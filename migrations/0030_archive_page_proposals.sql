-- Assistants propose archiving a page others see (spec §3: "Anyone who can
-- write in the space archives a page directly, and an assistant proposes it
-- for a person to approve"), and reopening one the same way. The person it's
-- for archives or reopens it by approving, as a direct edit, so only if they
-- may do it themselves then.

alter table proposals
  add column page_id uuid references pages (id),
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space', 'archive page', 'reopen page')),
  add constraint proposals_archive_page check ((action in ('archive page', 'reopen page')) = (page_id is not null) and (action not in ('archive page', 'reopen page') or not request));

-- A proposal about a page is about a knowledge page in its own space that the
-- person it's for can see.
create function check_proposal_page() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.page_id is not null
     and not exists (
       select from pages p
       where p.id = new.page_id and p.space_id = new.space_id and coalesce(p.type, '') not in ('guidance', 'skill', 'overview')
         and exists (select from content c where c.page_id = p.id and (c.private_to is null or c.private_to = new.private_to))
     ) then
    raise exception 'there''s no page there that you can see' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger check_proposal_page
before insert on proposals
for each row execute function check_proposal_page();

grant insert (page_id) on proposals to homing_app;
