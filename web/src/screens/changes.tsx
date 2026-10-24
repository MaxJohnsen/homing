import { useEffect, useRef } from 'react';
import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import { ago, dateOf, focusRing, ScreenHeader } from '@/components/screen';
import { nameIn, plain, type ChangeData } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import { placeName } from '@/lib/search';

/** "Today", "Yesterday", or the date. */
function dayOf(at: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(at))) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : dateOf(at);
}

/**
 * "by Cara Lund", "by you", "by Claude, for you", "by Cara Lund through Claude", or "shared by Cara
 * Lund". A change an assistant made to someone's own text is its change, for them.
 */
function byWhom(change: ChangeData): string {
  if (change.sharedBy) return `shared by ${nameIn(change.sharedBy) ?? 'someone'}`;
  const person = nameIn(change.by);
  const agent = change.agent ?? change.editAgent;
  if (agent) return person === 'you' ? `by ${agent}, for you` : person ? `by ${person} through ${agent}` : `by ${agent}`;
  return person ? `by ${person}` : 'by someone';
}

/**
 * What changed, newest first and grouped by day, each leading with the change itself, then where
 * it is and who did it.
 */
export function ChangeList({ changes, now }: { changes: ChangeData[]; now?: Date }) {
  const days: { day: string; changes: ChangeData[] }[] = [];
  for (const change of changes) {
    const day = dayOf(change.at, now);
    if (days.at(-1)?.day !== day) days.push({ day, changes: [] });
    days.at(-1)!.changes.push(change);
  }
  return (
    // Where focus stays when archived changes are left out again.
    <div id={listId} tabIndex={-1} className="flex flex-col gap-6 outline-none">
      {days.map(({ day, changes: those }) => (
        <section key={day} aria-label={day} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">{day}</h3>
          <ul className="-mx-3 flex flex-col">
            {those.map((change) => <ChangeRow key={change.itemId} change={change} now={now} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChangeRow({ change, now }: { change: ChangeData; now?: Date }) {
  const where = placeName(change.space);
  const what = change.overview
    ? `The overview of ${where}`
    : change.newPage
      ? `New page in ${where}`
      : `${change.kind === 'updated' ? 'Update on' : change.kind === 'corrected' ? 'Corrected on' : 'On'} ${change.title} in ${where}`;
  const href = change.overview ? (change.space.id ? `/spaces/${change.space.id}` : '/changes') : `/pages/${change.pageId}`;
  return (
    <li>
      <Link href={href} className={cn('flex flex-col gap-1 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
        <span className="text-base leading-snug font-semibold break-words">{change.newPage ? change.title : <span className="line-clamp-2">{plain(change.text)}</span>}</span>
        {change.newPage && <span className="line-clamp-2 text-base">{plain(change.text)}</span>}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {what}, {byWhom(change)}, {ago(change.at, now)}.{change.space.archived ? ` ${change.space.name} is archived.` : change.pageArchived ? ' The page is archived.' : ''}
          {change.onlyYou && !change.space.private && <OnlyYou />}
        </span>
      </Link>
    </li>
  );
}

/** Whether what changed in archived spaces and pages shows, and how to change that. */
export interface ArchivedChanges {
  /** Archived spaces and pages were left out, and something changed in them. */
  archived?: boolean;
  /** What changed in archived spaces and pages shows too. */
  withArchived?: boolean;
  onArchived?: (include: boolean) => void;
}

const listId = 'changes';
const noteId = 'archived-changes';
const includeId = 'include-archived';

/** Said where the list would be when everything that changed is archived. */
export const onlyArchived = 'Nothing has changed outside archived spaces and pages yet.';

/**
 * Archived spaces and pages are out of everyday attention, so what changed in them shows only on
 * request: a way to it below the list, offered only when there's something there, and a way back
 * above it.
 */
export function ArchivedNote({ withArchived, onArchived }: ArchivedChanges) {
  if (!withArchived || !onArchived) return null;
  return (
    <p id={noteId} tabIndex={-1} className="text-sm text-muted-foreground outline-none">
      Including what changed in archived spaces and pages, which are out of everyday context.{' '}
      <button type="button" onClick={() => onArchived(false)} className={cn('rounded-sm font-semibold text-primary-ink hover:underline', focusRing)}>
        Leave them out
      </button>
    </p>
  );
}

export function IncludeArchived({ archived, withArchived, onArchived }: ArchivedChanges) {
  if (!archived || withArchived || !onArchived) return null;
  return (
    <button id={includeId} type="button" onClick={() => onArchived(true)} className={cn('self-start rounded-sm text-sm font-semibold text-primary-ink hover:underline', focusRing)}>
      Show what changed in archived spaces and pages
    </button>
  );
}

/**
 * Keeps the person's place as they include or leave out what's archived: the list stays where it
 * is until the new one shows, and focus then goes to the line saying it's included when that's in
 * view, and otherwise to the list.
 */
export function useArchivedToggle(archived: ArchivedChanges, updating: boolean): ArchivedChanges {
  const toggled = useRef(false);
  const { withArchived, onArchived } = archived;
  useEffect(() => {
    if (!toggled.current || updating) return;
    toggled.current = false;
    const note = withArchived ? document.getElementById(noteId) : null;
    const inView = note && note.getBoundingClientRect().top >= 0 && note.getBoundingClientRect().bottom <= innerHeight;
    (inView ? note : (document.getElementById(listId) ?? document.getElementById(includeId)))?.focus({ preventScroll: true });
  }, [withArchived, updating]);
  return {
    ...archived,
    onArchived: onArchived && ((include) => {
      toggled.current = true;
      onArchived(include);
    }),
  };
}

/** Everything that changed, fifty at a time, newest first. */
export function Changes({ changes, more, from, onFrom, now, updating = false, ...shown }: {
  changes?: ChangeData[];
  more: boolean;
  from: number;
  onFrom: (from: number) => void;
  now?: Date;
  /** The list shown is the last one, while the next is on its way. */
  updating?: boolean;
} & ArchivedChanges) {
  const archived = useArchivedToggle(shown, updating);
  return (
    <>
      <ScreenHeader title="What changed" meta="In your spaces, newest first: what’s added, updated or corrected, by people and their assistants." below={<ArchivedNote {...archived} />} />
      {changes && changes.length === 0 && (
        <p className="text-base text-muted-foreground">
          {archived.archived ? onlyArchived : 'Nothing has changed yet. What you and others save shows up here.'}
        </p>
      )}
      {changes && changes.length > 0 && <ChangeList changes={changes} now={now} />}
      {(from > 0 || more) && (
        <nav aria-label="Older and newer changes" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {(from + 1).toLocaleString('en-US')}–{(from + (changes?.length ?? 0)).toLocaleString('en-US')}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={from === 0} onClick={() => onFrom(Math.max(0, from - 50))} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-semibold disabled:opacity-40', focusRing)}>
              Newer
            </button>
            <button type="button" disabled={!more} onClick={() => onFrom(from + 50)} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-semibold disabled:opacity-40', focusRing)}>
              Older
            </button>
          </div>
        </nav>
      )}
      <IncludeArchived {...archived} />
    </>
  );
}
