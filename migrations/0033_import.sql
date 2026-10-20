-- Importing a space from an export (#6, spec §3, guarantee 10).
--
-- An import is a new space of its own, with the spaces that came with it
-- below it, and only the person importing has them. What the export shared
-- goes on its shared side, and what was private becomes theirs. Everything
-- gets a new id. Nothing imported is credited to anyone here: it keeps who
-- wrote it as imported provenance, by name, and what a person wrote stays
-- protected from agents as before.

-- Each import: the new space at its top, who imported it and when, and
-- where it came from, as the export says.
create table imports (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces (id),
  imported_by uuid default current_person_id() references people (id) on delete set null,
  imported_at timestamptz not null default clock_timestamp(),
  instance text not null,
  exported_by text not null,
  exported_at timestamptz not null,
  original_space uuid not null
);

create index imports_space on imports (space_id);

alter table imports enable row level security;

-- Whoever can open the space sees that it was imported, by whom and from where.
create policy visible on imports for select
using (space_id in (select accessible_spaces()));

grant select on imports to homing_app;

-- What came in an import records it: the import, its id in the export, and
-- who did it there, as the export says: an author is a person, an agent for a
-- person, or a routine, and a person is their key in the export and a name.
-- The author stays only while the text is what they wrote; a change here
-- moves them into the history with the earlier text. What an item rested on
-- in spaces the export didn't hold is counted, so it never counts as resting
-- only on what everyone here can see.
alter table spaces add column imported jsonb;
alter table pages add column imported jsonb;
alter table content add column imported jsonb;
alter table revisions add column imported jsonb;
alter table sources add column imported jsonb;
alter table tasks add column imported jsonb;
alter table gathered add column imported jsonb;
alter table page_archives add column imported jsonb;

grant select (imported) on spaces, pages, content, revisions, sources, tasks, gathered, page_archives to homing_app;

-- Whether a person wrote it, here or in the Homing it was imported from, so
-- agents never rewrite or replace it.
create function by_person(written_by uuid, agent text, imported jsonb) returns boolean
language sql immutable
as $$
  select (written_by is not null and agent is null) or coalesce(imported -> 'author' ->> 'by' = 'person', false)
$$;

grant execute on function by_person to homing_app;

-- Keeps the sources of one of the person's own items on their update of it,
-- as before, and what it rested on outside the export it was imported from.
create or replace function carry_citations(from_item uuid, to_item uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into citations (content_id, source_id)
  select to_item, ci.source_id from citations ci
  join content f on f.id = ci.content_id
  join content t on t.id = to_item and t.page_id = f.page_id
  where ci.content_id = from_item
    and f.private_to = current_person_id() and t.private_to = current_person_id()
    and f.space_id in (select accessible_spaces())
  on conflict do nothing;
  update content t set imported = coalesce(t.imported, '{}') || jsonb_build_object('sourcesElsewhere', (f.imported ->> 'sourcesElsewhere')::integer)
  from content f
  where t.id = to_item and f.id = from_item and f.imported ? 'sourcesElsewhere' and t.page_id = f.page_id
    and f.private_to = current_person_id() and t.private_to = current_person_id()
    and f.space_id in (select accessible_spaces());
end
$$;

-- Who wrote imported text, kept with it in the history once it changes.
create function imported_author(imported jsonb) returns jsonb
language sql immutable
as $$
  select case when imported ? 'author' then jsonb_build_object('import', imported -> 'import', 'author', imported -> 'author') end
$$;

-- What an item rests on that the space's members can't all see, now and
-- later, counting what it rested on outside the export it was imported from.
create or replace function hidden_sources(item uuid) returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select (select count(*)::integer from citations ci
          join sources src on src.id = ci.source_id
          join content c on c.id = ci.content_id
          where ci.content_id = item and (src.private_to is not null or src.space_id <> c.space_id)
            -- Only about an item the person can see.
            and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id()))
       + coalesce((select (c.imported ->> 'sourcesElsewhere')::integer from content c
                   where c.id = item and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id())), 0)
$$;

create or replace function keep_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if current_agent() is not null and by_person(old.written_by, old.agent, old.imported) then
    raise exception 'agents never rewrite what people wrote' using errcode = 'insufficient_privilege';
  end if;
  insert into revisions (content_id, space_id, private_to, body, written_by, agent, written_at, imported)
  values (old.id, old.space_id, old.private_to, old.body, old.written_by, old.agent, old.updated_at, imported_author(old.imported));
  new.written_by := current_person_id();
  new.agent := current_agent();
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
          and (current_agent() is null or not by_person(replaced.written_by, replaced.agent, replaced.imported))
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

-- A shared copy keeps who wrote its private original, imported or not, and
-- the import it came in, so it's the same person there. An import that says
-- who wrote the copy keeps that.
create function copy_imported_author() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.imported ? 'author' then
    return new;
  end if;
  new.imported := coalesce(new.imported - 'author', '{}') || coalesce((select imported_author(o.imported) from content o where o.id = new.published_from), '{}');
  if new.imported = '{}' then
    new.imported := null;
  end if;
  return new;
end
$$;

create trigger copy_imported_author
before insert or update of published_from on content
for each row when (new.published_from is not null)
execute function copy_imported_author();

create or replace function check_task() returns trigger
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
      if current_agent() is not null and by_person(old.written_by, old.agent, old.imported) then
        raise exception 'agents never rewrite what people wrote' using errcode = 'insufficient_privilege';
      end if;
      new.written_by := current_person_id();
      new.agent := current_agent();
      new.imported := old.imported - 'author';
    end if;
    -- Someone given it here, or who finishes it here, takes the imported name's place.
    if new.assignee is distinct from old.assignee then
      new.imported := new.imported - 'assignee';
    end if;
    if new.done_at is distinct from old.done_at then
      new.imported := new.imported - 'doneBy';
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

-- Whether the person may write on a page, as before. Every item on a page is
-- in the page's space, so whether they can open it is looked up once, for the
-- page, instead of listing every space they can open for each item written,
-- which made writing many items slow for someone in many spaces, as imports
-- make them.
create or replace function page_open_to_writer(page uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from pages p where p.id = page and p.type in ('guidance', 'skill', 'overview'))
    or not exists (select from content c where c.page_id = page)
    or (exists (select from content c where c.page_id = page and (c.private_to is null or c.private_to = current_person_id()))
        and exists (
          select from pages p
          left join space_access a on a.person_id = current_person_id() and a.space_id = p.space_id
          where p.id = page and (a.person_id is not null or p.space_id = current_space_id())
        ))
$$;

-- A time from an export, never later than now. None stays none.
create function not_later(at timestamptz) returns timestamptz
language sql stable
as $$ select case when at > now() then now() else at end $$;

-- Imports a space, as the person directly, from an export Homing has read,
-- checked and given new ids. All of it or nothing. It creates the spaces
-- itself, the first at the top on its own and each other one under one
-- before it, with the person as their only admin, and writes only into
-- them, so nothing it holds can reach a space that existed before. Shared
-- things go on the new spaces' shared side, and private ones become the
-- person's. Nobody here is recorded as having made or written any of it: who
-- did comes in as imported provenance, by name, and times are kept, never
-- later than now.
--
-- Each row says which space it goes in, and nothing is joined to find it:
-- the spaces are checked against those just made, the composite keys keep a
-- row in its page's space, and what rows point to is checked against what
-- the import lists, so writing stays in step with the size of the export.
-- The checks on each row written are the same lookup each time, so they keep
-- their plans while it runs, instead of being planned again for each row as
-- every other query of a transaction is.
create function import_bundle(bundle jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp set plan_cache_mode = auto
as $$
declare
  me uuid := current_person_id();
  import uuid;
  made uuid[] := '{}';
  entry jsonb;
  parent uuid;
  n integer;
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
            coalesce(not_later((entry ->> 'createdAt')::timestamptz), clock_timestamp()), not_later((entry ->> 'archivedAt')::timestamptz), entry -> 'imported');
    insert into memberships (space_id, person_id, role) values ((entry ->> 'id')::uuid, me, 'admin');
    made := made || (entry ->> 'id')::uuid;
  end loop;
  if cardinality(made) = 0 then
    raise exception 'an import has a space' using errcode = 'check_violation';
  end if;

  insert into imports (space_id, instance, exported_by, exported_at, original_space)
  values (made[1], bundle -> 'from' ->> 'instance', bundle -> 'from' ->> 'exportedBy', not_later((bundle -> 'from' ->> 'exportedAt')::timestamptz),
          (bundle -> 'from' ->> 'space')::uuid)
  returning id into import;
  update spaces set imported = coalesce(imported, '{}') || jsonb_build_object('import', import) where id = any (made);

  -- Every list below is written whole, or the import stops: each row lands in the new spaces, and
  -- what it points to is something the import made.
  insert into pages (id, space_id, type, created_at, archived_at, imported)
  select (p ->> 'id')::uuid, (p ->> 'space')::uuid, p ->> 'type', not_later((p ->> 'createdAt')::timestamptz),
         not_later((p ->> 'archivedAt')::timestamptz), (p -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'pages') with ordinality as e(p, ord)
  where (p ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(bundle -> 'pages') then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;

  insert into sources (id, space_id, private_to, reference, excerpt, written_by, agent, created_at, imported)
  select (s ->> 'id')::uuid, (s ->> 'space')::uuid, case when (s ->> 'private')::boolean then me end, s ->> 'reference', s ->> 'excerpt',
         null, null, not_later((s ->> 'createdAt')::timestamptz), (s -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'sources') with ordinality as e(s, ord)
  where (s ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(bundle -> 'sources') then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;

  -- In the order they were written, so what replaced something comes after it. The page's space is
  -- the item's, and what it replaces is on its page, by their keys.
  insert into content (id, page_id, space_id, private_to, kind, path, body, supersedes, reaches_down, published_from, published_at,
                       written_by, agent, created_at, updated_at, imported)
  select (i ->> 'id')::uuid, (i ->> 'page')::uuid, (i ->> 'space')::uuid, case when (i ->> 'private')::boolean then me end, i ->> 'kind', i ->> 'path', i ->> 'body',
         (i ->> 'supersedes')::uuid, coalesce((i ->> 'reachesDown')::boolean, false), (i ->> 'publishedFrom')::uuid, not_later((i ->> 'publishedAt')::timestamptz),
         null, null, not_later((i ->> 'createdAt')::timestamptz), not_later((i ->> 'writtenAt')::timestamptz),
         (i -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'items') with ordinality as e(i, ord)
  where (i ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(bundle -> 'items') then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;
  -- What an item was shared from is one of the person's own on its page, from this import.
  if exists (
    select (i ->> 'publishedFrom')::uuid, (i ->> 'page')::uuid from jsonb_array_elements(bundle -> 'items') i where i ->> 'publishedFrom' is not null
    except
    select (i ->> 'id')::uuid, (i ->> 'page')::uuid from jsonb_array_elements(bundle -> 'items') i where (i ->> 'private')::boolean
  ) then
    raise exception 'an import shares only what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- Citations of what this import brought.
  insert into citations (content_id, source_id)
  select (x ->> 'item')::uuid, (x ->> 'source')::uuid from jsonb_array_elements(bundle -> 'citations') x;
  if exists (
    select (x ->> 'item')::uuid from jsonb_array_elements(bundle -> 'citations') x
    except select (i ->> 'id')::uuid from jsonb_array_elements(bundle -> 'items') i
  ) or exists (
    select (x ->> 'source')::uuid from jsonb_array_elements(bundle -> 'citations') x
    except select (s ->> 'id')::uuid from jsonb_array_elements(bundle -> 'sources') s
  ) then
    raise exception 'an import cites only what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- Earlier versions of what this import brought, in its space, and private whenever their item is.
  insert into revisions (content_id, space_id, private_to, body, written_by, agent, written_at, replaced_at, imported)
  select (r ->> 'item')::uuid, (r ->> 'space')::uuid, case when (r ->> 'private')::boolean then me end, r ->> 'body', null, null,
         not_later((r ->> 'writtenAt')::timestamptz), not_later((r ->> 'replacedAt')::timestamptz),
         (r -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'revisions') with ordinality as e(r, ord)
  order by ord;
  if exists (
    select (r ->> 'item')::uuid, (r ->> 'space')::uuid from jsonb_array_elements(bundle -> 'revisions') r
    except select (i ->> 'id')::uuid, (i ->> 'space')::uuid from jsonb_array_elements(bundle -> 'items') i
  ) or exists (
    select (r ->> 'item')::uuid from jsonb_array_elements(bundle -> 'revisions') r where not (r ->> 'private')::boolean
    except select (i ->> 'id')::uuid from jsonb_array_elements(bundle -> 'items') i where not (i ->> 'private')::boolean
  ) then
    raise exception 'an import keeps the history only of what it brings' using errcode = 'insufficient_privilege';
  end if;

  -- The collection and the page are in the row's space, by their keys.
  insert into gathered (collection_id, page_id, space_id, private_to, added_by, agent, created_at, imported)
  select (g ->> 'collection')::uuid, (g ->> 'page')::uuid, (g ->> 'space')::uuid, case when (g ->> 'private')::boolean then me end, null, null,
         not_later((g ->> 'createdAt')::timestamptz), (g -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'gathered') with ordinality as e(g, ord)
  where (g ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(bundle -> 'gathered') then
    raise exception 'an import gathers only what it brings' using errcode = 'insufficient_privilege';
  end if;

  insert into page_archives (page_id, archived, person_id, agent, at, imported)
  select (a ->> 'page')::uuid, (a ->> 'archived')::boolean, null, null, not_later((a ->> 'at')::timestamptz), (a -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'pageArchives') with ordinality as e(a, ord)
  order by ord;
  if exists (
    select (a ->> 'page')::uuid from jsonb_array_elements(bundle -> 'pageArchives') a
    except select (p ->> 'id')::uuid from jsonb_array_elements(bundle -> 'pages') p
  ) then
    raise exception 'an import archives only what it brings' using errcode = 'insufficient_privilege';
  end if;

  insert into tasks (id, space_id, private_to, title, description, due, done_at, written_by, agent, created_at, updated_at, imported)
  select (t ->> 'id')::uuid, (t ->> 'space')::uuid, case when (t ->> 'private')::boolean then me end, t ->> 'title', t ->> 'description',
         (t ->> 'due')::date, not_later((t ->> 'doneAt')::timestamptz), null, null,
         not_later((t ->> 'createdAt')::timestamptz), not_later((t ->> 'updatedAt')::timestamptz),
         (t -> 'imported') || jsonb_build_object('import', import)
  from jsonb_array_elements(bundle -> 'tasks') with ordinality as e(t, ord)
  where (t ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(bundle -> 'tasks') then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;

  return made[1];
end
$$;

revoke execute on function import_bundle, imported_author, copy_imported_author, not_later from public;
grant execute on function import_bundle to homing_app;
