-- A model of Homing's own (#129, spec §11). Whoever runs Homing brings a
-- provider's API key, and Homing calls a model in one place, which checks
-- before anything is sent: that the person can open every space the call
-- carries content from, that none of them has model processing off, and that
-- the call's worst case fits the monthly limit, counting the calls still under
-- way. Each call is recorded with what it cost. Prompts and answers are never
-- kept: only the model, what the call was for, its tokens and cost, the person
-- and the spaces.

-- Model processing is on unless an admin turns it off. Off in a space covers
-- the spaces in it, closed ones included, as guidance reaches them, so
-- nothing in any of them is sent either.
alter table spaces
  add column model_off_at timestamptz,
  add column model_off_by uuid references people (id) on delete set null;

-- Turns model processing off for a space, or back on. Only its admins do.
-- Their assistant may turn it off, the safe way, but only the person turns it
-- on, in Homing itself. Whether it changed anything.
create function set_model_processing(space uuid, model_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target spaces;
begin
  if current_person_id() is null or (model_on and not direct_edit()) then
    raise exception 'only a person turns model processing on, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  select * into target from spaces s where s.id = set_model_processing.space and s.id in (select accessible_spaces()) for update;
  if not found then
    raise exception 'there''s no space there that you can open' using errcode = 'insufficient_privilege';
  end if;
  if not admin_of(target.id) then
    raise exception 'only its admins turn model processing on or off' using errcode = 'insufficient_privilege';
  end if;
  if model_on and target.model_off_at is not null then
    update spaces set model_off_at = null, model_off_by = null where id = target.id;
    return true;
  elsif not model_on and target.model_off_at is null then
    update spaces set model_off_at = clock_timestamp(), model_off_by = current_person_id() where id = target.id;
    return true;
  end if;
  return false;
end
$$;

-- Which of these spaces have model processing off, themselves or through a
-- space above them, whoever can open those. Only the functions here use it.
create function model_off(spaces uuid[]) returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  with recursive up (start, id, parent_id, off, depth) as (
    select s.id, s.id, s.parent_id, s.model_off_at is not null, 0 from spaces s where s.id = any (model_off.spaces)
    union all
    select up.start, s.id, s.parent_id, s.model_off_at is not null, up.depth + 1
    from spaces s join up on s.id = up.parent_id
    where not up.off and up.depth < 100
  )
  select distinct start from up where off
$$;

-- Model processing in a space the person can open: when it was turned off
-- there and by whom, or whether it's off in a space above it, which is named
-- only when they can open that one too. Nothing for a space they can't open.
create function model_processing_of(space uuid)
returns table (off_at timestamptz, off_by uuid, off_above boolean, off_in uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  with recursive up (id, parent_id, off_at, depth) as (
    select s.id, s.parent_id, s.model_off_at, 1 from spaces s
    where s.id = (select p.parent_id from spaces p where p.id = model_processing_of.space)
    union all
    select s.id, s.parent_id, s.model_off_at, up.depth + 1 from spaces s join up on s.id = up.parent_id
    where up.off_at is null and up.depth < 100
  ),
  nearest as (select up.id from up where up.off_at is not null limit 1)
  select s.model_off_at, s.model_off_by, exists (select from nearest),
         (select n.id from nearest n where n.id in (select accessible_spaces()))
  from spaces s
  where s.id = model_processing_of.space and s.id in (select accessible_spaces())
$$;

-- What the model costs this Homing: a monthly limit for ongoing learning,
-- set by whoever looks after it, and when work last paused at it. One row.
create table model_spending (
  only_one boolean primary key default true check (only_one),
  -- In USD, for each calendar month in UTC.
  monthly_limit numeric(12, 2) not null default 10 check (monthly_limit >= 0),
  changed_at timestamptz,
  changed_by uuid references people (id) on delete set null,
  -- When a call was last refused because what was spent and it could pass
  -- the limit. Learning stays paused until the limit is set again, raised or
  -- not, or the month ends.
  paused_at timestamptz
);

insert into model_spending default values;

-- Every model call, recorded before it's sent and settled once it's done.
create table model_calls (
  id uuid primary key default gen_random_uuid(),
  -- Who it was for. A call stays counted when its person leaves.
  person_id uuid references people (id) on delete set null,
  -- What it was for, such as sorting, and which model.
  purpose text not null check (purpose ~ '^[a-z][a-z -]{0,39}$'),
  model text not null check (char_length(model) between 1 and 200),
  -- Every space whose content it carried.
  spaces uuid[] not null check (cardinality(spaces) between 1 and 1000),
  state text not null default 'under way' check (state in ('under way', 'done', 'failed')),
  -- Its worst case in USD, held against the limit while it's under way.
  reserved numeric(14, 8) not null check (reserved >= 0),
  -- What it cost, once settled, and how Homing knows: the provider said,
  -- its prices and tokens, its worst case when neither, or nothing when the
  -- provider refused it before any model ran.
  cost numeric(14, 8) check (cost >= 0),
  cost_from text check (cost_from in ('provider', 'prices', 'worst case', 'refused')),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  started_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  check ((state = 'under way') = (cost is null))
);

create index model_calls_month on model_calls (started_at);
create index model_calls_person on model_calls (person_id, started_at);
create index model_calls_under_way on model_calls (started_at) where state = 'under way';

alter table model_spending enable row level security;
alter table model_calls enable row level security;

-- Everyone signed in sees the limit and whether work is paused at it.
create policy everyone on model_spending for select
using (current_person_id() is not null);

-- A person sees only their own calls.
create policy own on model_calls for select
using (person_id = current_person_id());

-- Homing's role reads them, and changes them only through the functions below.
grant select on model_spending, model_calls to homing_app;

-- Reserves a call's worst case for the person, or refuses it. Refused
-- outright when it carries no space, a space they can't open, or one with
-- model processing off. Otherwise held against the monthly limit, with the
-- calls under way at their worst case. A call that what was spent alone
-- leaves no room for pauses learning, which is kept, so it returns the
-- refusal rather than raising it. One that only the calls under way leave no
-- room for is refused for now, without pausing anything.
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

-- Records what a reserved call cost, once it's done or failed. Only the
-- person it was for settles it, once. Whether it was still under way.
create function settle_model_call(call uuid, outcome text, cost numeric, cost_from text, input_tokens integer, output_tokens integer)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if outcome not in ('done', 'failed') or not (cost >= 0 and cost < 'infinity') then
    raise exception 'a settled call is done or failed, at a cost of zero or more' using errcode = 'check_violation';
  end if;
  update model_calls c
  set state = outcome, cost = settle_model_call.cost, cost_from = settle_model_call.cost_from,
      input_tokens = settle_model_call.input_tokens, output_tokens = settle_model_call.output_tokens, settled_at = clock_timestamp()
  where c.id = settle_model_call.call and c.person_id = current_person_id() and c.state = 'under way';
  return found;
end
$$;

-- Sets the monthly limit, which resumes learning paused at the old one, even
-- set to the same. Only whoever looks after Homing, in Homing itself.
create function set_model_limit(monthly_limit numeric) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() or not exists (select from people p where p.id = current_person_id() and p.instance_admin) then
    raise exception 'only whoever looks after Homing sets its limit' using errcode = 'insufficient_privilege';
  end if;
  if not (set_model_limit.monthly_limit >= 0 and set_model_limit.monthly_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('homing.model_spending'));
  update model_spending
  set monthly_limit = set_model_limit.monthly_limit, changed_at = clock_timestamp(), changed_by = current_person_id();
end
$$;

-- What the model cost this month, person by person, for whoever looks after
-- Homing: never what the calls were about or which spaces they carried.
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

-- Sharing a space from a personal space moves it out of the tree it was in,
-- as 0021 does, and keeps model processing off on it when it was off there,
-- itself or above it, so nothing that was kept from a model is sent once
-- it's shared. Spaces in it keep it off through it.
create or replace function make_collaborative(space uuid, new_parent uuid, closed boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  moving spaces;
  was_off boolean;
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

  was_off := exists (select from model_off(array[make_collaborative.space]));
  update spaces set private_to = null where id in (select space_subtree(make_collaborative.space));
  update spaces
  set parent_id = new_parent, closed = new_parent is not null and make_collaborative.closed,
      model_off_at = case when was_off then coalesce(moving.model_off_at, clock_timestamp()) end,
      model_off_by = case when was_off then coalesce(moving.model_off_by, me) end
  where id = make_collaborative.space;
  insert into space_moves (space_id, moved_from) values (make_collaborative.space, moving.parent_id);
end
$$;

-- Starts an import as 0038 does, and keeps model processing off on each space
-- whose export says it was, so what was kept from a model stays kept from one.
create or replace function import_begin(bundle jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  import uuid := gen_random_uuid();
  made uuid[] := '{}';
  entry jsonb;
  parent uuid;
begin
  if me is null or not direct_edit() then
    raise exception 'only a person imports a space, directly' using errcode = 'insufficient_privilege';
  end if;
  for entry in select value from jsonb_array_elements(bundle -> 'spaces') with ordinality order by ordinality loop
    parent := (entry ->> 'parent')::uuid;
    if (parent is null) <> (cardinality(made) = 0) or (parent is not null and not parent = any (made)) then
      raise exception 'the spaces in an import hang together under the first' using errcode = 'check_violation';
    end if;
    insert into spaces (id, name, parent_id, closed, created_by, agent, created_at, archived_at, imported, model_off_at, model_off_by)
    values ((entry ->> 'id')::uuid, entry ->> 'name', parent, parent is not null and (entry ->> 'closed')::boolean, null, null,
            coalesce(not_later((entry ->> 'createdAt')::timestamptz), clock_timestamp()), not_later((entry ->> 'archivedAt')::timestamptz),
            coalesce(entry -> 'imported', '{}') || jsonb_build_object('import', import),
            case when entry ->> 'modelProcessing' = 'off' then clock_timestamp() end,
            case when entry ->> 'modelProcessing' = 'off' then me end);
    made := made || (entry ->> 'id')::uuid;
  end loop;
  if cardinality(made) = 0 then
    raise exception 'an import has a space' using errcode = 'check_violation';
  end if;
  insert into imports (id, space_id, instance, exported_by, exported_at, original_space, done, touched_at)
  values (import, made[1], bundle -> 'from' ->> 'instance', bundle -> 'from' ->> 'exportedBy', not_later((bundle -> 'from' ->> 'exportedAt')::timestamptz),
          (bundle -> 'from' ->> 'space')::uuid, false, clock_timestamp());
  -- Hidden before anyone has them, then the person's.
  insert into importing (space_id, import_id) select unnest(made), import;
  insert into memberships (space_id, person_id, role) select unnest(made), me, 'admin';
  return import;
end
$$;

revoke execute on function set_model_processing, model_off, model_processing_of, reserve_model_call, settle_model_call, set_model_limit, model_usage_this_month from public;
grant execute on function set_model_processing, model_processing_of, reserve_model_call, settle_model_call, set_model_limit, model_usage_this_month to homing_app;
