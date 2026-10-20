import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import { ago, dateOf, focusRing, ScreenHeader } from '@/components/screen';
import { plain, type ChangeData } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import { placeName } from '@/lib/search';

/** "Today", "Yesterday", or the date. */
function dayOf(at: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(at))) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : dateOf(at);
}

/** "by Cara Lund", "by you", "by Claude, for you", "by Cara Lund through Claude". */
function byWhom(change: ChangeData): string {
  const person = change.by?.you ? 'you' : (change.by?.name ?? null);
  if (change.agent) return person === 'you' ? `by ${change.agent}, for you` : person ? `by ${person} through ${change.agent}` : `by ${change.agent}`;
  return person ? `by ${person}` : 'by someone no longer in the space';
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
    <div className="flex flex-col gap-6">
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
  const what = change.newPage
    ? `New page in ${where}`
    : `${change.kind === 'updated' ? 'Update on' : change.kind === 'corrected' ? 'Corrected on' : 'On'} ${change.title} in ${where}`;
  return (
    <li>
      <Link href={`/pages/${change.pageId}`} className={cn('flex flex-col gap-1 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
        <span className="text-base leading-snug font-semibold break-words">{change.newPage ? change.title : <span className="line-clamp-2">{plain(change.text)}</span>}</span>
        {change.newPage && <span className="line-clamp-2 text-base">{plain(change.text)}</span>}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {what}, {byWhom(change)}, {ago(change.at, now)}.
          {change.onlyYou && !change.space.private && <OnlyYou />}
        </span>
      </Link>
    </li>
  );
}

/** Everything that changed, fifty at a time, newest first. */
export function Changes({ changes, more, from, onFrom, now }: {
  changes?: ChangeData[];
  more: boolean;
  from: number;
  onFrom: (from: number) => void;
  now?: Date;
}) {
  return (
    <>
      <ScreenHeader title="What changed" meta="In all your spaces, newest first: what’s added, updated or corrected, by people and their assistants." />
      {changes && changes.length === 0 && <p className="text-base text-muted-foreground">Nothing has changed yet. What you and others save shows up here.</p>}
      {changes && changes.length > 0 && <ChangeList changes={changes} now={now} />}
      {(from > 0 || more) && (
        <nav aria-label="Older and newer changes" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {(from + 1).toLocaleString('en-US')}–{(from + (changes?.length ?? 0)).toLocaleString('en-US')}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={from === 0} onClick={() => onFrom(Math.max(0, from - 50))} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-medium disabled:opacity-40', focusRing)}>
              Newer
            </button>
            <button type="button" disabled={!more} onClick={() => onFrom(from + 50)} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-medium disabled:opacity-40', focusRing)}>
              Older
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
