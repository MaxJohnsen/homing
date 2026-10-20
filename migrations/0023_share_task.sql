-- Assistants propose sharing a task (#6, spec §6 and §7). An assistant keeps
-- the person's private tasks, and when they want one on the space's shared
-- side, it proposes that: the person approves it, as with sharing knowledge.

alter table proposals
  add column task_id uuid references tasks (id),
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task')),
  add constraint proposals_share_task check ((action = 'share task') = (task_id is not null) and (action <> 'share task' or not request));

-- A proposal to share a task is about one of the person's own open tasks, in
-- its own space, which has a shared side.
create function check_proposal_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.task_id is not null
     and not exists (
       select from tasks t join spaces s on s.id = t.space_id
       where t.id = new.task_id and t.space_id = new.space_id and t.private_to = new.private_to and t.done_at is null and s.private_to is null
     ) then
    raise exception 'that task isn''t yours in this space' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_proposal_task
before insert on proposals
for each row execute function check_proposal_task();

grant insert (task_id) on proposals to homing_app;
