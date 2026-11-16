-- Learning from a connected source (#132, spec §8). A person starts a run
-- for a place of theirs, such as their mailbox, with a scope, such as two
-- years back. It learns through the place's history, oldest first, then
-- follows what arrives, from a checkpoint the place's connector keeps. Each
-- item it processed is marked with its id and version, in the same
-- transaction as what learning wrote from it, so nothing is processed twice.
-- What it learns from history is held to its own spending limit, and what
-- arrives afterwards to the monthly limit. Only its owner sees a run, its
-- progress, its spending and what it processed, as with the place.

-- A person's routine, such as learning from their mailbox, acts for them the
-- way their assistant does, under every check an agent is under, with
-- homing.agent set too. But it isn't their assistant: what it writes is
-- derived from sources, and it changes only what it derived itself.
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

-- Whether a routine may change an item: only one on its owner's private
-- side that says the routine's own name wrote it, so never what the person
-- or their assistant wrote or changed since.
create function routine_derived(written_by uuid, agent text, private_to uuid) returns boolean
language sql stable
as $$
  select agent is not distinct from current_agent() and written_by = current_person_id() and private_to = current_person_id()
$$;

grant execute on function routine_derived to homing_app;

-- Keeps what an item said before, as 0041 does. A routine rewrites only what
-- it derived itself.
create or replace function keep_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  -- A person's assistant changing, on their private side, text they wrote themselves here.
  for_them boolean := current_agent() is not null and current_person_id() is not null
    and old.kind = 'text' and old.private_to = current_person_id() and own_text(old.written_by, old.agent, old.imported);
begin
  if current_routine() is not null and not routine_derived(old.written_by, old.agent, old.private_to) then
    raise exception 'a routine changes only what it derived itself' using errcode = 'insufficient_privilege';
  end if;
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

-- Replacing an item, as 0041 has it. A routine replaces only what it derived
-- itself.
create or replace function check_replacement() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not exists (
    select from content replaced
    where replaced.id = new.supersedes
      and (current_routine() is null or routine_derived(replaced.written_by, replaced.agent, replaced.private_to))
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

-- The most a learning run may spend on history, in USD, for whoever looks
-- after Homing to set beside the monthly limit. With both at 0, Homing's
-- model learns nothing.
alter table model_spending add column run_ceiling numeric(12, 2) not null default 25 check (run_ceiling between 0 and 1000000);

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
  checkpoint text check (length(checkpoint) <= 1000000),
  -- A scope extended further back, walked on its own until it's done: the
  -- range it adds, and where the walk through it stands. Before that, the
  -- estimate for a range its owner is asked about, which isn't walked yet.
  extension_since timestamptz,
  extension_until timestamptz,
  extension_checkpoint text check (length(extension_checkpoint) <= 1000000),
  extension_estimate jsonb check (jsonb_typeof(extension_estimate) = 'object' and pg_column_size(extension_estimate) < 10000),
  -- Estimating until the person starts it with a limit; then learning
  -- history, following once it caught up, or paused, needing its owner, or
  -- done once its place is removed or its account revoked.
  state text not null default 'estimating'
    check (state in ('estimating', 'learning history', 'following', 'paused', 'needs attention', 'done')),
  -- Why it's paused, needs its owner or is done.
  reason text check (reason in ('person', 'limit', 'monthly limit', 'model processing off', 'sign in again', 'not set up', 'removed')),
  -- What it waits for while it keeps trying by itself: the model's provider,
  -- the system it reads, or an error of Homing's own.
  waiting_for text check (waiting_for in ('provider', 'system', 'error')),
  -- While it follows what arrives, older material it still has to learn from,
  -- such as a range added to its scope, waits here once its limit is reached.
  waiting_at_limit boolean not null default false,
  -- How far through the place's history it is, when it first caught up, and
  -- when it last looked at what arrived.
  learned_up_to timestamptz,
  caught_up_at timestamptz,
  polled_at timestamptz,
  -- In USD, for what it learns from history, extensions included.
  spending_limit numeric(12, 2) not null default 0 check (spending_limit between 0 and 1000000),
  -- The last estimate, as Homing made it: what's there and what it may cost.
  estimate jsonb check (jsonb_typeof(estimate) = 'object' and pg_column_size(estimate) < 10000),
  -- What the person left out: senders by address or domain, and folders by
  -- name. And senders they keep, whatever their mail says about itself.
  excluded_senders text[] not null default '{}' check (cardinality(excluded_senders) <= 200),
  excluded_folders text[] not null default '{}' check (cardinality(excluded_folders) <= 200),
  kept_senders text[] not null default '{}' check (cardinality(kept_senders) <= 200),
  -- When it next needs work, how often in a row it failed, which threads the
  -- provider failed on, how often and when last, how many threads in a row
  -- the provider refused since it last answered one, how many items it asks
  -- for at once after a page that failed, and which of Homing's workers works
  -- on it, until when, under a claim of its own each time.
  next_at timestamptz not null default now(),
  attempts integer not null default 0,
  failures jsonb check (jsonb_typeof(failures) = 'array' and pg_column_size(failures) < 100000),
  refused integer not null default 0 check (refused >= 0),
  page_size integer check (page_size between 1 and 1000),
  claimed_by uuid,
  claim uuid,
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

-- Each item a run processed, by its id and version there: learned from,
-- added to a note's sources without a model reading it, or set aside and
-- why. A thread is learned from together, and the note learning wrote from
-- it is kept with each of its items. Each says who sent it and when, where
-- it was, which left-out sender or folder set it aside, and which
-- interpretation read it, so a later one can learn from it again.
create table learned_items (
  run_id uuid not null references learning_runs (id) on delete cascade,
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  item text not null check (length(item) between 1 and 1024),
  version text not null check (length(version) between 1 and 200),
  thread text check (length(thread) between 1 and 1024),
  outcome text not null check (outcome in ('learned', 'added as a source', 'set aside')),
  reason text check (reason ~ '^[a-z][a-z ]{0,39}$'),
  note uuid references content (id) on delete set null,
  sender text check (length(sender) <= 320),
  at timestamptz,
  because text check (length(because) <= 320),
  interpretation text check (interpretation ~ '^[a-z][a-z0-9 .-]{0,39}$'),
  -- The folder it was in, by name. Set aside without a model, it's looked at
  -- again once it's seen in another, as when it's taken out of junk.
  folder text check (length(folder) <= 1024),
  -- It's to be learned from after all, which the run does next: its owner
  -- said so, or it's tried again.
  again boolean not null default false,
  -- Set aside for something that may pass, such as the provider failing on
  -- it: when Homing tries it again by itself, which it does once.
  retry_at timestamptz,
  retried boolean not null default false,
  processed_at timestamptz not null default clock_timestamp(),
  primary key (run_id, item),
  check ((outcome = 'set aside') = (reason is not null))
);

create index learned_items_thread on learned_items (run_id, thread);
create index learned_items_space on learned_items (space_id);
create index learned_items_note on learned_items (note);
create index learned_items_again on learned_items (run_id) where again;
create index learned_items_retry on learned_items (run_id, retry_at) where retry_at is not null;

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

-- The state a run carries on in: history until it first caught up, and
-- following what arrives from then on, whatever older material it still has.
create function learning_active(r learning_runs) returns text
language sql immutable
as $$
  select case when r.caught_up_at is null then 'learning history' else 'following' end
$$;

-- What a run spent on its history, with the worst case of its calls under way.
create function learning_spent(run uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(coalesce(c.cost, c.reserved)), 0) from model_calls c where c.run_id = learning_spent.run and c.run_history
$$;

-- Whether an address is the sender an entry names, or at the domain it
-- names, written as northwind.test or @northwind.test. Both in lower case.
create function sender_matches(entry text, address text) returns boolean
language sql immutable
as $$
  select case
    when entry like '%@%' and entry not like '@%' then address = entry
    else ltrim(entry, '@') <> '' and (address like '%@' || ltrim(entry, '@') or address like '%.' || ltrim(entry, '@'))
  end
$$;

-- Whether what an item was set aside for may pass: the model's provider
-- refused it or failed on it, the model's answer couldn't be used, or the
-- system couldn't give it. Those are tried again, once by Homing itself and
-- whenever the person or their assistant asks.
create function learning_retryable(reason text) returns boolean
language sql immutable
as $$ select reason in ('provider refused', 'provider failed', 'no usable answer', 'unreadable') $$;

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

-- Whether the person's run for the same thing in another space, such as the same
-- mailbox connected in two spaces, has started. Each is learned from in one
-- space only. An estimate there is no run yet.
create function learning_elsewhere(place uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select from places mine
    join places o on o.connection_id = mine.connection_id and o.kind = mine.kind and o.resource = mine.resource and o.id <> mine.id
    join learning_runs r on r.place_id = o.id
    where mine.id = learning_elsewhere.place and mine.private_to = current_person_id()
      and r.private_to = mine.private_to and r.state not in ('estimating', 'done')
  )
$$;

-- Records an estimate for learning from a place of the person's own, before
-- it starts: the run, made for the place, which estimates until it's started,
-- a step of its own. Estimated again, it takes the new scope and estimate.
-- What an account reaches, such as its mailbox, is learned from in one space
-- only, so nothing is paid for twice, and a space with model processing off
-- can't be got around through another: a second run is refused, with the
-- space the first is in.
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
  -- One at a time for each account, so two spaces can't both start.
  perform pg_advisory_xact_lock(hashtext('homing.learning ' || target.connection_id::text));
  if learning_elsewhere(target.id) then
    raise exception 'Homing already learns from that in another space' using errcode = 'check_violation';
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

-- Starts a run that was estimated, with its spending limit, at most the
-- ceiling whoever looks after Homing set, for the period and the estimate
-- the person was shown: one estimated again since isn't what they saw, and
-- doesn't start. Only the person does, in Homing itself: there, or by
-- approving what their assistant proposed, which runs as them. An assistant
-- never starts one.
create function start_learning(run uuid, spending_limit numeric, since timestamptz, estimated timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  ceiling numeric := (select run_ceiling from model_spending);
begin
  if not direct_edit() then
    raise exception 'only the person starts learning, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if r.state <> 'estimating' then
    raise exception 'learning there has already started' using errcode = 'check_violation';
  end if;
  if r.estimate is null then
    raise exception 'learning is estimated before it starts' using errcode = 'check_violation';
  end if;
  if since is null or estimated is null or r.since is distinct from start_learning.since or (r.estimate ->> 'at')::timestamptz is distinct from estimated then
    raise exception 'the estimate, or how far back it goes, changed since it was shown, so nothing started' using errcode = 'check_violation';
  end if;
  -- One at a time for each account, so two spaces can't both start.
  perform pg_advisory_xact_lock(hashtext('homing.learning ' || r.connection_id::text));
  if learning_elsewhere(r.place_id) then
    raise exception 'Homing already learns from that in another space' using errcode = 'check_violation';
  end if;
  if spending_limit is null or not (spending_limit >= 0 and spending_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  if spending_limit > ceiling then
    raise exception 'a learning run may spend at most $% here, which whoever looks after Homing sets', ceiling using errcode = 'check_violation';
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
  update learning_runs set state = 'paused', reason = 'person', waiting_for = null, changed_at = clock_timestamp() where id = r.id;
  return true;
end
$$;

-- Resumes a paused run, or one that needed its owner, where it stopped, for
-- the person, or, when the person or their assistant paused it, for their
-- assistant. One paused at its limit resumes only by setting its limit,
-- which is the person's. The state it's in now.
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
  -- Their assistant resumes only what was paused. What waits for something else carries on by itself.
  if not direct_edit() and r.reason <> 'person' then
    raise exception 'that learning run waits for something else, and carries on by itself then' using errcode = 'check_violation';
  end if;
  update learning_runs set state = learning_active(r), reason = null, next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where id = r.id;
  return learning_active(r);
end
$$;

-- Keeps the estimate for extending a started run's scope further back, for
-- its owner to see before it applies, or, without a day, lets go of the one
-- it kept. Nothing else changes.
create function estimate_extension(run uuid, since timestamptz, estimate jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state = 'estimating' then
    raise exception 'learning there hasn''t started yet' using errcode = 'check_violation';
  end if;
  if since is null then
    update learning_runs set extension_estimate = null, changed_at = clock_timestamp() where id = r.id;
    return;
  end if;
  if since >= r.since or since <= '1990-01-01' then
    raise exception 'it already learns from that far back' using errcode = 'check_violation';
  end if;
  update learning_runs
  set extension_estimate = estimate_extension.estimate || jsonb_build_object('since', to_jsonb(estimate_extension.since)), changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Extends a started run's scope further back, once the range that adds was
-- estimated for that very day. Only the range it adds is walked, on its own,
-- oldest first, beside what arrives if the run follows. One that hasn't
-- begun its walk simply starts further back. Extended again while it walks
-- an extension, that walk starts over from the new start, and what it
-- already processed is skipped. Whatever worker has the run loses it, so a
-- page fetched for the scope as it was is never taken for the new one. Its
-- limit stays as it is. Only the person does, in Homing itself: there, or
-- by approving what their assistant proposed.
create function extend_learning(run uuid, since timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if not direct_edit() then
    raise exception 'only the person has learning go further back, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if r.state = 'estimating' then
    raise exception 'learning there hasn''t started yet' using errcode = 'check_violation';
  end if;
  if since is null or since >= r.since then
    raise exception 'it already learns from that far back' using errcode = 'check_violation';
  end if;
  if r.extension_estimate is null or (r.extension_estimate ->> 'since')::timestamptz is distinct from extend_learning.since then
    raise exception 'learning further back is estimated first' using errcode = 'check_violation';
  end if;
  if r.checkpoint is null and r.caught_up_at is null and r.extension_since is null then
    update learning_runs
    set since = extend_learning.since, estimate = r.extension_estimate, extension_estimate = null,
        claimed_by = null, claim = null, claimed_until = null, next_at = now(), changed_at = clock_timestamp()
    where id = r.id;
    return;
  end if;
  update learning_runs
  set since = extend_learning.since,
      extension_since = extend_learning.since,
      extension_until = coalesce(r.extension_until, r.since),
      extension_checkpoint = null,
      estimate = r.extension_estimate,
      extension_estimate = null,
      waiting_at_limit = false,
      claimed_by = null, claim = null, claimed_until = null,
      next_at = now(),
      changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Sets what a run may spend on history, at most the ceiling. Only the
-- person does, in Homing itself. It resumes a run paused at its limit, once
-- this leaves room, and lets older material that waited there be learned from.
create function set_learning_limit(run uuid, spending_limit numeric) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  ceiling numeric := (select run_ceiling from model_spending);
begin
  if not direct_edit() then
    raise exception 'only the person sets what learning may spend, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if spending_limit is null or not (spending_limit >= 0 and spending_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  if spending_limit > ceiling then
    raise exception 'a learning run may spend at most $% here, which whoever looks after Homing sets', ceiling using errcode = 'check_violation';
  end if;
  update learning_runs
  set spending_limit = set_learning_limit.spending_limit, waiting_at_limit = false, next_at = now(), changed_at = clock_timestamp()
  where id = r.id;
  if r.state = 'paused' and r.reason = 'limit' and learning_spent(r.id) < set_learning_limit.spending_limit then
    update learning_runs set state = learning_active(r), reason = null, attempts = 0 where id = r.id;
  end if;
end
$$;

-- Sets what a run leaves out without a model, senders by address or domain
-- and folders by name, and the senders it keeps whatever their mail says
-- about itself. The person's assistant only adds to what's left out, since
-- that sends less: taking something off it, or keeping a sender, sends more,
-- so it's the person's, in Homing itself. What was set aside for a sender or
-- folder no longer left out, or by its own signs from a sender now kept, is
-- learned from after all.
create function set_learning_exclusions(run uuid, senders text[], folders text[], kept text[]) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  left_senders text[];
  left_folders text[];
  keeps text[];
  again integer;
begin
  if senders is null or folders is null or kept is null or cardinality(senders) > 200 or cardinality(folders) > 200 or cardinality(kept) > 200
     or exists (select from unnest(senders || folders || kept) as one (value) where one.value is null or length(btrim(one.value)) not between 1 and 320 or one.value ~ '[[:cntrl:]]') then
    raise exception 'leave out up to 200 senders and 200 folders, and keep up to 200 senders, each on one line' using errcode = 'check_violation';
  end if;
  left_senders := array(select distinct lower(btrim(value)) from unnest(senders) as one (value) order by 1);
  left_folders := array(select distinct btrim(value) from unnest(folders) as one (value) order by 1);
  keeps := array(select distinct lower(btrim(value)) from unnest(kept) as one (value) order by 1);
  if not direct_edit() and not (r.excluded_senders <@ left_senders and r.excluded_folders <@ left_folders and keeps = r.kept_senders) then
    raise exception 'only the person takes something off what''s left out, or keeps a sender, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs
  set excluded_senders = left_senders, excluded_folders = left_folders, kept_senders = keeps, changed_at = clock_timestamp()
  where id = r.id;
  update learned_items i
  set again = true
  where i.run_id = r.id and i.outcome = 'set aside' and not i.again and (
    (i.reason = 'excluded sender' and i.because = any (r.excluded_senders) and not i.because = any (left_senders))
    or (i.reason = 'excluded folder' and i.because = any (r.excluded_folders) and not i.because = any (left_folders))
    or (i.reason in ('newsletter', 'automated') and i.sender is not null
        and exists (select from unnest(keeps) as k (entry) where sender_matches(k.entry, i.sender))
        and not exists (select from unnest(r.kept_senders) as k (entry) where sender_matches(k.entry, i.sender)))
  );
  get diagnostics again = row_count;
  if again > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now() where id = r.id;
  end if;
end
$$;

-- Has a run try again what it set aside for something that may pass: all of
-- it, or what was set aside for one reason. For the person or their
-- assistant, since it stays within the run they started and its limit. How
-- many items it tries again.
create function retry_learning(run uuid, reason text default null) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  tried integer;
begin
  if reason is not null and not learning_retryable(reason) then
    raise exception 'that isn''t something learning tries again' using errcode = 'check_violation';
  end if;
  update learned_items i
  set again = true
  where i.run_id = r.id and i.outcome = 'set aside' and not i.again and learning_retryable(i.reason)
    and (retry_learning.reason is null or i.reason = retry_learning.reason);
  get diagnostics tried = row_count;
  if tried > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now(), changed_at = clock_timestamp() where id = r.id;
  end if;
  return tried;
end
$$;

-- For Homing's own worker, without anyone's principal: picks a run that
-- needs work, and claims it for a while, so one worker works on a run at a
-- time, across restarts and deploys. A claim that ran out is taken over.
-- Each claim is one of its own, by a token made here, so a page begun under
-- an earlier claim writes nothing more, even when the same worker claimed
-- the run again. Only the run, its owner, whom the worker then acts for,
-- and the claim are named. On the way, a run whose place was removed, or
-- whose account was revoked, is done, and a run carries on once what it
-- waited for holds again: its owner signed in, the monthly limit was set
-- again or the month ended, or model processing was turned on in its space.
-- What the run set aside for something that may pass is tried again once
-- its day has come.
create function claim_learning_run(worker uuid, lease_seconds integer)
returns table (run uuid, person uuid, claim uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  picked learning_runs;
  token uuid := gen_random_uuid();
begin
  if current_person_id() is not null or current_space_id() is not null or worker is null or not (lease_seconds between 1 and 3600) then
    raise exception 'only Homing''s own worker claims a learning run' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs r
  set state = 'done', reason = 'removed', claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
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
  update learning_runs r
  set state = learning_active(r), reason = null, next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where r.state = 'paused' and r.reason = 'model processing off' and not exists (select from model_off(array[r.space_id]));

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
  set claimed_by = worker, claim = token, claimed_until = now() + make_interval(secs => claim_learning_run.lease_seconds), lease_seconds = claim_learning_run.lease_seconds
  where r.id = picked.id;
  update learned_items i set again = true, retried = true, retry_at = null
  where i.run_id = picked.id and i.retry_at <= now();
  return query select picked.id, picked.private_to, token;
end
$$;

-- The owner's run, under this claim, held until the transaction ends, for
-- the routine that learns for them and nobody else: not the owner, nor
-- their assistant, who can read the claim. Once the run was claimed again,
-- by another worker or the same, or its scope changed, a page begun under
-- this claim writes nothing more.
create function claimed_learning_run(run uuid, claim uuid) returns learning_runs
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  found learning_runs;
begin
  if current_routine() is null then
    raise exception 'only the routine that learns works on a learning run' using errcode = 'insufficient_privilege';
  end if;
  select r.* into found from learning_runs r
  where r.id = claimed_learning_run.run and r.private_to = current_person_id() and r.claim = claimed_learning_run.claim
    and r.space_id in (select accessible_spaces())
  for update;
  if found.id is null then
    raise exception 'that learning run isn''t this claim''s to work on now' using errcode = 'insufficient_privilege';
  end if;
  return found;
end
$$;

-- Marks items a run processed: learned from, with the note learning wrote
-- from their thread, added to that note's sources, or set aside and why.
-- Called in the transaction that writes what learning wrote from them, so a
-- crash leaves both or neither. An item marked again, as with a changed
-- version, is marked anew. One set aside for something that may pass is
-- tried again a day later, once. It keeps the claim, says the run isn't
-- waiting for anything, and counts the threads the provider refused in a
-- row, until a model answers for one.
create function learning_marked(run uuid, claim uuid, marks jsonb, note uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
begin
  if jsonb_typeof(marks) <> 'array' or jsonb_array_length(marks) > 1000 then
    raise exception 'marks are a list of at most 1,000 items' using errcode = 'check_violation';
  end if;
  if note is not null and not exists (
    select from content c where c.id = learning_marked.note and c.private_to = r.private_to and c.space_id = r.space_id
  ) then
    raise exception 'a note is on the run''s owner''s side of its place''s space' using errcode = 'insufficient_privilege';
  end if;
  insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note, sender, at, because, interpretation, folder, retry_at)
  select r.id, r.space_id, r.private_to, m.item, m.version, m.thread, m.outcome, m.reason, learning_marked.note, lower(m.sender), m.at, m.because, m.interpretation, m.folder,
         case when m.outcome = 'set aside' and learning_retryable(m.reason) then now() + interval '1 day' end
  from jsonb_to_recordset(marks) as m (item text, version text, thread text, outcome text, reason text, sender text, at timestamptz, because text, interpretation text, folder text)
  on conflict (run_id, item) do update
  set version = excluded.version, thread = excluded.thread, outcome = excluded.outcome, reason = excluded.reason,
      note = coalesce(excluded.note, learned_items.note), sender = excluded.sender, at = excluded.at, because = excluded.because,
      interpretation = excluded.interpretation, folder = excluded.folder, again = false, processed_at = clock_timestamp(),
      retry_at = case when excluded.retry_at is not null and not learned_items.retried then coalesce(learned_items.retry_at, excluded.retry_at) end;
  update learning_runs
  set claimed_until = greatest(claimed_until, now() + make_interval(secs => coalesce(lease_seconds, 60))), attempts = 0, waiting_for = null,
      refused = case
        when exists (select from jsonb_to_recordset(marks) as m (reason text) where m.reason = 'provider refused') then refused + 1
        when exists (select from jsonb_to_recordset(marks) as m (reason text, interpretation text) where m.interpretation is not null and m.reason is distinct from 'provider failed') then 0
        else refused end
  where id = r.id;
end
$$;

-- Moves a run on after a page of a walk, for the scope the page was fetched
-- for: a page for a scope that changed meanwhile is refused. The main walk
-- takes the connector's new checkpoint, how far history reached, and whether
-- it caught up, which takes the run from history to following. A walk of an
-- extension ends it once it caught up. A page of items learned from again
-- moves nothing. The claim ends, what the provider failed on is forgotten
-- for this walk, whose page is done, and the run is due at once while it has
-- history or older material to learn from, and otherwise when it's time to
-- look again. The state now.
create function learning_walked(run uuid, claim uuid, walk text, walked_since timestamptz, checkpoint text, caught_up boolean, reached timestamptz, poll_seconds integer)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
  after learning_runs;
  more boolean;
  now_in text;
begin
  if walk = 'extension' then
    if r.extension_since is null or walked_since is distinct from r.extension_since then
      raise exception 'the run''s scope changed while this page was fetched' using errcode = 'insufficient_privilege';
    end if;
    update learning_runs
    set extension_since = case when caught_up then null else extension_since end,
        extension_until = case when caught_up then null else extension_until end,
        extension_checkpoint = case when caught_up then null else learning_walked.checkpoint end
    where id = r.id;
  elsif walk = 'main' then
    if walked_since is distinct from r.since then
      raise exception 'the run''s scope changed while this page was fetched' using errcode = 'insufficient_privilege';
    end if;
    update learning_runs
    set checkpoint = learning_walked.checkpoint,
        learned_up_to = case when reached is null then learned_up_to else greatest(learned_up_to, reached) end,
        caught_up_at = case when caught_up then coalesce(caught_up_at, clock_timestamp()) else caught_up_at end,
        polled_at = case when caught_up then clock_timestamp() else polled_at end
    where id = r.id;
  elsif walk <> 'again' then
    raise exception 'a walk is the main one, an extension, or what''s learned from again' using errcode = 'check_violation';
  end if;
  select * into after from learning_runs where id = r.id;
  more := after.caught_up_at is null or (walk = 'main' and not caught_up)
    or (not after.waiting_at_limit and (after.extension_since is not null or exists (select from learned_items i where i.run_id = r.id and i.again)));
  update learning_runs
  set state = case when after.state in ('learning history', 'following') then learning_active(after) else after.state end,
      next_at = case when more then now() else now() + make_interval(secs => greatest(poll_seconds, 1)) end,
      attempts = 0, failures = (select jsonb_agg(f) from jsonb_array_elements(after.failures) as f where f ->> 0 <> learning_walked.walk),
      page_size = null, waiting_for = null,
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id
  returning state into now_in;
  return now_in;
end
$$;

-- Lets a run wait, and ends the claim, with its checkpoint as it was: for a
-- moment when calls under way leave no room or Homing stops, as long as the
-- system or the provider asked, or longer each time after a failure,
-- counted. While it waits for the model's provider, the system or an error
-- of Homing's own, it keeps trying and says which. It needs its owner once
-- their account needs them to sign in again, or once Homing isn't set up
-- for the system any more. It pauses at the monthly limit, and where model
-- processing is off, until that changes. It keeps which threads the provider
-- failed on, and how many items to ask for at once after a page that failed.
create function learning_later(run uuid, claim uuid, wait_seconds integer, trouble text, failures jsonb default null, page_size integer default null) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
  active boolean := r.state in ('learning history', 'following');
  waits text := case when trouble in ('provider', 'system', 'error') then trouble when trouble = 'throttled' then 'system' when trouble = 'limited' then 'provider' end;
begin
  if trouble is not null and trouble not in ('provider', 'system', 'error', 'throttled', 'limited', 'sign in again', 'not set up', 'monthly limit', 'model processing off') then
    raise exception 'a run waits for the provider, the system or an error, its owner, the monthly limit or model processing' using errcode = 'check_violation';
  end if;
  update learning_runs
  set attempts = attempts + case when trouble in ('provider', 'system', 'error') then 1 else 0 end,
      waiting_for = case when active then waits else null end,
      state = case
        when active and trouble in ('sign in again', 'not set up') then 'needs attention'
        when active and trouble in ('monthly limit', 'model processing off') then 'paused'
        else state end,
      reason = case when active and trouble in ('sign in again', 'not set up', 'monthly limit', 'model processing off') then trouble else reason end,
      failures = coalesce(learning_later.failures, learning_runs.failures),
      page_size = coalesce(learning_later.page_size, learning_runs.page_size),
      next_at = now() + make_interval(secs => greatest(wait_seconds, 0)),
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Reserves a call as 0044 does, with a learning run when it's for one, and
-- which of its walks: the main one, an extension of its scope, or items
-- learned from again. The run must be the person's own, on a place of theirs
-- that's still there, in a space they can open, and carry that space. A run
-- that isn't learning now is refused, and so is a call under a claim the
-- run no longer has, for a page begun before the run was claimed again:
-- nothing more is sent for it. What it learns from history, until it
-- first caught up and in the other walks after that, is held to its own
-- limit, or the ceiling if that's lower: what it spent and this call's worst
-- case past it pause the run, which setting its limit resumes, or, once it
-- follows, only make its older material wait there. Calls under way past it
-- are refused for now. What arrives once it follows is held to the monthly
-- limit, as any call, and history counts against that no more.
drop function reserve_model_call(text, text, uuid[], numeric);

create function reserve_model_call(purpose text, model text, spaces uuid[], worst numeric, run uuid default null, walk text default 'main', claim uuid default null)
returns table (call uuid, refused text, spent numeric, under_way numeric, cap numeric)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  month timestamptz := date_trunc('month', now(), 'UTC');
  limits model_spending;
  learning learning_runs;
  history boolean := false;
  most numeric;
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
  if walk is null or walk not in ('main', 'extension', 'again') then
    raise exception 'a walk is the main one, an extension, or what''s learned from again' using errcode = 'check_violation';
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
  select * into limits from model_spending;

  if learning.id is not null then
    if learning.state not in ('learning history', 'following') then
      return query select null::uuid, 'run paused', learning_spent(learning.id), 0::numeric, learning.spending_limit;
      return;
    end if;
    if reserve_model_call.claim is not null and learning.claim is distinct from reserve_model_call.claim then
      return query select null::uuid, 'claim lost', learning_spent(learning.id), 0::numeric, learning.spending_limit;
      return;
    end if;
    history := learning.caught_up_at is null or walk <> 'main';
  end if;

  if history then
    most := least(learning.spending_limit, limits.run_ceiling);
    select coalesce(sum(c.cost), 0), coalesce(sum(c.reserved) filter (where c.state = 'under way'), 0) into used, held
    from model_calls c where c.run_id = learning.id and c.run_history;
    if used + worst > most then
      if learning.caught_up_at is null then
        update learning_runs set state = 'paused', reason = 'limit', waiting_for = null, changed_at = clock_timestamp() where id = learning.id;
      else
        update learning_runs set waiting_at_limit = true, changed_at = clock_timestamp() where id = learning.id;
      end if;
      return query select null::uuid, 'run limit', used, held, most;
      return;
    end if;
    if used + held + worst > most then
      return query select null::uuid, 'busy', used, held, most;
      return;
    end if;
  else
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
  return query select made, null::text, used, held, case when history then most else limits.monthly_limit end;
end
$$;

-- Sets the most a learning run may spend on history, for whoever looks
-- after Homing, in Homing itself. Runs already over it stop at their next call.
create function set_run_ceiling(ceiling numeric) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() or not exists (select from people p where p.id = current_person_id() and p.instance_admin) then
    raise exception 'only whoever looks after Homing sets its limit' using errcode = 'insufficient_privilege';
  end if;
  if ceiling is null or not (ceiling >= 0 and ceiling <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('homing.model_spending'));
  update model_spending set run_ceiling = ceiling;
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

-- An assistant asks for learning to start, or to go further back, with a
-- proposal its person approves (spec §6), as for any change that isn't the
-- assistant's to make. It names a place of the person's own in the
-- proposal's space, the day to go back to, and the estimate they were shown.
create function learning_fits(change jsonb, space uuid, person uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select change ->> 'since' is not null and jsonb_typeof(change -> 'estimate') = 'object'
     and exists (
       select from places p join connections c on c.id = p.connection_id
       where p.id = (change ->> 'place')::uuid and p.space_id = learning_fits.space and p.private_to = learning_fits.person and c.person_id = learning_fits.person
     )
$$;

revoke execute on function learning_fits from public;
grant execute on function learning_fits to homing_app;

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in (
    'add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space',
    'archive page', 'reopen page', 'add include', 'remove include', 'plan', 'start learning', 'extend learning'
  )),
  add constraint proposals_learning check (action not in ('start learning', 'extend learning') or coalesce(
    not request and item_id is null and task_id is null and page_id is null and include_id is null,
    false
  ));

-- That it names a place of the person's own is checked as the proposal is
-- written, by a trigger: a check constraint may read only its own row, since
-- a restore loads tables in no order it promises.
create function check_learning_proposal() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not coalesce(learning_fits(new.change, new.space_id, new.private_to), false) then
    raise exception 'a proposal to learn names a place of the person''s own in its space' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger learning_proposal before insert or update of action, change, space_id, private_to on proposals
for each row when (new.action in ('start learning', 'extend learning')) execute function check_learning_proposal();

revoke execute on function learning_active, learning_spent, sender_matches, learning_retryable, learning_elsewhere, own_learning_run, estimate_learning, start_learning, pause_learning, resume_learning,
  estimate_extension, extend_learning, set_learning_limit, set_learning_exclusions, retry_learning, claim_learning_run, claimed_learning_run, learning_marked, learning_walked,
  learning_later, reserve_model_call, set_run_ceiling, model_usage_this_month, check_learning_proposal from public;
grant execute on function estimate_learning, start_learning, pause_learning, resume_learning, estimate_extension, extend_learning, set_learning_limit,
  set_learning_exclusions, retry_learning, claim_learning_run, learning_marked, learning_walked, learning_later, reserve_model_call, set_run_ceiling, model_usage_this_month
  to homing_app;
