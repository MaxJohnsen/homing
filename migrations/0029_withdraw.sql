-- Withdrawing a proposal (spec §6). The person a proposal is for, or their
-- assistant, can withdraw it while it waits, including a request sent to the
-- space's admins. Withdrawing never decides it: it only ends it, unchanged.

alter table proposals
  drop constraint proposals_state_check,
  add constraint proposals_state_check check (state in ('open', 'requested', 'approved', 'rejected', 'withdrawn'));

create or replace function check_decision() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  -- Withdrawing: only the person it's for, directly or through their assistant, and only while it waits.
  if new.state = 'withdrawn' then
    if current_person_id() is null or old.private_to is distinct from current_person_id() or not (direct_edit() or current_agent() is not null) then
      raise exception 'only the person it''s for withdraws it' using errcode = 'insufficient_privilege';
    end if;
    if old.state not in ('open', 'requested') or old.expires_at <= clock_timestamp() then
      raise exception 'that proposal no longer waits' using errcode = 'check_violation';
    end if;
    if new.decided_in is distinct from old.decided_in or new.space_created is distinct from old.space_created then
      raise exception 'withdrawing changes nothing else' using errcode = 'check_violation';
    end if;
    -- Who withdrew it: the person, and the assistant if one did it for them.
    new.decided_in := current_agent();
    new.decided_by := current_person_id();
    new.decided_at := clock_timestamp();
    return new;
  end if;
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
