-- A foundation for connecting to any system (#128, spec §7). Each system
-- Homing reaches has a connector, a module in Homing's code, so the database
-- keeps a connection's system and a place's kind as plain words, not a list
-- of them. Connecting takes two steps: the account, then each place it
-- reaches, so a place the person chooses is added on its own. Uses are
-- recorded by what Homing did, the same for every system, since the place
-- says what it is. A source Homing read itself keeps who could see it there,
-- where Homing knows. Nothing stored is rewritten: email's mail:…
-- references still lead to Microsoft mailboxes.

alter table connections drop constraint connections_provider_check;
alter table connections add constraint connections_provider_check check (provider ~ '^[a-z][a-z0-9]{1,30}$');

alter table places drop constraint places_kind_check;
alter table places add constraint places_kind_check check (kind ~ '^[a-z][a-z0-9]{1,30}$');

-- How a place the person chose is named there, such as a project's name, on
-- one line: it comes from the system, and Homing quotes it wherever it shows
-- it. Null for the account's own, such as its mailbox, which goes by the
-- account's address.
alter table places add column name text check (name is null or (length(name) between 1 and 200 and name !~ '[[:cntrl:]]'));

-- Searching or reading for the person, following changes once Homing learns,
-- or an action's name, such as microsoft.sendMail, once it acts. The uses
-- recorded before were all of mail, which their place still says.
alter table connection_uses drop constraint connection_uses_operation_check;
update connection_uses set operation = case operation when 'search mail' then 'search' else 'read' end
where operation in ('search mail', 'read mail');
alter table connection_uses add constraint connection_uses_operation_check
check (operation in ('search', 'read', 'follow') or operation ~ '^[a-z][a-z0-9]*\.[A-Za-z][A-Za-z0-9]*$');

-- Who could see a source in its own system, such as an email's To and Cc:
-- only for one Homing read itself, through a connection, and otherwise
-- unknown, which is never safe to publish. A known audience is never by
-- itself authorization to share either (spec §5).
alter table sources add column audience jsonb check (audience is null or jsonb_typeof(audience) = 'object');

grant insert (audience) on sources to homing_app;

create policy audience on sources as restrictive for insert
with check (audience is null or read_through is not null);

-- Connects an account in a space, for the person signed in to the app: the
-- account's connection, made, or brought up to date when they sign in with
-- it again, in this space or another. Its places are added on their own.
create function connect_account(space uuid, provider text, tenant text, account text, address text, name text, scopes text[])
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the conflict target below, the account's fields name columns.
#variable_conflict use_column
declare
  me uuid := current_person_id();
  connection uuid;
begin
  if not direct_edit() then
    raise exception 'only a person connects an account, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  -- Waits for any change to who can open which space, so the check holds.
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  if connect_account.space not in (select accessible_spaces()) then
    raise exception 'no access to the space' using errcode = 'insufficient_privilege';
  end if;

  -- Two sign-ins with the same account at once make one connection: the second waits for the
  -- first, inserts nothing, and finds what the first made.
  insert into connections (person_id, provider, tenant, account, address, name, scopes)
  values (me, connect_account.provider, connect_account.tenant, connect_account.account, connect_account.address, connect_account.name, connect_account.scopes)
  on conflict (person_id, provider, tenant, account) where revoked_at is null do nothing
  returning id into connection;
  if connection is null then
    select c.id into connection from connections c
    where c.person_id = me and c.provider = connect_account.provider and c.tenant = connect_account.tenant
      and c.account = connect_account.account and c.revoked_at is null
    for update;
    update connections c
    set address = connect_account.address, name = connect_account.name, scopes = connect_account.scopes,
        status = 'connected', refreshed_at = now()
    where c.id = connection;
  end if;
  return connection;
end
$$;

-- Adds what one of the person's own connections reaches as a place on their
-- private side of a space, for the person signed in to the app: the
-- account's own, such as its mailbox, as it connects, or one they chose. The
-- same place again in the same space is the one already there.
create function add_place(space uuid, connection uuid, kind text, resource text, name text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
-- In the conflict target below, the place's fields name columns.
#variable_conflict use_column
declare
  me uuid := current_person_id();
  place uuid;
begin
  if not direct_edit() then
    raise exception 'only a person adds a place, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  if add_place.space not in (select accessible_spaces()) then
    raise exception 'no access to the space' using errcode = 'insufficient_privilege';
  end if;
  -- Only their own connection, while it isn't revoked, held until the transaction ends.
  perform own_connection(add_place.connection);

  insert into places (connection_id, space_id, private_to, kind, resource, name)
  values (add_place.connection, add_place.space, me, add_place.kind, add_place.resource, add_place.name)
  on conflict (connection_id, space_id, kind, resource) where removed_at is null do nothing
  returning id into place;
  if place is null then
    select p.id into place from places p
    where p.connection_id = add_place.connection and p.space_id = add_place.space and p.kind = add_place.kind
      and p.resource = add_place.resource and p.removed_at is null;
  end if;
  return place;
end
$$;

drop function connect_mailbox(uuid, text, text, text, text, text, text[]);

revoke execute on function connect_account, add_place from public;
grant execute on function connect_account, add_place to homing_app;
