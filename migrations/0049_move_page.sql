-- What an item rests on, kept through rewriting, and moving a page (#151,
-- spec §3).
--
-- A newer version of an item cites what the one it replaces cited, besides
-- sources of its own, so knowledge learned from an email says so however
-- often it's rewritten, and what it rested on stays true in its history.
--
-- A person's assistant may move a page that's wholly the person's own to
-- another space they can open. Its items go with it, with their citations
-- and history, and its sources stay where they were kept, as a source read
-- through a connection stays in its place's space. Its own collections end,
-- since a collection gathers pages of its space. The move is recorded, for
-- the person alone, as everything on the page is theirs alone.

-- Carries the sources of one item to a newer version of it on the same page,
-- written by the person acting: all of them, ones they can no longer open
-- included, when both are their own, and otherwise those they can see, and
-- onto what everyone sees, only what everyone there may see.
create or replace function carry_citations(from_item uuid, to_item uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into citations (content_id, source_id)
  select to_item, ci.source_id from citations ci
  join content f on f.id = ci.content_id
  join content t on t.id = to_item and t.page_id = f.page_id
  join sources src on src.id = ci.source_id
  where ci.content_id = from_item
    and f.space_id in (select accessible_spaces()) and (f.private_to is null or f.private_to = current_person_id())
    and t.space_id in (select accessible_spaces()) and (t.private_to is null or t.private_to = current_person_id())
    and t.written_by is not distinct from current_person_id()
    and (
      (f.private_to = current_person_id() and t.private_to = current_person_id())
      or (src.space_id in (select accessible_spaces()) and (src.private_to is null or src.private_to = current_person_id())
          and (t.private_to is not null or src.private_to is null))
    )
  on conflict do nothing;
  update content t set imported = coalesce(t.imported, '{}') || jsonb_build_object('sourcesElsewhere', (f.imported ->> 'sourcesElsewhere')::integer)
  from content f
  where t.id = to_item and f.id = from_item and f.imported ? 'sourcesElsewhere' and t.page_id = f.page_id
    and f.private_to = current_person_id() and t.private_to = current_person_id()
    and f.space_id in (select accessible_spaces());
end
$$;

-- Where a page was moved from and to, which only the person who moved it reads.
create table page_moves (
  page_id uuid not null references pages (id),
  moved_from uuid not null references spaces (id),
  moved_to uuid not null references spaces (id),
  person_id uuid not null default current_person_id() references people (id),
  agent text default current_agent(),
  at timestamptz not null default clock_timestamp()
);

create index page_moves_page on page_moves (page_id, at);
create index page_moves_from on page_moves (moved_from);
create index page_moves_to on page_moves (moved_to);

alter table page_moves enable row level security;

create policy own on page_moves for select using (person_id = current_person_id());

grant select on page_moves to homing_app;

-- Moves one of the person's own pages to another space they can open, and
-- says where it was.
create function move_page(page uuid, destination uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  target pages;
  waiting uuid;
begin
  if me is null or not (direct_edit() or current_agent() is not null) then
    raise exception 'only people and their assistants move pages' using errcode = 'insufficient_privilege';
  end if;
  select p.* into target from pages p
  where p.id = move_page.page and p.space_id in (select accessible_spaces())
    and exists (select from content c where c.page_id = p.id and (c.private_to is null or c.private_to = me))
  for update;
  if not found then
    raise exception 'there''s no page there that you can see' using errcode = 'insufficient_privilege';
  end if;
  if target.type in ('guidance', 'skill', 'overview') then
    raise exception 'rules, skills and a space''s overview stay with their space' using errcode = 'check_violation';
  end if;
  -- Wholly the person's own, now and in its history: nothing on it is shared, published or anyone else's.
  if exists (select from content c where c.page_id = target.id and c.private_to is distinct from me) then
    raise exception 'something on that page is shared, so it stays where it is. Only a page that''s wholly the user''s own moves' using errcode = 'insufficient_privilege';
  end if;
  if destination = target.space_id then
    raise exception 'it''s in that space already' using errcode = 'check_violation';
  end if;
  if destination is null or destination not in (select accessible_spaces()) then
    raise exception 'there''s no space there that you can open' using errcode = 'insufficient_privilege';
  end if;
  -- What waits for the person's decision stays as it was shown, in the space it was shown in.
  select pr.id into waiting from proposals pr
  where pr.state = 'open' and pr.expires_at > now()
    and (pr.page_id = target.id or pr.item_id in (select c.id from content c where c.page_id = target.id))
  limit 1;
  if found then
    raise exception 'something on it waits for the user''s decision (proposal:%). It can move once that''s decided or withdrawn', waiting using errcode = 'check_violation';
  end if;

  delete from gathered g where (g.page_id = target.id or g.collection_id = target.id) and g.private_to = me;
  update revisions set space_id = destination where content_id in (select c.id from content c where c.page_id = target.id);
  -- One statement, so the page and what's on it are never in two spaces.
  with items as (
    update content set space_id = destination where page_id = target.id returning id
  )
  update pages set space_id = destination where id = target.id;
  insert into page_moves (page_id, moved_from, moved_to) values (target.id, target.space_id, destination);
  return target.space_id;
end
$$;

revoke execute on function move_page from public;
grant execute on function move_page to homing_app;
