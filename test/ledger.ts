// A connector for tests only, to a system unlike a mailbox: Ledger, an
// accounting system whose companies hold invoices of fields, with no prose. It
// can't be searched live, and an account reaches several companies, of which
// the person chooses the one a space is about. Ledger itself is a stand-in,
// in memory, that keeps its side of the rules Homing relies on: a code works
// once and only with the PKCE verifier it was issued for, tokens expire, and
// an account's consent can be withdrawn. It counts what it's asked, and can be
// made to refuse in each way a system does.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Connector, Grant, Item, Refusal, Tokens } from '../src/connectors.ts';

/** Someone's account in a Ledger workspace, and the companies it reaches. */
export interface LedgerAccount {
  workspace: string;
  id: string;
  address: string;
  name: string;
  companies: { id: string; name: string }[];
}

/** An invoice, as Ledger keeps it: fields only. */
export interface Invoice {
  number: string;
  customer: string;
  amount: string;
  due: Date;
  status: string;
}

/** Ledger refused, with what that means for Homing. */
export class LedgerRefused extends Error {
  override name = 'LedgerRefused';
  readonly meaning: Exclude<Refusal, 'try later'>;
  constructor(meaning: LedgerRefused['meaning'], why: string) {
    super(`Ledger refused: ${why}`);
    this.meaning = meaning;
  }
}

/** Ledger didn't answer. */
export class LedgerDown extends Error {
  override name = 'LedgerDown';
}

export class Ledger {
  /** What it was asked: codes redeemed, refreshes, companies listed and invoices read. */
  readonly asked = { codes: 0, refreshes: 0, discovers: 0, reads: 0 };
  /** Every token it handed out, so tests can look for them where they mustn't be. */
  readonly issued: string[] = [];
  /** How Ledger refuses from now on: an account's refreshes, every read, or not at all. */
  refusing: { refresh?: LedgerRefused['meaning']; read?: LedgerRefused['meaning']; down?: boolean } = {};
  private readonly codes = new Map<string, { account: LedgerAccount; challenge: string; redirectUri: string; used: boolean }>();
  private readonly refreshTokens = new Map<string, LedgerAccount>();
  private readonly accessTokens = new Map<string, { account: LedgerAccount; expiresAt: number }>();
  private readonly invoices = new Map<string, Map<string, Invoice>>();
  readonly connector: Connector;

  constructor({ ready = true }: { ready?: boolean } = {}) {
    const token = async (access: { token(): Promise<string> }) => {
      if (this.refusing.down) throw new LedgerDown('Ledger didn’t answer.');
      const held = this.accessTokens.get(await access.token());
      // A token refused before it expired: one new sign-in finds out whether the account still works.
      if (!held || held.expiresAt < Date.now()) throw new LedgerRefused('renew', 'invalid_token');
      return held.account;
    };
    this.connector = {
      id: 'ledger',
      name: 'Ledger',
      vendor: 'Ledger',
      ready,
      settings: 'Check LEDGER_CLIENT_ID.',
      ids: /^[A-Z0-9-]{1,40}$/,
      abilities: { 'invoices:read': 'read invoices' },
      auth: {
        callback: '/connections/ledger/callback',
        signIn: ({ redirectUri, state, challenge }) => {
          const url = new URL('https://ledger.test/authorize');
          url.search = new URLSearchParams({ redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
          return url;
        },
        redeem: async ({ code, verifier, redirectUri }): Promise<Grant> => {
          this.asked.codes++;
          if (this.refusing.down) throw new LedgerDown('Ledger didn’t answer.');
          const issued = this.codes.get(code);
          if (!issued || issued.used || issued.redirectUri !== redirectUri || createHash('sha256').update(verifier).digest('base64url') !== issued.challenge) {
            throw new LedgerRefused('sign in again', 'invalid_grant');
          }
          issued.used = true;
          return { tenant: issued.account.workspace, account: issued.account.id, username: issued.account.address, scopes: ['invoices:read'], tokens: this.tokensFor(issued.account) };
        },
        account: async (grant) => {
          const account = this.accountOf(grant.tokens.access);
          return { address: account.address, name: account.name, places: [] };
        },
        refresh: async (kept) => {
          this.asked.refreshes++;
          if (this.refusing.down) throw new LedgerDown('Ledger didn’t answer.');
          const account = this.refreshTokens.get(kept);
          if (!account) throw new LedgerRefused('sign in again', 'invalid_grant');
          if (this.refusing.refresh) throw new LedgerRefused(this.refusing.refresh, 'refresh refused');
          return this.tokensFor(account);
        },
      },
      kinds: {
        company: {
          words: { place: 'company', places: 'companies', item: 'invoice', items: 'invoices', anItem: 'an invoice', title: 'number', keeps: 'its number, customer, amount, due date and status' },
          discover: async (access) => {
            this.asked.discovers++;
            const account = await token(access);
            return account.companies.map((company) => ({ resource: company.id, name: company.name }));
          },
          read: async (access, id): Promise<Item | undefined> => {
            this.asked.reads++;
            const account = await token(access);
            if (this.refusing.read) throw new LedgerRefused(this.refusing.read, 'read refused');
            // Only within the company the place is, and only one the account reaches.
            if (!account.companies.some((company) => company.id === access.resource)) throw new LedgerRefused('refused', 'forbidden');
            const invoice = this.invoices.get(access.resource)?.get(id);
            if (!invoice) return undefined;
            return {
              envelope: { id, title: invoice.number, at: null, author: null, audience: 'unknown' },
              fields: [
                ['Number', { text: invoice.number }],
                ['Customer', { text: invoice.customer }],
                ['Amount', { text: invoice.amount }],
                ['Due', { at: invoice.due }],
                ['Status', { text: invoice.status }],
              ],
              text: null,
              related: [],
              moreRelated: false,
            };
          },
        },
      },
      refused: (error) => (error instanceof LedgerRefused ? error.meaning : error instanceof LedgerDown ? 'try later' : undefined),
    };
  }

  /** A new account in a workspace, reaching these companies. */
  account(name: string, companies: string[]): LedgerAccount {
    return {
      workspace: randomUUID(),
      id: randomUUID(),
      address: `${name.toLowerCase()}.${randomBytes(3).toString('hex')}@ledger.test`,
      name,
      companies: companies.map((company) => ({ id: randomUUID(), name: company })),
    };
  }

  /** Someone keeps an invoice in a company. Returns its id. */
  keep(company: string, invoice: Invoice): string {
    const id = `INV-${randomBytes(4).toString('hex').toUpperCase()}`;
    const kept = this.invoices.get(company) ?? new Map<string, Invoice>();
    kept.set(id, invoice);
    this.invoices.set(company, kept);
    return id;
  }

  /** The person signs in on Ledger's page with an account and allows Homing: where Ledger sends their browser back to. */
  signIn(address: string, account: LedgerAccount): string {
    const asked = new URL(address).searchParams;
    const code = randomBytes(16).toString('base64url');
    this.codes.set(code, { account, challenge: asked.get('code_challenge')!, redirectUri: asked.get('redirect_uri')!, used: false });
    const back = new URL(asked.get('redirect_uri')!);
    back.search = new URLSearchParams({ code, state: asked.get('state')! }).toString();
    return back.toString();
  }

  /** Ledger stops taking the tokens it handed out, before they expire. */
  dropTokens() {
    this.accessTokens.clear();
  }

  private tokensFor(account: LedgerAccount): Tokens {
    const access = `ledger-access-${randomBytes(16).toString('base64url')}`;
    const refresh = `ledger-refresh-${randomBytes(16).toString('base64url')}`;
    this.accessTokens.set(access, { account, expiresAt: Date.now() + 3600_000 });
    this.refreshTokens.set(refresh, account);
    this.issued.push(access, refresh);
    return { access, refresh, expiresAt: new Date(Date.now() + 3600_000) };
  }

  private accountOf(access: string): LedgerAccount {
    const held = this.accessTokens.get(access);
    if (!held) throw new LedgerRefused('renew', 'invalid_token');
    return held.account;
  }
}
