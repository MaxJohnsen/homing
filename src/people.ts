// Finding someone by the email they sign in with. Emails live with sign-in,
// apart from Homing's own tables, so only the server's sign-in connection
// reads them, and only for a person who is signed in: an assistant never
// learns whether an email has an account (spec §1, #31).

import type { Pool } from 'pg';

/** Someone with an account, found by their email. */
export interface Account {
  id: string;
  name: string;
  email: string;
}

/** Finds people by the emails they sign in with. */
export type FindAccount = (email: string) => Promise<Account | undefined>;

/**
 * The account with this email, if there is one and the email is proven theirs: someone who joins
 * can type any address, and only an invite sent to it verifies it (spec §4: an email is a strong
 * signal, not proof). Emails match whatever their case.
 */
export function accountFinder(authPool: Pool): FindAccount {
  return async (email) => {
    const { rows } = await authPool.query<Account>('select "id", "name", "email" from auth."user" where lower("email") = lower($1) and "emailVerified"', [email.trim()]);
    return rows[0];
  };
}

// One plain address, as sign-in and invites take it.
const emailPattern = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

/** Whether the text is an email address rather than a name. */
export function isEmail(text: string): boolean {
  return emailPattern.test(text.trim()) && text.trim().length <= 254;
}
