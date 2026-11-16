import type { ModelStatement } from '@/lib/model';

/** An account Homing signs in to for you, such as your work Microsoft 365. Never its credentials. */
export interface ConnectionData {
  id: string;
  /** The service, such as "Microsoft 365". */
  service: string;
  /** The account's address and name, as the service gives them. */
  address: string;
  name: string | null;
  /** What Homing may do with it, such as "read mail". */
  can: string[];
  status: 'connected' | 'needs attention';
  connectedAt: string;
  refreshedAt: string;
}

/** What learning from a scope may cost, as Homing estimated it before the pass. It's rough. */
export interface EstimateData {
  /** The scope it's for: from when, and up to when for a scope extended further back. */
  since: string;
  until: string | null;
  /** How many items the service counts there, about how many threads a model would read, and how many items need none. */
  items: number;
  threads: number;
  setAside: number;
  /** In dollars: about what it costs, at most, and the limit Homing suggests. */
  low: number;
  high: number;
  limit: number;
  /** How many items the sample held. */
  sampled: number;
}

/** How far Homing has learned from something of yours, such as your mailbox. Only you see it. */
export interface LearningData {
  state: 'estimating' | 'learning history' | 'following' | 'paused' | 'needs attention' | 'done';
  /** Why it's paused or needs you. */
  reason: 'person' | 'limit' | 'monthly limit' | 'model processing off' | 'sign in again' | 'not set up' | 'removed' | null;
  /** What it waits for while it keeps trying by itself: the model's provider, the service, or an error of Homing's own. */
  waitingFor?: 'provider' | 'system' | 'error' | null;
  /** Whether a range you added waits at the limit while it follows what arrives. */
  waitingAtLimit?: boolean;
  /** How far back it learns, and how far through that it is. */
  since: string;
  learnedUpTo: string | null;
  caughtUp: boolean;
  /** A range further back that it's learning from now. */
  extending: { since: string; until: string } | null;
  /** In dollars: its limit for history, what that cost so far, and what it cost since, which the monthly limit holds. */
  limit: number;
  spent: number;
  followed: number;
  estimate: EstimateData | null;
  /** The estimate for a range further back you asked about, which isn't learned from until you say so. */
  proposed?: EstimateData | null;
  /** What you left out, senders by address or domain and folders by name, and the senders you keep whatever their mail says about itself. */
  leftOut: { senders: string[]; folders: string[]; kept: string[] };
  /** How many threads it learned from, and the items in them. */
  threads: number;
  learned: number;
  /** What it set aside, by why, most first, each in words, such as "240 newsletters", with who sent them, most first. */
  setAside: { reason: string; items: number; words: string; senders: { sender: string; items: number }[] }[];
  /** How many set aside before it now learns from after all, since you said so. */
  again?: number;
}

/** Something of yours connected in a space, such as your mailbox, only for you. */
export interface PlaceData {
  id: string;
  /** What kind of place it is, such as a mailbox. */
  kind: string;
  addedAt: string;
  /** The other spaces you use the same account in. */
  elsewhere: { id: string; name: string; personal: boolean }[];
  connection: ConnectionData;
  /** Whether Homing can learn from a place of this kind, how what's in it is worded, and how far it has learned. */
  learns?: boolean;
  words?: { place: string; item: string; items: string; thread: string };
  learning?: LearningData | null;
}

/** A space's Connections: yours there, and whether this Homing can connect Microsoft 365. */
export interface SpaceConnectionsData {
  microsoft: boolean;
  /** Whether you look after this Homing, so you're told how to set it up. */
  looksAfter: boolean;
  /** The model that reads what Homing learns from, or null when Homing has none. */
  model?: ModelStatement | null;
  /** The most a learning run may spend on history here, in dollars, which whoever looks after Homing sets. */
  runCeiling?: number;
  places: PlaceData[];
}

/** One of your accounts, with the spaces it's used in. */
export interface AccountConnectionData extends ConnectionData {
  places: { id: string; space: { id: string; name: string; personal: boolean } }[];
}

export interface ConnectedAccountsData {
  microsoft: boolean;
  connections: AccountConnectionData[];
}

/** What happened when you came back from signing in with Microsoft. */
export type ConnectionNotice = 'connected' | 'declined' | 'expired' | 'failed' | 'unreachable' | 'no-mailbox' | 'another-account';

export const connectionNotices: ConnectionNotice[] = ['connected', 'declined', 'expired', 'failed', 'unreachable', 'no-mailbox', 'another-account'];
