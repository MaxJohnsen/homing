-- Publishing private knowledge to its space's shared side (#32, spec §5).
--
-- Something written without private sources moves to the shared side. What
-- rests on sources the space's members can't see, private ones or another
-- space's, is published as a shared copy that keeps a link to its private
-- original (published_from) and cites only what everyone there can see.
-- Publishing again updates the copy. Others see who shared it and when, never
-- the private original, its history or its sources. Only people publish:
-- directly, or by approving what their assistant proposes.

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

-- Whether an item rests on a source its space's members can't all see, now
-- and later: one that is private, or that belongs to another space.
create function rests_on_hidden(item uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select from citations ci
    join sources src on src.id = ci.source_id
    join content c on c.id = ci.content_id
    where ci.content_id = item and (src.private_to is not null or src.space_id <> c.space_id)
      -- Only about an item the person can see.
      and c.space_id in (select accessible_spaces()) and (c.private_to is null or c.private_to = current_person_id())
  )
$$;

-- Shares one of the person's own private items with its space, and the
-- page's title with it if the page has no shared title yet. Returns the
-- shared item.
create function publish_item(item uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  me uuid := current_person_id();
  original content;
  replaced content;
  shared_copy uuid;
  page_type text;
begin
  if not direct_edit() then
    raise exception 'only people share knowledge' using errcode = 'insufficient_privilege';
  end if;
  select c.* into original from content c
  where c.id = publish_item.item and c.private_to = me and c.kind = 'text' and c.space_id in (select accessible_spaces());
  if not found then
    raise exception 'there''s nothing of yours to share there' using errcode = 'insufficient_privilege';
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
  select c.* into replaced from content c where c.id = original.supersedes;

  -- The page takes the person's own title for everyone, if it has no shared one yet.
  if not exists (select from content t where t.page_id = original.page_id and t.kind = 'title' and t.private_to is null) then
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where page_id = original.page_id and kind = 'title' and private_to = me;
  end if;

  -- What was shared from it before, or from what it updated, is updated in place.
  select c.id into shared_copy from content c
  where c.published_from in (original.id, original.supersedes) and c.private_to is null
    and not exists (select from content r where r.supersedes = c.id and r.private_to is null)
  limit 1;

  if shared_copy is not null then
    update content set body = original.body, published_from = original.id, published_by = me, published_at = clock_timestamp()
    where id = shared_copy;
    delete from citations where content_id = shared_copy;
  elsif not rests_on_hidden(original.id) and (replaced.id is null or replaced.private_to is null) then
    -- Written without anything hidden: it simply moves to the shared side. Its earlier
    -- versions stay as they were, only the person's own.
    update content set private_to = null, published_by = me, published_at = clock_timestamp()
    where id = original.id;
    return original.id;
  else
    insert into content (space_id, page_id, kind, body, private_to, supersedes, published_from, published_by, published_at)
    values (original.space_id, original.page_id, 'text', original.body, null,
            case when replaced.private_to is null then replaced.id end,
            original.id, me, clock_timestamp())
    returning id into shared_copy;
  end if;

  -- The copy cites only what everyone in the space can see.
  insert into citations (content_id, source_id)
  select shared_copy, ci.source_id
  from citations ci join sources src on src.id = ci.source_id
  where ci.content_id = original.id and src.private_to is null and src.space_id = original.space_id;
  return shared_copy;
end
$$;

revoke execute on function publish_item, rests_on_hidden from public;
grant execute on function publish_item, rests_on_hidden to homing_app;
