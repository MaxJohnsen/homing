import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from '@/lib/api';

/**
 * What the app has loaded from the server, by address. A screen shows what it loaded before at
 * once, and the server's answer replaces it when it arrives, so moving back and forth is instant.
 */
const loaded = new Map<string, { data?: unknown; error?: ApiError; fetching?: Promise<void> }>();
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Loads it again, for everyone showing it, such as after deciding something that was waiting. */
export function reload(path: string): Promise<void> {
  const entry = loaded.get(path) ?? {};
  if (entry.fetching) return entry.fetching;
  entry.fetching = api(path).then(
    (data) => {
      loaded.set(path, { data });
    },
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        location.assign(`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }
      loaded.set(path, { data: entry.data, error: error instanceof ApiError ? error : new ApiError(0, {}) });
    },
  ).finally(changed);
  loaded.set(path, entry);
  return entry.fetching;
}

/** What the server answers at this address: undefined until it has, and an error if it refused. */
export function useLoad<T>(path: string): { data?: T; error?: ApiError } {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    reload(path);
  }, [path]);
  const entry = loaded.get(path);
  return { data: entry?.data as T | undefined, error: entry?.error };
}
