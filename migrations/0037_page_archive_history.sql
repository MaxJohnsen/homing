-- What someone did with a page while it was theirs alone, such as archiving
-- it, stays theirs (spec §3), wherever a page's archiving is read, as the
-- export already had it. Whether a page is archived is one state for everyone
-- who sees it. Its history, and when and by whom it was archived, others see
-- only from when they could first see the page: a page archived before then
-- is archived since then, by nobody named. Whoever archived or reopened it
-- still sees their own.

-- When the person, or a space's routine, could first see a page: from the
-- first thing on it they see, counting something shared from someone's own
-- side from when it was shared. The export, the app and row-level security
-- all ask here, so they can't drift apart. It applies the access rule itself,
-- so it says the same run by Homing's role or inside a function below. As a
-- table of one row, it's planned into the query that asks, and the spaces the
-- person can open are looked up once, not for every page.
create function page_first_seen(page uuid) returns table (seen timestamptz)
language sql stable
as $$
  select min(case when c.private_to is null and c.published_at is not null then greatest(c.created_at, c.published_at) else c.created_at end)
  from content c
  where c.page_id = page and c.space_id = any (array(select accessible_spaces()))
    and (c.private_to is null or c.private_to = current_person_id())
$$;

drop policy visible on page_archives;

create policy visible on page_archives for select
using (
  at >= (select f.seen from page_first_seen(page_id) f)
  or (person_id = current_person_id() and (select f.seen from page_first_seen(page_id) f) is not null)
);

-- Whether a page is archived is a column of its own, for everyone who sees
-- the page. When and by whom come only through page_archived, and when the
-- page itself was made, before anything on it was shared, not at all.
alter table pages add column archived boolean generated always as (archived_at is not null) stored;

-- Who archived a page before it was imported, too, so it's kept apart from
-- the rest of where the page came from. It holds until the page is archived
-- or reopened here.
alter table pages add column imported_archived_by jsonb;

update pages set imported_archived_by = case when archived_at is not null and archived_by is null then imported -> 'archivedBy' end,
                 imported = imported - 'archivedBy'
where imported ? 'archivedBy';

create function keep_imported_archiver() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.imported_archived_by := new.imported -> 'archivedBy';
    new.imported := new.imported - 'archivedBy';
  elsif new.archived_at is distinct from old.archived_at then
    new.imported_archived_by := null;
  end if;
  return new;
end
$$;

create trigger keep_imported_archiver
before insert or update on pages
for each row execute function keep_imported_archiver();

revoke select on pages from homing_app;
grant select (id, space_id, type, archived, imported) on pages to homing_app;

-- A page's archiving as the person sees it: when and by whom, here or before
-- it was imported, or, archived before they could first see the page by
-- someone else, since then, by nobody named. Nothing for a page that isn't
-- archived or that they can't see.
create function page_archived(page uuid) returns table (at timestamptz, archived_by uuid, imported_by jsonb, since boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select case when early then f.seen else p.archived_at end, case when not early then p.archived_by end,
         case when not early then p.imported_archived_by end, early
  from pages p
  cross join lateral page_first_seen(p.id) f
  cross join lateral (select p.archived_at < f.seen and not coalesce(p.archived_by = current_person_id(), false) as early) e
  where p.id = page_archived.page and p.archived_at is not null and f.seen is not null
$$;

revoke execute on function page_first_seen, page_archived from public;
grant execute on function page_first_seen, page_archived to homing_app;
