-- Telling people about requests (spec §6): when a member sends a request,
-- Homing emails the space's admins, if it sends email, and remembers
-- whether it could, so the member knows to tell them otherwise.

alter table proposals add column admins_emailed boolean;

grant update (admins_emailed) on proposals to homing_app;

-- The admins of a space, for someone who can open it, such as a member
-- asking them for a change. Admins through a space above count too.
create function space_admins(space uuid) returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select a.person_id from space_access a
  where a.space_id = space and a.admin
    and exists (select from space_access me where me.space_id = space and me.person_id = current_person_id())
$$;

revoke execute on function space_admins(uuid) from public;
grant execute on function space_admins(uuid) to homing_app;
