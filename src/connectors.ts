// Connectors (spec §7): the code for each outside system Homing reaches, one
// module for each, listed in the map below. Homing standardizes how it
// reaches and uses a system, not how that system works. A connector never
// touches the database or stored credentials: connecting, Homing hands it
// the code to redeem, and using a place, an Access with the place's resource,
// a token and Homing's time limit. Everything it gives back is outside
// content, which Homing frames itself, so nothing in it passes for Homing's
// own words. Following changes and acting come later, beside find and read.

import { microsoftConnector, type MicrosoftSettings } from './microsoft.ts';

/** A system Homing connects to, as a module in Homing's code. */
export interface Connector {
  /** As a connection's provider has it, and the start of its references, such as microsoft. */
  id: string;
  /** As people see the system, such as Microsoft 365. */
  name: string;
  /** Who answers for it, in a sentence such as "Microsoft didn't answer". */
  vendor: string;
  /** Whether this Homing is set up to reach it. What people connected stays as it is while it isn't. */
  ready: boolean;
  /** What whoever runs Homing checks when the system refuses Homing itself. */
  settings: string;
  /** What the ids of its items are made of, so a reference is told apart before anything is asked. */
  ids: RegExp;
  /** What Homing may do through an account, by the permission the system granted, such as Mail.Read: "read mail". */
  abilities: Record<string, string>;
  /** How a person connects an account, on the system's own page. */
  auth: OAuth;
  /** What an account there can reach, by kind of place, such as a mailbox. */
  kinds: Record<string, PlaceKind>;
  /** What an error from any of the above means, when it's the system's refusal or silence; undefined when it isn't. */
  refused(error: unknown): Refusal | undefined;
}

/**
 * What a refusal means for Homing. The account needs its owner to sign in again, such as after
 * withdrawing consent; a token was refused before it expired, so one new sign-in finds out whether
 * it still works; Homing's own settings are wrong, which nobody's connection is to blame for; the
 * system didn't answer, or not in time; or it simply refused.
 */
export type Refusal = 'sign in again' | 'renew' | 'homing settings' | 'try later' | 'refused';

/** OAuth 2.0's authorization code flow with PKCE, on the system's own page. */
export interface OAuth {
  /** Where the system sends the person back to, as its app registration has it. */
  callback: string;
  /** The system's sign-in page, for this attempt only. */
  signIn(attempt: { redirectUri: string; state: string; challenge: string; nonce: string; loginHint?: string }): URL;
  /** The account behind the code that came back, and its sign-in. */
  redeem(answer: { code: string; verifier: string; redirectUri: string; nonce: string }): Promise<Grant>;
  /** Who the account is, as the system names it, and the places connecting adds at once: the account's own, such as its mailbox. */
  account(grant: Grant): Promise<{ address: string; name: string | null; places: { kind: string; resource: string }[] }>;
  /** New tokens, with the refresh token Homing kept. */
  refresh(kept: string): Promise<Tokens>;
  /** What the person is told when the system refused connecting, where it's more than that it failed, such as expired. */
  notice?(error: unknown): string | undefined;
}

/** What an account's sign-in holds for Homing: a token to use, and one to get new ones with. */
export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: Date;
}

/** An account someone signed in with, by the ids the system keeps for good. */
export interface Grant {
  /** The system's directory or workspace, and the account's id there. */
  tenant: string;
  account: string;
  /** Its address, as the person signed in with it. */
  username: string | null;
  /** What the system allowed Homing, such as Mail.Read. */
  scopes: string[];
  tokens: Tokens;
}

/** A kind of place an account reaches, such as a mailbox, and what Homing can do with it. */
export interface PlaceKind {
  words: Words;
  /** The places of this kind the account reaches, for the person to choose from. A kind without it is the account's own, which connecting adds. */
  discover?(access: Access): Promise<{ resource: string; name: string }[]>;
  /** Live search, newest first, where it makes sense. A kind without it is still read by reference. */
  search?(access: Access, words: string, limit: number): Promise<Found[]>;
  /** One item by its id, with what it's read with unless left out, or undefined when it isn't there any more. */
  read(access: Access, id: string, options: { related: boolean }): Promise<Item | undefined>;
}

/** What Homing hands a connector for one use of a place. */
export interface Access {
  /** The place's resource, such as the account's id. */
  resource: string;
  /** A current token. Homing records the use before the first, and refreshes it when it needs to. */
  token(): Promise<string>;
  /** Homing's time limit, which the connector stops at. */
  signal: AbortSignal;
}

/** How Homing words a kind of place and what's in it, to people and assistants. */
export interface Words {
  /** The place, one and several: mailbox, mailboxes. */
  place: string;
  places: string;
  /** What's in it, one and several, and one with its article: email, emails, an email. */
  item: string;
  items: string;
  anItem: string;
  /** What names an item there: subject. */
  title: string;
  /** Who writes one: sender. */
  author?: string;
  /** What an item is read with, itself among them: thread. */
  related?: string;
  /** Why an item may not be there any more, besides being gone: or it moved to an archive. */
  lost?: string;
  /** What a source keeps of an item, as an assistant is told. */
  keeps: string;
}

/** Someone in an outside system: their name, as they or the system chose it, and how the system knows them, such as an email address. */
export interface Party {
  name: string | null;
  address: string | null;
}

/** Who could see an item where it lives, as Homing read it: people, such as an email's To and Cc, or unknown. */
export type Audience = { people: Party[]; more: number } | 'unknown';

/** What Homing handles the same way for every system. Every part but the id may be unknown. */
export interface Envelope {
  /** Its id there, the one that best survives moves. */
  id: string;
  title: string | null;
  /** When it was made or last changed there. */
  at: Date | null;
  author: Party | null;
  audience: Audience;
}

/** An item a search found, with its first words, as the system gives them. */
export type Found = Envelope & { preview?: string };

/** An item as Homing reads it. All of it is outside content, which Homing frames. */
export interface Item {
  envelope: Envelope;
  /** What it says in fields, each a label and its value, such as From and To, or Status and Amount. */
  fields: [label: string, value: Value][];
  /** Its text, for a kind with prose, such as an email's; null for one of fields only. */
  text: string | null;
  /** What it's read with, itself among them, oldest first, such as its thread. */
  related: Envelope[];
  /** Whether there's more of that than Homing read. */
  moreRelated: boolean;
  /** What a source keeps of it, with the words given, the kind's own way. By default, its fields. */
  excerpt?(words?: string): string;
}

/** A field's value, by what it holds, so Homing frames each the right way. */
export type Value = { text: string | null } | { texts: string[] } | { party: Party | null } | { parties: Party[] } | { at: Date | null };

/** The connectors this Homing has, by id. */
export type Connectors = ReadonlyMap<string, Connector>;

/** Homing's own reference words, and email's before connectors had their own, which no connector's id may be. */
const reserved = new Set(['space', 'page', 'item', 'source', 'proposal', 'task', 'connection', 'place', 'mail']);

/**
 * The connectors this Homing has: each system's module, set up from its settings, such as
 * MICROSOFT_CLIENT_ID, or there but not ready without them. Tests add stand-ins of their own.
 */
export function connectorsFor(settings: { microsoft?: MicrosoftSettings }, more: Connector[] = []): Connectors {
  const all = [microsoftConnector(settings.microsoft), ...more];
  for (const connector of all) {
    if (reserved.has(connector.id) || !/^[a-z][a-z0-9]{1,30}$/.test(connector.id) || all.filter((other) => other.id === connector.id).length > 1) {
      throw new Error(`A connector can't be called ${connector.id}.`);
    }
  }
  return new Map(all.map((connector) => [connector.id, connector]));
}
