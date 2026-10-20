-- Publishing private knowledge to its space's shared side (#32, spec §5).
--
-- Something written without private sources moves to the shared side. What
-- rests on sources the space's members can't see, private ones or another
-- space's, is published as a shared copy that keeps a link to its private
-- original (published_from), keeps who wrote it, and cites only what
-- everyone there can see. Publishing again updates the copy. Others see who
-- shared it and when, never the private original, its history or its
-- sources. Only people publish: directly, or by approving what their
-- assistant proposed, and exactly the text they were shown.

alter table content
  add column published_from uuid references content (id),
  add column published_by uuid references people (id) on delete set null,
  add column published_at timestamptz,
  add constraint content_published_from check (published_from is null or private_to is null);

create index content_published_from on content (published_from) where published_from is not null;

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish')),
  add constraint proposals_publish_for_you check (action <> 'publish' or not request);

-- One of the person's own private items, and the private ones it updated
-- before it, back to the first, or to the shared item they all update.
create function private_chain(item uuid) returns table (id uuid, depth integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  with recursive chain (id, supersedes, depth) as (
    select c.id, c.supersedes, 0 from content c
    where c.id = item and c.private_to = current_person_id() and c.space_id in (select accessible_spaces())
    union all
    select c.id, c.supersedes, chain.depth + 1 from content c join chain on c.id = chain.supersedes
    where c.private_to = current_person_id() and chain.depth < 100
  )
  select id, depth from chain
$$;

-- The shared item a private chain updates, while nothing shared has replaced it.
create function shared_base(item uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select base.id from content base
  where base.id = (select c.supersedes from content c where c.id = (select id from private_chain(item) order by depth desc limit 1))
    and base.private_to is null
    and not exists (select from content r where r.supersedes = base.id and r.private_to is null)
$$;

-- What the person shared from this chain before, while nothing shared has replaced it.
create function shared_copy(item uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from content c
  where c.published_from in (select id from private_chain(item)) and c.private_to is null
    and not exists (select from content r where r.supersedes = c.id and r.private_to is null)
  order by c.published_at desc
  limit 1
$$;

-- How many of the sources an item rests on its space's members can't all
-- see, now and later: private ones, or another space's.
create function hidden_sources(item uuid) returns integer
language sql stable security definer set search_path = public, pg_temp
as $$
  select count(*)::integer from citations ci
  join sources src on src.id = ci.source_id
  join content c on c.id = ci.content_id
  where ci.content_id = item and (src.private_to is not null or src.space_id <> c.space_id)
    -- Only about an item the person can see.
    and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id())
$$;

-- Shares one of the person's own private items with its space, exactly as
-- they were shown it, and the page's title with it if the page has no
-- shared title yet. Returns the shared item.
create function publish_item(item uuid, shown text) returns uuid
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
  -- Held to the end, so two approvals at once share it once.
  select c.* into original from content c
  where c.id = publish_item.item and c.private_to = me and c.kind = 'text' and c.space_id in (select accessible_spaces())
  for update;
  if not found then
    raise exception 'there''s nothing of yours to share there' using errcode = 'insufficient_privilege';
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
  if exists (select from content r where r.supersedes = original.id and (r.private_to is null or r.private_to = me)) then
    raise exception 'that item has been replaced since' using errcode = 'check_violation';
  end if;

  -- The page takes the person's own title for everyone, if it has no shared one yet.
  if not exists (select from content t where t.page_id = original.page_id and t.kind = 'title' and t.private_to is null) then
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where page_id = original.page_id and kind = 'title' and private_to = me;
  end if;

  base := shared_base(original.id);
  copy_id := shared_copy(original.id);

  if copy_id is not null then
    -- Shared before: what everyone sees is updated, and keeps what it said in its history.
    update content set body = original.body where id = copy_id;
    update content set published_from = original.id, published_by = me, published_at = clock_timestamp(),
                       written_by = original.written_by, agent = original.agent
    where id = copy_id;
    delete from citations where content_id = copy_id;
  elsif hidden_sources(original.id) = 0 and (original.supersedes is null or original.supersedes = base) then
    -- Written without anything hidden, as the first or only update of what's shared: it moves
    -- to the shared side. Its earlier versions stay as they were, only the person's own.
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where id = original.id;
    return original.id;
  else
    -- A copy, which keeps who wrote it, and updates for everyone what the person's own updated.
    insert into content (space_id, page_id, kind, body, private_to, supersedes, written_by, agent, published_from, published_by, published_at)
    values (original.space_id, original.page_id, 'text', original.body, null, base, original.written_by, original.agent, original.id, me, clock_timestamp())
    returning id into copy_id;
  end if;

  -- The copy cites only what everyone in the space can see.
  insert into citations (content_id, source_id)
  select copy_id, ci.source_id
  from citations ci join sources src on src.id = ci.source_id
  where ci.content_id = original.id and src.private_to is null and src.space_id = original.space_id;
  return copy_id;
end
$$;

revoke execute on function private_chain, shared_base, shared_copy, hidden_sources, publish_item from public;
grant execute on function shared_base, shared_copy, hidden_sources, publish_item to homing_app;
