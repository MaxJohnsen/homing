import { useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';
import { AudienceChoice, type Audience } from '@/components/audience';
import { Markdown } from '@/components/markdown';
import { OnlyYou } from '@/components/only-you';
import { ago, capitalize, dateOf, focusRing, ScreenHeader } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { nameOf, plain, type Author, type ItemData, type PageActions, type PageData, type PagesData } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import { AboutPage, CollectionPages } from '@/screens/collection';

/** Long pages can be searched within, from this many items. */
const findFrom = 12;

/**
 * A page as the person sees it: what's known first, read like a page, with what's only theirs
 * marked where it stands. Who wrote each item, its sources and what it said before open on it
 * when asked, and the person adds to it and corrects it here.
 */
export function Page({ page, actions, gathered, gatheredFrom = 0, onGatheredFrom = () => {}, now }: {
  page: PageData;
  actions?: PageActions;
  /** The pages it gathers, fifty at a time from gatheredFrom, when it's a collection. */
  gathered?: PagesData;
  gatheredFrom?: number;
  onGatheredFrom?: (from: number) => void;
  now?: Date;
}) {
  const [find, setFind] = useState('');
  const [picking, setPicking] = useState(false);
  const collection = page.gathers > 0 || picking;
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? page.items.filter((item) => words.every((word) => plain(item.text).toLowerCase().includes(word))) : page.items;
  const onlyYou = !page.space.private && !page.shared;

  return (
    <>
      <ScreenHeader title={page.title} aside={onlyYou && <OnlyYou />} meta={<About page={page} now={now} />} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,44rem)_15rem] lg:justify-between">
        <div className="flex min-w-0 flex-col gap-6">
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
            !collection && <p className="text-base text-muted-foreground">Nothing on this page yet.</p>
          ) : (
            <article aria-label={page.title} className="flex flex-col gap-1">
              {shown.map((item) => <Item key={item.id} item={item} page={page} marked={!onlyYou} actions={actions} />)}
              {shown.length === 0 && <p className="text-base text-muted-foreground">Nothing on this page says “{find.trim()}”.</p>}
            </article>
          )}
          {actions && (
            <AddToPage
              page={page}
              add={actions.add}
              initiallyOpen={page.items.length === 0 && !collection}
              beside={!collection && <Button variant="ghost" size="lg" onClick={() => setPicking(true)}>Gather pages here</Button>}
            />
          )}
          {collection && <CollectionPages page={page} gathered={gathered} from={gatheredFrom} onFrom={onGatheredFrom} actions={actions} picking={picking} onPicking={setPicking} />}
        </div>
        <AboutPage page={page} actions={actions} />
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
      {page.space.private || !page.shared
        ? 'Only you see it.'
        : `Everyone in ${page.space.name} sees it${mine ? `, except ${mine === 1 ? 'one item' : `${mine} items`} only you see` : ''}.`}
    </>
  );
}

/** One item. What only you see is marked, unless the whole page is, which its title already says. */
function Item({ item, page, marked, actions }: { item: ItemData; page: PageData; marked: boolean; actions?: PageActions }) {
  const [open, setOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const onlyYou = marked && !item.shared && !page.space.private;
  // Your private update to something shared: you see yours, everyone else still sees what it replaced.
  const yourUpdate = !item.shared && item.replaced?.shared === true;

  const toggle = (event: MouseEvent) => {
    // Links inside do their own thing, and selecting text shouldn't open the details.
    if ((event.target as HTMLElement).closest('a, button, input') || window.getSelection()?.toString()) return;
    setOpen(!open);
  };

  if (correcting && actions) {
    return (
      <div className={cn('-mx-2 flex flex-col gap-3 rounded-xl px-2 py-3 sm:-mx-4 sm:px-4', onlyYou ? 'bg-private/25' : 'bg-muted')}>
        <Correct item={item} page={page} correct={actions.correct} onDone={() => setCorrecting(false)} />
      </div>
    );
  }

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
      {open && <Details item={item} yourUpdate={yourUpdate} onCorrect={actions && (() => setCorrecting(true))} />}
    </div>
  );
}

/** "You wrote this", "Claude saved this for Cara Lund". */
function wrote(by: Author, agent: string | null): string {
  if (agent) return by?.name || by?.you ? `${agent} saved this for ${by.you ? 'you' : by.name}` : `${agent} saved this`;
  return `${nameOf(by)} wrote this`;
}

/** Who wrote it and when, its sources, and what it said before: small, under the item it's about. */
function Details({ item, yourUpdate, onCorrect }: { item: ItemData; yourUpdate: boolean; onCorrect?: () => void }) {
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
      {item.sharedBy && item.sharedAt && <p className="text-muted-foreground">{nameOf(item.sharedBy)} shared it with everyone here on {dateOf(item.sharedAt)}.</p>}
      {item.sources.map((source) => (
        <figure key={source.id} className="flex flex-col gap-0.5">
          <figcaption className="text-muted-foreground">
            From{' '}
            <Link href={`/sources/${source.id}`} className={cn('rounded-sm font-semibold text-foreground underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground', focusRing)}>
              {source.reference ?? 'a source'}
            </Link>
            {item.shared && source.shared === false && <OnlyYou className="ml-2" />}
          </figcaption>
          <blockquote className="max-w-[60ch] text-base leading-relaxed whitespace-pre-line">“{source.excerpt}”</blockquote>
        </figure>
      ))}
      {item.sources.length === 0 && !byPerson && !item.sharedBy && <p className="text-muted-foreground">No sources are kept for it.</p>}
      {earlier.map((entry, index) => (
        <p key={index} className="text-muted-foreground">
          Until {dateOf(entry.until)}, it said <span className="text-foreground">“{plain(entry.text)}”</span>
        </p>
      ))}
      {onCorrect && (
        <div>
          <Button variant="outline" size="sm" onClick={onCorrect}>Correct it</Button>
        </div>
      )}
    </div>
  );
}

/**
 * Correcting an item. Your own is corrected where it is. A shared one is corrected for everyone,
 * or replaced by your own version that only you see, and nothing written is ever lost: what it
 * said before stays in its history.
 */
function Correct({ item, page, correct, onDone }: { item: ItemData; page: PageData; correct: PageActions['correct']; onDone: () => void }) {
  const [text, setText] = useState(item.text);
  // New writing starts as only yours.
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const shared = item.shared && !page.space.private;
  const forEveryone = shared && audience === 'space';

  const save = async () => {
    setBusy(true);
    const answer = await correct(item.id, text.trim(), forEveryone);
    setBusy(false);
    if (answer) setProblem(answer);
    else onDone();
  };

  return (
    <div className="flex flex-col gap-3">
      {!item.shared && !page.space.private && <OnlyYou className="self-start" />}
      <Textarea aria-label="What it should say" value={text} onChange={(event) => setText(event.target.value)} rows={Math.min(12, Math.max(3, text.split('\n').length + 1))} className="bg-card text-base" autoFocus disabled={busy} />
      {shared && <AudienceChoice space={page.space.name} people={page.space.people} above={page.space.above} value={audience} onChange={setAudience} disabled={busy} />}
      <p className="text-sm text-muted-foreground">
        {forEveryone
          ? 'Everyone sees your correction. What it said before stays in its history, and assistants won’t rewrite what you wrote.'
          : shared
            ? `Your version takes its place for you. Others in ${page.space.name} still see what it says now.`
            : 'What it said before stays in its history, and assistants won’t rewrite what you wrote.'}
      </p>
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button size="lg" disabled={busy || !text.trim() || text.trim() === item.text} onClick={save}>
          {forEveryone ? `Correct it for ${page.space.name}` : shared ? 'Save your version' : 'Save for you'}
        </Button>
      </div>
    </div>
  );
}

/** Adding to the page, saying who will see it before it's saved. */
function AddToPage({ page, add, initiallyOpen, beside }: { page: PageData; add: PageActions['add']; initiallyOpen: boolean; beside?: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // On a page only you see, everything on it is yours too.
  const choice = page.shared && !page.space.private;
  const shared = choice && audience === 'space';

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={() => setOpen(true)}>Add to this page</Button>
        {beside}
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    const answer = await add(text.trim(), shared);
    setBusy(false);
    if (answer) return setProblem(answer);
    // The next thing written starts as only yours again.
    setText('');
    setAudience('you');
    setProblem(undefined);
    setOpen(false);
  };

  return (
    <section aria-label="Add to this page" className="flex flex-col gap-4 rounded-2xl bg-muted p-4 sm:p-5">
      <Textarea
        aria-label="What to add"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="bg-card text-base"
        placeholder="Write what you know. One fact or decision at a time keeps each easy to update."
        autoFocus={!initiallyOpen}
        disabled={busy}
      />
      {choice && <AudienceChoice space={page.space.name} people={page.space.people} above={page.space.above} value={audience} onChange={setAudience} disabled={busy} />}
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* A new page can start as a collection instead. */}
        {initiallyOpen && beside && <div className="sm:mr-auto">{beside}</div>}
        {!initiallyOpen && <Button variant="outline" size="lg" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>}
        <Button size="lg" disabled={busy || !text.trim()} onClick={save}>{shared ? `Share with ${page.space.name}` : 'Save for you'}</Button>
      </div>
    </section>
  );
}
