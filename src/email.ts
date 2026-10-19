import { createTransport } from 'nodemailer';

/** An email Homing sends: an invite, a link to verify an address, a sign-in link, or about a request to a space's admins. */
export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sends email, from the address it names if it says. Homing works without one, and then never sends any. */
export type Mailer = ((email: Email) => Promise<void>) & { from?: string };

/** A mailer from SMTP settings, such as `smtps://user:password@smtp.example.com`, if there are any. */
export function smtpMailer(url = process.env.SMTP_URL, from = process.env.HOMING_EMAIL_FROM): Mailer | undefined {
  if (!url) return undefined;
  const transport = createTransport(url);
  const sender = from ?? `Homing <homing@${new URL(url).hostname}>`;
  const send: Mailer = async (email) => {
    await transport.sendMail({ from: sender, ...email });
  };
  return Object.assign(send, { from: sender });
}

export const emails = {
  invite: (to: string, link: string, inviter: string): Email => ({
    to,
    subject: `${inviter} invited you to Homing`,
    text: `${inviter} invited you to Homing, a home for everything worth knowing that you and your AI assistants can share.\n\nCreate your account with this link. It works once, for a week:\n\n${link}\n`,
  }),
  verify: (to: string, link: string): Email => ({
    to,
    subject: 'Verify your email for Homing',
    text: `Open this link to verify that this is your email. Then Homing can send you a sign-in link if you ever can't sign in:\n\n${link}\n\nIf you didn't ask for this, you can ignore it.\n`,
  }),
  request: (to: string, request: { by: string; place: string; what: string; where: string; text: string; why: string | null; link: string }): Email => ({
    to,
    subject: `${request.by} asks to ${request.what} ${request.where}`,
    text:
      `${request.by} asks the admins of ${request.place} to ${request.what}:\n\n${request.text}\n\n` +
      (request.why ? `Why: ${request.why}\n\n` : '') +
      `Decide it in Homing. Any admin of ${request.place} can, and one decision settles it:\n\n${request.link}\n`,
  }),
  outcome: (to: string, outcome: { by: string; approved: boolean; place: string; what: string; where: string; text: string; link: string }): Email => ({
    to,
    subject: `${outcome.by} ${outcome.approved ? 'approved' : 'didn’t approve'} your request for ${outcome.place}`,
    text:
      `${outcome.by} ${outcome.approved ? 'approved' : 'didn’t approve'} your request to ${outcome.what} ${outcome.where}:\n\n${outcome.text}\n\n` +
      (outcome.approved ? 'It applies from now on, and your assistant gets it next time.' : 'Nothing changed.') +
      `\n\n${outcome.link}\n`,
  }),
  signIn: (to: string, link: string): Email => ({
    to,
    subject: 'Your sign-in link for Homing',
    text: `Open this link to sign in to Homing. It works once, for 15 minutes:\n\n${link}\n\nThen add a new passkey, so you can sign in next time. If you didn't ask for this, you can ignore it.\n`,
  }),
};
