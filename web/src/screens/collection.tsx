import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';
import { AudienceChoice, type Audience } from '@/components/audience';
import { OnlyYou } from '@/components/only-you';
import { capitalize, count, dateOf, focusRing, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { PageActions, PageData, PagesData, PageSummary } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import { PageRows, Pager } from '@/screens/pages';

/**
 * The pages a collection gathers, after its own knowledge, fifty at a time. Being mentioned on a
 * page doesn't put a page here; adding it does. Taking one out says what happens before it does.
 */
export function CollectionPages({ page, gathered, from, onFrom, actions, picking, onPicking }: {
  page: PageData;
  gathered?: PagesData;
  from: number;
  onFrom: (from: number) => void;
  actions?: PageActions;
  picking: boolean;
  onPicking: (picking: boolean) => void;
}) {
  const [removing, setRemoving] = useState<PageSummary>();
  const [problem, setProblem] = useState<string>();
  const total = gathered?.total ?? page.gathers;

  const remove = async (target: PageSummary) => {
    const answer = await actions!.ungather(target.id, target.gatheredShared === true);
    setProblem(answer);
    setRemoving(undefined);
  };

  return (
    <Section
      title="Pages in this collection"
      description={total > 0 ? `${count(total, 'page', 'pages')}. They stay where they are, and can be in other collections too.` : 'Add the pages it gathers. They stay where they are, and can be in other collections too.'}
    >
      {actions && !picking && (
        <div>
          <Button variant="outline" onClick={() => onPicking(true)}>Add pages</Button>
        </div>
      )}
      {actions && picking && <Picker page={page} actions={actions} onDone={() => onPicking(false)} />}
      {problem && <FieldError>{problem}</FieldError>}
      {gathered && gathered.pages.length > 0 && (
        <div className="flex flex-col gap-3">
          <PageRows
            pages={gathered.pages}
            space={page.space}
            aside={actions && ((gatheredPage) => (
              <Button variant="ghost" size="sm" onClick={() => setRemoving(gatheredPage)} aria-label={`Take ${gatheredPage.title} out of this collection`}>
                Take out
              </Button>
            ))}
          />
          {removing && (
            <div role="alertdialog" aria-label="Take it out of the collection?" className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="font-semibold">Take {removing.title} out?</span>{' '}
                {removing.gatheredShared ? `Nobody in ${page.space.name} sees it here any more.` : 'Only you had it here.'} The page itself stays.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setRemoving(undefined)}>Keep it</Button>
                <Button variant="destructive" size="sm" onClick={() => remove(removing)}>Take it out</Button>
              </div>
            </div>
          )}
          {total > 50 && <Pager total={total} from={from} onChange={onFrom} />}
        </div>
      )}
    </Section>
  );
}

/** Finding pages in the space to put in the collection, saying who will see each one there. */
function Picker({ page, actions, onDone }: { page: PageData; actions: PageActions; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PageSummary[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  // A shared gathering joins two shared pages, so a page only you see stays only yours here.
  const choice = page.shared && !page.space.private;
  const shared = choice && audience === 'space';

  useEffect(() => {
    const words = query.trim();
    if (!words) return setFound([]);
    const timer = setTimeout(async () => setFound((await actions.find(words)).filter((candidate) => candidate.id !== page.id).slice(0, 8)), 200);
    return () => clearTimeout(timer);
  }, [query, actions, page.id]);

  const add = async (candidate: PageSummary) => {
    const answer = await actions.gather(candidate.id, shared && !candidate.onlyYou);
    setProblem(answer);
    if (!answer) setAdded(new Set([...added, candidate.id]));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          aria-label={`Find pages in ${page.space.name} to add`}
          placeholder={`Find pages in ${page.space.personal ? 'your personal space' : page.space.name} to add`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 flex-1 bg-card text-base"
          autoFocus
        />
        <Button variant="ghost" size="icon" aria-label="Done adding pages" onClick={onDone}><X /></Button>
      </div>
      {choice && <AudienceChoice space={page.space.name} people={page.space.people} above={page.space.above} value={audience} onChange={setAudience} />}
      {problem && <FieldError>{problem}</FieldError>}
      {found.length > 0 && (
        <ul className="flex flex-col gap-1">
          {found.map((candidate) => (
            <li key={candidate.id} className="flex items-center gap-3 rounded-lg bg-card px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                  <span className="truncate">{candidate.title}</span>
                  {candidate.onlyYou && !page.space.private && <OnlyYou />}
                </span>
                {candidate.type && <span className="text-sm text-muted-foreground">{capitalize(candidate.type)}</span>}
              </span>
              {added.has(candidate.id)
                ? <span className="text-sm text-muted-foreground">Added</span>
                : <Button variant="outline" size="sm" onClick={() => add(candidate)}>{shared && candidate.onlyYou ? 'Add for you' : 'Add'}</Button>}
            </li>
          ))}
        </ul>
      )}
      {query.trim() && found.length === 0 && <p className="text-sm text-muted-foreground">No pages by that name.</p>}
    </div>
  );
}

/** Beside the page, what the text doesn't already say: the collections it's in, and the pages that mention it. */
export function AboutPage({ page, actions }: { page: PageData; actions?: PageActions }) {
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<PageData['collections'][number]>();
  const [problem, setProblem] = useState<string>();

  const leave = async (collection: PageData['collections'][number]) => {
    setProblem(await actions!.leave(collection.id, collection.shared));
    setLeaving(undefined);
  };

  return (
    <aside aria-label="Where this page belongs" className="flex flex-col gap-7 lg:sticky lg:top-10 lg:self-start">
      <Part title="In collections">
        {page.collections.length > 0 ? (
          <ul className="-mx-2 flex flex-col">
            {page.collections.map((collection) => (
              <li key={collection.id} className="group flex items-center gap-1">
                <Link href={`/pages/${collection.id}`} className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-base leading-snug font-semibold hover:bg-muted', focusRing)}>
                  <span className="min-w-0 break-words">{collection.title}</span>
                  {!collection.shared && !page.space.private && <OnlyYou />}
                </Link>
                {actions && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Take it out of ${collection.title}`} className="shrink-0 text-muted-foreground" onClick={() => setLeaving(collection)}>
                    <X />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        {leaving && (
          <div role="alertdialog" aria-label="Take it out of the collection?" className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm">
            <p>
              <span className="font-semibold">Take it out of {leaving.title}?</span>{' '}
              {leaving.shared ? `Nobody in ${page.space.name} sees it there any more.` : 'Only you had it there.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setLeaving(undefined)}>Keep it</Button>
              <Button variant="destructive" size="sm" onClick={() => leave(leaving)}>Take it out</Button>
            </div>
          </div>
        )}
        {problem && <FieldError>{problem}</FieldError>}
        {actions && (adding
          ? <JoinCollection page={page} actions={actions} onDone={() => setAdding(false)} />
          : (
            <button type="button" onClick={() => setAdding(true)} className={cn('self-start rounded-sm text-sm font-semibold text-primary-ink hover:underline', focusRing)}>
              {page.collections.length ? 'Add to another collection' : 'Add to a collection'}
            </button>
          ))}
      </Part>
      {page.mentionedOn.length > 0 && (
        <Part title="Mentioned on">
          <ul className="-mx-2 flex flex-col">
            {page.mentionedOn.map((other) => (
              <li key={other.id}>
                <Link href={`/pages/${other.id}`} className={cn('flex rounded-lg px-2 py-1.5 text-base leading-snug font-semibold hover:bg-muted', focusRing)}>
                  {other.title}
                </Link>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {actions?.archive && <ArchivePage page={page} archive={actions.archive} />}
    </aside>
  );
}

/**
 * Archiving a page that's no longer active (spec §3), for everyone who sees it: it leaves everyday
 * context and the list of pages, and stays searchable. Nothing is deleted, and it can be reopened.
 */
function ArchivePage({ page, archive }: { page: PageData; archive: NonNullable<PageActions['archive']> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const run = async (archived: boolean) => {
    setBusy(true);
    const answer = await archive(archived);
    setBusy(false);
    setProblem(answer);
    if (!answer) setAsking(false);
  };
  const everyone = page.shared && !page.space.private;

  if (page.archived) {
    const by = page.archived.by?.you ? ' by you' : page.archived.by?.name ? ` by ${page.archived.by.name}` : '';
    return (
      <Part title="Archived">
        <p className="text-sm text-muted-foreground">On {dateOf(page.archived.at)}{by}. It’s out of everyday context, and still searchable.</p>
        <Button variant="outline" size="sm" className="self-start" disabled={busy} onClick={() => run(false)}>Reopen</Button>
        {problem && <FieldError>{problem}</FieldError>}
      </Part>
    );
  }
  return (
    <Part title="No longer active?">
      {asking ? (
        <div role="alertdialog" aria-label="Archive this page?" className="flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm">
          <p>
            <span className="font-semibold">Archive {page.title}?</span>{' '}
            It leaves everyday context{everyone ? ` for everyone in ${page.space.name}` : ''}, and stays searchable. Nothing is deleted.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setAsking(false)} autoFocus>Keep it</Button>
            <Button size="sm" disabled={busy} onClick={() => run(true)}>Archive</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={cn('self-start rounded-sm text-sm font-semibold text-primary-ink hover:underline', focusRing)}>
          Archive this page
        </button>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </Part>
  );
}

/** Choosing a collection in the space to put this page in, and who sees it there. */
function JoinCollection({ page, actions, onDone }: { page: PageData; actions: PageActions; onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PageSummary[]>();
  const [everyone, setEveryone] = useState(false);
  const [problem, setProblem] = useState<string>();
  const choice = page.shared && !page.space.private;

  useEffect(() => {
    const timer = setTimeout(async () => setFound((await actions.find(query.trim(), true)).filter((candidate) => candidate.id !== page.id && !page.collections.some((c) => c.id === candidate.id)).slice(0, 8)), 200);
    return () => clearTimeout(timer);
  }, [query, actions, page.id, page.collections]);

  const join = async (collection: PageSummary) => {
    const answer = await actions.join(collection.id, choice && everyone && !collection.onlyYou);
    if (answer) setProblem(answer);
    else onDone();
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
      <Input type="search" aria-label="Find a collection" placeholder="Find a collection" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 bg-card text-base" autoFocus />
      {choice && (
        <div role="radiogroup" aria-label="Who sees it there" className="inline-flex w-fit gap-1 rounded-full bg-secondary p-1">
          {([[false, 'Only you'], [true, `Everyone in ${page.space.name}`]] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={everyone === value}
              onClick={() => setEveryone(value)}
              className={cn('rounded-full px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground', focusRing, everyone === value && 'bg-card text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
      {found && (found.length > 0 ? (
        <ul className="-mx-1 flex flex-col">
          {found.map((collection) => (
            <li key={collection.id}>
              <button type="button" onClick={() => join(collection)} className={cn('w-full rounded-lg px-2 py-1.5 text-left text-base hover:bg-card', focusRing)}>
                Add to <span className="font-semibold">{collection.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{query.trim() ? 'No collection by that name.' : `No other collections in ${page.space.personal ? 'your personal space' : page.space.name} yet.`}</p>
      ))}
      <button type="button" onClick={onDone} className={cn('self-start rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground', focusRing)}>Cancel</button>
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
