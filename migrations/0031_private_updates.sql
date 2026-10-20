-- Your own update of something shared (#32, spec §3 and §5).
--
-- A private item replaces a shared one for its owner only when it says so:
-- it supersedes the shared item, itself or through earlier private updates.
-- Something shared as a copy shows as the copy for its owner from then on,
-- with their own sources, and changing its private original is a private
-- update of the copy, which supersedes it. Sharing that update replaces the
-- copy for everyone, so the copy is never rewritten from a private original.

-- Nothing anyone saw goes out of sight. An original that says something
-- other than what it was shared as, such as one rewritten since, stays with
-- its owner as an item of its own beside the copy, replacing nothing, with
-- its sources, authors and earlier versions: when it's unclear, both show.
-- Someone who can no longer open the space doesn't see it either way, and a
-- private item that replaced an original keeps showing as it is.
do $$
declare
  o record;
  kept uuid;
begin
  for o in
    select original.* from content original
    where original.private_to is not null and original.kind = 'text'
      and exists (select from content c where c.published_from = original.id and c.private_to is null)
      and original.body <> (
        select c.body from content c where c.published_from = original.id and c.private_to is null
        order by c.published_at desc limit 1
      )
      and not exists (select from content r where r.supersedes = original.id)
      and exists (select from space_access a where a.space_id = original.space_id and a.person_id = original.private_to)
  loop
    -- Written as its owner, who can still open the space, so the store checks it as theirs.
    perform set_config('homing.person_id', o.private_to::text, true);
    insert into content (space_id, page_id, kind, body, private_to, written_by, agent, created_at, updated_at)
    values (o.space_id, o.page_id, 'text', o.body, o.private_to, o.written_by, o.agent, o.created_at, o.updated_at)
    returning id into kept;
    insert into citations (content_id, source_id) select kept, source_id from citations where content_id = o.id;
    insert into revisions (content_id, space_id, private_to, body, written_by, agent, written_at, replaced_at)
    select kept, space_id, private_to, body, written_by, agent, written_at, replaced_at from revisions where content_id = o.id;
  end loop;
  perform set_config('homing.person_id', '', true);
end
$$;

-- Shares one of the person's own private items with its space, exactly as
-- they were shown it, and the page's title with it if the page has no shared
-- title yet. Returns the shared item.
create or replace function publish_item(item uuid, shown text) returns uuid
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

drop function shared_copy(uuid);

-- Keeps the sources of one of the person's own items on their update of it
-- on the same page, ones they can no longer open included, so sharing the
-- update still says what it rests on.
create function carry_citations(from_item uuid, to_item uuid) returns void
language sql security definer set search_path = public, pg_temp
as $$
  insert into citations (content_id, source_id)
  select to_item, ci.source_id from citations ci
  join content f on f.id = ci.content_id
  join content t on t.id = to_item and t.page_id = f.page_id
  where ci.content_id = from_item
    and f.private_to = current_person_id() and t.private_to = current_person_id()
    and f.space_id in (select accessible_spaces())
  on conflict do nothing
$$;

revoke execute on function carry_citations from public;
grant execute on function carry_citations to homing_app;
