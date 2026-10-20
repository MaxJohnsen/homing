-- Assistants suggest archiving a space (#6, spec §1: "A person archives a
-- space, and agents can suggest it"). The suggestion waits for the person,
-- who archives it by approving, as an admin of the space.

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space')),
  add constraint proposals_archive_for_you check (action <> 'archive space' or not request);
