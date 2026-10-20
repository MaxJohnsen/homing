-- Sharing a space from your personal tree through your assistant (spec §1 and
-- §6): the assistant proposes it, and you decide where it goes, who has it
-- and what becomes of its rules on the card in the conversation.

alter table proposals
  drop constraint proposals_action_check,
  add constraint proposals_action_check check (action in ('add rule', 'change rule', 'remove rule', 'add space', 'change members', 'publish', 'share task', 'archive space', 'share space')),
  add constraint proposals_share_space_for_you check (action <> 'share space' or not request);
