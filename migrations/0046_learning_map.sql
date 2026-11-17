-- A map of where a place's mail belongs (#142, spec §8). A run keeps a
-- summary of its place, made without a model: who writes, how much and when.
-- And a map: routes, each saying who, a sender by address or domain, and
-- where: a space, leave out, or wait; and where everything else goes. A map
-- is set only by the person, by approving it as a proposal. The senders a run
-- leaves out are routes to leave out, so who goes where is kept once. Without
-- a map, everything goes to the place's own space, as before.

alter table learning_runs
  -- [{"who": "northwind.test", "to": "<space id>" | "leave out" | "wait"}],
  -- and where everything else goes: null for the place's own space.
  add column routes jsonb not null default '[]' check (jsonb_typeof(routes) = 'array' and jsonb_array_length(routes) <= 400),
  add column rest text check (rest in ('leave out', 'wait') or rest ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- The summary of the place, as Homing made it, and, while it's being made,
  -- how far the worker has come: senders, counts, dates and subjects, never
  -- an email's text.
  add column summary jsonb check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) < 400000),
  add column summarizing jsonb check (jsonb_typeof(summarizing) = 'object' and pg_column_size(summarizing) < 8000000);

update learning_runs r
set routes = (select coalesce(jsonb_agg(jsonb_build_object('who', e.entry, 'to', 'leave out') order by e.entry), '[]') from unnest(r.excluded_senders) as e (entry));

alter table learning_runs drop column excluded_senders;

-- No route named anyone in its thread, so it went where everything else goes.
alter table learned_items add column unplaced boolean not null default false;

-- Where a route's entry leads now: the route that names it, or, for none,
-- where everything else goes: a space's id, leave out, or wait.
create function learning_route_to(r learning_runs, entry text) returns text
language sql stable
as $$
  select coalesce(
    (select route ->> 'to' from jsonb_array_elements(r.routes) as route where route ->> 'who' = entry limit 1),
    r.rest, r.space_id::text
  )
$$;

-- What a run set aside because of a route is learned from after all once
-- the route no longer says so: a thread left out whose sender isn't any more,
-- and one that waited once its route leads to a space its owner can open
-- where model processing is on, or, when no route named it, once one names
-- its sender. The run reads each as the map has it then. How many.
create function learning_rerouted(run uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs;
  again integer;
begin
  select * into r from learning_runs where id = learning_rerouted.run;
  update learned_items i
  set again = true
  from (select i2.item, learning_route_to(r, i2.because) as dest from learned_items i2
        where i2.run_id = r.id and i2.outcome = 'set aside' and not i2.again and i2.reason in ('excluded sender', 'waiting')) as now_to
  where i.run_id = r.id and i.item = now_to.item and (
    (i.unplaced and i.sender is not null and exists (select from jsonb_array_elements(r.routes) as route where sender_matches(route ->> 'who', i.sender)))
    or (i.reason = 'excluded sender' and now_to.dest <> 'leave out')
    or (i.reason = 'waiting' and now_to.dest = 'leave out')
    or (i.reason = 'waiting' and now_to.dest not in ('leave out', 'wait')
        and exists (select from space_access a where a.space_id = now_to.dest::uuid and a.person_id = r.private_to)
        and not exists (select from model_off(array[now_to.dest::uuid])))
  );
  get diagnostics again = row_count;
  if again > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now(), changed_at = clock_timestamp() where id = r.id;
  end if;
  return again;
end
$$;

-- Asks for a summary of a place of the person's own, back to a day, for
-- them or their assistant: Homing's worker makes it, a page at a time. It
-- needs no model and no estimate. A place without a run gets one, which
-- waits to be started. A started run is summarized over its own scope.
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
  set summarizing = jsonb_build_object('since', to_jsonb(r.since)), next_at = now(), attempts = 0, changed_at = clock_timestamp()
  where id = r.id;
  return r.id;
end
$$;

-- Keeps how far a summary has come, or the summary once it's made, and ends
-- the claim: for the routine that learns, under its claim. Without either,
-- the summary is given up, as when the place can't be reached any more.
create function learning_summarized(run uuid, claim uuid, working jsonb, summary jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := claimed_learning_run(run, claim);
begin
  update learning_runs
  set summarizing = working, summary = coalesce(learning_summarized.summary, learning_runs.summary),
      next_at = now(), attempts = 0, waiting_for = null,
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id;
end
$$;

-- Whether a list of routes is whole: each names a sender once, by address
-- or domain, in lower case, and leads to a space, leave out, or wait.
create function routes_fit(routes jsonb) returns boolean
language sql immutable
as $$
  select jsonb_typeof(routes) = 'array' and jsonb_array_length(routes) <= 400
     and not exists (
       select from jsonb_array_elements(routes) as route
       where jsonb_typeof(route) <> 'object' or length(coalesce(route ->> 'who', '')) not between 1 and 320 or route ->> 'who' ~ '[[:cntrl:]]' or route ->> 'who' <> lower(route ->> 'who')
          or coalesce(route ->> 'to' not in ('leave out', 'wait') and route ->> 'to' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
     )
     and (select count(*) = count(distinct route ->> 'who') from jsonb_array_elements(routes) as route)
$$;

-- Sets a run's map: its routes and where everything else goes. Only the
-- person does, in Homing itself, which approving a proposed map is. A route
-- names only a space they can open, and write on their own side of, that
-- isn't archived. Whatever worker has the run loses it, so nothing is
-- written by the map as it was. What a route set aside before and no longer
-- does is learned from after all.
create function set_learning_map(run uuid, routes jsonb, rest text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
begin
  if not direct_edit() then
    raise exception 'only the person sets where learning puts things, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(routes_fit(routes), false)
     or (select count(*) from jsonb_array_elements(routes) as route where route ->> 'to' = 'leave out') > 200 then
    raise exception 'a map holds up to 200 routes, and 200 senders left out, each naming a sender once' using errcode = 'check_violation';
  end if;
  if exists (
    select from (select route ->> 'to' as dest from jsonb_array_elements(routes) as route union all select rest) as named
    where named.dest is not null and named.dest not in ('leave out', 'wait')
      and not exists (select from spaces s where s.id::text = named.dest and s.archived_at is null and s.id in (select accessible_spaces()))
  ) then
    raise exception 'a route leads to a space you can open' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs
  set routes = set_learning_map.routes, rest = set_learning_map.rest,
      claimed_by = null, claim = null, claimed_until = null, changed_at = clock_timestamp()
  where id = r.id;
  perform learning_rerouted(r.id);
end
$$;

-- Sets what a run leaves out and keeps, as 0045 has it, with the senders it
-- leaves out kept as routes to leave out. A sender left out takes the place
-- of a route that named them.
create or replace function set_learning_exclusions(run uuid, senders text[], folders text[], kept text[]) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r learning_runs := own_learning_run(run);
  had text[];
  left_senders text[];
  left_folders text[];
  keeps text[];
  again integer;
begin
  if senders is null or folders is null or kept is null or cardinality(senders) > 200 or cardinality(folders) > 200 or cardinality(kept) > 200
     or exists (select from unnest(senders || folders || kept) as one (value) where one.value is null or length(btrim(one.value)) not between 1 and 320 or one.value ~ '[[:cntrl:]]') then
    raise exception 'leave out up to 200 senders and 200 folders, and keep up to 200 senders, each on one line' using errcode = 'check_violation';
  end if;
  had := array(select route ->> 'who' from jsonb_array_elements(r.routes) as route where route ->> 'to' = 'leave out');
  left_senders := array(select distinct lower(btrim(value)) from unnest(senders) as one (value) order by 1);
  left_folders := array(select distinct btrim(value) from unnest(folders) as one (value) order by 1);
  keeps := array(select distinct lower(btrim(value)) from unnest(kept) as one (value) order by 1);
  if not direct_edit() and not (had <@ left_senders and r.excluded_folders <@ left_folders and keeps = r.kept_senders) then
    raise exception 'only the person takes something off what''s left out, or keeps a sender, in Homing itself' using errcode = 'insufficient_privilege';
  end if;
  update learning_runs
  set routes = (
        select coalesce(jsonb_agg(route order by place), '[]') from (
          select route, place from jsonb_array_elements(r.routes) with ordinality as kept_routes (route, place)
          where route ->> 'to' <> 'leave out' and not route ->> 'who' = any (left_senders)
          union all
          select jsonb_build_object('who', entry, 'to', 'leave out'), 1000 + place from unnest(left_senders) with ordinality as l (entry, place)
        ) as now_routes
      ),
      excluded_folders = left_folders, kept_senders = keeps, changed_at = clock_timestamp()
  where id = r.id;
  update learned_items i
  set again = true
  where i.run_id = r.id and i.outcome = 'set aside' and not i.again and (
    (i.reason = 'excluded folder' and i.because = any (r.excluded_folders) and not i.because = any (left_folders))
    or (i.reason in ('newsletter', 'automated') and i.sender is not null
        and exists (select from unnest(keeps) as k (entry) where sender_matches(k.entry, i.sender))
        and not exists (select from unnest(r.kept_senders) as k (entry) where sender_matches(k.entry, i.sender)))
  );
  get diagnostics again = row_count;
  if again + learning_rerouted(r.id) > 0 and r.state in ('learning history', 'following') then
    update learning_runs set next_at = now() where id = r.id;
  end if;
end
$$;

-- Claims a run that needs work, as 0045 has it. A run whose summary is asked
-- for needs work too, started or not. And what the claimed run set aside to
-- wait is learned from once its route allows, as when model processing was
-- turned on where it leads.
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
  where (r.state in ('learning history', 'following') or (r.summarizing is not null and r.state <> 'done')) and r.next_at <= now()
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
  if exists (select from learned_items i where i.run_id = picked.id and i.reason = 'waiting' and not i.again) then
    perform learning_rerouted(picked.id);
  end if;
  return query select picked.id, picked.private_to, token;
end
$$;

-- Marks items a run processed, as 0045 has it. A note is on the owner's
-- private side in the place's space or one the run's map leads to. And an
-- item says whether no route named anyone in its thread.
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
  insert into learned_items (run_id, space_id, private_to, item, version, thread, outcome, reason, note, sender, at, because, interpretation, folder, unplaced, retry_at)
  select r.id, r.space_id, r.private_to, m.item, m.version, m.thread, m.outcome, m.reason, learning_marked.note, lower(m.sender), m.at, m.because, m.interpretation, m.folder, coalesce(m.unplaced, false),
         case when m.outcome = 'set aside' and learning_retryable(m.reason) then now() + interval '1 day' end
  from jsonb_to_recordset(marks) as m (item text, version text, thread text, outcome text, reason text, sender text, at timestamptz, because text, interpretation text, folder text, unplaced boolean)
  on conflict (run_id, item) do update
  set version = excluded.version, thread = excluded.thread, outcome = excluded.outcome, reason = excluded.reason,
      note = coalesce(excluded.note, learned_items.note), sender = excluded.sender, at = excluded.at, because = excluded.because,
      interpretation = excluded.interpretation, folder = excluded.folder, unplaced = excluded.unplaced, again = false, processed_at = clock_timestamp(),
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
          where coalesce(route->>'who', '') = '' or coalesce(route->>'to' not in ('leave out', 'wait') and route->>'to' !~ id and route->>'to' !~ '^step [0-9]{1,3}$', true)
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

revoke execute on function learning_route_to, learning_rerouted, summarize_learning, learning_summarized, routes_fit, set_learning_map from public;
grant execute on function summarize_learning, learning_summarized, set_learning_map to homing_app;
