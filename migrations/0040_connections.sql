-- Connections and places (spec §7, guarantee 5). A connection is how Homing
-- gets into an outside system: one account there, signed in by the person it
-- belongs to. A place is what Homing reaches through it, such as that
-- account's mailbox, added by a person in a space. Both are only their
-- owner's: nobody else can find them, count them or learn their ids, even
-- in a space they share.
--
-- The credentials are kept apart, sealed with a key the database never sees.
-- Homing's role can't read their table at all. Only the functions below hand
-- them out, and only to the person whose connection it is, never while an
-- assistant acts for them, so nothing an assistant asks for can reach them.
--
-- What's built here is a person's own connection, and places only for them.
-- A connection a space owns, and a place bound to a space's shared side, come
-- with bindings: a connection then belongs to a person or a space, and a
-- place's private_to can be empty, as everywhere else under the access rule.

create table connections (
  id uuid primary key default gen_random_uuid(),
  -- Whose it is: the person who signed in with it.
  person_id uuid not null references people (id) on delete cascade,
  -- The system and the account in it, by the ids the system keeps for good:
  -- for Microsoft, the account's directory (tenant) and its object id there.
  provider text not null check (provider in ('microsoft')),
  tenant text not null,
  account text not null,
  -- How the account is shown: its address and name, as the system gives them.
  address text not null,
  name text,
  -- What the person allowed Homing to do with it, as the system granted it.
  scopes text[] not null,
  -- Whether it still works: it needs attention once the system refuses it,
  -- until the person signs in again.
  status text not null default 'connected' check (status in ('connected', 'needs attention')),
  connected_at timestamptz not null default now(),
  -- When Homing last signed in with it: connecting, or refreshing its sign-in.
  refreshed_at timestamptz not null default now(),
  -- Revoking stops it everywhere at once. The row stays, without credentials,
  -- so what records which connection it used still points somewhere.
  revoked_at timestamptz
);

-- One connection for each of a person's accounts, used in every space.
create unique index connections_account on connections (person_id, provider, tenant, account) where revoked_at is null;

create table places (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  -- The space it was added in, which gives Homing its context, and the
  -- person whose private side there it is on.
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  -- What it reaches through the connection: for now an account's own
  -- mailbox, its resource the account's id.
  kind text not null check (kind in ('mailbox')),
  resource text not null,
  added_at timestamptz not null default now(),
  -- Removing it from its space stops its use there and keeps the connection.
  removed_at timestamptz
);

create unique index places_in_space on places (connection_id, space_id, kind, resource) where removed_at is null;
create index places_space on places (space_id);

-- A connection's sign-in, sealed by Homing with authenticated encryption
-- before it gets here, each bound to its connection and what it is.
create table credentials (
  connection_id uuid primary key references connections (id) on delete cascade,
  refresh_token bytea not null,
  access_token bytea,
  access_expires_at timestamptz
);

alter table connections enable row level security;
alter table places enable row level security;
alter table credentials enable row level security;

-- Only its owner sees a connection.
create policy own on connections for select
using (person_id = current_person_id());

-- And a place, only while they can open its space.
create policy own on places for select
using (private_to = current_person_id() and space_id in (select accessible_spaces()));

-- Homing reads connections and places, and changes them only through the
-- functions below. Credentials it can't read or write at all.
grant select on connections, places to homing_app;

-- The person's own connection, as they use it, never while an assistant
-- acts for them. The same refusal whether it doesn't exist or isn't theirs.
create function own_connection(connection uuid) returns connections
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found connections;
begin
  if current_person_id() is null or current_agent() is not null then
    raise exception 'only the person whose connection it is uses it' using errcode = 'insufficient_privilege';
  end if;
  -- Locked first, by everything that changes a connection or its
  -- credentials, so two refreshes, or a refresh and revoking, take turns.
  select * into found from connections c
  where c.id = own_connection.connection and c.person_id = current_person_id() and c.revoked_at is null
  for update;
  if found.id is null then
    raise exception 'there is no such connection' using errcode = 'insufficient_privilege';
  end if;
  return found;
end
$$;

-- Connects an account in a space, for the person signed in to the app: the
-- account's connection, made or brought up to date, and its mailbox as a
-- place on their private side of the space. Signing in with the same account
-- again, in this space or another, uses the same connection.
create function connect_mailbox(
  space uuid, provider text, tenant text, account text, address text, name text, scopes text[],
  out connection_id uuid, out place_id uuid
)
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the conflict targets below, connection_id and the account's fields name columns.
#variable_conflict use_column
declare
  me uuid := current_person_id();
begin
  if not direct_edit() then
    raise exception 'only a person connects an account, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  -- Waits for any change to who can open which space, so the check holds.
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  if space not in (select accessible_spaces()) then
    raise exception 'no access to the space' using errcode = 'insufficient_privilege';
  end if;

  -- Two sign-ins with the same account at once make one connection and one place: the second
  -- waits for the first, inserts nothing, and finds what the first made.
  insert into connections (person_id, provider, tenant, account, address, name, scopes)
  values (me, connect_mailbox.provider, connect_mailbox.tenant, connect_mailbox.account, connect_mailbox.address, connect_mailbox.name, connect_mailbox.scopes)
  on conflict (person_id, provider, tenant, account) where revoked_at is null do nothing
  returning id into connection_id;
  if connection_id is null then
    select c.id into connection_id from connections c
    where c.person_id = me and c.provider = connect_mailbox.provider and c.tenant = connect_mailbox.tenant
      and c.account = connect_mailbox.account and c.revoked_at is null
    for update;
    update connections c
    set address = connect_mailbox.address, name = connect_mailbox.name, scopes = connect_mailbox.scopes,
        status = 'connected', refreshed_at = now()
    where c.id = connection_id;
  end if;

  insert into places (connection_id, space_id, private_to, kind, resource)
  values (connect_mailbox.connection_id, space, me, 'mailbox', connect_mailbox.account)
  on conflict (connection_id, space_id, kind, resource) where removed_at is null do nothing
  returning id into place_id;
  if place_id is null then
    select p.id into place_id from places p
    where p.connection_id = connect_mailbox.connection_id and p.space_id = space and p.kind = 'mailbox'
      and p.resource = connect_mailbox.account and p.removed_at is null;
  end if;
end
$$;

-- Keeps a connection's sealed sign-in, after connecting or refreshing it, and
-- says it works again.
create function keep_credentials(connection uuid, refresh_token bytea, access_token bytea, access_expires_at timestamptz)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform own_connection(connection);
  insert into credentials (connection_id, refresh_token, access_token, access_expires_at)
  values (connection, keep_credentials.refresh_token, keep_credentials.access_token, keep_credentials.access_expires_at)
  on conflict on constraint credentials_pkey do update
  set refresh_token = excluded.refresh_token, access_token = excluded.access_token, access_expires_at = excluded.access_expires_at;
  update connections set status = 'connected', refreshed_at = now() where id = connection;
end
$$;

-- A connection's sealed sign-in, for its owner's own use, held until the
-- transaction ends. Nothing for a connection that isn't theirs.
create function credentials_of(connection uuid)
returns table (status text, refresh_token bytea, access_token bytea, access_expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found connections;
begin
  begin
    found := own_connection(connection);
  exception when insufficient_privilege then
    if current_person_id() is null or current_agent() is not null then
      raise;
    end if;
    return;
  end;
  return query
  select found.status, c.refresh_token, c.access_token, c.access_expires_at
  from credentials c where c.connection_id = connection;
end
$$;

-- The system refused the connection's sign-in, so it needs the person to
-- sign in again before Homing can use it.
create function connection_needs_attention(connection uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform own_connection(connection);
  update connections set status = 'needs attention' where id = connection;
  update credentials set access_token = null, access_expires_at = null where connection_id = connection;
end
$$;

-- Removes a place from its space. The connection stays, for its other places.
create function remove_place(place uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only a person removes a place, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update places p set removed_at = now()
  where p.id = place and p.private_to = current_person_id() and p.removed_at is null;
  return found;
end
$$;

-- Revokes the person's connection: its credentials are deleted, and it stops
-- in every space at once. What Homing kept from it stays, as it was.
create function revoke_connection(connection uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only a person revokes a connection, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update connections c set revoked_at = now()
  where c.id = connection and c.person_id = current_person_id() and c.revoked_at is null;
  if not found then
    return false;
  end if;
  delete from credentials where connection_id = connection;
  update places set removed_at = now() where connection_id = connection and removed_at is null;
  return true;
end
$$;

revoke execute on function own_connection, connect_mailbox, keep_credentials, credentials_of, connection_needs_attention, remove_place, revoke_connection from public;
grant execute on function connect_mailbox, keep_credentials, credentials_of, connection_needs_attention, remove_place, revoke_connection to homing_app;
