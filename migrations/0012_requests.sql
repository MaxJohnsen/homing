-- Requests (spec §6): a member asks a space's admins for a change to its
-- shared rules, which only they may make.
--
-- A request is a proposal on the member's private side, like any other, and
-- they confirm the exact request first: sending it is their decision. Once
-- sent, any admin of the space sees it and decides it, and one admin's
-- decision settles it. Approving makes the change as that admin, under the
-- same checks as a direct edit, so someone who is no longer an admin can't.
-- Only the member and the space's admins ever see it.

alter table proposals
  add column request boolean not null default false,
  -- Why the person wants it, in their words, for whoever decides.
  add column reason text,
  -- When the member sent it to the admins.
  add column requested_at timestamptz;

alter table proposals
  drop constraint proposals_state_check,
  add constraint proposals_state_check check (state in ('open', 'requested', 'approved', 'rejected')),
  add constraint proposals_requested check ((state = 'requested') <= request);

-- Whether the person is an admin of the space, as the access table says.
create function admin_of(space uuid) returns boolean
language sql stable
as $$
  select exists (select from space_access a where a.space_id = space and a.person_id = current_person_id() and a.admin)
$$;

-- A person's own proposal, or one that's open, they decide once. Sending a
-- request is deciding it too. A sent request any admin of its space decides,
-- once. Always directly, never through an assistant, and before it expires,
-- a week after it was made or sent.
create or replace function check_decision() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not direct_edit() then
    raise exception 'only a person decides, never an assistant' using errcode = 'insufficient_privilege';
  end if;
  if old.state = 'requested' then
    if not admin_of(old.space_id) then
      raise exception 'only an admin of the space decides a request' using errcode = 'insufficient_privilege';
    end if;
  elsif old.private_to is distinct from current_person_id() then
    raise exception 'only the person it was proposed to decides it' using errcode = 'insufficient_privilege';
  elsif old.state <> 'open' then
    raise exception 'that proposal was already decided' using errcode = 'check_violation';
  end if;
  if new.state not in ('approved', 'rejected') and not (new.state = 'requested' and old.state = 'open' and old.request) then
    raise exception 'that proposal was already decided' using errcode = 'check_violation';
  end if;
  if old.expires_at <= clock_timestamp() then
    raise exception 'that proposal has expired' using errcode = 'check_violation';
  end if;
  if new.state = 'requested' then
    new.requested_at := clock_timestamp();
    new.expires_at := clock_timestamp() + interval '7 days';
  else
    new.decided_by := current_person_id();
    new.decided_at := clock_timestamp();
  end if;
  return new;
end
$$;

-- The member sees their own; a sent request, the space's admins see too.
drop policy own on proposals;

create policy visible on proposals for select
using (
  (private_to = current_person_id() and space_id in (select accessible_spaces()))
  or (requested_at is not null and admin_of(space_id))
);

create policy own on proposals for insert
with check (private_to = current_person_id() and space_id in (select accessible_spaces()));

create policy decide on proposals for update
using (
  (private_to = current_person_id() and space_id in (select accessible_spaces()))
  or (requested_at is not null and admin_of(space_id))
);

create index proposals_requested on proposals (space_id) where state = 'requested';

grant insert (request, reason) on proposals to homing_app;
