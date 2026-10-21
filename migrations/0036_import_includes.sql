-- Exporting and importing includes (#6, spec §3). An export lists what each
-- space's guidance includes, and an import brings back those that point to
-- something it holds, as guidance, through the same checks as any include.
-- Like everything else imported, nobody here is recorded as having added one:
-- who did, and when, comes in as imported provenance.

alter table includes
  add column imported jsonb,
  -- Who added it here, or nobody, for one that came in an import, which says who did there.
  alter column added_by drop not null;

-- As before, and an include that comes in an import, which only import_bundle
-- writes, keeps who added it and when as the import says, crediting nobody here.
create or replace function check_include() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only people change guidance' using errcode = 'insufficient_privilege';
  end if;
  if new.private_to is null and not admin_of(new.space_id) then
    raise exception 'only admins change shared guidance' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' then
    if old.removed_at is not null or new.removed_at is null then
      raise exception 'an include is removed once, and stays in the history' using errcode = 'check_violation';
    end if;
    new.removed_by := current_person_id();
    new.removed_at := clock_timestamp();
    return new;
  end if;
  if not include_open(new.space_included, new.skill_included) then
    raise exception 'that can''t be included' using errcode = 'insufficient_privilege';
  end if;
  if new.skill_included is not null and not exists (select from pages p where p.id = new.skill_included and p.type = 'skill') then
    raise exception 'only a skill is included on its own' using errcode = 'check_violation';
  end if;
  if new.private_to is null and not (
    exists (select from spaces x where x.id = new.space_included and x.private_to is null)
    or exists (select from content t where t.page_id = new.skill_included and t.kind = 'title' and t.private_to is null)
  ) then
    raise exception 'only shared guidance is included for everyone' using errcode = 'check_violation';
  end if;
  if new.imported is null then
    new.added_by := current_person_id();
    new.added_at := clock_timestamp();
  else
    new.added_by := null;
  end if;
  return new;
end
$$;

-- For a space's admins, as before, and for one that came in an import, the
-- name of who added it there, and nothing else of the import.
drop function includes_not_open(uuid);

create function includes_not_open(space uuid) returns table (id uuid, kind text, added_by uuid, added_at timestamptz, imported_adder text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.id, case when i.skill_included is null then 'rules' else 'skill' end, i.added_by, i.added_at, i.imported -> 'author' ->> 'name'
  from includes i
  where i.space_id = includes_not_open.space and admin_of(includes_not_open.space)
    and i.private_to is null and i.removed_at is null
    and not include_open(i.space_included, i.skill_included)
  order by i.added_at
$$;

revoke execute on function includes_not_open from public;
grant execute on function includes_not_open to homing_app;

-- Imports a space as 0033 does, and now the includes between the spaces it
-- makes too. All of it or nothing. It creates the spaces itself, the first at
-- the top on its own and each other one under one before it, with the person
-- as their only admin, and writes only into them, so nothing it holds can
-- reach a space that existed before. Shared things go on the new spaces'
-- shared side, and private ones become the person's, includes included.
-- Nobody here is recorded as having made, written or added any of it: who
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
create or replace function import_bundle(bundle jsonb) returns uuid
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

  -- What the spaces' guidance includes from each other, for everyone or the person's own, as
  -- it was. The checks on includes run as for any, and each points to something the import made.
  insert into includes (space_id, private_to, space_included, skill_included, added_at, imported)
  select (x ->> 'space')::uuid, case when (x ->> 'private')::boolean then me end, (x ->> 'rules')::uuid, (x ->> 'skill')::uuid,
         not_later((x ->> 'addedAt')::timestamptz), coalesce(x -> 'imported', '{}') || jsonb_build_object('import', import)
  from jsonb_array_elements(coalesce(bundle -> 'includes', '[]')) with ordinality as e(x, ord)
  where (x ->> 'space')::uuid = any (made)
  order by ord;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(coalesce(bundle -> 'includes', '[]')) then
    raise exception 'an import writes only into its own spaces' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select (x ->> 'rules')::uuid from jsonb_array_elements(coalesce(bundle -> 'includes', '[]')) x where x ->> 'rules' is not null
    except select unnest(made)
  ) or exists (
    select (x ->> 'skill')::uuid from jsonb_array_elements(coalesce(bundle -> 'includes', '[]')) x where x ->> 'skill' is not null
    except select (p ->> 'id')::uuid from jsonb_array_elements(bundle -> 'pages') p
  ) then
    raise exception 'an import includes only what it brings' using errcode = 'insufficient_privilege';
  end if;

  return made[1];
end
$$;
