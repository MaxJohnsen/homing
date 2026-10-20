-- Related changes are one decision (spec §6). A plan is one proposal holding
-- several changes in one space, which it may also create: sharing the
-- person's items and tasks there, its rules, and who's in it. The person it's
-- for approves it as it is, or declines it, like any other proposal, and
-- approving makes every change as them, in one transaction. A plan is never a
-- request: what a space's admins decide stays a proposal of its own.
--
-- Its steps are in its change, each as its own proposal holds it, so the
-- columns that point at one thing stay empty. A new space goes where the plan
-- waits.

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in (
    'add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space',
    'archive page', 'reopen page', 'add include', 'remove include', 'plan'
  )),
  add constraint proposals_plan check (action <> 'plan' or (
    not request and item_id is null and task_id is null and page_id is null and include_id is null
    and jsonb_typeof(change->'steps') = 'array'
    -- Every step is one a plan can hold.
    and jsonb_array_length(change->'steps') = jsonb_array_length(jsonb_path_query_array(
      change, '$.steps[*].action ? (@ == "publish" || @ == "share task" || @ == "change members" || @ == "add rule" || @ == "change rule" || @ == "remove rule")'
    ))
    and (change->'space' is null or change->'space'->>'in' = space_id::text)
  )),
  -- A plan that creates its space keeps which, as a suggested space does.
  drop constraint proposals_space_created,
  add constraint proposals_space_created check (space_created is null or (action in ('add space', 'plan') and state = 'approved'));
