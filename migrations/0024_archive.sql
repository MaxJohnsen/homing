-- Archiving a space (#6, spec §1). Finished work leaves everyday attention:
-- an archived space and the spaces in it leave daily context, but stay
-- searchable and can be reopened. Only people archive, directly: an admin of
-- the space, which in a personal tree is its owner. The personal space itself
-- stays open. Archiving never deletes anything, and who can open what is
-- unchanged.

alter table spaces
  add column archived_at timestamptz,
  add column archived_by uuid references people (id) on delete set null;

-- When the space was archived, or the nearest space above it that the
-- person can open, if one was: a space in an archived one is archived with
-- it, as far as the person can see. It runs with the person's own rights, so
-- a space above that they can't open never shows through.
create function archived_since(space uuid) returns table (archived_at timestamptz, archived_in uuid)
language sql stable set search_path = public, pg_temp
as $$
  with recursive up (id, parent_id, archived_at, depth) as (
    select s.id, s.parent_id, s.archived_at, 0 from spaces s where s.id = space
    union all
    select s.id, s.parent_id, s.archived_at, up.depth + 1 from spaces s join up on s.id = up.parent_id
    where up.archived_at is null and up.depth < 100
  )
  select up.archived_at, up.id from up where up.archived_at is not null limit 1
$$;

-- Archives a space, or reopens it.
create function archive_space(space uuid, archived boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target spaces;
begin
  if not direct_edit() then
    raise exception 'only people archive spaces' using errcode = 'insufficient_privilege';
  end if;
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
  if archived and target.archived_at is null then
    update spaces set archived_at = clock_timestamp(), archived_by = current_person_id() where id = target.id;
  elsif not archived then
    update spaces set archived_at = null, archived_by = null where id = target.id;
  end if;
end
$$;

revoke execute on function archived_since, archive_space from public;
grant execute on function archived_since, archive_space to homing_app;
