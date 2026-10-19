/** Homing refused a request, with a message that can be shown as it is. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** The form field the message is about, if any. */
  readonly field?: string;

  constructor(status: number, body: { message?: string; code?: string; field?: string }) {
    super(body.message ?? 'Something went wrong. Try again.');
    this.status = status;
    this.code = body.code;
    this.field = body.field;
  }
}

/** Calls the server: a GET without a body, a POST with one. */
export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined
    ? { headers: { accept: 'application/json' } }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}

/** Where to go after signing in: a page of Homing's own, never another site. */
export function nextPage(fallback = '/'): string {
  return samePage(new URLSearchParams(location.search).get('next'), location.origin, fallback);
}

/**
 * A page on this origin, by the browser's own reading of the address, so
 * tricks like `/\evil.com` or a tab after the slash lead nowhere else.
 */
export function samePage(next: string | null, origin: string, fallback: string): string {
  if (!next?.startsWith('/')) return fallback;
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

/**
 * While an assistant is connecting, sign-in and consent carry the signed part
 * of the page's address, so Homing can continue to the assistant afterward.
 */
export function oauthQuery(): { oauth_query?: string } {
  const params = new URLSearchParams(location.search);
  if (!params.has('sig')) return {};
  const names = new Set(params.getAll('ba_param'));
  const signed = new URLSearchParams();
  for (const [key, value] of params) if (key === 'sig' || key === 'ba_param' || names.has(key)) signed.append(key, value);
  return { oauth_query: signed.toString() };
}
