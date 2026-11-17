// An assistant connecting to Homing over OAuth, the way Claude.ai does: it
// names itself with a client metadata document on its own site, sends the
// person to Homing to sign in and allow it, then acts as them over MCP.

import { Client, StreamableHTTPClientTransport, type OAuthClientProvider } from '@modelcontextprotocol/client';
import type { Browser } from './browser.ts';

const redirectUrl = 'http://localhost:9999/callback';

/** Assistants' client metadata documents, as their own sites serve them. */
export const assistants = {
  claude: metadata('https://claude.test/oauth/metadata.json', 'Claude'),
  chatgpt: metadata('https://chatgpt.test/oauth/metadata.json', 'ChatGPT'),
};

function metadata(clientId: string, name: string) {
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: [redirectUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

/** A site Homing doesn't trust, which publishes a metadata document all the same. */
export const stranger = metadata('https://stranger.test/oauth/metadata.json', 'Claude');

/** Server options for tests: the stand-in sites, that their assistants may connect, and a quiet log. */
export const testAssistants = {
  fetchClientMetadata,
  assistantSites: Object.values(assistants).map((assistant) => new URL(assistant.client_id).hostname),
  logRequests: false,
};

/** Stands in for the assistants' sites, which are outside Homing. */
export async function fetchClientMetadata(input: RequestInfo | URL): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const document = [...Object.values(assistants), stranger].find((assistant) => assistant.client_id === url);
  return document ? Response.json(document) : new Response('Not found', { status: 404 });
}

export class Assistant {
  readonly mcpUrl: URL;
  readonly metadata: ReturnType<typeof metadata>;
  tokens?: { access_token: string; refresh_token?: string };
  private verifier = '';
  private authorizationUrl?: URL;
  readonly provider: OAuthClientProvider;

  constructor(homing: URL, document = assistants.claude) {
    this.mcpUrl = new URL('/mcp', homing);
    this.metadata = document;
    this.provider = {
      redirectUrl,
      clientMetadataUrl: document.client_id,
      clientMetadata: { ...document, redirect_uris: [redirectUrl] },
      clientInformation: () => ({ client_id: document.client_id }),
      tokens: () => this.tokens as never,
      saveTokens: (tokens) => void (this.tokens = tokens as never),
      redirectToAuthorization: (url) => void (this.authorizationUrl = url),
      saveCodeVerifier: (verifier) => void (this.verifier = verifier),
      codeVerifier: () => this.verifier,
    };
  }

  /**
   * Connects for the person signed in to the browser: Homing shows its
   * consent page, the person allows it, and the assistant gets its tokens.
   */
  async connect(browser: Browser, choice: { allow: boolean } = { allow: true }) {
    const start = await this.open().then(
      () => 'connected without signing in',
      () => undefined,
    );
    if (start || !this.authorizationUrl) throw new Error(start ?? 'Homing gave no sign-in address');

    const consent = await follow(browser, this.authorizationUrl);
    if (consent.pathname !== '/connect') return { page: consent };
    const decided = await browser.json('/api/auth/oauth2/consent', { accept: choice.allow, oauth_query: signedQuery(consent.search) });
    const callback = new URL(decided.body.url ?? decided.body.redirect_uri);
    if (callback.searchParams.has('code')) await this.finish(callback);
    return { page: consent, callback };
  }

  /** Redeems the authorization code Homing sent back, for tokens. */
  async finish(callback: URL) {
    await new StreamableHTTPClientTransport(this.mcpUrl, { authProvider: this.provider }).finishAuth(callback.searchParams);
  }

  /** A new MCP session, like a new conversation. */
  async open() {
    const client = new Client({ name: this.metadata.client_name, version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(this.mcpUrl, { authProvider: this.provider }));
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
      return { text, failed: Boolean(result.isError) };
    };
    const tools = async () => (await client.listTools()).tools.map((tool) => tool.name).sort();
    return { call, tools, client, close: () => client.close() };
  }
}

/** Follows redirects in the browser until a page of Homing's own, or the assistant's callback. */
async function follow(browser: Browser, start: URL): Promise<URL> {
  let url = start;
  for (let hop = 0; hop < 5 && url.origin === browser.url.origin && url.pathname.startsWith('/api/'); hop++) {
    const response = await browser.fetch(url.pathname + url.search);
    // A page script gets JSON where a browser would get a redirect.
    const next = response.headers.get('location') ?? ((await response.json()) as { url?: string }).url;
    if (!next) throw new Error(`no redirect from ${url.pathname}`);
    url = new URL(next, browser.url);
  }
  return url;
}

/** The signed part of the sign-in or consent page's address, which Homing checks to continue. */
export function signedQuery(search: string): string {
  const params = new URLSearchParams(search);
  const names = new Set(params.getAll('ba_param'));
  const signed = new URLSearchParams();
  for (const [key, value] of params) if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
  return signed.toString();
}
