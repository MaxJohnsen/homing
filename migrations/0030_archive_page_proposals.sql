-- Assistants propose archiving a page in a space others can open (spec §3:
-- "Anyone who can write in the space archives a page directly, and an
-- assistant proposes it for a person to approve"), and reopening one the same
-- way. The person it's for archives or reopens it by approving, as a direct
-- edit, so only if they may do it themselves then.

alter table proposals
  add column page_id uuid references pages (id),
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space', 'archive page', 'reopen page')),
  add constraint proposals_archive_page check ((action in ('archive page', 'reopen page')) = (page_id is not null) and (action not in ('archive page', 'reopen page') or not request));

-- A proposal about a page is about a knowledge page in its own space that
-- whoever makes it can see. These checks run before row-level security, so
-- each refuses first a proposal for someone else, and checks only what the
-- person making it can see: refusing never tells anything about someone else
-- or a space they can't open.
create function check_proposal_page() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.private_to is distinct from current_person_id() then
    raise exception 'a proposal is for whoever makes it' using errcode = 'insufficient_privilege';
  end if;
  if new.page_id is not null
     and not exists (
       select from pages p
       where p.id = new.page_id and p.space_id = new.space_id and p.space_id in (select accessible_spaces())
         and coalesce(p.type, '') not in ('guidance', 'skill', 'overview')
         and exists (select from content c where c.page_id = p.id and (c.private_to is null or c.private_to = current_person_id()))
     ) then
    raise exception 'there''s no page there that you can see' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_proposal_page
before insert on proposals
for each row execute function check_proposal_page();

grant insert (page_id) on proposals to homing_app;

-- The same for sharing a task (0023), so it never tells whether a task is
-- someone else's.
create or replace function check_proposal_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.private_to is distinct from current_person_id() then
    raise exception 'a proposal is for whoever makes it' using errcode = 'insufficient_privilege';
  end if;
  if new.task_id is not null
     and not exists (
       select from tasks t join spaces s on s.id = t.space_id
       where t.id = new.task_id and t.space_id = new.space_id and t.private_to = current_person_id() and t.done_at is null and s.private_to is null
     ) then
    raise exception 'that task isn''t yours in this space' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- And for a rule or an item to share (0015): an item the person making the
-- proposal can see in its space, so it never tells whether an item is in a
-- space they can't open, or on someone else's private side.
create or replace function check_proposal_rule() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.private_to is distinct from current_person_id() then
    raise exception 'a proposal is for whoever makes it' using errcode = 'insufficient_privilege';
  end if;
  if new.item_id is not null
     and not exists (
       select from content c
       where c.id = new.item_id and c.space_id = new.space_id and c.space_id in (select accessible_spaces())
         and (c.private_to is null or c.private_to = current_person_id())
     ) then
    raise exception 'that rule isn''t in this space' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- Archiving a space says whether it changed anything too, for the same reason.
drop function archive_space(uuid, boolean);

create function archive_space(space uuid, archived boolean) returns boolean
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
    return true;
  elsif not archived and target.archived_at is not null then
    update spaces set archived_at = null, archived_by = null where id = target.id;
    insert into space_archives (space_id, archived) values (target.id, false);
    return true;
  end if;
  return false;
end
$$;

revoke execute on function archive_space from public;
grant execute on function archive_space to homing_app;

-- Archiving a page now says whether it changed anything, so approving a
-- proposal can refuse when someone else got there first. An assistant
-- archives at once only in a space nobody else can open: whether others see
-- the page itself would tell of their private side.
drop function archive_page(uuid, boolean);

create function archive_page(page uuid, archived boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target pages;
  me uuid := current_person_id();
begin
  if me is null or not (direct_edit() or current_agent() is not null) then
    raise exception 'only people archive pages' using errcode = 'insufficient_privilege';
  end if;
  -- One person's archiving runs one at a time, so the hourly count holds for calls at once.
  perform pg_advisory_xact_lock(hashtext('homing.archive_page:' || me));
  -- A page the person can see: something on it that's shared in a space they can open, or theirs.
  select * into target from pages p
  where p.id = archive_page.page and p.space_id in (select accessible_spaces())
    and exists (select from content c where c.page_id = p.id and (c.private_to is null or c.private_to = me))
  for update;
  if not found then
    raise exception 'there''s no page there that you can see' using errcode = 'insufficient_privilege';
  end if;
  if target.type in ('guidance', 'skill', 'overview') then
    raise exception 'rules, skills and overviews aren''t archived' using errcode = 'check_violation';
  end if;
  if current_agent() is not null then
    if exists (select from space_access a where a.space_id = target.space_id and a.person_id <> me) then
      raise exception 'others can open that page''s space, so a person archives it' using errcode = 'insufficient_privilege';
    end if;
    if (
      select count(*) from page_archives l
      where l.person_id = me and l.agent is not null and l.at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'an assistant archives at most 20 pages an hour' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if archived and target.archived_at is null then
    update pages set archived_at = clock_timestamp(), archived_by = me where id = target.id;
    insert into page_archives (page_id, archived) values (target.id, true);
    return true;
  elsif not archived and target.archived_at is not null then
    update pages set archived_at = null, archived_by = null where id = target.id;
    insert into page_archives (page_id, archived) values (target.id, false);
    return true;
  end if;
  return false;
end
$$;

revoke execute on function archive_page from public;
grant execute on function archive_page to homing_app;

-- When a space, or a space above it that the person can open, was last
-- archived or reopened, so a proposal to archive it stands only while nothing
-- changed since. It walks up only through spaces the person can open, so a
-- space above they can't open never shows through.
create function archive_changed(space uuid) returns timestamptz
language sql stable security definer set search_path = public, pg_temp
as $$
  with recursive up (id, parent_id, depth) as (
    select s.id, s.parent_id, 0 from spaces s where s.id = space and s.id in (select accessible_spaces())
    union all
    select s.id, s.parent_id, up.depth + 1 from spaces s join up on s.id = up.parent_id
    where s.id in (select accessible_spaces()) and up.depth < 100
  )
  select max(l.at) from space_archives l where l.space_id in (select id from up)
$$;

revoke execute on function archive_changed from public;
grant execute on function archive_changed to homing_app;
