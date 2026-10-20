-- Fixes from an independent review, so the store refuses on its own what
-- Homing already refuses.

-- Nobody writes on a knowledge page they can't see: a page takes new items
-- only while it is empty, being created, or has something the writer sees.
-- Otherwise someone who learned a private page's id could put a shared
-- title on it and show it to the whole space. Guidance and skill pages are
-- one per space and shared by design, so they're left to their own checks.
create function page_open_to_writer(page uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from pages p where p.id = page and p.type in ('guidance', 'skill'))
    or not exists (select from content c where c.page_id = page)
    or exists (
      select from content c
      where c.page_id = page
        and c.space_id in (select accessible_spaces())
        and (c.private_to is null or c.private_to = current_person_id())
    )
$$;

revoke execute on function page_open_to_writer(uuid) from public;
grant execute on function page_open_to_writer(uuid) to homing_app;

create function check_page_open() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not page_open_to_writer(new.page_id) then
    raise exception 'that page can''t be written on' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_page_open
before insert on content
for each row execute function check_page_open();

-- A proposal about a rule is about a rule in its own space.
create function check_proposal_rule() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.item_id is not null
     and not exists (select from content c where c.id = new.item_id and c.space_id = new.space_id) then
    raise exception 'that rule isn''t in this space' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_proposal_rule
before insert on proposals
for each row execute function check_proposal_rule();

-- The first item in a chain of replacements, as the reader sees it, so a
-- private update of a private update still says what others see.
create function first_of(item uuid) returns uuid
language sql stable set search_path = public, pg_temp
as $$
  with recursive chain (id, supersedes, depth) as (
    select id, supersedes, 0 from content where id = item
    union all
    select c.id, c.supersedes, chain.depth + 1 from content c join chain on c.id = chain.supersedes
    where chain.depth < 100
  )
  select id from chain order by depth desc limit 1
$$;

grant execute on function first_of(uuid) to homing_app;

-- No single question to the database runs away with it.
alter role homing_app set statement_timeout = '30s';
