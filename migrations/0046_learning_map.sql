-- A map of where a place's mail belongs (#142, spec §8). A run keeps a
-- summary of its place, made without a model: who writes, how much and when.
-- And a map: routes, each saying who, a sender by address or domain, and
-- where: a space, or wait; and where everything else goes. A map is set only
-- by the person, by approving it as a proposal. The senders a run leaves out
-- stay a list of their own, as 0045 has it: a map adds to it and never takes
-- anything off it. Without a map, everything goes to the place's own space,
-- as before.

-- Whether a text names a sender for a route: a plain address or a domain, in
-- lower case, of ASCII only, so it names who it looks like it names.
create function route_names(who text) returns boolean
language sql immutable
as $$
  select length(who) <= 320 and who ~ '^([a-z0-9.!#$%&''*+/=?^_`{|}~-]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$'
$$;

-- Whether one of the senders left out covers a route's sender: that
-- address, or the whole of the domain it names. What is left out is never
-- read, whatever route names it.
create function route_left_out(who text, senders text[]) returns boolean
language sql immutable
as $$
  select exists (select from unnest(senders) as l (entry) where sender_matches(l.entry, case when who like '%@%' then who else 'x@' || who end))
$$;

-- Whether a list of routes is whole: each names a sender once, and leads to
-- a space, leave out, or wait.
create function routes_fit(routes jsonb) returns boolean
language sql immutable
as $$
  select jsonb_typeof(routes) = 'array' and jsonb_array_length(routes) <= 400
     and not exists (
       select from jsonb_array_elements(routes) as route
       where jsonb_typeof(route) <> 'object' or not coalesce(route_names(route ->> 'who'), false)
          or coalesce(route ->> 'to' not in ('leave out', 'wait') and route ->> 'to' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
     )
     and (select count(*) = count(distinct route ->> 'who') from jsonb_array_elements(routes) as route)
$$;

alter table learning_runs
  -- [{"who": "northwind.test", "to": "<space id>" | "wait"}], and where
  -- everything else goes: null for the place's own space. Who is left out
  -- is in excluded_senders, never here.
  add column routes jsonb not null default '[]' check (routes_fit(routes) and jsonb_array_length(routes) <= 200 and not routes @> '[{"to": "leave out"}]'),
  add column rest text check (rest in ('leave out', 'wait') or rest ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- The summary of the place, as Homing made it, and, while it's being made,
  -- how far the worker has come: senders, counts, dates and subjects, never
  -- an email's text. A summary Homing gave up on says so there.
  add column summary jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 400000),
  add column summarizing jsonb check (jsonb_typeof(summarizing) = 'object' and pg_column_size(summarizing) < 8000000),
  -- Until when Homing's own model is being asked for a map of the place, so
  -- it is asked once at a time. It ends by itself, should Homing stop meanwhile.
  add column map_asked_until timestamptz;

-- Who a thread was with, as far as Homing saw, when this item of it was set
-- aside by the map, to wait or as left out: everyone who wrote in it, and
-- whoever its owner wrote to. A map that changes for one of them has the
-- thread looked at again.
alter table learned_items add column parties text[] check (cardinality(parties) <= 200);

create index learned_items_waiting on learned_items (run_id) where reason = 'waiting' and not again;

-- Sets a run's routes, where everything else goes and who is left out, and
-- has the run look again at what it set aside by them, by thread: every item
-- that waits or was left out, in a thread where one was set aside by an
-- entry that changed, or holds someone an entry that changed names, by
-- address or domain, or went where everything else goes when that changed.
-- An item set aside before a run kept who its thread is with goes by its
-- sender.
-- Where a thread belongs is the worker's to say, which sorts each again.
-- Looking at too many costs a request; this never decides. How many.
create function learning_mapped(r learning_runs, routes jsonb, rest text, senders text[]) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  changed text[];
  again integer;
begin
  changed := array(
    select who
    from (select route ->> 'who' as who, route ->> 'to' as dest from jsonb_array_elements(r.routes) as route
          union all select e, 'leave out' from unnest(r.excluded_senders) as e) as before
    full join (select route ->> 'who' as who, route ->> 'to' as dest from jsonb_array_elements(learning_mapped.routes) as route
               union all select e, 'leave out' from unnest(senders) as e) as after using (who)
    where before.dest is distinct from after.dest
  );
  update learning_runs
  set routes = learning_mapped.routes, rest = learning_mapped.rest, excluded_senders = senders, changed_at = clock_timestamp()
  where id = r.id;
  update learned_items i
  set again = true
  where i.run_id = r.id and i.outcome = 'set aside' and not i.again and i.reason in ('excluded sender', 'waiting')
    and coalesce(i.thread, i.item) in (
      select coalesce(p.thread, p.item) from learned_items p
      where p.run_id = r.id and p.outcome = 'set aside' and p.reason in ('excluded sender', 'waiting')
        and (p.because = any (changed)
          or (p.because is null and r.rest is distinct from learning_mapped.rest)
          or exists (select from unnest(changed) as c (entry), unnest(coalesce(p.parties, array[p.sender])) as w (address) where sender_matches(c.entry, w.address)))
    );
  get diagnostics again = row_count;
  if again > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now() where id = r.id;
  end if;
  return again;
end
$$;

-- Asks for a summary of a place of the person's own, back to a day, for
-- them or their assistant: Homing's worker makes it, a page at a time. It
-- needs no model and no estimate. A place without a run gets one, which
-- waits to be started. A started run is summarized over its own scope.
-- Whatever worker has the run loses it, so a summary it was making for an
-- earlier request is never kept. When the run walks next stays as it is: a
-- run that waits, as its place or the model's provider asked, isn't hurried.
create function summarize_learning(place uuid, since timestamptz) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  target places;
  r learning_runs;
begin
  if me is null or current_routine() is not null then
    raise exception 'only a person, or their assistant, directs learning' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('homing.space_access'));
  select p.* into target from places p join connections c on c.id = p.connection_id
  where p.id = summarize_learning.place and p.private_to = me and c.person_id = me
    and p.removed_at is null and c.revoked_at is null and p.space_id in (select accessible_spaces());
  if target.id is null then
    raise exception 'there is no such place of yours' using errcode = 'insufficient_privilege';
  end if;
  select * into r from learning_runs l where l.place_id = target.id for update;
  if r.id is null or r.state = 'estimating' then
    if since is null or not (since > '1990-01-01' and since < now()) then
      raise exception 'learning starts from a day in the past' using errcode = 'check_violation';
    end if;
    perform pg_advisory_xact_lock(hashtext('homing.learning ' || target.connection_id::text));
    if learning_elsewhere(target.id) then
      raise exception 'Homing already learns from that in another space' using errcode = 'check_violation';
    end if;
  end if;
  if r.id is null then
    insert into learning_runs (place_id, connection_id, space_id, private_to, since)
    values (target.id, target.connection_id, target.space_id, me, summarize_learning.since)
    returning * into r;
  elsif r.state = 'done' then
    raise exception 'that learning run has stopped, since its place is gone' using errcode = 'check_violation';
  elsif r.state = 'estimating' and r.since is distinct from summarize_learning.since then
    -- Another scope: what was estimated for the old one no longer holds.
    update learning_runs set since = summarize_learning.since, estimate = null where id = r.id returning * into r;
  end if;
  update learning_runs
  set summarizing = jsonb_build_object('since', to_jsonb(r.since)),
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id;
  return r.id;
end
$$;

-- Keeps how far a summary has come, or the summary once it's made: for the
-- routine that learns, under its claim, which it hands back when the run
-- has no page to walk now. The summary is a step of its own: nothing else
-- about the run changes with it.
create function learning_summarized(run uuid, claim uuid, working jsonb, summary jsonb, done boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
begin
  update learning_runs
  set summarizing = working, summary = coalesce(learning_summarized.summary, learning_runs.summary),
      claimed_by = case when done then null else claimed_by end, claim = case when done then null else learning_runs.claim end,
      claimed_until = case when done then null else claimed_until end, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Sets a run's map: its routes and where everything else goes, which stays
-- as it is when the map doesn't say. Only the person does, in Homing itself,
-- which approving a proposed map is. The senders the run leaves out now all
-- stay left out, with those the map leaves out added, and a route for
-- anyone that list covers, by address or by domain, is dropped: a map never
-- takes anyone off that list, and no route reads what is left out. A route
-- names only a space they can open. Whatever worker has the
-- run loses it, so nothing is written by the map as it was.
create function set_learning_map(run uuid, routes jsonb, rest text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  leaves text[];
  kept jsonb;
begin
  if not direct_edit() then
    raise exception 'only the person sets where learning puts things, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(routes_fit(routes), false) then
    raise exception 'a map''s routes each name a sender once, by address or domain' using errcode = 'check_violation';
  end if;
  leaves := array(
    select e from unnest(r.excluded_senders) as e
    union select route ->> 'who' from jsonb_array_elements(routes) as route where route ->> 'to' = 'leave out'
    order by 1
  );
  select coalesce(jsonb_agg(route order by place), '[]') into kept
  from jsonb_array_elements(routes) with ordinality as given (route, place)
  where route ->> 'to' <> 'leave out' and not route_left_out(route ->> 'who', leaves);
  if cardinality(leaves) > 200 or jsonb_array_length(kept) > 200 then
    raise exception 'a map holds up to 200 routes, and a run leaves out up to 200 senders' using errcode = 'check_violation';
  end if;
  if exists (
    select from (select route ->> 'to' as dest from jsonb_array_elements(kept) as route union all select set_learning_map.rest) as named
    where named.dest is not null and named.dest not in ('leave out', 'wait')
      and not exists (select from accessible_spaces() as mine (id) where mine.id::text = named.dest)
  ) then
    raise exception 'a route leads to a space you can open' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs set claimed_by = null, claim = null, claimed_until = null where id = r.id;
  perform learning_mapped(r, kept, coalesce(set_learning_map.rest, r.rest), leaves);
end
$$;

-- Sets what a run leaves out and keeps, as 0045 has it. A sender left out
-- takes the place of every route it covers, for that address or for anyone
-- at that domain, and what the run set
-- aside by its map or its left-out senders is looked at again where they
-- changed, as when a map changes. A folder left out since the run's summary
-- was made is in that summary, so the summary is made again without it.
create or replace function set_learning_exclusions(run uuid, senders text[], folders text[], kept text[]) returns void
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
  set excluded_folders = left_folders, kept_senders = keeps, changed_at = clock_timestamp()
  where id = r.id;
  if not left_folders <@ r.excluded_folders and (r.summary is not null or r.summarizing is not null) then
    update learning_runs
    set summary = null, summarizing = jsonb_build_object('since', to_jsonb(r.since)),
        claimed_by = null, claim = null, claimed_until = null
    where id = r.id;
  end if;
  update learned_items i
  set again = true
  where i.run_id = r.id and i.outcome = 'set aside' and not i.again and (
    (i.reason = 'excluded folder' and i.because = any (r.excluded_folders) and not i.because = any (left_folders))
    or (i.reason in ('newsletter', 'automated') and i.sender is not null
        and exists (select from unnest(keeps) as k (entry) where sender_matches(k.entry, i.sender))
        and not exists (select from unnest(r.kept_senders) as k (entry) where sender_matches(k.entry, i.sender)))
  );
  get diagnostics again = row_count;
  again := again + learning_mapped(
    r,
    (select coalesce(jsonb_agg(route order by place), '[]') from jsonb_array_elements(r.routes) with ordinality as had (route, place) where not route_left_out(route ->> 'who', left_senders)),
    r.rest, left_senders
  );
  if again > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now() where id = r.id;
  end if;
end
$$;

-- Marks that Homing's own model is being asked for a map of the person's
-- run, for a few minutes at most, or takes the mark off: only the person
-- asks, in Homing itself. Whether it was marked now, which it isn't while
-- another ask holds the mark.
create function learning_map_asking(run uuid, asking boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_person_id() is null or current_agent() is not null or current_routine() is not null then
    raise exception 'only the person asks Homing''s model for a map, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs r
  set map_asked_until = case when asking then now() + interval '5 minutes' end
  where r.id = learning_map_asking.run and r.private_to = current_person_id() and r.space_id in (select accessible_spaces())
    and (not asking or r.map_asked_until is null or r.map_asked_until < now());
  return found;
end
$$;

-- Has a run learn after all from what waits for a space that can take it
-- now: for the routine that learns, under its claim, which says which of
-- the map's entries lead to such a space, and whether everything else does.
-- How many.
create function learning_reopened(run uuid, claim uuid, entries text[], rest boolean) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
  again integer;
begin
  update learned_items i
  set again = true
  where i.run_id = r.id and i.reason = 'waiting' and not i.again and (i.because = any (entries) or (i.because is null and rest));
  get diagnostics again = row_count;
  return again;
end
$$;

-- Claims a run that needs work, as 0045 has it. A run whose summary is asked
-- for needs work too, whatever else it waits for, started or not, until the
-- summary is made or given up, but not while the summary waits to be tried
-- again.
create or replace function claim_learning_run(worker uuid, lease_seconds integer)
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
  set state = 'done', reason = 'removed', summarizing = null, claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
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
  where r.state <> 'done' and (r.claimed_until is null or r.claimed_until < now())
    and ((r.state in ('learning history', 'following') and r.next_at <= now())
      or (r.summarizing is not null and not r.summarizing ? 'failed' and coalesce((r.summarizing ->> 'retryAt')::numeric, 0) <= extract(epoch from now()) * 1000))
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

-- Marks items a run processed, as 0045 has it. A note is on the owner's
-- private side in the place's space or one the run's map leads to. And an
-- item set aside by the map says who its thread was with.
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
  insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note, sender, at, because, interpretation, folder, parties, retry_at)
  select r.id, r.space_id, r.private_to, m.item, m.version, m.thread, m.outcome, m.reason, learning_marked.note, lower(m.sender), m.at, m.because, m.interpretation, m.folder, m.parties,
         case when m.outcome = 'set aside' and learning_retryable(m.reason) then now() + interval '1 day' end
  from jsonb_to_recordset(marks) as m (item text, version text, thread text, outcome text, reason text, sender text, at timestamptz, because text, interpretation text, folder text, parties text[])
  on conflict (run_id, item) do update
  set version = excluded.version, thread = excluded.thread, outcome = excluded.outcome, reason = excluded.reason,
      note = coalesce(excluded.note, learned_items.note), sender = excluded.sender, at = excluded.at, because = excluded.because,
      interpretation = excluded.interpretation, folder = excluded.folder, parties = excluded.parties, again = false, processed_at = clock_timestamp(),
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

-- A plan (0035) may also make a map: steps that create spaces only the
-- person will have, and one that sets a run's routes, which may lead to a
-- space an earlier step creates, by that step's place in the plan. A map is
-- a plan even when it's the only step.
create or replace function plan_fits(change jsonb, space uuid) returns boolean
language plpgsql immutable set search_path = public, pg_temp
as $$
declare
  step jsonb;
  id constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  maps integer;
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
  select count(*) into maps from jsonb_array_elements(change->'steps') as s where s->>'action' = 'learning map';
  if maps > 1 or (maps = 0 and jsonb_array_length(change->'steps') + (change ? 'space')::int < 2) or (maps = 1 and jsonb_array_length(change->'steps') < 1) then
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
      when 'add space' then
        maps = 1 and jsonb_typeof(step->'name') = 'string' and btrim(step->>'name') <> ''
        and (step->>'in' ~ id or step->>'in' ~ '^step [0-9]{1,3}$')
      when 'learning map' then
        step->>'place' ~ id and jsonb_typeof(step->'routes') = 'array' and jsonb_array_length(step->'routes') <= 400
        and not exists (
          select from jsonb_array_elements(step->'routes') as route
          where not coalesce(route_names(route->>'who'), false) or coalesce(route->>'to' not in ('leave out', 'wait') and route->>'to' !~ id and route->>'to' !~ '^step [0-9]{1,3}$', true)
        )
        and (step->'rest' is null or step->'rest' = 'null'::jsonb or step->>'rest' in ('leave out', 'wait') or step->>'rest' ~ id or step->>'rest' ~ '^step [0-9]{1,3}$')
      else false
    end, false) then
      return false;
    end if;
  end loop;
  return true;
end
$$;

revoke execute on function routes_fit, learning_mapped, summarize_learning, learning_summarized, set_learning_map, learning_map_asking, learning_reopened from public;
grant execute on function summarize_learning, learning_summarized, set_learning_map, learning_map_asking, learning_reopened to homing_app;
