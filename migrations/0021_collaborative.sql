-- Making a space in your personal tree collaborative (#32, spec §1): a
-- deliberate conversion. The space and everything under it leave the
-- personal tree, as a space of their own or in a shared space the person is
-- an admin of. It exposes nothing by itself: everything in them stays on
-- their private side. Where it was is kept for its owner alone. Only people
-- do it, never an assistant.

-- Where a space was in its owner's personal tree, which only they can read.
create table space_moves (
  space_id uuid not null references spaces (id),
  moved_from uuid references spaces (id) on delete set null,
  moved_by uuid not null references people (id) default current_person_id(),
  moved_at timestamptz not null default clock_timestamp()
);

alter table space_moves enable row level security;

create policy own on space_moves for select using (moved_by = current_person_id());

grant select on space_moves to homing_app;

create function make_collaborative(space uuid, new_parent uuid, closed boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  moving spaces;
begin
  if not direct_edit() then
    raise exception 'only people share a space' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('homing.space_access'));
  select s.* into moving from spaces s
  where s.id = make_collaborative.space and s.private_to = me and s.parent_id is not null
  for update;
  if not found then
    raise exception 'there''s no space in your personal space to share there' using errcode = 'insufficient_privilege';
  end if;
  if new_parent is not null and not exists (
    select from spaces p join space_access a on a.space_id = p.id
    where p.id = new_parent and p.private_to is null and a.person_id = me and a.admin
  ) then
    raise exception 'only admins put spaces in a space' using errcode = 'insufficient_privilege';
  end if;

  update spaces set private_to = null where id in (select space_subtree(make_collaborative.space));
  update spaces
  set parent_id = new_parent, closed = new_parent is not null and make_collaborative.closed
  where id = make_collaborative.space;
  insert into space_moves (space_id, moved_from) values (make_collaborative.space, moving.parent_id);
end
$$;

revoke execute on function make_collaborative from public;
grant execute on function make_collaborative to homing_app;
