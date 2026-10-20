-- Includes (spec §2): a space's guidance can include another space's rules,
-- or a single skill, by link instead of by copy, so what it brings in stays
-- live. An include is guidance: only people change it, a shared one the
-- space's admins and a private one its owner, and like a skill it applies in
-- the spaces below its own. Removing one keeps it, with who removed it.
--
-- An include never grants access. It is seen only by someone who can open
-- what it points to, and what it brings in is read as that person under the
-- ordinary access rule, so nothing here changes who can see a rule or a skill.

create table includes (
  id uuid primary key default gen_random_uuid(),
  -- The space whose guidance includes it.
  space_id uuid not null references spaces (id),
  -- The person it's only for, or null when it's for everyone in the space.
  private_to uuid references people (id),
  -- Another space, whose rules it brings in, or a skill's page.
  space_included uuid references spaces (id),
  skill_included uuid references pages (id),
  added_by uuid not null default current_person_id() references people (id),
  added_at timestamptz not null default clock_timestamp(),
  removed_by uuid references people (id),
  removed_at timestamptz,
  constraint includes_one_thing check (num_nonnulls(space_included, skill_included) = 1),
  constraint includes_not_itself check (space_included <> space_id)
);

create index includes_space on includes (space_id) where removed_at is null;
create index includes_space_included on includes (space_included) where removed_at is null;

-- A space includes the same thing once on each side.
create unique index includes_once on includes (space_id, private_to, coalesce(space_included, skill_included)) nulls not distinct
where removed_at is null;

-- Whether the principal can open what an include points to: the space, or
-- the space a skill is in and the skill, still there, on a side they can see.
-- It runs as its owner, so it also answers where row-level security would
-- hide the skill, and it says only yes or no.
create function include_open(space uuid, skill uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when space is not null then space in (select accessible_spaces())
    else exists (
      select from content t
      where t.page_id = skill and t.kind = 'title'
        and t.space_id in (select accessible_spaces())
        and (t.private_to is null or t.private_to = current_person_id())
        and not exists (select from content r where r.supersedes = t.id)
    )
  end
$$;

revoke execute on function include_open from public;
grant execute on function include_open to homing_app;

-- Only people change guidance, includes too. A shared include needs an admin
-- of its space, and points only to shared guidance, so what everyone there
-- gets is never one person's own. Something the person can't open is refused
-- before anything else is looked at, the same way whether or not it exists,
-- so the refusal says nothing about it. Removing one is once.
create function check_include() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only people change guidance' using errcode = 'insufficient_privilege';
  end if;
  if new.private_to is null and not admin_of(new.space_id) then
    raise exception 'only admins change shared guidance' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' then
    if old.removed_at is not null or new.removed_at is null then
      raise exception 'an include is removed once, and stays in the history' using errcode = 'check_violation';
    end if;
    new.removed_by := current_person_id();
    new.removed_at := clock_timestamp();
    return new;
  end if;
  if not include_open(new.space_included, new.skill_included) then
    raise exception 'that can''t be included' using errcode = 'insufficient_privilege';
  end if;
  if new.skill_included is not null and not exists (select from pages p where p.id = new.skill_included and p.type = 'skill') then
    raise exception 'only a skill is included on its own' using errcode = 'check_violation';
  end if;
  if new.private_to is null and not (
    exists (select from spaces x where x.id = new.space_included and x.private_to is null)
    or exists (select from content t where t.page_id = new.skill_included and t.kind = 'title' and t.private_to is null)
  ) then
    raise exception 'only shared guidance is included for everyone' using errcode = 'check_violation';
  end if;
  new.added_by := current_person_id();
  new.added_at := clock_timestamp();
  return new;
end
$$;

create trigger check_include
before insert or update on includes
for each row execute function check_include();

alter table includes enable row level security;

-- Seen where guidance is seen, a shared one also in the spaces below its own,
-- and only by someone who can open what it points to.
create policy visible on includes for select
using (
  include_open(space_included, skill_included)
  and (
    (space_id in (select accessible_spaces()) and (private_to is null or private_to = current_person_id()))
    or (private_to is null and space_id in (select guidance_reach()))
  )
);

create policy own on includes for insert
with check (
  include_open(space_included, skill_included)
  and space_id in (select accessible_spaces())
  and (
    private_to = current_person_id()
    or (private_to is null and space_id in (select id from spaces where private_to is null))
  )
);

-- Removed where it's set, by someone who can open what it points to.
create policy remove on includes for update
using (
  include_open(space_included, skill_included)
  and space_id in (select accessible_spaces())
  and (private_to is null or private_to = current_person_id())
);

grant select, insert (space_id, private_to, space_included, skill_included), update (removed_at) on includes to homing_app;

-- A space's admins see that it includes something for everyone they can't
-- open, so it never outlives everyone who could remove it: only that it's
-- there, whether it's rules or a skill, who added it and when, never what it
-- points to. They stop including it the same way.
create function includes_not_open(space uuid) returns table (id uuid, kind text, added_by uuid, added_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.id, case when i.skill_included is null then 'rules' else 'skill' end, i.added_by, i.added_at
  from includes i
  where i.space_id = includes_not_open.space and admin_of(includes_not_open.space)
    and i.private_to is null and i.removed_at is null
    and not include_open(i.space_included, i.skill_included)
  order by i.added_at
$$;

create function stop_including(include uuid, space uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only people change guidance' using errcode = 'insufficient_privilege';
  end if;
  -- check_include runs as for any removal: by a person directly, and an admin for a shared one.
  update includes i set removed_at = clock_timestamp()
  where i.id = stop_including.include and i.space_id = stop_including.space
    and i.private_to is null and i.removed_at is null and admin_of(i.space_id);
  return found;
end
$$;

revoke execute on function includes_not_open, stop_including from public;
grant execute on function includes_not_open, stop_including to homing_app;

-- An assistant proposes adding or removing an include like a rule, and the
-- person approves it, or a member's shared one becomes a request. What a new
-- one would include is kept beside the proposal, where only those who can
-- open it see it, so an admin deciding a request learns nothing of what they
-- can't open. Removing one names the include, which says what it points to.
alter table proposals
  add column include_id uuid references includes (id),
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in (
    'add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space',
    'archive page', 'reopen page', 'add include', 'remove include'
  )),
  add constraint proposals_include check ((action = 'remove include') = (include_id is not null));

create table proposal_includes (
  proposal_id uuid primary key references proposals (id),
  space_included uuid references spaces (id),
  skill_included uuid references pages (id),
  constraint proposal_includes_one_thing check (num_nonnulls(space_included, skill_included) = 1)
);

alter table proposal_includes enable row level security;

create policy visible on proposal_includes for select
using (include_open(space_included, skill_included) and proposal_id in (select id from proposals));

-- Added by the person it's proposed to, to their own open proposal, naming something they can open.
create policy own on proposal_includes for insert
with check (
  include_open(space_included, skill_included)
  and proposal_id in (
    select id from proposals
    where private_to = current_person_id() and action = 'add include' and state = 'open' and requested_at is null
  )
);

grant select, insert on proposal_includes to homing_app;

-- Removing an include names one in its own space that the person can see, and
-- what the proposal says about it comes from the include itself.
create function check_proposal_include() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  removing includes;
begin
  if new.action = 'add include' then
    new.change := jsonb_build_object('shared', coalesce((new.change->>'shared')::boolean, false), 'what', case when new.change->>'what' = 'skill' then 'skill' else 'rules' end);
  elsif new.action = 'remove include' then
    select i.* into removing from includes i
    where i.id = new.include_id and i.space_id = new.space_id
      and (i.private_to is null or i.private_to = current_person_id())
      and include_open(i.space_included, i.skill_included);
    if not found then
      raise exception 'that include isn''t in this space' using errcode = 'insufficient_privilege';
    end if;
    new.change := jsonb_build_object('shared', removing.private_to is null, 'what', case when removing.skill_included is null then 'rules' else 'skill' end);
  end if;
  return new;
end
$$;

create trigger check_proposal_include
before insert on proposals
for each row execute function check_proposal_include();

grant insert (include_id) on proposals to homing_app;
