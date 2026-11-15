-- Learning from a connected source (#132, spec §8). A person starts a run
-- for a place of theirs, such as their mailbox, with a scope, such as two
-- years back. It learns through the place's history, oldest first, then
-- follows what arrives, from a checkpoint the place's connector keeps. Each
-- item it processed is marked with its id and version, in the same
-- transaction as what learning wrote from it, so nothing is processed twice.
-- While it learns history, its model calls are held to its own spending
-- limit; once it follows, to the monthly limit. Only its owner sees a run,
-- its progress, its spending and what it processed, as with the place.

-- A person's routine, such as learning from their mailbox, acts for them the
-- way their assistant does, under every check an agent is under, with
-- homing.agent set too. But it isn't their assistant: what it writes is
-- derived from sources, and the exception that lets their assistant change
-- what they wrote themselves never applies to it.
create function current_routine() returns text
language sql stable
as $$ select nullif(current_setting('homing.routine', true), '') $$;

grant execute on function current_routine to homing_app;

-- Whether the person acting wrote it themselves here: not an agent, not
-- someone in an import, and never while a routine acts, which doesn't change
-- what a person wrote.
create or replace function own_text(written_by uuid, agent text, imported jsonb) returns boolean
language sql stable
as $$
  select written_by = current_person_id() and agent is null and not coalesce(imported ? 'author', false)
     and current_routine() is null
$$;

create table learning_runs (
  id uuid primary key default gen_random_uuid(),
  -- The place it learns from, one run for each, and its owner, who alone
  -- sees it, while they can open its space.
  place_id uuid not null references places (id) on delete cascade,
  connection_id uuid not null references connections (id) on delete cascade,
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  -- How far back it learns, and where the connector's walk through the place
  -- stands, as the connector keeps it.
  since timestamptz not null,
  checkpoint text check (length(checkpoint) <= 200000),
  -- A scope extended further back, walked on its own until it's done: the
  -- range it adds, and where the walk through it stands.
  extension_since timestamptz,
  extension_until timestamptz,
  extension_checkpoint text check (length(extension_checkpoint) <= 200000),
  -- Estimating until the person starts it with a limit; then learning
  -- history, following once it caught up, or paused, needing attention, or
  -- done once its place is removed or its account revoked.
  state text not null default 'estimating'
    check (state in ('estimating', 'learning history', 'following', 'paused', 'needs attention', 'done')),
  -- Why it's paused, needs attention or is done.
  reason text check (reason in ('person', 'limit', 'monthly limit', 'sign in again', 'not set up', 'failing', 'removed')),
  -- How far through the place's history it is, and when it first caught up.
  learned_up_to timestamptz,
  caught_up_at timestamptz,
  -- In USD, for what it learns from history, extensions included.
  spending_limit numeric(12, 2) not null default 0 check (spending_limit between 0 and 1000000),
  -- The last estimate, as Homing made it: what's there and what it may cost.
  estimate jsonb check (jsonb_typeof(estimate) = 'object' and pg_column_size(estimate) < 10000),
  -- What the person set aside: senders by address or domain, and folders by name.
  excluded_senders text[] not null default '{}' check (cardinality(excluded_senders) <= 200),
  excluded_folders text[] not null default '{}' check (cardinality(excluded_folders) <= 200),
  -- When it next needs work, how often in a row it failed, and which of
  -- Homing's workers works on it, until when.
  next_at timestamptz not null default now(),
  attempts integer not null default 0,
  claimed_by uuid,
  claimed_until timestamptz,
  lease_seconds integer,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  changed_at timestamptz not null default now(),
  check ((state in ('paused', 'needs attention', 'done')) = (reason is not null)),
  check ((extension_since is null) = (extension_until is null))
);

create unique index learning_runs_place on learning_runs (place_id);
create index learning_runs_person on learning_runs (private_to);
create index learning_runs_space on learning_runs (space_id);
create index learning_runs_connection on learning_runs (connection_id);
create index learning_runs_due on learning_runs (next_at) where state in ('learning history', 'following');

-- Each item a run processed, by its id and version there: learned from, or
-- set aside and why. A conversation is learned from together, and the note
-- learning wrote from it is kept with each of its items.
create table learned_items (
  run_id uuid not null references learning_runs (id) on delete cascade,
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  item text not null check (length(item) between 1 and 1024),
  version text not null check (length(version) between 1 and 200),
  thread text check (length(thread) between 1 and 1024),
  outcome text not null check (outcome in ('learned', 'set aside')),
  reason text check (reason ~ '^[a-z][a-z ]{0,39}$'),
  note uuid references content (id) on delete set null,
  processed_at timestamptz not null default clock_timestamp(),
  primary key (run_id, item),
  check ((outcome = 'set aside') = (reason is not null))
);

create index learned_items_thread on learned_items (run_id, thread);
create index learned_items_space on learned_items (space_id);
create index learned_items_note on learned_items (note);

alter table learning_runs enable row level security;
alter table learned_items enable row level security;

-- Only its owner sees a run, and what it processed, while they can open its space.
create policy own on learning_runs for select
using (private_to = current_person_id() and space_id in (select accessible_spaces()));

create policy own on learned_items for select
using (private_to = current_person_id() and space_id in (select accessible_spaces()));

-- Homing reads them, and changes them only through the functions below.
grant select on learning_runs, learned_items to homing_app;

-- What a model call was for: a learning run, and whether it was for the run's
-- history, which its own limit covers rather than the monthly one.
alter table model_calls
  add column run_id uuid references learning_runs (id) on delete set null,
  add column run_history boolean not null default false;

create index model_calls_run on model_calls (run_id) where run_id is not null;

-- The state a run carries on in: history while it hasn't caught up or walks
-- an extension, and otherwise following what arrives.
create function learning_active(r learning_runs) returns text
language sql immutable
as $$
  select case when r.extension_since is not null or r.caught_up_at is null then 'learning history' else 'following' end
$$;

-- What a run spent on its history, with the worst case of its calls under way.
create function learning_spent(run uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(coalesce(c.cost, c.reserved)), 0) from model_calls c where c.run_id = learning_spent.run and c.run_history
$$;

-- The person's own run, for them or their assistant to direct, held until
-- the transaction ends. Never a routine's or a space's, and the same refusal
-- whether it isn't theirs or doesn't exist.
create function own_learning_run(run uuid) returns learning_runs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found learning_runs;
begin
  if current_person_id() is null or current_routine() is not null then
    raise exception 'only a person, or their assistant, directs learning' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  select r.* into found from learning_runs r
  where r.id = own_learning_run.run and r.private_to = current_person_id() and r.space_id in (select accessible_spaces())
  for update;
  if found.id is null then
    raise exception 'there is no such learning run' using errcode = 'insufficient_privilege';
  end if;
  if found.state = 'done' then
    raise exception 'that learning run has stopped, since its place is gone' using errcode = 'check_violation';
  end if;
  return found;
end
$$;

-- Records an estimate for learning from a place of the person's own, before
-- it starts: the run, made for the place, which estimates until it's started,
-- a step of its own. Estimated again, it takes the new scope and estimate.
create function estimate_learning(place uuid, since timestamptz, estimate jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  target places;
  made uuid;
begin
  if me is null or current_routine() is not null then
    raise exception 'only a person, or their assistant, directs learning' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  select p.* into target from places p join connections c on c.id = p.connection_id
  where p.id = estimate_learning.place and p.private_to = me and c.person_id = me
    and p.removed_at is null and c.revoked_at is null and p.space_id in (select accessible_spaces());
  if target.id is null then
    raise exception 'there is no such place of yours' using errcode = 'insufficient_privilege';
  end if;
  if since is null or not (since > '1990-01-01' and since < now()) then
    raise exception 'learning starts from a day in the past' using errcode = 'check_violation';
  end if;
  insert into learning_runs (place_id, connection_id, space_id, private_to, since, estimate)
  values (target.id, target.connection_id, target.space_id, me, estimate_learning.since, estimate_learning.estimate)
  on conflict (place_id) do update
  set since = excluded.since, estimate = excluded.estimate, changed_at = clock_timestamp()
  where learning_runs.state = 'estimating'
  returning id into made;
  if made is null then
    raise exception 'learning there has already started' using errcode = 'check_violation';
  end if;
  return made;
end
$$;

-- Starts a run that was estimated, with its spending limit. The person sets
-- any limit; their assistant at most the one the estimate suggested, since
-- raising what a run may spend is the person's.
create function start_learning(run uuid, spending_limit numeric) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state <> 'estimating' then
    raise exception 'learning there has already started' using errcode = 'check_violation';
  end if;
  if r.estimate is null then
    raise exception 'learning is estimated before it starts' using errcode = 'check_violation';
  end if;
  if spending_limit is null or not (spending_limit >= 0 and spending_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  if current_agent() is not null and spending_limit > coalesce((r.estimate ->> 'limit')::numeric, 0) then
    raise exception 'only the person sets a higher limit, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs
  set state = 'learning history', spending_limit = start_learning.spending_limit, started_at = clock_timestamp(),
      next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Pauses a run, for the person or their assistant. Whether it changed anything.
create function pause_learning(run uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state not in ('learning history', 'following', 'needs attention') then
    return false;
  end if;
  update learning_runs set state = 'paused', reason = 'person', changed_at = clock_timestamp() where id = r.id;
  return true;
end
$$;

-- Resumes a paused run, or one that needed attention, where it stopped, for
-- the person or their assistant. One paused at its limit resumes only by
-- setting its limit, which is the person's. The state it's in now.
create function resume_learning(run uuid) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state not in ('paused', 'needs attention') then
    return r.state;
  end if;
  if r.reason = 'limit' then
    raise exception 'that learning run is at its limit, which only the person raises, in Homing itself' using errcode = 'check_violation';
  end if;
  update learning_runs set state = learning_active(r), reason = null, next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where id = r.id;
  return learning_active(r);
end
$$;

-- Extends a started run's scope further back, with the estimate for what it
-- adds. Only the range it adds is walked, on its own, oldest first, and a
-- run following what arrives learns history again until it's done. One that
-- hasn't begun its walk simply starts further back. Extended again while it
-- walks an extension, that walk starts over from the new start, and what it
-- already processed is skipped. Its limit stays as it is. Whether it changed
-- anything.
create function extend_learning(run uuid, since timestamptz, estimate jsonb) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state = 'estimating' then
    raise exception 'learning there hasn''t started yet' using errcode = 'check_violation';
  end if;
  if extend_learning.since is null or extend_learning.since >= r.since or extend_learning.since <= '1990-01-01' then
    return false;
  end if;
  if r.checkpoint is null and r.caught_up_at is null and r.extension_since is null then
    update learning_runs
    set since = extend_learning.since, estimate = coalesce(extend_learning.estimate, r.estimate), changed_at = clock_timestamp()
    where id = r.id;
    return true;
  end if;
  update learning_runs
  set since = extend_learning.since,
      extension_since = extend_learning.since,
      extension_until = coalesce(r.extension_until, r.since),
      extension_checkpoint = null,
      estimate = coalesce(extend_learning.estimate, r.estimate),
      state = case when r.state = 'following' then 'learning history' else r.state end,
      next_at = now(),
      changed_at = clock_timestamp()
  where id = r.id;
  return true;
end
$$;

-- Sets what a run may spend on history. Only the person does, in Homing
-- itself. Raising it resumes a run paused at its limit, once it leaves room.
create function set_learning_limit(run uuid, spending_limit numeric) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if not direct_edit() then
    raise exception 'only the person sets what learning may spend, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if spending_limit is null or not (spending_limit >= 0 and spending_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  update learning_runs set spending_limit = set_learning_limit.spending_limit, changed_at = clock_timestamp() where id = r.id;
  if r.state = 'paused' and r.reason = 'limit' and learning_spent(r.id) < set_learning_limit.spending_limit then
    update learning_runs set state = learning_active(r), reason = null, next_at = now(), attempts = 0 where id = r.id;
  end if;
end
$$;

-- Sets what a run leaves out without a model: senders, by address or domain,
-- and folders, by name. For the person or their assistant, since leaving
-- something out sends less.
create function set_learning_exclusions(run uuid, senders text[], folders text[]) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if senders is null or folders is null or cardinality(senders) > 200 or cardinality(folders) > 200
     or exists (select from unnest(senders || folders) as one (value) where one.value is null or length(one.value) not between 1 and 320 or one.value ~ '[[:cntrl:]]') then
    raise exception 'set aside up to 200 senders and 200 folders, each on one line' using errcode = 'check_violation';
  end if;
  update learning_runs
  set excluded_senders = array(select distinct lower(btrim(value)) from unnest(senders) as one (value) order by 1),
      excluded_folders = array(select distinct btrim(value) from unnest(folders) as one (value) order by 1),
      changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- For Homing's own worker, without anyone's principal: picks a run that
-- needs work, and claims it for a while, so one worker works on a run at a
-- time, across restarts and deploys. A claim that ran out is taken over.
-- Only the run and its owner are named, whom the worker then acts for. On
-- the way, a run whose place was removed, or whose account was revoked, is
-- done, one that waited for its owner to sign in again carries on, and so
-- does one paused at the monthly limit, once that's set again or the month
-- ends.
create function claim_learning_run(worker uuid, lease_seconds integer)
returns table (run uuid, person uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  picked learning_runs;
begin
  if current_person_id() is not null or current_space_id() is not null or worker is null or not (lease_seconds between 1 and 3600) then
    raise exception 'only Homing''s own worker claims a learning run' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs r
  set state = 'done', reason = 'removed', claimed_by = null, claimed_until = null, changed_at = clock_timestamp()
  from places p join connections c on c.id = p.connection_id
  where p.id = r.place_id and r.state <> 'done' and (p.removed_at is not null or c.revoked_at is not null);
  update learning_runs r
  set state = learning_active(r), reason = null, next_at = now(), attempts = 0, changed_at = clock_timestamp()
  from connections c
  where c.id = r.connection_id and r.state = 'needs attention' and r.reason = 'sign in again' and c.status = 'connected';
  update learning_runs r
  set state = learning_active(r), reason = null, next_at = now(), attempts = 0, changed_at = clock_timestamp()
  from model_spending m
  where r.state = 'paused' and r.reason = 'monthly limit'
    and not (m.paused_at >= date_trunc('month', now(), 'UTC') and (m.changed_at is null or m.paused_at > m.changed_at));

  select r.* into picked from learning_runs r
  where r.state in ('learning history', 'following') and r.next_at <= now()
    and (r.claimed_until is null or r.claimed_until < now())
    and exists (select from space_access a where a.space_id = r.space_id and a.person_id = r.private_to)
  order by r.next_at
  limit 1
  for update skip locked;
  if picked.id is null then
    return;
  end if;
  update learning_runs r
  set claimed_by = worker, claimed_until = now() + make_interval(secs => claim_learning_run.lease_seconds), lease_seconds = claim_learning_run.lease_seconds
  where r.id = picked.id;
  return query select picked.id, picked.private_to;
end
$$;

-- The owner's run, claimed by this worker, held until the transaction ends.
-- Once another worker took it over, this one writes nothing more.
create function claimed_learning_run(run uuid, worker uuid) returns learning_runs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found learning_runs;
begin
  select r.* into found from learning_runs r
  where r.id = claimed_learning_run.run and r.private_to = current_person_id() and r.claimed_by = worker
    and r.space_id in (select accessible_spaces())
  for update;
  if found.id is null then
    raise exception 'that learning run isn''t this worker''s to work on now' using errcode = 'insufficient_privilege';
  end if;
  return found;
end
$$;

-- Marks items a run processed: learned from, with the note learning wrote
-- from their conversation, or set aside and why. Called in the transaction
-- that writes what learning wrote from them, so a crash leaves both or
-- neither. An item marked again, with a changed version, is marked anew.
-- It keeps the claim.
create function learning_marked(run uuid, worker uuid, marks jsonb, note uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, worker);
begin
  if jsonb_typeof(marks) <> 'array' or jsonb_array_length(marks) > 1000 then
    raise exception 'marks are a list of at most 1,000 items' using errcode = 'check_violation';
  end if;
  if note is not null and not exists (
    select from content c where c.id = learning_marked.note and c.private_to = r.private_to and c.space_id = r.space_id
  ) then
    raise exception 'a note is on the run''s owner''s side of its place''s space' using errcode = 'insufficient_privilege';
  end if;
  insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note)
  select r.id, r.space_id, r.private_to, m.item, m.version, m.thread, m.outcome, m.reason, learning_marked.note
  from jsonb_to_recordset(marks) as m (item text, version text, thread text, outcome text, reason text)
  on conflict (run_id, item) do update
  set version = excluded.version, thread = excluded.thread, outcome = excluded.outcome, reason = excluded.reason,
      note = coalesce(excluded.note, learned_items.note), processed_at = clock_timestamp();
  update learning_runs
  set claimed_until = greatest(claimed_until, now() + make_interval(secs => coalesce(lease_seconds, 60))), attempts = 0
  where id = r.id;
end
$$;

-- Moves a run on after a page of its walk: the connector's new checkpoint,
-- how far history reached, and whether the walk caught up, which ends an
-- extension, or takes the run from history to following. The claim ends,
-- and following runs wait until it's time to look again. The state now.
create function learning_walked(run uuid, worker uuid, walk text, checkpoint text, caught_up boolean, reached timestamptz, poll_seconds integer)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, worker);
  after learning_runs;
  now_in text;
begin
  if walk = 'extension' then
    update learning_runs
    set extension_since = case when caught_up then null else extension_since end,
        extension_until = case when caught_up then null else extension_until end,
        extension_checkpoint = case when caught_up then null else learning_walked.checkpoint end
    where id = r.id;
  elsif walk = 'main' then
    update learning_runs
    set checkpoint = learning_walked.checkpoint,
        learned_up_to = case when reached is null then learned_up_to else greatest(learned_up_to, reached) end,
        caught_up_at = case when caught_up then coalesce(caught_up_at, clock_timestamp()) else caught_up_at end
    where id = r.id;
  else
    raise exception 'a walk is the main one or an extension' using errcode = 'check_violation';
  end if;
  select * into after from learning_runs where id = r.id;
  update learning_runs
  set state = case when after.state in ('learning history', 'following') then learning_active(after) else after.state end,
      next_at = case
        when after.state in ('learning history', 'following') and learning_active(after) = 'following' and walk = 'main' and caught_up
          then now() + make_interval(secs => greatest(poll_seconds, 1))
        else now()
      end,
      attempts = 0, claimed_by = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id
  returning state into now_in;
  return now_in;
end
$$;

-- Lets a run wait, and ends the claim: for a moment when the provider is
-- busy or Homing stops, or longer after a failure, counted. It needs its
-- owner once their account needs them to sign in again, once Homing isn't
-- set up for the system any more, or after eight failures in a row. One that
-- follows what arrives pauses at the monthly limit, until that's set again.
create function learning_later(run uuid, worker uuid, wait_seconds integer, trouble text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, worker);
  failures integer := r.attempts + case when trouble = 'failing' then 1 else 0 end;
  stuck boolean := trouble in ('sign in again', 'not set up') or (trouble = 'failing' and failures >= 8);
  active boolean := r.state in ('learning history', 'following');
begin
  if trouble is not null and trouble not in ('failing', 'sign in again', 'not set up', 'monthly limit') then
    raise exception 'trouble is failing, sign in again, not set up or the monthly limit' using errcode = 'check_violation';
  end if;
  update learning_runs
  set attempts = failures,
      state = case when active and stuck then 'needs attention' when active and trouble = 'monthly limit' then 'paused' else state end,
      reason = case when active and (stuck or trouble = 'monthly limit') then trouble else reason end,
      next_at = now() + make_interval(secs => greatest(wait_seconds, 0)),
      claimed_by = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Reserves a call as 0044 does, with a learning run when it's for one. The
-- run must be the person's own, on a place of theirs that's still there, in
-- a space they can open, and carry that space. A run that isn't learning
-- now is refused. While it learns history, its own limit applies: what it
-- spent and this call's worst case past it pause the run, which raising its
-- limit resumes, and calls under way past it are refused for now. Once it
-- follows, the monthly limit applies, as to any call, and history counts
-- against it no more.
drop function reserve_model_call(text, text, uuid[], numeric);

create function reserve_model_call(purpose text, model text, spaces uuid[], worst numeric, run uuid default null)
returns table (call uuid, refused text, spent numeric, under_way numeric, cap numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  month timestamptz := date_trunc('month', now(), 'UTC');
  limits model_spending;
  learning learning_runs;
  history boolean := false;
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
  if reserve_model_call.run is not null then
    select r.* into learning from learning_runs r
    join places p on p.id = r.place_id join connections c on c.id = r.connection_id
    where r.id = reserve_model_call.run and r.private_to = me and p.private_to = me and c.person_id = me
      and p.removed_at is null and c.revoked_at is null and r.space_id in (select accessible_spaces())
    for update of r;
    if learning.id is null then
      raise exception 'there is no such learning run' using errcode = 'insufficient_privilege';
    end if;
    if not learning.space_id = any (spaces) then
      raise exception 'a learning run''s call carries its place''s space' using errcode = 'check_violation';
    end if;
  end if;
  off := array(select model_off(spaces));
  if cardinality(off) > 0 then
    raise exception 'model processing is off' using errcode = 'insufficient_privilege', detail = array_to_string(off, ',');
  end if;

  -- One reservation at a time, so calls made at once can't each fit the
  -- same room under a limit.
  perform pg_advisory_xact_lock(hashtext('homing.model_spending'));
  -- A call Homing stopped during, and never settled, counts at its worst case.
  update model_calls c set state = 'failed', cost = c.reserved, cost_from = 'worst case', settled_at = clock_timestamp()
  where c.state = 'under way' and c.started_at < now() - interval '15 minutes';

  if learning.id is not null then
    if learning.state not in ('learning history', 'following') then
      return query select null::uuid, 'run paused', learning_spent(learning.id), 0::numeric, learning.spending_limit;
      return;
    end if;
    history := learning.state = 'learning history';
  end if;

  if history then
    select coalesce(sum(c.cost), 0), coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0) into used, held
    from model_calls c where c.run_id = learning.id and c.run_history;
    if used + worst > learning.spending_limit then
      update learning_runs set state = 'paused', reason = 'limit', changed_at = clock_timestamp() where id = learning.id;
      return query select null::uuid, 'run limit', used, held, learning.spending_limit;
      return;
    end if;
    if used + held + worst > learning.spending_limit then
      return query select null::uuid, 'busy', used, held, learning.spending_limit;
      return;
    end if;
  else
    select * into limits from model_spending;
    select coalesce(sum(c.cost), 0), coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0) into used, held
    from model_calls c where c.started_at >= month and not c.run_history;
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
  end if;
  insert into model_calls (person_id, purpose, model, spaces, reserved, run_id, run_history)
  values (me, reserve_model_call.purpose, reserve_model_call.model, reserve_model_call.spaces, worst, learning.id, history)
  returning id into made;
  return query select made, null::text, used, held, case when history then learning.spending_limit else limits.monthly_limit end;
end
$$;

-- What the model cost this month, person by person, as 0044 has it: what
-- the monthly limit covers, and apart from it what learning history cost,
-- which each run's own limit covers.
drop function model_usage_this_month();

create function model_usage_this_month()
returns table (person_id uuid, name text, calls bigint, cost numeric, under_way numeric, history numeric)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select from people p where p.id = current_person_id() and p.instance_admin) then
    raise exception 'only whoever looks after Homing sees this' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.person_id, p.name, count(*),
         coalesce(sum(c.cost) filter (where not c.run_history), 0),
         coalesce(sum(c.reserved) filter (where c.state = 'under way' and not c.run_history), 0),
         coalesce(sum(coalesce(c.cost, c.reserved)) filter (where c.run_history), 0)
  from model_calls c left join people p on p.id = c.person_id
  where c.started_at >= date_trunc('month', now(), 'UTC')
  group by c.person_id, p.name
  order by 4 desc, 2;
end
$$;

revoke execute on function learning_active, learning_spent, own_learning_run, estimate_learning, start_learning, pause_learning, resume_learning,
  extend_learning, set_learning_limit, set_learning_exclusions, claim_learning_run, claimed_learning_run, learning_marked, learning_walked,
  learning_later, reserve_model_call, model_usage_this_month from public;
grant execute on function estimate_learning, start_learning, pause_learning, resume_learning, extend_learning, set_learning_limit,
  set_learning_exclusions, claim_learning_run, learning_marked, learning_walked, learning_later, reserve_model_call, model_usage_this_month
  to homing_app;
