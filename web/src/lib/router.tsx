import { useSyncExternalStore, type ComponentProps, type MouseEvent } from 'react';

/** A screen inside the app. Each has an address of its own, so links from assistants and the back button work. */
export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'changes' }
  | { name: 'waiting' }
  | { name: 'account' }
  | { name: 'admin' }
  | { name: 'new space' }
  | { name: 'import space' }
  | { name: 'space'; id: string; view?: SpaceView }
  | { name: 'page'; id: string }
  | { name: 'source'; id: string }
  | { name: 'skill'; id: string }
  | { name: 'proposal'; id: string };

/** The parts of a space: its overview, its pages, collections and sources under Knowledge, its rules and skills under Guidance, its members and its settings. */
export type SpaceView = 'overview' | 'pages' | 'collections' | 'sources' | 'rules' | 'skills' | 'tasks' | 'members' | 'settings';

const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const patterns: [RegExp, (id: string, view?: string) => Route][] = [
  [/^\/$/, () => ({ name: 'home' })],
  [/^\/search$/, () => ({ name: 'search' })],
  [/^\/changes$/, () => ({ name: 'changes' })],
  [/^\/waiting$/, () => ({ name: 'waiting' })],
  [/^\/account$/, () => ({ name: 'account' })],
  [/^\/admin$/, () => ({ name: 'admin' })],
  [/^\/spaces\/new$/, () => ({ name: 'new space' })],
  [/^\/spaces\/import$/, () => ({ name: 'import space' })],
  [new RegExp(`^/spaces/${uuid}(?:/(pages|collections|sources|rules|skills|tasks|members|settings))?$`, 'i'), (id, view) => ({ name: 'space', id: id.toLowerCase(), view: view as SpaceView | undefined })],
  [new RegExp(`^/pages/${uuid}$`, 'i'), (id) => ({ name: 'page', id: id.toLowerCase() })],
  [new RegExp(`^/sources/${uuid}$`, 'i'), (id) => ({ name: 'source', id: id.toLowerCase() })],
  [new RegExp(`^/skills/${uuid}$`, 'i'), (id) => ({ name: 'skill', id: id.toLowerCase() })],
  [new RegExp(`^/proposals/${uuid}$`, 'i'), (id) => ({ name: 'proposal', id: id.toLowerCase() })],
];

/** The app's screen at an address, or undefined for a page outside the app. */
export function routeOf(path: string): Route | undefined {
  const plain = path.length > 1 ? path.replace(/\/$/, '') : path;
  for (const [pattern, route] of patterns) {
    const match = pattern.exec(plain);
    if (match) return route(match[1], match[2]);
  }
  return undefined;
}

export function addressOf(route: Route): string {
  switch (route.name) {
    case 'home': return '/';
    case 'search': return '/search';
    case 'changes': return '/changes';
    case 'waiting': return '/waiting';
    case 'account': return '/account';
    case 'admin': return '/admin';
    case 'new space': return '/spaces/new';
    case 'import space': return '/spaces/import';
    case 'space': return `/spaces/${route.id}${route.view ? `/${route.view}` : ''}`;
    case 'page': return `/pages/${route.id}`;
    case 'source': return `/sources/${route.id}`;
    case 'skill': return `/skills/${route.id}`;
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
export function Link({ href, onClick, ...rest }: ComponentProps<'a'> & { href: string }) {
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
