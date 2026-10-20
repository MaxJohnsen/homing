-- Archiving a space only you have, as soon as you ask (spec §1 and §6).
-- Like renaming one, an assistant may archive or reopen a space that nobody
-- else can open, at most 20 an hour; a space others have stays with its
-- admins, directly. Every archive and reopening is recorded.

create table space_archives (
  space_id uuid not null references spaces (id),
  archived boolean not null,
  person_id uuid not null default current_person_id() references people (id),
  agent text default current_agent(),
  at timestamptz not null default clock_timestamp()
);

create index space_archives_person on space_archives (person_id, at);

alter table space_archives enable row level security;

create policy own on space_archives for select using (person_id = current_person_id() and space_id in (select accessible_spaces()));

grant select on space_archives to homing_app;

create or replace function archive_space(space uuid, archived boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target spaces;
begin
  if current_person_id() is null or not (direct_edit() or current_agent() is not null) then
    raise exception 'only people archive spaces' using errcode = 'insufficient_privilege';
  end if;
  -- Held to the end, as renaming does, so the count and who can open it hold while it changes.
  perform pg_advisory_xact_lock(hashtext('homing.space_access'));
  select * into target from spaces s where s.id = archive_space.space and s.id in (select accessible_spaces()) for update;
  if not found then
    raise exception 'there''s no space there that you can open' using errcode = 'insufficient_privilege';
  end if;
  if target.private_to is not null and target.parent_id is null then
    raise exception 'your personal space stays open' using errcode = 'check_violation';
  end if;
  if not exists (select from space_access a where a.space_id = target.id and a.person_id = current_person_id() and a.admin) then
    raise exception 'only its admins archive a space' using errcode = 'insufficient_privilege';
  end if;
  if current_agent() is not null then
    if exists (select from space_access a where a.space_id = target.id and a.person_id <> current_person_id()) then
      raise exception 'others can open that space, so a person archives it' using errcode = 'insufficient_privilege';
    end if;
    if (
      select count(*) from space_archives l
      where l.person_id = current_person_id() and l.agent is not null and l.at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'an assistant archives at most 20 spaces an hour' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if archived and target.archived_at is null then
    update spaces set archived_at = clock_timestamp(), archived_by = current_person_id() where id = target.id;
    insert into space_archives (space_id, archived) values (target.id, true);
  elsif not archived and target.archived_at is not null then
    update spaces set archived_at = null, archived_by = null where id = target.id;
    insert into space_archives (space_id, archived) values (target.id, false);
  end if;
end
$$;
