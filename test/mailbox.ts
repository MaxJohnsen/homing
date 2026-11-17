// Generates a work mailbox as it looks after a year or two, for reading in
// order to be tried on controlled data, never a real mailbox: a few hundred
// conversations with clients and colleagues, with replies that quote what
// they answer, forwards and later corrections, among newsletters, receipts in
// a folder of their own, mail filed by client, junk and a draft or two. Some
// of it is in Norwegian, a few threads run long, a few go on for months, and
// a few emails arrive in the very same second. The same seed gives the same
// mailbox, so a test that fails can be run again as it was.
//
// Run it to see what it makes: node test/mailbox.ts [seed]

import type { Email } from './microsoft.ts';

/** An email with its conversation. */
export type Generated = Email & { conversation: string };

export interface MailboxOptions {
  /** The same seed gives the same mailbox. */
  seed?: number;
  /** How many conversations, newsletters and the like included. */
  conversations?: number;
  /** The mailbox's last day, and how many days it goes back. */
  until?: Date;
  days?: number;
}

type Person = { name: string; address: string };

const clients: { name: string; people: Person[] }[] = [
  { name: 'Northwind', people: [{ name: 'Gunnar Lie', address: 'gunnar@northwind.test' }, { name: 'Ingrid Moe', address: 'ingrid@mail.northwind.test' }] },
  { name: 'Fabrikam', people: [{ name: 'Per Olsen', address: 'per@fabrikam.test' }, { name: 'Sara Khan', address: 'sara@fabrikam.test' }] },
  { name: 'Contoso', people: [{ name: 'Jonas Berg', address: 'jonas@contoso.test' }, { name: 'Lena Vik', address: 'lena@contoso.test' }] },
  { name: 'Tailspin', people: [{ name: 'Nora Dahl', address: 'nora@tailspin.test' }] },
];

const colleagues: Person[] = [
  { name: 'Tor Hagen', address: 'tor@acme.test' },
  { name: 'Mia Solberg', address: 'mia@acme.test' },
];

/** What a conversation is about: what's asked, what's answered, and how the answer is later corrected. */
const topics: { subject: (c: string, n: number) => string; ask: (c: string, n: number) => string; answer: (c: string, n: number) => string; correction: (c: string, n: number) => string }[] = [
  {
    subject: (c, n) => `${c} budget for ${2025 + (n % 3)}`,
    ask: (c, n) => `Where does the ${c} budget for ${2025 + (n % 3)} stand? I need the figure for the steering group.`,
    answer: (c, n) => `The ${c} budget for ${2025 + (n % 3)} is NOK ${2 + (n % 7)} million, approved by the board on Monday.`,
    correction: (c, n) => `A correction: the ${c} budget for ${2025 + (n % 3)} is NOK ${1 + (n % 7)}.5 million, not ${2 + (n % 7)}. The board cut the travel line.`,
  },
  {
    subject: (c) => `${c} workshop`,
    ask: (c) => `When can we hold the ${c} workshop? We need half a day with the whole team.`,
    answer: (c, n) => `The ${c} workshop is on ${3 + (n % 20)} March, from nine to one, at their office.`,
    correction: (c, n) => `The ${c} workshop moves to ${5 + (n % 20)} April. Their project lead is away in March.`,
  },
  {
    subject: (c) => `${c} contract renewal`,
    ask: (c) => `Has ${c} said anything about renewing the contract? It runs out at the end of the year.`,
    answer: (c, n) => `${c} wants to renew for ${1 + (n % 3)} more year${n % 3 ? 's' : ''}, at the same hourly rate.`,
    correction: (c) => `${c} came back on the renewal: they want a three-month notice period instead of six.`,
  },
  {
    subject: (c, n) => `${c} delivery of phase ${1 + (n % 4)}`,
    ask: (c, n) => `Is phase ${1 + (n % 4)} for ${c} on track? They asked for a date.`,
    answer: (c, n) => `Phase ${1 + (n % 4)} for ${c} is delivered on ${10 + (n % 15)} June. Testing takes the two weeks before that.`,
    correction: (c, n) => `Phase ${1 + (n % 4)} for ${c} slips to ${1 + (n % 20)} August. The integration took longer than planned.`,
  },
];

const thanks = ['Thanks, that is what I needed.', 'Great, thank you!', 'Noted, thanks.'];
const newsletters = [
  { from: { name: 'The Weekly Digest', address: 'news@weekly-digest.test' }, subject: (n: number) => `This week in consulting, issue ${n}`, text: 'Five things to read this week.' },
  { from: { name: 'Cloud Updates', address: 'updates@cloudvendor.test' }, subject: (n: number) => `What is new in the platform, release ${n}`, text: 'New regions and lower prices for storage.' },
];

const pad = (value: number) => String(value).padStart(2, '0');
const paragraph = (text: string) => `<p>${text}</p>`;

/** A small pseudo-random generator, so a seed gives the same mailbox each time. */
function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The mailbox of someone working with a handful of clients, oldest email first. */
export function generateMailbox(owner: Person, options: MailboxOptions = {}): Generated[] {
  const { seed = 1, conversations = 200, until = new Date(), days = 365 } = options;
  const random = generator(seed);
  const pick = <T>(from: T[]): T => from[Math.floor(random() * from.length)];
  const between = (least: number, most: number) => least + Math.floor(random() * (most - least + 1));
  const hours = 60 * 60 * 1000;
  const start = until.getTime() - days * 24 * hours;
  const emails: Generated[] = [];
  // Whole seconds, as a mailbox keeps them.
  const at = (time: number) => new Date(Math.floor(time / 1000) * 1000);
  const when = () => start + random() * (until.getTime() - start - 2 * hours);
  /** A reply's HTML: what its sender wrote, then the email it answers, quoted as Outlook does. */
  const quoting = (own: string, earlier: Generated) => `${own}<p>On ${earlier.at.toISOString().slice(0, 10)}, ${earlier.from.name} wrote:</p><blockquote>${earlier.unique ?? earlier.html}</blockquote>`;

  for (let number = 0; number < conversations; number++) {
    const conversation = `AAQkGen${seed}x${pad(number)}${Math.floor(random() * 1e9).toString(36)}=`;
    const began = when();
    const roll = random();
    if (roll < 0.55) {
      // Work: someone asks, someone answers quoting it, sometimes a thank-you, sometimes a correction weeks later.
      const client = pick(clients);
      const contact = pick(client.people);
      const topic = pick(topics);
      const n = between(0, 40);
      const subject = topic.subject(client.name, n);
      const filed = random() < 0.3 ? `Clients/${client.name}` : 'inbox';
      const ownerAsks = random() < 0.5;
      const [asker, answerer] = ownerAsks ? [owner, contact] : [contact, owner];
      const folder = (from: Person) => (from === owner ? 'sentitems' : filed);
      const first: Generated = { conversation, from: asker, to: [answerer], subject, html: paragraph(topic.ask(client.name, n)), at: at(began), folder: folder(asker) };
      emails.push(first);
      if (random() < 0.9) {
        const own = paragraph(topic.answer(client.name, n));
        const answer: Generated = {
          conversation, from: answerer, to: [asker], cc: random() < 0.3 ? [pick(colleagues)] : undefined, subject: `Re: ${subject}`,
          html: quoting(own, first), unique: own, at: at(first.at.getTime() + between(1, 72) * hours), folder: folder(answerer),
        };
        emails.push(answer);
        let last = answer;
        if (random() < 0.4) {
          const own = paragraph(pick(thanks));
          last = { conversation, from: asker, to: [answerer], subject: `Re: ${subject}`, html: quoting(own, answer), unique: own, at: at(answer.at.getTime() + between(1, 30) * hours), folder: folder(asker) };
          emails.push(last);
        }
        if (random() < 0.3) {
          const own = paragraph(topic.correction(client.name, n));
          emails.push({ conversation, from: answerer, to: [asker], subject: `Re: ${subject}`, html: quoting(own, last), unique: own, at: at(last.at.getTime() + between(3, 40) * 24 * hours), folder: folder(answerer) });
        }
      }
    } else if (roll < 0.62) {
      // A colleague forwards what a client wrote.
      const client = pick(clients);
      const colleague = pick(colleagues);
      const topic = pick(topics);
      const n = between(0, 40);
      const own = paragraph('FYI, see below. Can you take this one?');
      emails.push({ conversation, from: colleague, to: [owner], subject: `FW: ${topic.subject(client.name, n)}`, html: own + `<hr>${paragraph(topic.answer(client.name, n))}`, unique: own, at: at(began) });
    } else if (roll < 0.7) {
      emails.push({
        conversation, from: { name: 'Fjord Software billing', address: 'billing@fjordsoftware.test' }, to: [owner],
        subject: `Your receipt ${10000 + number}`, html: paragraph(`Thank you for your payment of NOK ${between(90, 4900)}.`), at: at(began), folder: 'Receipts',
      });
    } else if (roll < 0.9) {
      const letter = pick(newsletters);
      emails.push({ conversation, from: letter.from, to: [owner], subject: letter.subject(number), html: paragraph(letter.text), at: at(began) });
    } else if (roll < 0.97) {
      emails.push({ conversation, from: { name: 'Prize office', address: 'winner@lottery-prize.test' }, to: [owner], subject: 'You have won! Claim your prize today', html: paragraph('Send us your bank details.'), at: at(began), folder: 'junkemail' });
    } else {
      emails.push({ conversation, from: owner, to: [pick(colleagues)], subject: 'Thoughts on next year', html: paragraph('A few loose thoughts, not ready to send yet.'), at: at(began), folder: 'drafts', draft: true });
    }
  }
  // In Norwegian, quoted as Outlook does there.
  for (let number = 0; number < 6; number++) {
    const conversation = `AAQkGen${seed}no${pad(number)}=`;
    const client = pick(clients);
    const contact = pick(client.people);
    const began = when();
    const first: Generated = { conversation, from: owner, to: [contact], subject: `Budsjett ${client.name}`, html: paragraph('Hvor står budsjettet for neste år?'), at: at(began), folder: 'sentitems' };
    const own = paragraph('Budsjettet for neste år er 3 millioner kroner, godkjent av styret på mandag.');
    emails.push(first, { conversation, from: contact, to: [owner], subject: `SV: Budsjett ${client.name}`, html: own + `<p>Den ${first.at.getUTCDate()}. skrev ${owner.name}:</p><blockquote>${first.html}</blockquote>`, unique: own, at: at(began + between(2, 48) * hours) });
  }
  // Threads that run long: a dozen emails back and forth within a few days.
  for (let number = 0; number < 2; number++) {
    const conversation = `AAQkGen${seed}long${number}=`;
    const client = clients[number % clients.length];
    const contact = client.people[0];
    const began = start + random() * (until.getTime() - start - 10 * 24 * hours);
    for (let turn = 0; turn < 12; turn++) {
      const from = turn % 2 ? owner : contact;
      emails.push({
        conversation, from, to: [turn % 2 ? contact : owner], subject: `${turn ? 'Re: ' : ''}${client.name} rollout plan`,
        html: paragraph(`Point ${turn + 1} on the ${client.name} rollout.`), at: at(began + turn * 3 * hours), folder: from === owner ? 'sentitems' : 'inbox',
      });
    }
  }
  // Matters that go on for months: the same two people pick one up again every few weeks.
  for (let number = 0; number < 2; number++) {
    const conversation = `AAQkGen${seed}standing${number}=`;
    const client = clients[(number + 2) % clients.length];
    const contact = client.people[0];
    for (let turn = 0, time = start + random() * 20 * 24 * hours; time < until.getTime() - 2 * hours; turn++, time += between(18, 35) * 24 * hours) {
      const from = turn % 2 ? owner : contact;
      emails.push({
        conversation, from, to: [turn % 2 ? contact : owner], subject: `${turn ? 'Re: ' : ''}${client.name} retainer status`,
        html: paragraph(`${client.name} retainer, status ${turn + 1}.`), at: at(time), folder: from === owner ? 'sentitems' : 'inbox',
      });
    }
  }
  // A few that arrive in the very same second, as when one note goes to several people one by one.
  for (let number = 0; number < 3; number++) {
    const moment = at(when());
    for (const [turn, colleague] of [...colleagues, ...clients[number].people].entries()) {
      emails.push({ conversation: `AAQkGen${seed}burst${number}x${turn}=`, from: owner, to: [colleague], subject: `Holiday hours ${number + 1}`, html: paragraph('We are closed between Christmas and New Year.'), at: moment, folder: 'sentitems' });
    }
  }
  return emails.filter((email) => email.at.getTime() <= until.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime());
}

if (import.meta.main) {
  const emails = generateMailbox({ name: 'Ana Berg', address: 'ana@acme.test' }, { seed: Number(process.argv[2] ?? 1) });
  const folders = new Map<string, number>();
  for (const email of emails) folders.set(email.folder ?? 'inbox', (folders.get(email.folder ?? 'inbox') ?? 0) + 1);
  console.log(`${emails.length} emails in ${new Set(emails.map((email) => email.conversation)).size} conversations, from ${emails[0].at.toISOString().slice(0, 10)} to ${emails.at(-1)!.at.toISOString().slice(0, 10)}`);
  for (const [folder, count] of folders) console.log(`  ${folder}: ${count}`);
}
