-- Reading a connected mailbox for its owner (#125, spec §7, §8 and §10).
-- Homing searches and reads the person's mail live, as them, through their
-- own connection, and records each use. What it keeps from an email it read
-- itself says so, so it's never taken for what an assistant reported.

-- Which connection Homing read a source through, when it read it itself,
-- such as an email in the person's mailbox. Null for what a person or an
-- assistant gave Homing.
alter table sources add column read_through uuid references connections (id) on delete set null;

grant insert (read_through) on sources to homing_app;

-- Only on the person's own private side, in the space where the mailbox it
-- came from is theirs, through their own connection while it works.
create policy read_through on sources as restrictive for insert
with check (
  read_through is null
  or (
    private_to = current_person_id()
    and exists (
      select from places p join connections c on c.id = p.connection_id
      where c.id = sources.read_through and p.space_id = sources.space_id
        and p.private_to = current_person_id() and c.person_id = current_person_id()
        and p.removed_at is null and c.revoked_at is null and c.status = 'connected'
    )
  )
);

-- Each use of a connection: which one, through which place, what Homing did
-- with it, and for which assistant. Only its owner sees it, as with the
-- connection itself.
create table connection_uses (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  place_id uuid not null references places (id) on delete cascade,
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  operation text not null check (operation in ('search mail', 'read mail')),
  -- The assistant it was for, such as Claude.
  agent text,
  used_at timestamptz not null default clock_timestamp()
);

create index connection_uses_connection on connection_uses (connection_id, used_at);
create index connection_uses_space on connection_uses (space_id);
create index connection_uses_place on connection_uses (place_id);
create index sources_read_through on sources (read_through) where read_through is not null;

alter table connection_uses enable row level security;

create policy own on connection_uses for select
using (private_to = current_person_id());

-- Recorded by the person's own use of their place, as it is used.
create policy record on connection_uses for insert
with check (
  private_to = current_person_id()
  and exists (
    select from places p
    where p.id = connection_uses.place_id and p.connection_id = connection_uses.connection_id
      and p.space_id = connection_uses.space_id and p.private_to = current_person_id() and p.removed_at is null
  )
);

grant select, insert (connection_id, place_id, space_id, private_to, operation, agent) on connection_uses to homing_app;

-- A refresh happens outside any transaction, since Microsoft may take a
-- while and nothing else should wait on it. Its new tokens are kept only
-- while the sign-in is still the one it refreshed, so a refresh that finished
-- meanwhile, a new sign-in or revoking wins, and a revoked connection never
-- gets credentials back. Whether they were kept.
create function keep_refreshed(connection uuid, used bytea, refresh_token bytea, access_token bytea, access_expires_at timestamptz)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  found_connection connections;
begin
  found_connection := own_connection(connection);
  if found_connection.status <> 'connected' then
    return false;
  end if;
  update credentials c
  set refresh_token = keep_refreshed.refresh_token, access_token = keep_refreshed.access_token, access_expires_at = keep_refreshed.access_expires_at
  where c.connection_id = keep_refreshed.connection and c.refresh_token = keep_refreshed.used;
  if not found then
    return false;
  end if;
  update connections c set refreshed_at = now() where c.id = keep_refreshed.connection;
  return true;
end
$$;

-- The system refused a refresh, so the connection needs its owner to sign in
-- again: only while the sign-in is still the one refused, so it never blames
-- one that came after. Whether it was marked.
drop function connection_needs_attention(uuid);
create function connection_needs_attention(connection uuid, used bytea) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform own_connection(connection);
  update credentials c set access_token = null, access_expires_at = null
  where c.connection_id = connection_needs_attention.connection and c.refresh_token = connection_needs_attention.used;
  if not found then
    return false;
  end if;
  update connections c set status = 'needs attention' where c.id = connection_needs_attention.connection;
  return true;
end
$$;

revoke execute on function keep_refreshed, connection_needs_attention from public;
grant execute on function keep_refreshed, connection_needs_attention to homing_app;

-- Uses are kept for 90 days. Housekeeping forgets older ones, anyone's,
-- which is all this does.
create function forget_old_uses() returns integer
language sql security definer set search_path = public, pg_temp
as $$
  with forgotten as (delete from connection_uses where used_at < now() - interval '90 days' returning 1)
  select count(*)::integer from forgotten
$$;

revoke execute on function forget_old_uses from public;
grant execute on function forget_old_uses to homing_app;
