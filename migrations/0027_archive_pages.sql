-- Archiving a page (#6, spec §3). It leaves everyday context and the space's
-- list of pages, and stays searchable and can be reopened. Anyone who can see
-- the page archives it directly, for everyone who sees it. An assistant may
-- only archive or reopen a page nobody else has anything on, at most 20 an
-- hour. Every archive and reopening is recorded, for everyone who sees the
-- page. Nothing is deleted.

alter table pages
  add column archived_at timestamptz,
  add column archived_by uuid references people (id) on delete set null;

create table page_archives (
  page_id uuid not null references pages (id),
  archived boolean not null,
  person_id uuid default current_person_id() references people (id) on delete set null,
  agent text default current_agent(),
  at timestamptz not null default clock_timestamp()
);

create index page_archives_page on page_archives (page_id, at);
create index page_archives_person on page_archives (person_id, at);

alter table page_archives enable row level security;

-- Whoever can see the page sees when it was archived and reopened.
create policy visible on page_archives for select
using (exists (select from content c where c.page_id = page_archives.page_id));

grant select on page_archives to homing_app;

create function archive_page(page uuid, archived boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  target pages;
  me uuid := current_person_id();
begin
  if me is null or not (direct_edit() or current_agent() is not null) then
    raise exception 'only people archive pages' using errcode = 'insufficient_privilege';
  end if;
  -- One person's archiving runs one at a time, so the hourly count holds for calls at once.
  perform pg_advisory_xact_lock(hashtext('homing.archive_page:' || me));
  -- A page the person can see: something on it that's shared in a space they can open, or theirs.
  select * into target from pages p
  where p.id = archive_page.page and p.space_id in (select accessible_spaces())
    and exists (select from content c where c.page_id = p.id and (c.private_to is null or c.private_to = me))
  for update;
  if not found then
    raise exception 'there''s no page there that you can see' using errcode = 'insufficient_privilege';
  end if;
  if target.type in ('guidance', 'skill', 'overview') then
    raise exception 'rules, skills and overviews aren''t archived' using errcode = 'check_violation';
  end if;
  if current_agent() is not null then
    if exists (select from content c where c.page_id = target.id and (c.private_to is null or c.private_to <> me)) then
      raise exception 'others see that page, so a person archives it' using errcode = 'insufficient_privilege';
    end if;
    if (
      select count(*) from page_archives l
      where l.person_id = me and l.agent is not null and l.at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'an assistant archives at most 20 pages an hour' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if archived and target.archived_at is null then
    update pages set archived_at = clock_timestamp(), archived_by = me where id = target.id;
    insert into page_archives (page_id, archived) values (target.id, true);
  elsif not archived and target.archived_at is not null then
    update pages set archived_at = null, archived_by = null where id = target.id;
    insert into page_archives (page_id, archived) values (target.id, false);
  end if;
end
$$;

revoke execute on function archive_page from public;
grant execute on function archive_page to homing_app;
