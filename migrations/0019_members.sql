-- Changing who is in a space (#31, spec §1 and §6). Adding someone shares
-- the space's knowledge and guidance with them, so only people change who
-- has access: an assistant proposes it, and the person approves. A space
-- always keeps an admin, so someone can still look after it.

create or replace function add_member(space uuid, person uuid, member_role text default 'member')
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('homing.space_access'));
  if current_agent() is not null then
    raise exception 'only people change who has access' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select from space_access a
    where a.space_id = space and a.person_id = current_person_id() and a.admin
  ) then
    raise exception 'only admins can add members' using errcode = 'insufficient_privilege';
  end if;

  if (select s.private_to from spaces s where s.id = space) is not null then
    raise exception 'spaces in a personal tree have only their owner' using errcode = 'insufficient_privilege';
  end if;

  insert into memberships (space_id, person_id, role)
  values (space, person, member_role)
  on conflict on constraint memberships_pkey do update set role = excluded.role;

  perform keeps_an_admin(space);
end
$$;

create or replace function remove_member(space uuid, person uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('homing.space_access'));
  if current_agent() is not null then
    raise exception 'only people change who has access' using errcode = 'insufficient_privilege';
  end if;
  if person is distinct from current_person_id() and not exists (
    select from space_access a
    where a.space_id = space and a.person_id = current_person_id() and a.admin
  ) then
    raise exception 'only admins can remove members' using errcode = 'insufficient_privilege';
  end if;

  if (select s.private_to from spaces s where s.id = space) is not null then
    raise exception 'spaces in a personal tree have only their owner' using errcode = 'insufficient_privilege';
  end if;

  delete from memberships m where m.space_id = space and m.person_id = person;

  perform keeps_an_admin(space);
end
$$;

-- A space someone looks after: an admin of its own, or one from above.
create function keeps_an_admin(space uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select from space_access a where a.space_id = keeps_an_admin.space and a.admin) then
    raise exception 'a space keeps at least one admin' using errcode = 'check_violation';
  end if;
end
$$;

revoke execute on function keeps_an_admin from public;

-- A change of members is proposed to an admin of the space, who approves it.
alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members')),
  add constraint proposals_members_for_you check (action <> 'change members' or not request);
