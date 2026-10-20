-- Creating and renaming spaces from the web app and assistants (#31).
-- A space records who created it, and through which assistant, like
-- everything else in Homing. Existing spaces keep no creator. A name is one
-- line of visible text.

alter table spaces
  add column created_by uuid references people (id) on delete set null default current_person_id(),
  add column agent text default current_agent(),
  add constraint spaces_name_check check (char_length(btrim(name, E' \t\r\n')) between 1 and 100 and name !~ '[[:cntrl:]]') not valid;

-- A space's name is seen by everyone who can open it, so an assistant never
-- names a space others see without the person approving it (guarantee 1).
-- On its own it creates only spaces nobody else has: in the person's
-- personal tree, on their own, or closed. And only so many in an hour.
create function check_new_space() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_agent() is null then
    return new;
  end if;
  if new.parent_id is not null and new.private_to is null and not new.closed then
    raise exception 'others would see that space, so the person creates it' using errcode = 'insufficient_privilege';
  end if;
  if (
    select count(*) from spaces s
    where s.created_by = current_person_id() and s.agent is not null and s.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'an assistant creates at most 20 spaces an hour' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_new_space
before insert on spaces
for each row execute function check_new_space();

-- What a space was called before, who renamed it and through which assistant.
create table space_names (
  space_id uuid not null references spaces (id),
  name text not null,
  renamed_by uuid references people (id) on delete set null default current_person_id(),
  agent text default current_agent(),
  renamed_at timestamptz not null default clock_timestamp()
);

create index space_names_space on space_names (space_id, renamed_at);

alter table space_names enable row level security;

create policy visible on space_names for select
using (space_id in (select accessible_spaces()));

grant select on space_names to homing_app;

-- Renames a space. Only its admins do, a personal space keeps its name, and an
-- assistant renames only a space nobody else can open.
create function rename_space(space uuid, name text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('homing.space_access'));
  if not exists (
    select from space_access a
    where a.space_id = rename_space.space and a.person_id = current_person_id() and a.admin
  ) then
    raise exception 'only admins rename a space' using errcode = 'insufficient_privilege';
  end if;
  if exists (select from spaces s where s.id = rename_space.space and s.private_to is not null and s.parent_id is null) then
    raise exception 'a personal space keeps its name' using errcode = 'insufficient_privilege';
  end if;
  if current_agent() is not null and exists (
    select from space_access a where a.space_id = rename_space.space and a.person_id <> current_person_id()
  ) then
    raise exception 'others can open that space, so the person renames it' using errcode = 'insufficient_privilege';
  end if;
  insert into space_names (space_id, name) select s.id, s.name from spaces s where s.id = rename_space.space;
  update spaces set name = btrim(rename_space.name) where id = rename_space.space;
end
$$;

revoke execute on function rename_space from public;
grant execute on function rename_space to homing_app;
