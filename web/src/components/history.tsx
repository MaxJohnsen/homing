import { dateOf, timeOf } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { nameIn, plain, type Author, type Version } from '@/lib/knowledge';
import { fromChange } from '@/lib/versions';

/** Who made a version, in the middle of a sentence: "you", "Cara Lund", "your assistant Claude", "Cara Lund’s assistant Claude", "Homing". */
export function madeBy(version: { by: Author; agent: string | null; editAgent?: string | null }): string {
  const agent = version.agent ?? version.editAgent;
  const person = nameIn(version.by);
  if (agent) return person === 'you' ? `your assistant ${agent}` : person ? `${person}’s assistant ${agent}` : agent;
  return person ?? (version.by ? 'someone' : 'Homing');
}

/**
 * What something said before, newest first: each earlier version with until when, and who changed it
 * then, the one who wrote the version after it, then what it replaced. Each shows a few lines from
 * where it differs from the version after it; Restore opens the whole version where it's corrected,
 * to save it back. Versions from the same day
 * say the time too.
 */
export function EarlierVersions({ current, earlier, replaced, onRestore }: {
  current: { text: string; by: Author; agent: string | null; editAgent?: string | null };
  /** Oldest first. */
  earlier: Version[];
  /** What it replaced, which says what it was, but isn't restored here. */
  replaced?: { text: string; until: string } | null;
  onRestore?: (text: string) => void;
}) {
  const entries = [
    ...earlier
      .map((entry, index) => ({ text: entry.text, next: (earlier[index + 1] ?? current).text, until: entry.until, by: madeBy(earlier[index + 1] ?? current), version: index + 1 }))
      .reverse(),
    ...(replaced ? [{ text: replaced.text, next: current.text, until: replaced.until, by: null, version: null }] : []),
  ];
  const days = entries.map((entry) => dateOf(entry.until));
  const when = (until: string) => {
    const day = dateOf(until);
    return days.filter((other) => other === day).length > 1 ? `${day} at ${timeOf(until)}` : day;
  };
  return (
    <>
      {entries.map((entry) => (
        <div key={`${entry.version}-${entry.until}`} className="flex flex-col items-start gap-2">
          <p className="line-clamp-3 text-muted-foreground">
            Until {when(entry.until)}{entry.by && `, when ${entry.by} changed it`}, it said <span className="text-foreground">“{fromChange(plain(entry.text), plain(entry.next))}”</span>
          </p>
          {onRestore && entry.version !== null && entry.text !== current.text && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Restore version ${entry.version} of ${earlier.length + 1}, as it was until ${when(entry.until)}`}
              onClick={() => onRestore(entry.text)}
            >
              Restore
            </Button>
          )}
        </div>
      ))}
    </>
  );
}
