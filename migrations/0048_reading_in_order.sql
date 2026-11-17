-- Reading a place in order (#150, spec §7, §8). A person's assistant reads a
-- place that can be listed in order, such as their mailbox, from its oldest
-- item to its newest, a stretch at a time, and decides for itself what each
-- is about and what is worth keeping. Homing holds where reading began, the
-- place it has reached, the stretch handed out now, and what is never read
-- there. Only the place's owner sees any of it, as with the place itself, and
-- it changes only through the functions below.

-- What's never read, as it's kept: senders by an address or a domain, in
-- plain lower-case ASCII, and folders by name, on one line.
create function never_read_fits(senders text[], folders text[]) returns boolean
language sql immutable
as $$
  select coalesce(cardinality(senders), 0) <= 500 and coalesce(cardinality(folders), 0) <= 100
    and not exists (
      select from unnest(senders) s
      where s is null or length(s) > 254 or s !~ '^([a-z0-9._%+''-]+@)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    )
    and not exists (select from unnest(folders) f where f is null or length(f) not between 1 and 200 or f ~ '[[:cntrl:]]' or f <> btrim(f))
$$;

-- A moment to the whole second, as a stretch is cut.
create function whole_second(at timestamptz) returns boolean
language sql immutable
as $$ select at is null or date_trunc('second', at at time zone 'UTC') = at at time zone 'UTC' $$;

create table readings (
  place_id uuid primary key references places (id) on delete cascade,
  private_to uuid not null references people (id) on delete cascade,
  -- Where reading began, and the place it has reached: everything that came
  -- before it is read.
  began timestamptz check (whole_second(began)),
  reached timestamptz check (whole_second(reached)),
  -- The stretch handed out now, from the place reached: its token, the moment
  -- it ends, and when the hand-out lapses, after which it's handed out afresh.
  token uuid,
  stretch_ends timestamptz check (whole_second(stretch_ends)),
  lapses_at timestamptz,
  -- What's never read there. Null for as its kind starts it, such as a
  -- mailbox's Junk Email, Deleted Items, Drafts and Outbox.
  never_senders text[],
  never_folders text[],
  check ((began is null) = (reached is null)),
  check ((token is null) = (stretch_ends is null) and (token is null) = (lapses_at is null)),
  check (token is null or (reached is not null and stretch_ends > reached)),
  check (never_read_fits(never_senders, never_folders))
);

alter table readings enable row level security;

-- Only its owner sees it, while they can see the place.
create policy own on readings for select
using (private_to = current_person_id() and place_id in (select id from places));

grant select on readings to homing_app;

-- One of the person's own places, in use: on their private side, in a space
-- they can open, through a live connection of theirs. Their assistant uses
-- it for them. The same refusal whether it doesn't exist or isn't theirs.
create function own_place(place uuid) returns places
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found places;
begin
  select p.* into found from places p join connections c on c.id = p.connection_id
  where p.id = own_place.place and p.private_to = current_person_id() and c.person_id = current_person_id()
    and p.removed_at is null and c.revoked_at is null and p.space_id in (select accessible_spaces());
  if found.id is null then
    raise exception 'there is no such place' using errcode = 'insufficient_privilege';
  end if;
  return found;
end
$$;

-- Begins reading the place in order from a moment, or begins again from
-- there: what was handed out is no longer current. What was written from it
-- stays. The place reached is where reading began, or, when the first
-- stretch holds nothing to read, where that stretch ends. With a token, the
-- first stretch is handed out at once, for an hour. When it lapses.
create function begin_reading(place uuid, began timestamptz, reached timestamptz, token uuid, stretch_ends timestamptz)
returns table (lapses_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the conflict target below, the reading's fields name columns.
#variable_conflict use_column
begin
  perform own_place(place);
  if begin_reading.reached < begin_reading.began then
    raise exception 'reading reaches no further back than it began' using errcode = 'check_violation';
  end if;
  return query
  insert into readings as r (place_id, private_to, began, reached, token, stretch_ends, lapses_at)
  values (
    begin_reading.place, current_person_id(), begin_reading.began, begin_reading.reached, begin_reading.token, begin_reading.stretch_ends,
    case when begin_reading.token is null then null else now() + interval '1 hour' end
  )
  on conflict (place_id) do update
  set began = excluded.began, reached = excluded.reached, token = excluded.token, stretch_ends = excluded.stretch_ends, lapses_at = excluded.lapses_at
  returning r.lapses_at;
end
$$;

-- Moves reading on from a moment: the place reached goes to a later one, and
-- the stretch from there is handed out for an hour, or nothing without a
-- token. After a token, that stretch, which ended at the moment, is
-- confirmed, in the same statement that checks the token is still the
-- current one. Without one, it carries on from the place reached, while
-- nothing is handed out there, or what was has lapsed. When the new one
-- lapses, or no row when reading stood elsewhere.
create function hand_out_stretch(place uuid, from_at timestamptz, reached timestamptz, token uuid, stretch_ends timestamptz, after uuid)
returns table (lapses_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the updates below, the reading's fields name columns.
#variable_conflict use_column
declare
  lapses timestamptz := case when hand_out_stretch.token is null then null else now() + interval '1 hour' end;
begin
  perform own_place(place);
  if hand_out_stretch.reached < hand_out_stretch.from_at then
    raise exception 'reading moves only on' using errcode = 'check_violation';
  end if;
  return query
  update readings r
  set reached = hand_out_stretch.reached, token = hand_out_stretch.token, stretch_ends = hand_out_stretch.stretch_ends, lapses_at = lapses
  where r.place_id = hand_out_stretch.place
    and case when hand_out_stretch.after is not null
      then r.token = hand_out_stretch.after and r.stretch_ends = hand_out_stretch.from_at
      else r.reached = hand_out_stretch.from_at and (r.token is null or r.lapses_at <= now())
    end
  returning r.lapses_at;
end
$$;

-- Adds a sender or a folder to what's never read in the place, which its
-- owner or their assistant does, or takes one off, which only its owner does,
-- in Homing itself. A folder is the same whatever its case. Until the list
-- first changes, it's as the place's kind starts it. Whether it changed.
create function change_never_read(place uuid, adding boolean, sender text, folder text, start_folders text[]) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  was readings;
  senders text[];
  folders text[];
begin
  perform own_place(place);
  if (sender is null) = (folder is null) then
    raise exception 'a sender or a folder, one at a time' using errcode = 'check_violation';
  end if;
  if not adding and not direct_edit() then
    raise exception 'only the person takes something off what is never read, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  insert into readings (place_id, private_to) values (place, current_person_id()) on conflict (place_id) do nothing;
  select * into was from readings r where r.place_id = change_never_read.place for update;
  senders := coalesce(was.never_senders, '{}');
  folders := coalesce(was.never_folders, start_folders);
  if sender is not null and adding and not sender = any (senders) then
    senders := senders || sender;
  elsif sender is not null and not adding then
    senders := array_remove(senders, sender);
  elsif folder is not null and adding and not exists (select from unnest(folders) f where lower(f) = lower(folder)) then
    folders := folders || folder;
  elsif folder is not null and not adding then
    folders := array(select f from unnest(folders) with ordinality as e(f, n) where lower(f) <> lower(folder) order by n);
  end if;
  if senders = coalesce(was.never_senders, '{}') and folders = coalesce(was.never_folders, start_folders) then
    return false;
  end if;
  update readings r set never_senders = senders, never_folders = folders where r.place_id = change_never_read.place;
  return true;
end
$$;

-- Each stretch is a use of the connection, recorded as listing the place.
-- Uses recorded while Homing followed mailboxes by itself keep saying so.
alter table connection_uses drop constraint connection_uses_operation_check;
alter table connection_uses add constraint connection_uses_operation_check
check (operation in ('search', 'read', 'list', 'follow') or operation ~ '^[a-z][a-z0-9]*\.[A-Za-z][A-Za-z0-9]*$');

revoke execute on function own_place, begin_reading, hand_out_stretch, change_never_read from public;
grant execute on function begin_reading, hand_out_stretch, change_never_read to homing_app;

-- Which conversation a source Homing read itself comes from, such as an
-- email's, by the system's id, so the conversation shows what was already
-- kept from it. Only for a source Homing read through a connection. Sources
-- kept before have none.
alter table sources add column conversation text check (conversation is null or length(conversation) between 1 and 1024);

grant insert (conversation) on sources to homing_app;

create policy conversation on sources as restrictive for insert
with check (conversation is null or read_through is not null);

create index sources_conversation on sources (read_through, conversation) where conversation is not null;
