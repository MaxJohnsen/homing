// Other tools an assistant has beside Homing, as in the chat apps: a web search, a calendar, an
// email inbox and a notes app. They answer from canned data about Ana's week, so a request that
// belongs to one of them can be done without Homing, and nothing here calls anything outside.

import type { Stub } from './agent.ts';

/** Ana's calendar in the week of 19 October 2026. */
const events = [
  { day: '2026-10-20', time: '10:00–10:30', title: 'Acme weekly' },
  { day: '2026-10-21', time: '09:00–09:15', title: 'Standup, website relaunch' },
  { day: '2026-10-21', time: '13:00–13:45', title: 'Call with Gunnar Holm (Northwind)', with: 'gunnar.holm@northwind.example' },
  { day: '2026-10-21', time: '17:30–18:30', title: 'Interval run, Frognerparken' },
  { day: '2026-10-22', time: '11:00–12:00', title: 'Fjord Bank quarterly review', with: 'kari.lie@fjordbank.example' },
  { day: '2026-10-23', time: '15:00–15:15', title: 'Time sheets' },
];

/** Ana's inbox, newest first. */
const emails = [
  {
    from: 'Gunnar Holm <gunnar.holm@northwind.example>',
    date: '2026-10-20 08:12',
    subject: 'Budget',
    text: 'Hi Ana, good news: the board approved raising the relaunch budget to 550,000 NOK, so the extra product pages can go in. Gunnar',
  },
  {
    from: 'Gunnar Holm <gunnar.holm@northwind.example>',
    date: '2026-10-19 16:40',
    subject: 'Re: Revised timeline',
    text: "Thanks, Ana. The revised timeline looks good to me. I'll take it to the steering group on 11 November. Gunnar",
  },
  { from: 'Oslo Marathon <post@oslomarathon.example>', date: '2026-10-16 09:00', subject: 'Your start number', text: 'Your start number for Oslo Marathon 2027 is 4127.' },
  { from: 'Azure Updates <updates@azure.example>', date: '2026-10-15 07:00', subject: 'What’s new in October', text: 'New regions, price changes and features this month.' },
];

/** Ana's notes app. */
const notes = [
  { title: 'Shopping list', text: 'Eggs, coffee, bread, tomatoes' },
  { title: 'Books to read', text: 'The Overstory, Klara and the Sun' },
  { title: 'Gift ideas for Ingrid', text: 'A pottery class, a good olive oil' },
];

/** What the web search finds, by what the query is about. Anything else finds nothing in particular. */
const web: [RegExp, string][] = [
  [/weather|rain|forecast/i, 'yr.no: Oslo, Wednesday 21 October 2026: showers in the afternoon, 80% chance of rain, 9 °C.'],
  [/wcag|contrast/i, 'w3.org: WCAG 2.1, success criterion 1.4.3 (level AA): text needs a contrast ratio of at least 4.5:1, or 3:1 for large text.'],
  [/app service|azure.*(price|pric|cost)/i, 'azure.microsoft.com: App Service, Basic plan B1 (1 core, 1.75 GB): about USD 13 a month.'],
];

const words = (text: string) => text.toLowerCase().match(/[a-zæøå0-9]{3,}/g) ?? [];
const matches = (query: unknown, ...fields: string[]) => {
  const wanted = words(String(query ?? ''));
  const text = fields.join(' ').toLowerCase();
  return wanted.length === 0 || wanted.some((word) => text.includes(word));
};

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties, required }, strict: false },
});

export const others: Stub[] = [
  {
    tool: fn('web_search', 'Searches the web and returns the top results, with their titles, addresses and snippets.', { query: { type: 'string', description: 'What to search for' } }, ['query']),
    answer: (args) => web.find(([about]) => about.test(String(args.query ?? '')))?.[1] ?? 'No results that match well. Try other words.',
  },
  {
    tool: fn(
      'calendar_list_events',
      "Lists the events in the user's calendar from one day to another, with their times, titles and who else is invited.",
      { start: { type: 'string', description: 'The first day, as YYYY-MM-DD' }, end: { type: 'string', description: 'The last day, as YYYY-MM-DD' } },
      ['start'],
    ),
    answer: (args) => {
      const start = String(args.start ?? '2026-10-20').slice(0, 10);
      const end = String(args.end ?? start).slice(0, 10);
      const found = events.filter((event) => event.day >= start && event.day <= end);
      return found.length ? found.map((event) => `${event.day} ${event.time} ${event.title}${event.with ? `, with ${event.with}` : ''}`).join('\n') : 'No events.';
    },
  },
  {
    tool: fn('email_search', "Searches the user's email inbox and returns the matching messages, newest first, with sender, date, subject and text.", { query: { type: 'string', description: 'Words to look for' } }, [
      'query',
    ]),
    answer: (args) => {
      const found = emails.filter((email) => matches(args.query, email.from, email.subject, email.text));
      return found.length ? found.map((email) => `From: ${email.from}\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.text}`).join('\n\n---\n\n') : 'No messages match.';
    },
  },
  {
    tool: fn('notes_search', "Searches the user's notes app and returns the matching notes.", { query: { type: 'string', description: 'Words to look for' } }, ['query']),
    answer: (args) => {
      const found = notes.filter((note) => matches(args.query, note.title, note.text));
      return found.length ? found.map((note) => `# ${note.title}\n${note.text}`).join('\n\n') : 'No notes match.';
    },
  },
  {
    tool: fn(
      'notes_save',
      "Saves a note in the user's notes app. A note with the same title is replaced, so include what it already says to add to it.",
      { title: { type: 'string' }, text: { type: 'string' } },
      ['title', 'text'],
    ),
    answer: (args) => `Saved the note "${String(args.title ?? 'Untitled')}".`,
  },
];
