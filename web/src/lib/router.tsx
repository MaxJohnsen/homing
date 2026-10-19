import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/** A screen inside the app. Each has an address of its own, so links from assistants and the back button work. */
export type Route =
  | { name: 'home' }
  | { name: 'waiting' }
  | { name: 'account' }
  | { name: 'space'; id: string }
  | { name: 'proposal'; id: string };

const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const patterns: [RegExp, (id: string) => Route][] = [
  [/^\/$/, () => ({ name: 'home' })],
  [/^\/waiting$/, () => ({ name: 'waiting' })],
  [/^\/account$/, () => ({ name: 'account' })],
  [new RegExp(`^/spaces/${uuid}$`, 'i'), (id) => ({ name: 'space', id: id.toLowerCase() })],
  [new RegExp(`^/proposals/${uuid}$`, 'i'), (id) => ({ name: 'proposal', id: id.toLowerCase() })],
];

/** The app's screen at an address, or undefined for a page outside the app. */
export function routeOf(path: string): Route | undefined {
  const plain = path.length > 1 ? path.replace(/\/$/, '') : path;
  for (const [pattern, route] of patterns) {
    const match = pattern.exec(plain);
    if (match) return route(match[1]);
  }
  return undefined;
}

export function addressOf(route: Route): string {
  switch (route.name) {
    case 'home': return '/';
    case 'waiting': return '/waiting';
    case 'account': return '/account';
    case 'space': return `/spaces/${route.id}`;
    case 'proposal': return `/proposals/${route.id}`;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    removeEventListener('popstate', listener);
  };
}

/** The address the app is at, which changes as the person moves between screens. */
export function useAddress(): string {
  return useSyncExternalStore(subscribe, () => location.pathname + location.search);
}

/** Moves to another screen without loading the page again. Pages outside the app, and the development server's screens, load normally. */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, location.href);
  if (import.meta.env.DEV || url.origin !== location.origin || !routeOf(url.pathname)) {
    location.assign(url);
    return;
  }
  if (options.replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  for (const listener of listeners) listener();
}

/**
 * A link to a screen. Inside the app it moves there without loading the page again; opening it in a
 * new tab, or a link to anywhere else, works as usual. The development server shows each screen at
 * an address of its own, so there every link loads the page.
 */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (import.meta.env.DEV || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || rest.target) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || !routeOf(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  };
  return <a href={href} onClick={follow} {...rest} />;
}
