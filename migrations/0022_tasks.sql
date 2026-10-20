-- Homing's own tasks (#6, spec §7): deliberately minimal. A title, an
-- optional description, open or done, an optional due date, an optional
-- assignee, a space and a side, and who wrote it. A task is a record, not
-- knowledge, so it has a table of its own with the same access rule.
-- Assistants keep the person's private tasks; only people write on a
-- space's shared side, directly, or by sharing a task of their own.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id),
  private_to uuid references people (id),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 20000),
  due date,
  assignee uuid references people (id) on delete set null,
  done_at timestamptz,
  done_by uuid references people (id) on delete set null,
  written_by uuid default current_person_id() references people (id) on delete set null,
  agent text default current_agent(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index tasks_open on tasks (space_id, due) where done_at is null;

alter table tasks enable row level security;

create policy visible on tasks
using (space_id in (select accessible_spaces()) and (private_to is null or private_to = current_person_id()))
with check (
  space_id in (select accessible_spaces())
  and (
    private_to = current_person_id()
    or (private_to is null and space_id in (select id from spaces where private_to is null))
  )
);

-- Who changed a task, and what they may change. Only people write a space's
-- shared tasks, directly. Assistants keep the person's own, and never
-- rewrite the words of one the person wrote, though they may still mark it
-- done or move its due date. An assignee has the space: on the shared side
-- anyone who can open it, on the private side only its owner; it's checked
-- when given, so a task stays changeable after someone leaves. The store
-- marks when a task is done, and who did it.
create function check_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  wrote boolean;
  changed boolean;
  assigning boolean;
begin
  if tg_op = 'INSERT' then
    wrote := true;
    changed := true;
    assigning := new.assignee is not null;
  else
    wrote := (new.title, new.description) is distinct from (old.title, old.description);
    -- Someone's account going leaves their tasks unassigned, which is no one's change.
    assigning := new.assignee is not null and (new.assignee, new.private_to) is distinct from (old.assignee, old.private_to);
    changed := wrote or assigning or (new.due, new.done_at, new.private_to) is distinct from (old.due, old.done_at, old.private_to);
  end if;
  if changed and new.private_to is null and not direct_edit() then
    raise exception 'only people write shared tasks' using errcode = 'insufficient_privilege';
  end if;
  if assigning and (
    (new.private_to is not null and new.assignee <> new.private_to)
    or (new.private_to is null and not exists (select from space_access a where a.space_id = new.space_id and a.person_id = new.assignee))
  ) then
    raise exception 'that person can''t be given this task' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    if wrote then
      if current_agent() is not null and old.agent is null and old.written_by is not null then
        raise exception 'agents never rewrite what people wrote' using errcode = 'insufficient_privilege';
      end if;
      new.written_by := current_person_id();
      new.agent := current_agent();
    end if;
    if new.done_at is distinct from old.done_at then
      if new.done_at is null then
        new.done_by := null;
      elsif old.done_at is null then
        new.done_at := clock_timestamp();
        new.done_by := current_person_id();
      else
        new.done_at := old.done_at;
      end if;
    end if;
    new.updated_at := clock_timestamp();
  end if;
  return new;
end
$$;

create trigger check_task
before insert or update on tasks
for each row execute function check_task();

-- Shares one of the person's own private tasks with its space.
create function share_task(task uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only people share tasks' using errcode = 'insufficient_privilege';
  end if;
  update tasks t set private_to = null
  where t.id = share_task.task and t.private_to = current_person_id()
    and t.space_id in (select accessible_spaces())
    and t.space_id in (select id from spaces where private_to is null);
  if not found then
    raise exception 'there''s no task of yours to share there' using errcode = 'insufficient_privilege';
  end if;
end
$$;

grant select, insert (space_id, private_to, title, description, due, assignee), update (title, description, due, assignee, done_at) on tasks to homing_app;
revoke execute on function share_task from public;
grant execute on function share_task to homing_app;
