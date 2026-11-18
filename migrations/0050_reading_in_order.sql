-- Reading a place in order (#150, spec §7, §8). A person's assistant reads a
-- place that can be listed in order, such as their mailbox, from its oldest
-- item to its newest, a stretch at a time, and decides for itself what each
-- is about and what is worth keeping. Homing holds where reading began, the
-- place it has reached, the stretch handed out now, and what is never read
-- there: once for each thing a person's account reaches, such as their
-- mailbox, in whichever spaces it's connected, and for as long as they
-- connect the account again. Only they see any of it, and it changes only
-- through the functions below.

-- What's never read, as it's kept: at most 500 entries, each a sender by an
-- address or a domain, in plain lower-case ASCII, a folder by its name, on
-- one line, or a folder the system makes itself, by the system's own name
-- for it, such as junkemail. This is what a sender may look like, for Homing
-- too.
create function never_read_fits(entries jsonb) returns boolean
language sql immutable
as $$
  select jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) <= 500 and not exists (
    select from jsonb_array_elements(entries) e
    where not coalesce(case
      when e ? 'sender' then length(e ->> 'sender') <= 254
        and e ->> 'sender' ~ '^([a-z0-9._%+''-]+@)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
      when e ? 'folder' then length(e ->> 'folder') between 1 and 200 and e ->> 'folder' !~ '[[:cntrl:]]' and e ->> 'folder' = btrim(e ->> 'folder')
      when e ? 'standard' then e ->> 'standard' ~ '^[a-z]{1,40}$'
    end, false)
  )
$$;

create table readings (
  -- What it's of: a place the person's account reaches, by the system and the
  -- account as their connection names them, and the place's kind and
  -- resource there, so it outlasts a connection revoked and made again.
  private_to uuid not null references people (id) on delete cascade,
  provider text not null,
  tenant text not null,
  account text not null,
  kind text not null,
  resource text not null,
  -- Where reading began, and the place it has reached: everything that came
  -- before it is read.
  began timestamptz,
  reached timestamptz,
  -- The stretch handed out now, from the place reached: its token, the moment
  -- it ends, and when the hand-out lapses, after which it's handed out afresh.
  token uuid,
  stretch_ends timestamptz,
  lapses_at timestamptz,
  -- What's never read there, each entry the person or their assistant added
  -- with who did, their assistant by name or null for the person, and when.
  -- Null for as its kind starts it, such as a mailbox's Junk Email, Deleted
  -- Items, Drafts and Outbox.
  never_read jsonb check (never_read_fits(never_read)),
  check ((began is null) = (reached is null)),
  check ((token is null) = (stretch_ends is null) and (token is null) = (lapses_at is null)),
  check (token is null or (reached is not null and stretch_ends > reached)),
  primary key (private_to, provider, tenant, account, kind, resource)
);

alter table readings enable row level security;

create policy own on readings for select
using (private_to = current_person_id());

grant select on readings to homing_app;

-- The reading of one of the person's own places, in use: on their private
-- side, in a space they can open, through a live connection of theirs, as
-- the person or their assistant. Made when it's new, and held until the
-- transaction ends. The same refusal whether the place doesn't exist or
-- isn't theirs.
create function reading_of(place uuid) returns readings
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  reading readings;
begin
  select p.private_to, c.provider, c.tenant, c.account, p.kind, p.resource
  into reading.private_to, reading.provider, reading.tenant, reading.account, reading.kind, reading.resource
  from places p join connections c on c.id = p.connection_id
  where p.id = reading_of.place and p.private_to = current_person_id() and c.person_id = current_person_id()
    and p.removed_at is null and c.revoked_at is null and p.space_id in (select accessible_spaces());
  if reading.private_to is null then
    raise exception 'there is no such place' using errcode = 'insufficient_privilege';
  end if;
  insert into readings (private_to, provider, tenant, account, kind, resource)
  values (reading.private_to, reading.provider, reading.tenant, reading.account, reading.kind, reading.resource)
  on conflict do nothing;
  select r.* into reading from readings r
  where (r.private_to, r.provider, r.tenant, r.account, r.kind, r.resource) = (reading.private_to, reading.provider, reading.tenant, reading.account, reading.kind, reading.resource)
  for update;
  return reading;
end
$$;

-- Moves reading the place on from a moment: the place reached goes to a
-- later one, and the stretch from there is handed out for an hour, or
-- nothing without a token. Beginning, reading begins at the moment, or
-- begins again there: what was handed out is no longer current, and what was
-- written from it stays. After a token, the stretch it was for, which ended
-- at the moment, is confirmed, in the same statement that finds the token is
-- still the current one. Otherwise it carries on from the place reached,
-- while nothing is handed out there, or what was has lapsed. When the new one
-- lapses, or no row when reading stood elsewhere.
create function move_reading(place uuid, beginning boolean, from_at timestamptz, reached timestamptz, token uuid, stretch_ends timestamptz, after uuid)
returns table (lapses_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the update below, the reading's fields name columns.
#variable_conflict use_column
declare
  was readings := reading_of(place);
begin
  if move_reading.reached < from_at then
    raise exception 'reading moves only on' using errcode = 'check_violation';
  end if;
  if beginning or (after is null and was.reached = from_at and (was.token is null or was.lapses_at <= now()))
    or (was.token = after and was.stretch_ends = from_at) then
    return query
    update readings r
    set began = case when beginning then from_at else r.began end, reached = move_reading.reached, token = move_reading.token,
        stretch_ends = move_reading.stretch_ends, lapses_at = case when move_reading.token is null then null else now() + interval '1 hour' end
    where (r.private_to, r.provider, r.tenant, r.account, r.kind, r.resource) = (was.private_to, was.provider, was.tenant, was.account, was.kind, was.resource)
    returning r.lapses_at;
  end if;
end
$$;

-- Adds an entry to what's never read in the place, which its owner or their
-- assistant does, saying who and when, or takes one off, which only its owner
-- does, in Homing itself. A folder is the same whatever its case. Until the
-- list first changes, it's as the place's kind starts it. Whether it changed.
create function change_never_read(place uuid, adding boolean, entry jsonb, start jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  was readings := reading_of(place);
  listed jsonb := coalesce(was.never_read, start);
  others jsonb;
  changed jsonb;
begin
  if not adding and not direct_edit() then
    raise exception 'only the person takes something off what is never read, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  others := (
    select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(listed) with ordinality as x(e, n)
    where not coalesce(e ->> 'sender' = entry ->> 'sender' or lower(e ->> 'folder') = lower(entry ->> 'folder') or e ->> 'standard' = entry ->> 'standard', false)
  );
  changed := case
    when not adding then others
    when others = listed then listed || (entry || jsonb_build_object('by', current_agent(), 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    else listed
  end;
  if changed = listed then
    return false;
  end if;
  update readings r set never_read = changed
  where (r.private_to, r.provider, r.tenant, r.account, r.kind, r.resource) = (was.private_to, was.provider, was.tenant, was.account, was.kind, was.resource);
  return true;
end
$$;

-- Each stretch is a use of the connection, recorded as listing the place.
-- Uses recorded while Homing followed mailboxes by itself keep saying so.
alter table connection_uses drop constraint connection_uses_operation_check;
alter table connection_uses add constraint connection_uses_operation_check
check (operation in ('search', 'read', 'list', 'follow') or operation ~ '^[a-z][a-z0-9]*\.[A-Za-z][A-Za-z0-9]*$');

revoke execute on function reading_of, move_reading, change_never_read from public;
grant execute on function move_reading, change_never_read to homing_app;

-- Which conversation a source Homing read itself comes from, such as an
-- email's, by the system's id, so the conversation shows what was already
-- kept from it. Only for a source Homing read through a connection. Sources
-- kept before have none.
alter table sources add column conversation text check (conversation is null or length(conversation) between 1 and 1024);

grant insert (conversation) on sources to homing_app;

create policy conversation on sources as restrictive for insert
with check (conversation is null or read_through is not null);

create index sources_conversation on sources (read_through, conversation) where conversation is not null;
