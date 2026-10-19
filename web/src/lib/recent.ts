import { useCallback, useSyncExternalStore } from 'react';

/**
 * The spaces you opened lately, newest first, kept in this browser only: it's a convenience for
 * finding your way back, so nothing is lost when the browser forgets it. Each account keeps its own.
 */
const kept = 5;
const listeners = new Set<() => void>();

function storeKey(account: string) {
  return `homing.recent.${account}`;
}

function read(account: string): string {
  try {
    return localStorage.getItem(storeKey(account)) ?? '[]';
  } catch {
    return '[]';
  }
}

export function useRecent(account: string): { recent: string[]; opened: (spaceId: string) => void } {
  const stored = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(account),
  );
  const opened = useCallback(
    (spaceId: string) => {
      const before = parse(read(account));
      if (before[0] === spaceId) return;
      try {
        localStorage.setItem(storeKey(account), JSON.stringify([spaceId, ...before.filter((id) => id !== spaceId)].slice(0, kept)));
      } catch {
        return;
      }
      for (const listener of listeners) listener();
    },
    [account],
  );
  return { recent: parse(stored), opened };
}

function parse(stored: string): string[] {
  try {
    const ids: unknown = JSON.parse(stored);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
