import { useState, type MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';
import { Markdown } from '@/components/markdown';
import { OnlyYou } from '@/components/only-you';
import { ago, capitalize, focusRing, ScreenHeader } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nameOf, plain, type Author, type ItemData, type PageData } from '@/lib/knowledge';
import { Link } from '@/lib/router';

/** Long pages can be searched within, from this many items. */
const findFrom = 12;

/**
 * A page as the person sees it: what's known first, read like a page, with what's only theirs
 * marked where it stands. Who wrote each item, its sources and what it said before open on it
 * when asked.
 */
export function Page({ page, now }: { page: PageData; now?: Date }) {
  const [find, setFind] = useState('');
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? page.items.filter((item) => words.every((word) => plain(item.text).toLowerCase().includes(word))) : page.items;
  const onlyYou = !page.space.private && page.items.length > 0 && page.items.every((item) => !item.shared);

  return (
    <>
      <ScreenHeader title={page.title} aside={onlyYou && <OnlyYou />} meta={<About page={page} now={now} />} />
      <div className="flex max-w-[44rem] flex-col gap-6">
        {page.items.length >= findFrom && (
          <Input
            type="search"
            aria-label="Find on this page"
            placeholder={`Find in ${page.items.length} items on this page`}
            value={find}
            onChange={(event) => setFind(event.target.value)}
            className="h-10 rounded-full border-0 bg-muted px-5 text-base sm:max-w-sm"
          />
        )}
        {page.items.length === 0 ? (
          <p className="text-base text-muted-foreground">Nothing on this page yet.</p>
        ) : (
          <article aria-label={page.title} className="flex flex-col gap-1">
            {shown.map((item) => <Item key={item.id} item={item} page={page} marked={!onlyYou} />)}
            {shown.length === 0 && <p className="text-base text-muted-foreground">Nothing on this page says “{find.trim()}”.</p>}
          </article>
        )}
      </div>
    </>
  );
}

/** What the page is, where, when it last changed, and who sees it, in a sentence. */
function About({ page, now }: { page: PageData; now?: Date }) {
  const mine = page.items.filter((item) => !item.shared).length;
  const where = page.space.personal ? 'your personal space' : page.space.name;
  const kind = page.type ?? 'page';
  return (
    <>
      {capitalize(/^[aeiou]/i.test(kind) ? 'an' : 'a')} {kind} in{' '}
      <Link href={`/spaces/${page.space.id}`} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
        {where}
      </Link>
      , updated {ago(page.updatedAt, now)}.{' '}
      {page.space.private || (page.items.length > 0 && mine === page.items.length)
        ? 'Only you see it.'
        : `Everyone in ${page.space.name} sees it${mine ? `, except ${mine === 1 ? 'one item' : `${mine} items`} only you see` : ''}.`}
    </>
  );
}

/** One item. What only you see is marked, unless the whole page is, which its title already says. */
function Item({ item, page, marked }: { item: ItemData; page: PageData; marked: boolean }) {
  const [open, setOpen] = useState(false);
  const onlyYou = marked && !item.shared && !page.space.private;
  // Your private update to something shared: you see yours, everyone else still sees what it replaced.
  const yourUpdate = !item.shared && item.replaced?.shared === true;

  const toggle = (event: MouseEvent) => {
    // Links inside do their own thing, and selecting text shouldn't open the details.
    if ((event.target as HTMLElement).closest('a, button, input') || window.getSelection()?.toString()) return;
    setOpen(!open);
  };

  return (
    <div
      onClick={toggle}
      className={cn(
        'group -mx-2 flex cursor-pointer flex-col gap-3 rounded-xl px-2 py-3 transition-colors sm:-mx-4 sm:px-4',
        onlyYou ? 'bg-private/25' : open ? 'bg-card' : 'hover:bg-muted/70',
      )}
    >
      {onlyYou && <OnlyYou className="self-start" />}
      <div className="flex items-start gap-3">
        <Markdown text={item.text} className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={open ? 'Hide who wrote it and where it came from' : 'Who wrote it and where it came from'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn('-mt-0.5 shrink-0 text-muted-foreground', !open && 'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100')}
        >
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>
      {yourUpdate && (
        <p className="rounded-lg bg-card px-4 py-3 text-base">
          <span className="font-semibold">Your version is newer.</span> Others in {page.space.name} still see “{plain(item.replaced!.text)}”
        </p>
      )}
      {open && <Details item={item} yourUpdate={yourUpdate} />}
    </div>
  );
}

const day = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** "October 14", with the year when it isn't this year. */
function dateOf(at: string): string {
  const date = new Date(at);
  return (date.getFullYear() === new Date().getFullYear() ? day : dayYear).format(date);
}

/** "You wrote this", "Claude saved this for Cara Lund". */
function wrote(by: Author, agent: string | null): string {
  if (agent) return by?.name || by?.you ? `${agent} saved this for ${by.you ? 'you' : by.name}` : `${agent} saved this`;
  return `${nameOf(by)} wrote this`;
}

/** Who wrote it and when, its sources, and what it said before: small, under the item it's about. */
function Details({ item, yourUpdate }: { item: ItemData; yourUpdate: boolean }) {
  const byPerson = item.by !== null && item.agent === null;
  // What it said before, newest first: its own earlier wording, then what it replaced.
  const earlier = [
    ...[...item.earlier].reverse().map((entry) => ({ text: entry.text, until: entry.until })),
    ...(item.replaced && !yourUpdate ? [{ text: item.replaced.text, until: item.replaced.until }] : []),
  ];
  return (
    <div className="flex cursor-auto flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        {wrote(item.by, item.agent)} on {dateOf(item.writtenAt)}.{byPerson && ' Assistants never rewrite it.'}
      </p>
      {item.sources.map((source) => (
        <figure key={source.id} className="flex flex-col gap-0.5">
          <figcaption className="text-muted-foreground">From {source.reference ?? 'a source'}</figcaption>
          <blockquote className="max-w-[60ch] text-base leading-relaxed whitespace-pre-line">“{source.excerpt}”</blockquote>
        </figure>
      ))}
      {item.sources.length === 0 && !byPerson && <p className="text-muted-foreground">No sources are kept for it.</p>}
      {earlier.map((entry, index) => (
        <p key={index} className="text-muted-foreground">
          Until {dateOf(entry.until)}, it said <span className="text-foreground">“{plain(entry.text)}”</span>
        </p>
      ))}
    </div>
  );
}
