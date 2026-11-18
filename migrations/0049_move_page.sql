-- What an item rests on, kept through rewriting, and moving a page (#151,
-- spec §3).
--
-- A newer version of an item cites what the one it replaces cited, besides
-- sources of its own, so knowledge learned from an email says so however
-- often it's rewritten, and what it rested on stays true in its history.
-- Whoever can see an item learns whether it rests on something Homing read,
-- and nothing else about that source.
--
-- A person's assistant may move a page that's wholly the person's own to
-- another space they can open. Its items go with it, with their citations
-- and history, and its sources stay where they were kept, as a source read
-- through a connection stays in its place's space. Its own collections end,
-- since a collection gathers pages of its space. The move is recorded, for
-- the person alone, as everything on the page is theirs alone. Since an item
-- can now change spaces, sharing names the space it was shown for.

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

-- The kind of place Homing read what an item rests on in, such as a mailbox,
-- when it read any of it itself, for anyone who can see the item, whoever
-- wrote it: its own sources, or for a copy someone shared, those of what they
-- shared it from. Nothing else about those sources. Null when there's none.
create function read_from(item uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(p.kind, '') from content c
  join citations ci on ci.content_id in (c.id, c.published_from)
  join sources src on src.id = ci.source_id and src.read_through is not null
  left join places p on p.connection_id = src.read_through and p.id::text = lower(substring(src.reference from '^[a-z][a-z0-9]*:([0-9a-fA-F-]{36}):'))
  where c.id = read_from.item and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id())
  order by p.kind nulls last
  limit 1
$$;

revoke execute on function read_from from public;
grant execute on function read_from to homing_app;

-- Shares one of the person's own private items with its space, exactly as
-- they were shown it and in the space they were shown it for, and the page's
-- title with it if the page has no shared title yet. Returns the shared item.
drop function publish_item(uuid, text);
create function publish_item(item uuid, shown_in uuid, shown text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  original content;
  base uuid;
  copy_id uuid;
  page_type text;
begin
  if not direct_edit() then
    raise exception 'only people share knowledge' using errcode = 'insufficient_privilege';
  end if;
  -- Held to the end, so two approvals at once share it once, and it can't move meanwhile.
  select c.* into original from content c
  where c.id = publish_item.item and c.private_to = me and c.kind = 'text' and c.space_id in (select accessible_spaces())
  for update;
  if not found then
    raise exception 'there''s nothing of yours to share there' using errcode = 'insufficient_privilege';
  end if;
  if original.space_id is distinct from shown_in then
    raise exception 'it''s in % now', (
      select case when s.private_to is not null and s.parent_id is null then 'your personal space' else s.name end from spaces s where s.id = original.space_id
    ) using errcode = 'check_violation';
  end if;
  if original.body is distinct from shown then
    raise exception 'it changed since it was shown' using errcode = 'serialization_failure';
  end if;
  if exists (select from spaces s where s.id = original.space_id and s.private_to is not null) then
    raise exception 'spaces in a personal tree have no shared side' using errcode = 'insufficient_privilege';
  end if;
  select p.type into page_type from pages p where p.id = original.page_id;
  if coalesce(page_type, '') in ('guidance', 'skill', 'overview') then
    raise exception 'that is shared another way' using errcode = 'insufficient_privilege';
  end if;
  -- Replaced, or shared already as a copy, which stands for it from then on.
  if exists (select from content r where r.supersedes = original.id and (r.private_to is null or r.private_to = me))
     or exists (select from content c where c.published_from = original.id) then
    raise exception 'that item has been replaced since' using errcode = 'check_violation';
  end if;

  -- The page takes the person's own title for everyone, if it has no shared one yet.
  if not exists (select from content t where t.page_id = original.page_id and t.kind = 'title' and t.private_to is null) then
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where page_id = original.page_id and kind = 'title' and private_to = me;
  end if;

  base := shared_base(original.id);

  if hidden_sources(original.id) = 0 and (original.supersedes is null or original.supersedes = base) then
    -- Written without anything hidden, as the first or only update of what's shared: it moves
    -- to the shared side. Its earlier versions stay as they were, only the person's own.
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where id = original.id;
    return original.id;
  end if;

  -- A copy, which keeps who wrote it, and updates for everyone what the person's own updated.
  insert into content (space_id, page_id, kind, body, private_to, supersedes, written_by, agent, published_from, published_by, published_at)
  values (original.space_id, original.page_id, 'text', original.body, null, base, original.written_by, original.agent, original.id, me, clock_timestamp())
  returning id into copy_id;

  -- The copy cites only what everyone in the space can see.
  insert into citations (content_id, source_id)
  select copy_id, ci.source_id
  from citations ci join sources src on src.id = ci.source_id
  where ci.content_id = original.id and src.private_to is null and src.space_id = original.space_id;
  return copy_id;
end
$$;

revoke execute on function publish_item from public;
grant execute on function publish_item to homing_app;

-- Where a page was moved from, which only the person who moved it reads.
create table page_moves (
  page_id uuid not null references pages (id),
  moved_from uuid not null references spaces (id),
  person_id uuid not null default current_person_id() references people (id),
  agent text default current_agent(),
  at timestamptz not null default clock_timestamp()
);

create index page_moves_page on page_moves (page_id, at);
create index page_moves_from on page_moves (moved_from);

alter table page_moves enable row level security;

create policy own on page_moves for select using (person_id = current_person_id());

grant select on page_moves to homing_app;

-- Moves one of the person's own pages to another space they can open, by
-- their assistant, and says where it was.
create function move_page(page uuid, destination uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  target pages;
begin
  if me is null or current_agent() is null then
    raise exception 'only a person''s assistant moves their pages' using errcode = 'insufficient_privilege';
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
  -- What's never sent to a model doesn't go where it may be.
  if exists (select from model_off(array[target.space_id])) and not exists (select from model_off(array[destination])) then
    raise exception 'model processing is off where it is and on in that space, so it stays where it is' using errcode = 'check_violation';
  end if;

  delete from gathered g where (g.page_id = target.id or g.collection_id = target.id) and g.private_to = me;
  update revisions set space_id = destination where content_id in (select c.id from content c where c.page_id = target.id);
  -- One statement, so the page and what's on it are never in two spaces.
  with items as (
    update content set space_id = destination where page_id = target.id returning id
  )
  update pages set space_id = destination where id = target.id;
  insert into page_moves (page_id, moved_from) values (target.id, target.space_id);
  return target.space_id;
end
$$;

revoke execute on function move_page from public;
grant execute on function move_page to homing_app;
