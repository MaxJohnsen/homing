-- Homing no longer reads or sorts mail by itself (#149). 0045 and 0046 stay,
-- since they ran wherever Homing ran from main, and this undoes them, so the
-- database is as 0044 left it: learning runs, what they processed and their
-- maps go. What learning wrote stays: its notes are the person's knowledge,
-- and its model calls stay recorded with what they cost.

-- Proposals to start or extend learning, and plans that set a map, go with
-- the runs they were about, waiting or decided. Withdrawing them wouldn't
-- do: proposals as 0044 has them can't hold any of these, and nothing reads
-- them any more.
delete from proposals
where action in ('start learning', 'extend learning')
   or (action = 'plan' and exists (select from jsonb_array_elements(change -> 'steps') as step where step ->> 'action' = 'learning map'));

drop trigger learning_proposal on proposals;
drop function check_learning_proposal();
drop function learning_fits(jsonb, uuid, uuid);

alter table proposals
  drop constraint proposals_learning,
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in (
    'add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space',
    'archive page', 'reopen page', 'add include', 'remove include', 'plan'
  ));

-- A plan as 0035 has it.
create or replace function plan_fits(change jsonb, space uuid) returns boolean
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

-- Every plan left is one 0035 can hold.
do $$
begin
  if exists (select from proposals where action = 'plan' and not plan_fits(change, space_id)) then
    raise exception 'a plan is left that only learning could hold';
  end if;
end
$$;

-- Writing and replacing items as 0041 has it, without routines.
create or replace function own_text(written_by uuid, agent text, imported jsonb) returns boolean
language sql stable
as $$
  select written_by = current_person_id() and agent is null and not coalesce(imported ? 'author', false)
$$;

create or replace function keep_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  -- A person's assistant changing, on their private side, text they wrote themselves here.
  for_them boolean := current_agent() is not null and current_person_id() is not null
    and old.kind = 'text' and old.private_to = current_person_id() and own_text(old.written_by, old.agent, old.imported);
begin
  if by_person(old.written_by, old.agent, old.imported) and (current_agent() is not null or current_space_id() is not null) and not for_them then
    raise exception 'agents never rewrite what people wrote' using errcode = 'insufficient_privilege';
  end if;
  insert into revisions (content_id, space_id, private_to, body, written_by, agent, edit_agent, written_at, imported)
  values (old.id, old.space_id, old.private_to, old.body, old.written_by, old.agent, old.edit_agent, old.updated_at, imported_author(old.imported));
  if for_them then
    -- It stays theirs, changed by their assistant.
    new.written_by := old.written_by;
    new.agent := null;
    new.edit_agent := current_agent();
  else
    new.written_by := current_person_id();
    new.agent := current_agent();
    new.edit_agent := null;
  end if;
  new.updated_at := clock_timestamp();
  new.imported := old.imported - 'author';
  return new;
end
$$;

create or replace function check_replacement() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not exists (
    select from content replaced
    where replaced.id = new.supersedes
      and case new.kind
        when 'text' then
          replaced.kind = 'text'
          and (new.private_to is not null or replaced.private_to is null)
          and (
            (current_agent() is null and current_space_id() is null)
            or not by_person(replaced.written_by, replaced.agent, replaced.imported)
            or (current_agent() is not null and new.private_to = current_person_id() and replaced.private_to is null
                and own_text(replaced.written_by, replaced.agent, replaced.imported))
          )
        when 'removed' then
          replaced.private_to is not distinct from new.private_to
          and replaced.reaches_down = new.reaches_down
        else false
      end
  ) then
    raise exception 'that item can''t be replaced' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- Model calls stay, without the run they were for. One that never reached
-- the provider cost nothing, as one the provider refused, and is kept as
-- that. One that asked for a map was sorting mail.
alter table model_calls
  drop column run_id,
  drop column run_history,
  drop constraint model_calls_cost_from_check;

update model_calls set cost_from = 'refused' where cost_from = 'not sent';
update model_calls set purpose = 'sort' where purpose = 'map';

alter table model_calls
  add constraint model_calls_cost_from_check check (cost_from in ('provider', 'prices', 'worst case', 'refused'));

-- Reserving a call, and what calls cost this month, as 0044 has them.
drop function reserve_model_call(text, text, uuid[], numeric, uuid, text, uuid);

create function reserve_model_call(purpose text, model text, spaces uuid[], worst numeric)
returns table (call uuid, refused text, spent numeric, under_way numeric, cap numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  month timestamptz := date_trunc('month', now(), 'UTC');
  limits model_spending;
  off uuid[];
  used numeric;
  held numeric;
  made uuid;
begin
  if me is null then
    raise exception 'a model call is made for a person' using errcode = 'insufficient_privilege';
  end if;
  if spaces is null or cardinality(spaces) = 0 or array_position(spaces, null) is not null then
    raise exception 'a model call names every space whose content it carries' using errcode = 'insufficient_privilege';
  end if;
  if worst is null or not (worst >= 0 and worst < 'infinity') then
    raise exception 'a model call has a worst case of zero or more' using errcode = 'check_violation';
  end if;
  -- Who can open what holds until this is recorded.
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  if exists (select unnest(spaces) except select accessible_spaces()) then
    raise exception 'no access to a space the call carries' using errcode = 'insufficient_privilege';
  end if;
  off := array(select model_off(spaces));
  if cardinality(off) > 0 then
    raise exception 'model processing is off' using errcode = 'insufficient_privilege', detail = array_to_string(off, ',');
  end if;

  -- One reservation at a time, so calls made at once can't each fit the
  -- same room under the limit.
  perform pg_advisory_xact_lock(hashtext('homing.model_spending'));
  -- A call Homing stopped during, and never settled, counts at its worst case.
  update model_calls c set state = 'failed', cost = c.reserved, cost_from = 'worst case', settled_at = clock_timestamp()
  where c.state = 'under way' and c.started_at < now() - interval '15 minutes';

  select * into limits from model_spending;
  select coalesce(sum(c.cost), 0), coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0) into used, held
  from model_calls c where c.started_at >= month;
  if limits.paused_at >= month and (limits.changed_at is null or limits.paused_at > limits.changed_at) then
    return query select null::uuid, 'paused', used, held, limits.monthly_limit;
    return;
  end if;
  if used + worst > limits.monthly_limit then
    update model_spending set paused_at = clock_timestamp();
    return query select null::uuid, 'monthly limit', used, held, limits.monthly_limit;
    return;
  end if;
  if used + held + worst > limits.monthly_limit then
    return query select null::uuid, 'busy', used, held, limits.monthly_limit;
    return;
  end if;
  insert into model_calls (person_id, purpose, model, spaces, reserved)
  values (me, reserve_model_call.purpose, reserve_model_call.model, reserve_model_call.spaces, worst)
  returning id into made;
  return query select made, null::text, used, held, limits.monthly_limit;
end
$$;

drop function model_usage_this_month();

create function model_usage_this_month()
returns table (person_id uuid, name text, calls bigint, cost numeric, under_way numeric)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select from people p where p.id = current_person_id() and p.instance_admin) then
    raise exception 'only whoever looks after Homing sees this' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.person_id, p.name, count(*), coalesce(sum(c.cost), 0), coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0)
  from model_calls c left join people p on p.id = c.person_id
  where c.started_at >= date_trunc('month', now(), 'UTC')
  group by c.person_id, p.name
  order by 4 desc, 2;
end
$$;

revoke execute on function reserve_model_call, model_usage_this_month from public;
grant execute on function reserve_model_call, model_usage_this_month to homing_app;

-- Learning itself: what directs runs, what the worker calls, the runs and
-- what they processed, with their policies, indexes and grants, and the
-- limit for a run's history.
drop function estimate_learning(uuid, timestamptz, jsonb);
drop function start_learning(uuid, numeric, timestamptz, timestamptz);
drop function pause_learning(uuid);
drop function resume_learning(uuid);
drop function estimate_extension(uuid, timestamptz, jsonb);
drop function extend_learning(uuid, timestamptz);
drop function set_learning_limit(uuid, numeric);
drop function set_learning_exclusions(uuid, text[], text[], text[]);
drop function retry_learning(uuid, text);
drop function summarize_learning(uuid, timestamptz);
drop function set_learning_map(uuid, jsonb, text);
drop function learning_map_asking(uuid, boolean);
drop function claim_learning_run(uuid, integer);
drop function learning_marked(uuid, uuid, jsonb, uuid);
drop function learning_walked(uuid, uuid, text, timestamptz, text, boolean, timestamptz, integer, boolean);
drop function learning_later(uuid, uuid, integer, text, jsonb, integer);
drop function learning_summarized(uuid, uuid, jsonb, jsonb, boolean);
drop function learning_reopened(uuid, uuid, text[], boolean);
drop function learning_mapped(learning_runs, jsonb, text, text[]);
drop function own_learning_run(uuid);
drop function claimed_learning_run(uuid, uuid);
drop function learning_active(learning_runs);
drop function learning_elsewhere(uuid);
drop function learning_spent(uuid);
drop function learning_failures(jsonb, jsonb, text[]);
drop function learning_retryable(text);
drop function set_run_ceiling(numeric);

drop table learned_items;
drop table learning_runs;

drop function routes_fit(jsonb);
drop function route_names(text);
drop function sender_matches(text, text);
drop function routine_derived(uuid, text, uuid);
drop function current_routine();

alter table model_spending drop column run_ceiling;
