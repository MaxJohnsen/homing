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

/** Something of yours connected in a space, such as your mailbox, only for you. */
export interface PlaceData {
  id: string;
  kind: 'mailbox';
  addedAt: string;
  /** In how many other spaces you use the same account. */
  elsewhere: number;
  connection: ConnectionData;
}

/** A space's Connections: yours there, and whether this Homing can connect Microsoft 365. */
export interface SpaceConnectionsData {
  microsoft: boolean;
  /** Whether you look after this Homing, so you're told how to set it up. */
  looksAfter: boolean;
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
export type ConnectionNotice = 'connected' | 'declined' | 'expired' | 'failed' | 'unreachable' | 'no-mailbox';

export const connectionNotices: ConnectionNotice[] = ['connected', 'declined', 'expired', 'failed', 'unreachable', 'no-mailbox'];
