-- Assistants suggest spaces (spec §1, #31). A suggestion is a proposal for
-- the person alone, who can change its name and place before creating it.
-- Approving creates the space, and the proposal keeps which one.

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space')),
  add constraint proposals_space_for_you check (action <> 'add space' or not request),
  add column space_created uuid references spaces (id),
  add constraint proposals_space_created check (space_created is null or (action = 'add space' and state = 'approved'));

-- The space it created is set only by the decision that created it.
drop trigger check_decision on proposals;
create trigger check_decision
before update of state, decided_in, space_created on proposals
for each row execute function check_decision();

grant update (space_created) on proposals to homing_app;

-- Finding whether someone already declined a space by that name.
create index proposals_suggested_spaces on proposals (private_to, lower(change->>'name')) where action = 'add space';
