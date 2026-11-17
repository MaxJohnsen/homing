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
  -- The questions handed out to its owner's assistant under the claim the
  -- run has now, each by a digest of what it asks and the items it holds, in
  -- their versions. No item's text. It goes when the claim does: whoever
  -- takes the run with that claim gets it, to check the answers by.
  add column handed_out jsonb check (jsonb_typeof(handed_out) = 'array' and jsonb_array_length(handed_out) <= 50);

-- Who read an item, when that wasn't Homing's own model: the person's
-- assistant, by the name it connected with.
alter table learned_items add column reader text check (length(reader) between 1 and 200);

-- What was handed out counts under the claim it was handed out with, and no
-- other: whatever ends or replaces a run's claim lets go of it.
create function forget_handed_out() returns trigger
language plpgsql
as $$
begin
  if new.claim is distinct from old.claim then
    new.handed_out := null;
  end if;
  return new;
end
$$;

create trigger handed_out_with_claim before update of claim on learning_runs
for each row execute function forget_handed_out();

-- Whether a run has reading to hand out to its owner's assistant: while it
-- learns, and while it's paused for money alone, at its own limit or the
-- monthly one, since an assistant's reading costs nothing in Homing. Paused
-- by its owner, or waiting for anything else, it hands out nothing.
create function learning_hands_out(r learning_runs) returns boolean
language sql immutable
as $$
  select r.state in ('learning history', 'following') or (r.state = 'paused' and r.reason in ('limit', 'monthly limit'))
$$;

-- Takes a run's claim for its owner's assistant, which only that assistant
-- can ask for, when nobody holds the run or the assistant names the claim it
-- holds. Either way the claim is a new one, as each of a worker's is, so one
-- look at a page works under it at a time: a second request with the same
-- claim finds it taken. With the claim it held, the assistant gets what was
-- handed out under it, which its answers are for. One worker reads a run at
-- a time, so a run Homing's own worker or another conversation holds is
-- refused until that claim ends or lapses, and so is one that waits for the
-- system it reads or for an error of Homing's own, until it's due. Says why,
-- and until when.
create function take_learning_run(run uuid, held uuid, lease_seconds integer)
returns table (claim uuid, handed jsonb, refused text, until timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs;
  token uuid := gen_random_uuid();
begin
  if current_agent() is null or lease_seconds is null or not (lease_seconds between 1 and 3600) then
    raise exception 'only the person''s assistant takes a learning run''s reading' using errcode = 'insufficient_privilege';
  end if;
  r := own_learning_run(run);
  if not learning_hands_out(r) then
    return query select null::uuid, null::jsonb, 'not reading', null::timestamptz;
    return;
  end if;
  if r.claimed_until >= now() then
    if r.claim is distinct from held then
      return query select null::uuid, null::jsonb, 'held', r.claimed_until;
      return;
    end if;
  else
    if r.next_at > now() and r.waiting_for in ('system', 'error') then
      return query select null::uuid, null::jsonb, 'waits', r.next_at;
      return;
    end if;
    -- Nothing carries over from a claim that lapsed.
    r.handed_out := null;
  end if;
  update learning_runs
  set claimed_by = token, claim = token, claimed_until = now() + make_interval(secs => take_learning_run.lease_seconds), lease_seconds = take_learning_run.lease_seconds
  where id = r.id;
  return query select token, r.handed_out, null::text, null::timestamptz;
end
$$;

-- Ends a page that waits for someone to read it, for the routine that learns,
-- under its claim, with how many of its threads wait. With what was handed
-- out to the owner's assistant, each question by its digest, the claim stays
-- theirs for as long again, so their answers count. Without, nobody reads
-- now: the claim ends, and the run looks again later.
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
  if jsonb_typeof(work) <> 'array' or exists (select from jsonb_array_elements(work) as q where jsonb_typeof(q) <> 'string' or length(q #>> '{}') not between 1 and 64) then
    raise exception 'what was handed out is a list of questions, each by its digest' using errcode = 'check_violation';
  end if;
  update learning_runs
  set unread = threads, handed_out = work, attempts = 0, waiting_for = null,
      claimed_until = now() + make_interval(secs => coalesce(lease_seconds, 60)), changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Moves a run on after a page of a walk, as 0045 has it. A page that's done
-- has nothing left to read.
create or replace function learning_walked(run uuid, claim uuid, walk text, walked_since timestamptz, checkpoint text, caught_up boolean, reached timestamptz, poll_seconds integer, partly boolean default false)
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
        polled_at = case when caught_up then clock_timestamp() else polled_at end,
        followed_partly = coalesce(partly, false)
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

revoke execute on function forget_handed_out, learning_hands_out, take_learning_run, learning_unread from public;
grant execute on function learning_hands_out, take_learning_run, learning_unread to homing_app;
