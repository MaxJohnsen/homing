-- Importing a space of any size (#6, spec §3, guarantee 10). An import now
-- makes its spaces first, in a moment, then fills them a batch at a time
-- without holding the lock that creating spaces takes everywhere, and shows
-- them only once everything is in. Until then nobody sees them, not even the
-- person importing: not in lists, counts or search. An import that fails, or
-- that stops because Homing did, is taken out again, and only what it put in.

-- The spaces an import is still filling.
create table importing (
  space_id uuid primary key references spaces (id),
  import_id uuid not null references imports (id)
);

create index importing_import on importing (import_id);

alter table importing enable row level security;

-- Seen only where the person has the space, which is only by whoever is importing it.
create policy own on importing for select
using (space_id in (select space_id from space_access where person_id = current_person_id()));

grant select on importing to homing_app;

-- Whether an import is done, and when it last wrote, so one that stopped on the way can be found.
alter table imports
  add column done boolean not null default true,
  add column touched_at timestamptz;

-- The spaces the principal can access, as before, except those an import is still filling.
create or replace function accessible_spaces() returns setof uuid
language sql stable
as $$
  select a.space_id from public.space_access a
  where a.person_id = current_person_id()
    and not exists (select from public.importing i where i.space_id = a.space_id)
  union all
  select current_space_id() where current_space_id() is not null
$$;

-- Taking an import out goes through what points to its rows, so what points
-- there is found by key, not by reading every row.
create index proposals_item on proposals (item_id) where item_id is not null;
create index proposals_page on proposals (page_id) where page_id is not null;
create index proposals_task on proposals (task_id) where task_id is not null;
create index includes_skill on includes (skill_included) where skill_included is not null;
create index proposal_includes_skill on proposal_includes (skill_included) where skill_included is not null;
create index proposal_includes_space on proposal_includes (space_included) where space_included is not null;
create index revisions_space on revisions (space_id);
create index gathered_space on gathered (space_id);

-- An export reads a space's sources a thousand at a time, in the order they
-- were kept, each thousand after the last.
drop index sources_space;
create index sources_space on sources (space_id, created_at, id);

-- A citation is seen with what cites it, and checked a citation at a time, by
-- key. As a list of every item the person sees, it was read whole for each
-- query, and once there were a few hundred thousand items, row by row for
-- each citation, so reading a space's citations took minutes.
alter policy visible on citations
using (exists (select from content where content.id = citations.content_id))
with check (
  exists (
    select from content
    where content.id = citations.content_id and content.kind = 'text' and content.written_by is not distinct from current_person_id()
  )
  and exists (select from sources where sources.id = citations.source_id)
);

-- An import of the person's own that's still under way, and its spaces, or a refusal.
create function import_under_way(import uuid) returns uuid[]
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_person_id() is null or not direct_edit() then
    raise exception 'only a person imports a space, directly' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select from imports i where i.id = import and i.imported_by = current_person_id() and not i.done) then
    raise exception 'there''s no import of yours under way there' using errcode = 'insufficient_privilege';
  end if;
  update imports set touched_at = clock_timestamp() where id = import;
  return array(select space_id from importing where import_id = import);
end
$$;

-- Starts an import, as the person directly, from an export Homing has read
-- and checked: makes its spaces, the first at the top on its own and each
-- other one under one before it, with the person as their only admin, and
-- hides them until the import is done. Nobody here is recorded as having made
-- them: who did comes in as imported provenance. Returns the import.
create function import_begin(bundle jsonb) returns uuid
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
    insert into spaces (id, name, parent_id, closed, created_by, agent, created_at, archived_at, imported)
    values ((entry ->> 'id')::uuid, entry ->> 'name', parent, parent is not null and (entry ->> 'closed')::boolean, null, null,
            coalesce(not_later((entry ->> 'createdAt')::timestamptz), clock_timestamp()), not_later((entry ->> 'archivedAt')::timestamptz),
            coalesce(entry -> 'imported', '{}') || jsonb_build_object('import', import));
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

-- Writes a batch of an import under way into its spaces, as 0036's
-- import_bundle wrote all of it: shared things on the shared side, private
-- ones the person's, nobody here recorded as having written any of it, and
-- times kept, never later than now. Each row says which space it goes in, the
-- composite keys keep a row in its page's space, and what rows point to is
-- looked up by key among the import's own rows, so writing a batch takes as
-- long however much is in Homing already.
create function import_load(import uuid, batch jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp set plan_cache_mode = auto set enable_seqscan = off
as $$
declare
  me uuid := current_person_id();
  made uuid[] := import_under_way(import);
  n integer;
begin
  insert into pages (id, space_id, type, created_at, archived_at, imported)
  select (p ->> 'id')::uuid, (p ->> 'space')::uuid, p ->> 'type', not_later((p ->> 'createdAt')::timestamptz),
         not_later((p ->> 'archivedAt')::timestamptz), coalesce(p -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'pages', '[]')) with ordinality as e(p, ord)
  where (p ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'pages', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;

  insert into sources (id, space_id, private_to, reference, excerpt, written_by, agent, created_at, imported)
  select (s ->> 'id')::uuid, (s ->> 'space')::uuid, case when (s ->> 'private')::boolean then me end, s ->> 'reference', s ->> 'excerpt',
         null, null, not_later((s ->> 'createdAt')::timestamptz), coalesce(s -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'sources', '[]')) with ordinality as e(s, ord)
  where (s ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'sources', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;

  -- In the order they were written, so what replaced something comes after it.
  insert into content (id, page_id, space_id, private_to, kind, path, body, supersedes, reaches_down, published_from, published_at,
                       written_by, agent, created_at, updated_at, imported)
  select (i ->> 'id')::uuid, (i ->> 'page')::uuid, (i ->> 'space')::uuid, case when (i ->> 'private')::boolean then me end, i ->> 'kind', i ->> 'path', i ->> 'body',
         (i ->> 'supersedes')::uuid, coalesce((i ->> 'reachesDown')::boolean, false), (i ->> 'publishedFrom')::uuid, not_later((i ->> 'publishedAt')::timestamptz),
         null, null, not_later((i ->> 'createdAt')::timestamptz), not_later((i ->> 'writtenAt')::timestamptz),
         coalesce(i -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'items', '[]')) with ordinality as e(i, ord)
  where (i ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'items', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;
  -- What an item was shared from is one of the person's own on its page, from this import.
  if exists (
    select from jsonb_array_elements(coalesce(batch -> 'items', '[]')) i
    where i ->> 'publishedFrom' is not null
      and not exists (
        select from content c
        where c.id = (i ->> 'publishedFrom')::uuid and c.page_id = (i ->> 'page')::uuid and c.private_to = me and c.space_id = any (made)
      )
  ) then
    raise exception 'an import shares only what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- Citations of what this import brought.
  insert into citations (content_id, source_id)
  select (x ->> 'item')::uuid, (x ->> 'source')::uuid from jsonb_array_elements(coalesce(batch -> 'citations', '[]')) x;
  if exists (
    select from jsonb_array_elements(coalesce(batch -> 'citations', '[]')) x
    where not exists (select from content c where c.id = (x ->> 'item')::uuid and c.space_id = any (made))
       or not exists (select from sources s where s.id = (x ->> 'source')::uuid and s.space_id = any (made))
  ) then
    raise exception 'an import cites only what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- Earlier versions of what this import brought, of the kind it is, in its space, and private
  -- whenever their item is.
  insert into revisions (content_id, space_id, private_to, body, written_by, agent, written_at, replaced_at, imported)
  select c.id, c.space_id, case when (r ->> 'private')::boolean or c.private_to is not null then me end, r ->> 'body', null, null,
         not_later((r ->> 'writtenAt')::timestamptz), not_later((r ->> 'replacedAt')::timestamptz),
         coalesce(r -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'revisions', '[]')) with ordinality as e(r, ord)
  join content c on c.id = (r ->> 'item')::uuid and c.space_id = any (made) and c.kind = r ->> 'kind'
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'revisions', '[]')) then
    raise exception 'an import keeps the history only of what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- The collection and the page are in the row's space, by their keys.
  insert into gathered (collection_id, page_id, space_id, private_to, added_by, agent, created_at, imported)
  select (g ->> 'collection')::uuid, (g ->> 'page')::uuid, (g ->> 'space')::uuid, case when (g ->> 'private')::boolean then me end, null, null,
         not_later((g ->> 'createdAt')::timestamptz), coalesce(g -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'gathered', '[]')) with ordinality as e(g, ord)
  where (g ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'gathered', '[]')) then
    raise exception 'an import gathers only what it brings' using errcode = 'insufficient_privilege';
  end if;

  insert into page_archives (page_id, archived, person_id, agent, at, imported)
  select p.id, (a ->> 'archived')::boolean, null, null, not_later((a ->> 'at')::timestamptz), coalesce(a -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'pageArchives', '[]')) with ordinality as e(a, ord)
  join pages p on p.id = (a ->> 'page')::uuid and p.space_id = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'pageArchives', '[]')) then
    raise exception 'an import archives only what it brings' using errcode = 'insufficient_privilege';
  end if;

  insert into tasks (id, space_id, private_to, title, description, due, done_at, written_by, agent, created_at, updated_at, imported)
  select (t ->> 'id')::uuid, (t ->> 'space')::uuid, case when (t ->> 'private')::boolean then me end, t ->> 'title', t ->> 'description',
         (t ->> 'due')::date, not_later((t ->> 'doneAt')::timestamptz), null, null,
         not_later((t ->> 'createdAt')::timestamptz), not_later((t ->> 'updatedAt')::timestamptz),
         coalesce(t -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(batch -> 'tasks', '[]')) with ordinality as e(t, ord)
  where (t ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(batch -> 'tasks', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;
end
$$;

-- Finishes an import under way: shows its spaces, then writes what they
-- include from each other, through the same checks as any include, which
-- need the spaces shown. Returns the space at its top.
create function import_finish(import uuid, ending jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp set plan_cache_mode = auto set enable_seqscan = off
as $$
declare
  me uuid := current_person_id();
  made uuid[] := import_under_way(import);
  n integer;
begin
  delete from importing where import_id = import;
  update imports set done = true where id = import;

  insert into includes (space_id, private_to, space_included, skill_included, added_at, imported)
  select (x ->> 'space')::uuid, case when (x ->> 'private')::boolean then me end, (x ->> 'rules')::uuid, (x ->> 'skill')::uuid,
         not_later((x ->> 'addedAt')::timestamptz), coalesce(x -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(ending -> 'includes', '[]')) with ordinality as e(x, ord)
  where (x ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(ending -> 'includes', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select from jsonb_array_elements(coalesce(ending -> 'includes', '[]')) x
    where (x ->> 'rules' is not null and not (x ->> 'rules')::uuid = any (made))
       or (x ->> 'skill' is not null and not exists (select from pages p where p.id = (x ->> 'skill')::uuid and p.space_id = any (made)))
  ) then
    raise exception 'an import includes only what it brings' using errcode = 'insufficient_privilege';
  end if;
  return made[1];
end
$$;

-- Takes out everything an unfinished import put in: only its own rows, all
-- of them in the spaces it made, which nobody else could see or write in.
create function import_take_out(import uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  made uuid[] := array(select space_id from importing where import_id = import);
begin
  if not exists (select from imports i where i.id = import and not i.done) then
    return;
  end if;
  delete from includes where space_id = any (made);
  delete from citations ci using content c where c.id = ci.content_id and c.space_id = any (made);
  delete from revisions where space_id = any (made);
  delete from gathered where space_id = any (made);
  delete from page_archives a using pages p where p.id = a.page_id and p.space_id = any (made);
  delete from content where space_id = any (made);
  delete from sources where space_id = any (made);
  delete from tasks where space_id = any (made);
  delete from pages where space_id = any (made);
  delete from importing where import_id = import;
  delete from memberships where space_id = any (made);
  delete from space_access where space_id = any (made);
  delete from imports where id = import;
  delete from spaces where id = any (made);
end
$$;

-- Takes out the person's own import under way, as when it fails.
create function import_discard(import uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (select from imports i where i.id = import and i.imported_by = current_person_id() and not i.done) then
    raise exception 'there''s no import of yours under way there' using errcode = 'insufficient_privilege';
  end if;
  perform import_take_out(import);
end
$$;

-- Takes out every import that stopped on the way, which nothing has written
-- to for a while, as when Homing stopped. They were never shown.
create function imports_discard_stale(quiet interval) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  stale uuid;
  n integer := 0;
begin
  for stale in select id from imports where not done and coalesce(touched_at, imported_at) < clock_timestamp() - quiet loop
    perform import_take_out(stale);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Refreshes what the database knows about the tables an import filled, so
-- what's read next is planned for how much is there now, rather than for
-- what was there before, until it would have got round to it itself.
create function import_settle() returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  analyze pages, content, citations, revisions, sources, gathered, page_archives, tasks, includes;
end
$$;

-- An export from before is read differently now, so the one function that
-- wrote it all at once goes.
drop function import_bundle(jsonb);

revoke execute on function import_under_way, import_begin, import_load, import_finish, import_take_out, import_discard, imports_discard_stale, import_settle from public;
grant execute on function import_begin, import_load, import_finish, import_discard, imports_discard_stale, import_settle to homing_app;
