import type { Pool } from 'pg';
import { withPrincipal, type Sql } from './db.ts';
import { emails, type Mailer } from './email.ts';
import type { ProposalView } from './proposals.ts';

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
 * request in Homing, where deciding needs signing in.
 */
export async function afterDecision(n: Notifier, person: string, proposal: ProposalView): Promise<void> {
  if (!proposal.request) return;
  const place = proposal.space.within ? `${proposal.space.name} in ${proposal.space.within}` : proposal.space.name;
  const kind = proposal.change.kind ?? proposal.rule?.kind ?? 'rule';
  const what = proposal.action === 'add rule' ? 'add a rule' : proposal.action === 'change rule' ? `change a ${kind}` : `remove a ${kind}`;
  const where = `${proposal.action === 'add rule' ? 'to' : proposal.action === 'change rule' ? 'in' : 'from'} ${place}`;
  const text = proposal.change.text ?? proposal.rule?.text ?? '';
  const link = new URL(`/proposals/${proposal.id}`, n.url).toString();

  if (proposal.state === 'requested' && proposal.yours) {
    const admins = await withPrincipal(n.sql, { person }, (s) => s.tx<{ id: string }[]>`select space_admins(${proposal.spaceId}::uuid) as id`);
    let emailed = 0;
    if (n.mailer) {
      for (const to of await addresses(n, admins.map((admin) => admin.id).filter((id) => id !== person))) {
        try {
          await n.mailer(emails.request(to, { by: proposal.names.proposedTo ?? 'A member', place, what, where, text, why: proposal.reason, link }));
          emailed++;
        } catch (error) {
          console.error(`Couldn't email a space's admin about a request: ${(error as Error).message}`);
        }
      }
    }
    await withPrincipal(n.sql, { person }, (s) => s.tx`update proposals set admins_emailed = ${emailed > 0} where id = ${proposal.id}::uuid`);
    return;
  }

  if ((proposal.state === 'approved' || proposal.state === 'rejected') && !proposal.yours && proposal.requestedAt && n.mailer) {
    const [to] = await addresses(n, [proposal.privateTo]);
    if (!to) return;
    const by = (await withPrincipal(n.sql, { person }, (s) => s.tx<{ name: string }[]>`select name from people where id = ${person}::uuid`))[0]?.name ?? 'An admin';
    try {
      await n.mailer(emails.outcome(to, { by, approved: proposal.state === 'approved', place, what, where, text, link }));
    } catch (error) {
      console.error(`Couldn't email a member the outcome of their request: ${(error as Error).message}`);
    }
  }
}

/** The email addresses of these people, from sign-in's own tables. */
async function addresses(n: Notifier, people: string[]): Promise<string[]> {
  if (people.length === 0) return [];
  const { rows } = await n.authPool.query<{ email: string }>('select "email" from auth."user" where "id" = any($1::uuid[])', [people]);
  return rows.map((row) => row.email);
}
