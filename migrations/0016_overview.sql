-- A space's written overview (spec §3): a short summary of where the space
-- stands, kept as ordinary knowledge on one page per space. Its items are
-- shared or someone's own, like any knowledge; it has no title, and the
-- page lists of a space leave it out.

alter table pages
  drop constraint pages_type_check,
  add constraint pages_type_check check (type in ('guidance', 'skill', 'overview') or lower(type) not in ('guidance', 'skill', 'overview'));

create unique index pages_one_overview on pages (space_id) where type = 'overview';

-- The space's overview page, created the first time someone writes on it.
create function overview_page(space uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  page uuid;
begin
  if space not in (select accessible_spaces()) then
    raise exception 'no access to that space' using errcode = 'insufficient_privilege';
  end if;
  insert into pages (space_id, type) values (space, 'overview')
  on conflict (space_id) where type = 'overview' do nothing
  returning id into page;
  return coalesce(page, (select p.id from pages p where p.space_id = space and p.type = 'overview'));
end
$$;

revoke execute on function overview_page from public;
grant execute on function overview_page to homing_app;

-- An overview holds knowledge and nothing else.
create or replace function check_guidance() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  page_type text := (select type from pages where id = new.page_id);
begin
  if not new.kind = any (case page_type
    when 'guidance' then array['requirement', 'preference', 'removed']
    when 'skill' then array['title', 'file', 'removed']
    when 'overview' then array['text']
    else array['title', 'text']
  end) then
    raise exception 'that kind of item doesn''t belong on this page' using errcode = 'check_violation';
  end if;
  if page_type = 'skill' and not new.reaches_down then
    raise exception 'a skill applies in the spaces below its own' using errcode = 'check_violation';
  end if;
  if page_type in ('guidance', 'skill') then
    if not direct_edit() then
      raise exception 'only people change guidance' using errcode = 'insufficient_privilege';
    end if;
    if new.private_to is null and not exists (
      select from space_access a
      where a.space_id = new.space_id and a.person_id = current_person_id() and a.admin
    ) then
      raise exception 'only admins change shared guidance' using errcode = 'insufficient_privilege';
    end if;
  elsif new.reaches_down then
    raise exception 'knowledge never reaches down' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- Like guidance and skills, the overview page is one per space and shared
-- by design, so anyone in the space writes their own items on it.
create or replace function page_open_to_writer(page uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from pages p where p.id = page and p.type in ('guidance', 'skill', 'overview'))
    or not exists (select from content c where c.page_id = page)
    or exists (
      select from content c
      where c.page_id = page
        and c.space_id in (select accessible_spaces())
        and (c.private_to is null or c.private_to = current_person_id())
    )
$$;
