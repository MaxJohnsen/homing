-- Creating and renaming spaces from the web app and assistants (#31).
-- A space records who created it, and through which assistant, like
-- everything else in Homing. Existing spaces keep no creator.

alter table spaces
  add column created_by uuid references people (id) on delete set null default current_person_id(),
  add column agent text default current_agent(),
  add constraint spaces_name_check check (char_length(btrim(name)) between 1 and 100) not valid;

-- Renames a space. Only its admins do, and a personal space keeps its name.
create function rename_space(space uuid, name text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select from space_access a
    where a.space_id = rename_space.space and a.person_id = current_person_id() and a.admin
  ) then
    raise exception 'only admins rename a space' using errcode = 'insufficient_privilege';
  end if;
  if exists (select from spaces s where s.id = rename_space.space and s.private_to is not null and s.parent_id is null) then
    raise exception 'a personal space keeps its name' using errcode = 'insufficient_privilege';
  end if;
  update spaces set name = btrim(rename_space.name) where id = rename_space.space;
end
$$;

revoke execute on function rename_space from public;
grant execute on function rename_space to homing_app;
