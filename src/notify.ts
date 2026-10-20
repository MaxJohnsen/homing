import type { Pool } from 'pg';
import { withPrincipal, type Sql } from './db.ts';
import { emails, type Mailer } from './email.ts';
import { readProposal, type ProposalView } from './proposals.ts';

/** What telling people about requests needs: email, and sign-in's own tables for addresses. */
export interface Notifier {
  sql: Sql;
  authPool: Pool;
  url: URL;
  mailer?: Mailer;
}

/**
 * After someone decides a proposal. A member who just sent a request has the space's admins emailed,
 * and Homing remembers whether it could, so the member knows to tell them otherwise. A member whose
 * request an admin just decided is emailed the outcome. The emails only tell: their link opens the
 * request in Homing, where deciding needs signing in. Each email is written from the request as its
 * reader sees it, so it names nobody and no space they couldn't see in Homing. Nothing here undoes
 * the decision: when telling people fails, the member is told to let the admins know.
 */
export async function afterDecision(n: Notifier, person: string, proposal: ProposalView): Promise<void> {
  if (!proposal.request) return;
  const link = new URL(`/proposals/${proposal.id}`, n.url).toString();

  if (proposal.state === 'requested' && proposal.yours) {
    let emailed = 0;
    try {
      const admins = await withPrincipal(n.sql, { person }, (s) => s.tx<{ id: string }[]>`select space_admins(${proposal.spaceId}::uuid) as id`);
      for (const admin of admins.filter((admin) => admin.id !== person)) {
        if (!n.mailer) break;
        const [to] = await addresses(n, [admin.id]);
        const seen = await withPrincipal(n.sql, { person: admin.id }, (s) => readProposal(s, proposal.id));
        if (!to || !seen) continue;
        try {
          await n.mailer(emails.request(to, { ...wording(seen), by: seen.names.proposedTo ?? 'A member', why: seen.reason, link }));
          emailed++;
        } catch (error) {
          console.error(`Couldn't email a space's admin about a request: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      console.error(`Couldn't tell a space's admins about a request: ${(error as Error).message}`);
    }
    await withPrincipal(n.sql, { person }, (s) => s.tx`update proposals set admins_emailed = ${emailed > 0} where id = ${proposal.id}::uuid`);
    return;
  }

  if ((proposal.state === 'approved' || proposal.state === 'rejected') && !proposal.yours && proposal.requestedAt && n.mailer) {
    try {
      const [to] = await addresses(n, [proposal.privateTo]);
      const seen = await withPrincipal(n.sql, { person: proposal.privateTo }, (s) => readProposal(s, proposal.id));
      if (!to || !seen) return;
      await n.mailer(emails.outcome(to, { ...wording(seen), by: seen.names.decidedBy ?? 'An admin', approved: proposal.state === 'approved', link }));
    } catch (error) {
      console.error(`Couldn't email a member the outcome of their request: ${(error as Error).message}`);
    }
  }
}

/** "add a rule", "to Website in Acme", and the rule, as the reader sees the request. */
function wording(proposal: ProposalView) {
  const place = proposal.space.within ? `${proposal.space.name} in ${proposal.space.within}` : proposal.space.name;
  if (proposal.include) {
    // Someone who can't open what it includes learns nothing of it, not even its name.
    const { skill, space } = proposal.include;
    const thing = proposal.change.what === 'skill' ? 'a skill' : 'another space’s rules';
    const text = skill ? `The skill ${skill.name}` : space ? `The rules from ${space.name}` : proposal.change.what === 'skill' ? 'A skill from a space you can’t open' : 'Rules from a space you can’t open';
    return { place, what: `${proposal.action === 'add include' ? 'include' : 'stop including'} ${thing}`, where: `in ${place}`, text };
  }
  const kind = proposal.change.kind ?? proposal.rule?.kind ?? 'rule';
  const what = proposal.action === 'add rule' ? 'add a rule' : proposal.action === 'change rule' ? `change a ${kind}` : `remove a ${kind}`;
  const where = `${proposal.action === 'add rule' ? 'to' : proposal.action === 'change rule' ? 'in' : 'from'} ${place}`;
  return { place, what, where, text: proposal.change.text ?? proposal.rule?.text ?? '' };
}

/** The email addresses of these people, from sign-in's own tables. */
async function addresses(n: Notifier, people: string[]): Promise<string[]> {
  if (people.length === 0) return [];
  const { rows } = await n.authPool.query<{ email: string }>('select "email" from auth."user" where "id" = any($1::uuid[])', [people]);
  return rows.map((row) => row.email);
}
