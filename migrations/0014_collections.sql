-- Collections (spec §3): any knowledge page can gather other pages in its
-- space, which makes it a collection. Gathering is a link of its own, apart
-- from mentions. Like an item, it is on the shared side or on one person's
-- private side, and it never changes who can see either page.

create table gathered (
  collection_id uuid not null,
  page_id uuid not null,
  space_id uuid not null,
  private_to uuid references people (id),
  -- The person who gathered it, and the agent if a person didn't do it themselves.
  added_by uuid default current_person_id() references people (id),
  agent text default current_agent(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (collection_id, space_id) references pages (id, space_id),
  foreign key (page_id, space_id) references pages (id, space_id),
  check (collection_id <> page_id)
);

create unique index gathered_once on gathered (collection_id, page_id, private_to) nulls not distinct;
create index gathered_page on gathered (page_id);

-- Only knowledge pages gather, and only pages the writer can see. A shared
-- link joins two shared pages, so it never points anyone to a page they
-- can't see. It runs as the writer, so row-level security decides.
create function check_gathered() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if exists (select from pages where id in (new.collection_id, new.page_id) and type in ('guidance', 'skill'))
    or (select count(distinct page_id) from content
        where page_id in (new.collection_id, new.page_id) and kind = 'title'
          and (new.private_to is not null or private_to is null)) < 2 then
    raise exception 'those pages can''t be gathered' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_gathered
before insert on gathered
for each row execute function check_gathered();

alter table gathered enable row level security;

create policy visible on gathered
using (
  space_id in (select accessible_spaces())
  and (private_to is null or private_to = current_person_id())
)
with check (
  space_id in (select accessible_spaces())
  and (
    private_to = current_person_id()
    or (private_to is null and space_id in (select id from spaces where private_to is null))
  )
);

grant select, insert (collection_id, page_id, space_id, private_to), delete on gathered to homing_app;
