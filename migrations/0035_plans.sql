-- Related changes are one decision (spec §6). A plan is one proposal holding
-- several changes in one space, which it may also create: sharing the
-- person's items and tasks there, its rules, and who's in it. The person it's
-- for approves it as it is, or declines it, like any other proposal, and
-- approving makes every change as them, in one transaction. A plan is never a
-- request: what a space's admins decide stays a proposal of its own.
--
-- Its steps are in its change, each as its own proposal holds it, so the
-- columns that point at one thing stay empty. A new space goes where the plan
-- waits, open to everyone there.

-- Whether a plan's change holds only what a plan can: each step whole and of a
-- kind a plan makes, at least two changes, and a new space with a name, in the
-- space the plan waits in.
create function plan_fits(change jsonb, space uuid) returns boolean
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  step jsonb;
  id constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(change) is distinct from 'object' or jsonb_typeof(change->'steps') is distinct from 'array' then
    return false;
  end if;
  if change ? 'space' and not coalesce(
    jsonb_typeof(change->'space') = 'object'
    and change->'space'->>'in' = space::text
    and jsonb_typeof(change->'space'->'name') = 'string' and btrim(change->'space'->>'name') <> ''
    and change->'space'->'who' = '"with others"'::jsonb
    and change->'space'->'closed' = 'false'::jsonb,
    false
  ) then
    return false;
  end if;
  if jsonb_array_length(change->'steps') + (change ? 'space')::int < 2 then
    return false;
  end if;
  for step in select value from jsonb_array_elements(change->'steps') loop
    if not coalesce(jsonb_typeof(step) = 'object' and case step->>'action'
      when 'publish' then step->>'item' ~ id
      when 'share task' then step->>'task' ~ id
      when 'change members' then
        step->>'member' in ('add', 'make admin', 'make member', 'remove')
        and (step ? 'person') <> (step ? 'email')
        and (not step ? 'person' or step->>'person' ~ id)
        and (not step ? 'email' or jsonb_typeof(step->'email') = 'string')
        and (not step ? 'personName' or jsonb_typeof(step->'personName') = 'string')
      when 'add rule' then
        step->>'kind' in ('requirement', 'preference')
        and jsonb_typeof(step->'text') = 'string' and btrim(step->>'text') <> ''
        and jsonb_typeof(step->'shared') = 'boolean' and jsonb_typeof(step->'onlyHere') = 'boolean'
      when 'change rule' then step->>'rule' ~ id and jsonb_typeof(step->'text') = 'string' and btrim(step->>'text') <> ''
      when 'remove rule' then step->>'rule' ~ id
      else false
    end, false) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

revoke execute on function plan_fits from public;
grant execute on function plan_fits to homing_app;

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in (
    'add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space',
    'archive page', 'reopen page', 'add include', 'remove include', 'plan'
  )),
  add constraint proposals_plan check (action <> 'plan' or coalesce(
    not request and item_id is null and task_id is null and page_id is null and include_id is null and plan_fits(change, space_id),
    false
  )),
  -- A plan that creates its space keeps which, as a suggested space does.
  drop constraint proposals_space_created,
  add constraint proposals_space_created check (space_created is null or (action in ('add space', 'plan') and state = 'approved'));
