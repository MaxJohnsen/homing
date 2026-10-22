/** How far along a preview being read, or an import, is, as Homing says. */
export type ImportProgress =
  | { state: 'waiting' }
  | { state: 'reading' | 'importing'; done: number; total: number }
  | { state: 'done'; id: string }
  | { state: 'failed'; message: string }
  | { state: 'none' };

/** How following an import ended: it's done, it failed and why, or nobody follows it any more. */
export type Followed = { done: string } | { failed: string } | { left: true };

/** Why a file can't be sent to import, said before any of it is: larger than Homing imports, 2 GB as a zip. */
export function unsendable(file: { size: number }): string | undefined {
  return file.size > 2 * 1024 ** 3 ? 'That file is larger than Homing imports, 2 GB. Exports from Homing never are.' : undefined;
}

export const stopped = 'The import stopped before it was done, so nothing of it was kept. Try again.';

/**
 * Follows an import until it ends, telling how far it's got, for as long as someone looks. When
 * Homing knows of no import any more, as when it restarted on the way, the import stopped, and
 * nothing of it was kept. While Homing can't be reached, it keeps trying.
 */
export async function followImport(progress: () => Promise<ImportProgress>, looking: () => boolean, step: (fraction: number) => void, every = 700): Promise<Followed> {
  while (looking()) {
    const now = await progress().catch(() => undefined);
    if (!looking()) break;
    if (now?.state === 'done') return { done: now.id };
    if (now?.state === 'failed') return { failed: now.message };
    if (now?.state === 'none') return { failed: stopped };
    if (now?.state === 'importing') step(now.total ? now.done / now.total : 0);
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return { left: true };
}
