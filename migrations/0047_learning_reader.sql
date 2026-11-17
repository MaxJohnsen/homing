-- A person's assistant can do the reading (#143, spec §8). Homing owns the
-- work: the run, its checkpoint, the map, the checks and the writing. Its own
-- model answers each thread's question in the background, or the run's
-- owner's assistant does, through MCP: it takes the run's claim as Homing's
-- worker does, is handed a few questions, and hands back answers, which count
-- only for what was handed out under that claim. A run needs no model to
-- start, and what nobody has read yet waits, counted.

alter table learning_runs
  -- How many threads of the page it stands at wait for someone to read them,
  -- as whoever looked at the page last counted them.
  add column unread integer not null default 0 check (unread >= 0),
  -- What is handed out to its owner's assistant under the claim the run has
  -- now: the walk it is from, and its questions, each by a digest of what it
  -- asks and the items it holds, in their versions. No item's text. It goes
  -- when the claim does: whoever takes the run with that claim gets it, to
  -- check the answers by.
  add column handed_out jsonb check (jsonb_typeof(handed_out) = 'object' and pg_column_size(handed_out) < 10000),
  -- A run's limit is also its owner's word that Homing's own model may read
  -- it: they set it where they were shown the provider and what it may cost.
  -- Without one, no model of Homing's reads the run, whatever is set up
  -- later, and the reading is their assistant's.
  alter column spending_limit drop not null,
  alter column spending_limit drop default;

-- Nothing that hasn't started has a limit yet.
update learning_runs set spending_limit = null where state = 'estimating';

-- None never means unlimited: no call of Homing's model is made for a run
-- without a limit, whoever asks for one.
create function refuse_call_without_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if exists (select from learning_runs r where r.id = new.run_id and r.spending_limit is null) then
    raise exception 'that learning run has no limit, so Homing''s model doesn''t read it' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger model_call_within_limit before insert on model_calls
for each row when (new.run_id is not null) execute function refuse_call_without_limit();

-- Who read an item, when that wasn't Homing's own model: the person's
-- assistant, by the name it connected with.
alter table learned_items add column reader text check (length(reader) between 1 and 200);

-- Who read what a note of learning's rests on, when that wasn't Homing's
-- own model: the assistant's name and nothing else. For whoever can be
-- shown the note, on their own private side or shared in a space they can
-- open, also as the copy of it that was shared.
create function learned_reader(note uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.reader from content c join learned_items i on i.note in (c.id, c.published_from)
  where c.id = learned_reader.note and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id())
    and i.reader is not null
  order by i.processed_at desc
  limit 1
$$;

-- What was handed out counts under the claim it was handed out with, and no
-- other: whatever ends or replaces a run's claim lets go of it, unless it
-- says what is handed out under the new one.
create function forget_handed_out() returns trigger
language plpgsql
as $$
begin
  if new.claim is distinct from old.claim and new.handed_out is not distinct from old.handed_out then
    new.handed_out := null;
  end if;
  return new;
end
$$;

create trigger handed_out_with_claim before update of claim on learning_runs
for each row execute function forget_handed_out();

-- Whether a run has reading to hand out to its owner's assistant: while it
-- learns, and while only Homing's model waits, at the run's limit or the
-- monthly one, since an assistant's reading costs nothing in Homing. Paused
-- by its owner, or waiting for anything else, it hands out nothing.
create function learning_hands_out(r learning_runs) returns boolean
language sql immutable
as $$
  select r.state in ('learning history', 'following') or (r.state = 'paused' and r.reason in ('limit', 'monthly limit'))
$$;

-- Starts a run as 0045 has it, with or without a limit. An estimate with a
-- price starts with the limit its owner was shown, which lets Homing's model
-- read it. An estimate without one, made where Homing had no model, starts
-- without a limit, whatever was asked for: nobody was shown what a model
-- would cost.
create or replace function start_learning(run uuid, spending_limit numeric, since timestamptz, estimated timestamptz) returns void
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
  if r.estimate ? 'unpriced' then
    spending_limit := null;
  elsif spending_limit is null or not (spending_limit >= 0 and spending_limit <= 1000000) then
    raise exception 'a limit is between $0 and $1,000,000' using errcode = 'check_violation';
  elsif spending_limit > ceiling then
    raise exception 'a learning run may spend at most $% here, which whoever looks after Homing sets', ceiling using errcode = 'check_violation';
  end if;
  update learning_runs
  set state = 'learning history', spending_limit = start_learning.spending_limit, started_at = clock_timestamp(),
      next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Pauses a run, for the person or their assistant, wherever it stands once
-- it has started: also one where only Homing's model waits, at a limit, and
-- one that waits for something else. Their pause stops every reader, and
-- only resuming it carries on. Whether it changed anything.
create or replace function pause_learning(run uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if r.state in ('estimating', 'done') or (r.state = 'paused' and r.reason = 'person') then
    return false;
  end if;
  update learning_runs set state = 'paused', reason = 'person', waiting_for = null, changed_at = clock_timestamp() where id = r.id;
  return true;
end
$$;

-- Takes a run's claim for its owner's assistant, which only that assistant
-- can ask for, when nobody holds the run or the assistant names the claim it
-- holds. Either way the claim is a new one, as each of a worker's is, so one
-- look at a page works under it at a time: a second request with the same
-- claim finds it taken. With the claim it held, the assistant gets what was
-- handed out under it, which its answers are for, and the claim lasts as
-- long as it did: only an answer that is taken renews it. The claim the
-- request came with is remembered while its work is handed out, so a
-- request whose reply was lost can be sent again. Work that is handed out isn't handed out again to
-- a request that brings no answers. One worker reads a run at a time, so a
-- run Homing's own worker or another conversation holds is refused until
-- that claim ends or lapses, and so is one that waits for the system it
-- reads or for an error of Homing's own, until it's due, with what was
-- handed out kept. Says why, and until when, when that is known.
create function take_learning_run(run uuid, held uuid, lease_seconds integer, answering boolean)
returns table (claim uuid, handed jsonb, refused text, until timestamptz, resent boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs;
  token uuid := gen_random_uuid();
  live boolean;
  theirs boolean;
begin
  if current_agent() is null or lease_seconds is null or not (lease_seconds between 1 and 3600) then
    raise exception 'only the person''s assistant takes a learning run''s reading' using errcode = 'insufficient_privilege';
  end if;
  r := own_learning_run(run);
  if not learning_hands_out(r) then
    return query select null::uuid, null::jsonb, 'not reading', null::timestamptz, false;
    return;
  end if;
  live := coalesce(r.claimed_until >= now(), false);
  -- The claim the run has, or the one before it, whose request handed out what is handed out now.
  theirs := live and held is not null and (r.claim = held or (r.claimed_by = held and r.handed_out is not null));
  if live and not theirs then
    -- With work handed out, it is held until the claim lapses. Otherwise someone is looking at it this moment.
    return query select null::uuid, null::jsonb, 'held', case when r.handed_out is not null then r.claimed_until end, false;
    return;
  end if;
  if r.next_at > now() and r.waiting_for in ('system', 'error') then
    return query select null::uuid, case when theirs then r.handed_out end, 'waits', r.next_at, false;
    return;
  end if;
  if theirs and r.handed_out is not null and not coalesce(answering, false) then
    return query select null::uuid, r.handed_out, 'handed out', r.claimed_until, false;
    return;
  end if;
  update learning_runs
  set claimed_by = coalesce(held, token), claim = token, lease_seconds = take_learning_run.lease_seconds,
      claimed_until = case when theirs then claimed_until else now() + make_interval(secs => take_learning_run.lease_seconds) end
  where id = r.id;
  -- Nothing carries over from a claim that lapsed.
  return query select token, case when theirs then r.handed_out end, null::text, null::timestamptz, theirs and r.claim is distinct from held;
end
$$;

-- Ends a page that waits for someone to read it, for the routine that learns,
-- under its claim, with how many of its threads wait. With what was handed
-- out to the owner's assistant, the walk and each question by its digest,
-- the claim stays theirs for as long as it lasts, so their answers count.
-- Without, nobody reads now: the claim ends, and the run looks again later.
create function learning_unread(run uuid, claim uuid, threads integer, work jsonb, wait_seconds integer) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
begin
  if threads is null or threads < 0 then
    raise exception 'so many threads wait: none or more' using errcode = 'check_violation';
  end if;
  if work is null then
    update learning_runs
    set unread = threads, attempts = 0, waiting_for = null, next_at = now() + make_interval(secs => greatest(coalesce(wait_seconds, 0), 0)),
        claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
    where id = r.id;
    return;
  end if;
  if not learning_handed(work) then
    raise exception 'what was handed out is a walk and its questions, each by its digest' using errcode = 'check_violation';
  end if;
  update learning_runs
  set unread = threads, handed_out = work, attempts = 0, waiting_for = null, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Whether this is what a run hands out: a walk and at most 50 questions, each by its digest.
create function learning_handed(work jsonb) returns boolean
language sql immutable
as $$
  select coalesce(
    jsonb_typeof(work) = 'object' and work ->> 'walk' in ('main', 'extension', 'again') and jsonb_typeof(work -> 'questions') = 'array'
      and jsonb_array_length(work -> 'questions') <= 50
      and not exists (select from jsonb_array_elements(work -> 'questions') as q where jsonb_typeof(q) <> 'string' or length(q #>> '{}') not between 1 and 64),
    false)
$$;

-- Hands a run's claim back to carry on after a wait, as 0045 has it. A look
-- for the owner's assistant that ended before it took their answers, as
-- when the system it reads didn't answer, keeps what was handed out, under
-- the claim the assistant sent, as if the look hadn't been: it stays theirs
-- until the run is due and for as long as a claim lasts after that, so the
-- same answers count when they are sent again.
drop function learning_later(uuid, uuid, integer, text, jsonb, integer);

create function learning_later(run uuid, claim uuid, wait_seconds integer, trouble text, counted jsonb default null, page_size integer default null, handed jsonb default null) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
  active boolean := r.state in ('learning history', 'following');
  waits text := case when trouble in ('provider', 'system', 'error') then trouble when trouble = 'throttled' then 'system' when trouble = 'limited' then 'provider' end;
  keeps boolean := handed is not null;
begin
  if trouble is not null and trouble not in ('provider', 'system', 'error', 'throttled', 'limited', 'sign in again', 'not set up', 'monthly limit', 'model processing off') then
    raise exception 'a run waits for the provider, the system or an error, its owner, the monthly limit or model processing' using errcode = 'check_violation';
  end if;
  if keeps and not learning_handed(handed) then
    raise exception 'what was handed out is a walk and its questions, each by its digest' using errcode = 'check_violation';
  end if;
  update learning_runs
  set attempts = attempts + case when trouble in ('provider', 'system', 'error') then 1 else 0 end,
      waiting_for = case when learning_hands_out(r) then waits else null end,
      state = case
        when active and trouble in ('sign in again', 'not set up') then 'needs attention'
        when active and trouble in ('monthly limit', 'model processing off') then 'paused'
        else state end,
      reason = case when active and trouble in ('sign in again', 'not set up', 'monthly limit', 'model processing off') then trouble else reason end,
      failures = learning_failures(failures, counted, '{}'),
      page_size = coalesce(learning_later.page_size, learning_runs.page_size),
      next_at = now() + make_interval(secs => greatest(wait_seconds, 0)),
      handed_out = handed,
      claim = case when keeps then claimed_by end, claimed_by = case when keeps then claimed_by end,
      claimed_until = case when keeps then now() + make_interval(secs => greatest(wait_seconds, 0) + coalesce(lease_seconds, 60)) end,
      changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Moves a run on after a page of a walk, as 0045 has it. A page that's done
-- has nothing left to read. A run paused at its limit whose history the
-- owner's assistant read to its end follows what arrives from then on: the
-- limit holds Homing's model back from history, never the run from following.
create or replace function learning_walked(run uuid, claim uuid, walk text, walked_since timestamptz, checkpoint text, caught_up boolean, reached timestamptz, poll_seconds integer, partly boolean default false)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
  after learning_runs;
  more boolean;
  carries boolean;
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
        polled_at = case when caught_up then clock_timestamp() else polled_at end,
        followed_partly = coalesce(partly, false)
    where id = r.id;
  elsif walk <> 'again' then
    raise exception 'a walk is the main one, an extension, or what''s learned from again' using errcode = 'check_violation';
  end if;
  select * into after from learning_runs where id = r.id;
  more := after.caught_up_at is null or (walk = 'main' and not caught_up)
    or (not after.waiting_at_limit and (after.extension_since is not null or exists (select from learned_items i where i.run_id = r.id and i.again)));
  carries := after.state in ('learning history', 'following') or (after.state = 'paused' and after.reason = 'limit' and after.caught_up_at is not null);
  update learning_runs
  set state = case when carries then learning_active(after) else after.state end,
      reason = case when carries then null else after.reason end,
      next_at = case when more then now() else now() + make_interval(secs => greatest(poll_seconds, 1)) end,
      attempts = 0, failures = learning_failures(after.failures, null, '{}'),
      page_size = null, waiting_for = null, unread = 0,
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id
  returning state into now_in;
  return now_in;
end
$$;

-- Marks items a run processed, as 0046 has it. An item the owner's assistant
-- read says so, by the assistant's name.
create or replace function learning_marked(run uuid, claim uuid, marks jsonb, note uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
begin
  if jsonb_typeof(marks) <> 'array' or jsonb_array_length(marks) > 1000 then
    raise exception 'marks are a list of at most 1,000 items' using errcode = 'check_violation';
  end if;
  if note is not null and not exists (
    select from content c where c.id = learning_marked.note and c.private_to = r.private_to
      and (c.space_id = r.space_id or c.space_id::text = r.rest or exists (select from jsonb_array_elements(r.routes) as route where route ->> 'to' = c.space_id::text))
  ) then
    raise exception 'a note is on the run''s owner''s side of a space its map leads to' using errcode = 'insufficient_privilege';
  end if;
  insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note, sender, at, because, interpretation, reader, folder, parties, retry_at)
  select r.id, r.space_id, r.private_to, m.item, m.version, m.thread, m.outcome, m.reason, learning_marked.note, lower(m.sender), m.at, m.because, m.interpretation, m.reader, m.folder, m.parties,
         case when m.outcome = 'set aside' and learning_retryable(m.reason) then now() + interval '1 day' end
  from jsonb_to_recordset(marks) as m (item text, version text, thread text, outcome text, reason text, sender text, at timestamptz, because text, interpretation text, reader text, folder text, parties text[])
  on conflict (run_id, item) do update
  set version = excluded.version, thread = excluded.thread, outcome = excluded.outcome, reason = excluded.reason,
      note = coalesce(excluded.note, learned_items.note), sender = excluded.sender, at = excluded.at, because = excluded.because,
      interpretation = excluded.interpretation, reader = excluded.reader, folder = excluded.folder, parties = excluded.parties, again = false, processed_at = clock_timestamp(),
      retry_at = case when excluded.retry_at is not null and not learned_items.retried then coalesce(learned_items.retry_at, excluded.retry_at) end;
  update learning_runs
  set claimed_until = greatest(claimed_until, now() + make_interval(secs => coalesce(lease_seconds, 60))), attempts = 0, waiting_for = null,
      refused = case
        when exists (select from jsonb_to_recordset(marks) as m (reason text) where m.reason = 'provider refused') then refused + 1
        when exists (select from jsonb_to_recordset(marks) as m (reason text, interpretation text) where m.interpretation is not null and m.reason is distinct from 'provider failed') then 0
        else refused end,
      failures = learning_failures(failures, null, array(
        select coalesce(m.thread, m.item) from jsonb_to_recordset(marks) as m (item text, thread text, interpretation text) where m.interpretation is not null
      ))
  where id = r.id;
end
$$;

revoke execute on function forget_handed_out, refuse_call_without_limit, learned_reader, learning_hands_out, learning_handed, take_learning_run, learning_unread, learning_later from public;
grant execute on function learned_reader, learning_hands_out, learning_handed, take_learning_run, learning_unread, learning_later to homing_app;
