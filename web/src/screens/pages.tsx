import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import empty from '@/assets/illustrations/empty.png';
import { AudienceChoice, type Audience } from '@/components/audience';
import { OnlyYou } from '@/components/only-you';
import { ago, capitalize, count, focusRing, Section, wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { plain, type NewPage, type PageOrder, type PagesData, type PageSummary } from '@/lib/knowledge';
import { Link, navigate } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** What the list shows: a search, one type, an order, and where in the list. */
export interface PageFilters {
  q: string;
  type: string;
  sort?: PageOrder;
  from: number;
  /** Archived pages instead of the others. */
  archived?: boolean;
}

export const pageSize = 50;

/**
 * Everything a space knows, as pages, findable however many there are: a search within the space,
 * a filter for each type that exists, an order, and fifty at a time. New pages start here.
 */
export function Pages({ space, data, filters, onFilters, create, collections = false, now }: {
  space: SpaceData;
  /** Undefined while the first answer is on its way. */
  data?: PagesData;
  filters: PageFilters;
  onFilters: (next: PageFilters) => void;
  create?: NewPage;
  /** Only the pages that gather others. */
  collections?: boolean;
  now?: Date;
}) {
  const noun: [string, string] = collections ? ['collection', 'collections'] : ['page', 'pages'];
  const [query, setQuery] = useState(filters.q);
  const [creating, setCreating] = useState(false);
  const sent = useRef(filters.q);

  // The address can change the search too, such as going back, or opening the plain list.
  useEffect(() => {
    if (filters.q !== sent.current) setQuery(filters.q);
    sent.current = filters.q;
  }, [filters.q]);

  // Searching waits until typing pauses, and starts from the top.
  useEffect(() => {
    if (query === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = query;
      onFilters({ ...filters, q: query, sort: undefined, from: 0 });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, filters, onFilters]);

  if (!data) return null;
  const form = creating && create && <NewPageForm space={space} types={data.types.map((entry) => entry.type)} create={create} onCancel={() => setCreating(false)} />;
  if (data.all === 0 && collections) {
    return (
      <p className="max-w-[65ch] text-base text-muted-foreground">
        No collections in {space.personal ? 'your personal space' : space.name} yet. Any page can gather other pages, such as “2027 planning”: open it and choose Gather pages here. A page can be in several collections, and it stays where it is.
      </p>
    );
  }
  // Archived pages show on request: a way there below the list, and a way back above them.
  const where = space.personal ? 'your personal space' : space.name;
  const toArchived = !collections && !filters.archived && (data.archived ?? 0) > 0 && (
    <button type="button" onClick={() => onFilters({ q: '', type: '', from: 0, archived: true })} className={cn('self-start rounded-sm text-sm font-semibold text-primary-ink hover:underline', focusRing)}>
      Archived pages ({(data.archived ?? 0).toLocaleString('en-US')})
    </button>
  );
  const archivedNote = filters.archived && (
    <p className="text-sm text-muted-foreground">
      Archived pages in {where}, out of everyday context and still searchable.{' '}
      <button type="button" onClick={() => onFilters({ q: '', type: '', from: 0 })} className={cn('rounded-sm font-semibold text-primary-ink hover:underline', focusRing)}>
        Back to current pages
      </button>
    </p>
  );
  if (data.all === 0 && filters.archived) {
    return <div className="flex flex-col gap-4">{archivedNote}<p className="text-base text-muted-foreground">No archived pages in {where}.</p></div>;
  }
  if (data.all === 0) {
    // Every page archived isn't the same as nothing written yet.
    return (
      <div className="flex flex-col gap-4">
        {form || (toArchived ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-muted-foreground">Every page in {where} is archived.</p>
            {create && <Button variant="outline" size="lg" onClick={() => setCreating(true)}>New page</Button>}
          </div>
        ) : <EmptyKnowledge space={space} onWrite={create && (() => setCreating(true))} />)}
        {toArchived}
      </div>
    );
  }

  const searching = filters.q.trim() !== '';
  const sort = filters.sort ?? (searching ? 'match' : 'recent');
  const untyped = data.all - data.types.reduce((sum, entry) => sum + entry.count, 0);
  // A filter is only offered when it would leave something out.
  const typeChoices = data.types.length > 1 || (data.types.length === 1 && untyped > 0);

  return (
    <div className="flex flex-col gap-6">
      {form}
      {archivedNote}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            aria-label={`Search ${noun[1]} in ${space.name}`}
            placeholder={`Search ${count(data.all, ...noun)} in ${space.name}`}
            className="h-11 rounded-full border-0 bg-muted px-5 text-base sm:max-w-md"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {create && !creating && !collections && !filters.archived && <Button variant="outline" size="lg" className="sm:ml-auto" onClick={() => setCreating(true)}>New page</Button>}
        </div>
        {(typeChoices || data.all > 1) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {typeChoices && (
              <Choose
                label="Type"
                value={filters.type}
                onChange={(type) => onFilters({ ...filters, type, from: 0 })}
                options={[
                  { value: '', label: 'All types' },
                  ...data.types.map((entry) => ({ value: entry.type, label: `${capitalize(entry.type)} (${entry.count.toLocaleString('en-US')})` })),
                  // Kept while it's chosen, even when none of that type is left.
                  ...(filters.type && !data.types.some((entry) => entry.type === filters.type) ? [{ value: filters.type, label: capitalize(filters.type) }] : []),
                ]}
              />
            )}
            <Choose
              label="Sort"
              value={sort}
              onChange={(next) => onFilters({ ...filters, sort: next, from: 0 })}
              options={[
                ...(searching ? [{ value: 'match' as const, label: 'Best match' }] : []),
                { value: 'recent' as const, label: 'Recently updated' },
                { value: 'name' as const, label: 'Name' },
              ]}
            />
          </div>
        )}
      </div>

      {data.pages.length > 0 ? (
        <div className="flex flex-col gap-4">
          <Pager total={data.total} from={filters.from} onChange={(from) => onFilters({ ...filters, from })} noun={noun} />
          <PageRows pages={data.pages} space={space} now={now} />
          {data.total > pageSize && <Pager total={data.total} from={filters.from} onChange={(from) => { onFilters({ ...filters, from }); scrollTo({ top: 0 }); }} noun={noun} />}
          {toArchived}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-muted-foreground">
            {searching ? `No ${filters.archived ? 'archived ' : ''}${noun[1]} in ${space.name} match “${filters.q.trim()}”.` : `No ${noun[1]} in ${space.name} are of that type.`}
          </p>
          {toArchived}
        </div>
      )}
    </div>
  );
}

/** Pages in a list, each with a glimpse of what it says, what it is and when it changed. */
export function PageRows({ pages, space, now, aside }: { pages: PageSummary[]; space: Pick<SpaceData, 'private'>; now?: Date; aside?: (page: PageSummary) => ReactNode }) {
  return (
    <ul className="-mx-3 flex flex-col gap-1">
      {pages.map((page) => <PageRow key={page.id} page={page} space={space} now={now} aside={aside?.(page)} />)}
    </ul>
  );
}

function PageRow({ page, space, now, aside }: { page: PageSummary; space: Pick<SpaceData, 'private'>; now?: Date; aside?: ReactNode }) {
  const updated = `updated ${ago(page.updatedAt, now)}`;
  const kind = page.gathers > 0 ? `Collection of ${count(page.gathers, 'page', 'pages')}` : page.type && capitalize(page.type);
  return (
    <li className="group flex items-center gap-1 rounded-xl transition-colors hover:bg-muted">
      <Link href={`/pages/${page.id}`} className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3', focusRing)}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
            <span className="min-w-0 break-words">{page.title}</span>
            {(page.onlyYou || page.gatheredShared === false) && !space.private && <OnlyYou />}
          </span>
          {page.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{plain(page.excerpt)}</span>}
          <span className="text-sm text-muted-foreground">{kind ? `${kind}, ${updated}` : capitalize(updated)}{page.archived && '. Archived'}</span>
        </div>
        {!aside && <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
      </Link>
      {aside && <div className="shrink-0 pr-2">{aside}</div>}
    </li>
  );
}

/** "Showing 51–100 of 1,240 pages", with the way to the fifty before and after. Just how many when everything fits. */
export function Pager({ total, from, onChange, noun = ['page', 'pages'] }: { total: number; from: number; onChange: (from: number) => void; noun?: [string, string] }) {
  const first = Math.min(from, Math.max(0, total - 1));
  const last = Math.min(total, first + pageSize);
  if (total <= pageSize) return <p className="text-sm text-muted-foreground">{count(total, ...noun)}</p>;
  return (
    <nav aria-label="Pages of the list" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {(first + 1).toLocaleString('en-US')}–{last.toLocaleString('en-US')} of {count(total, ...noun)}
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={first === 0} onClick={() => onChange(Math.max(0, first - pageSize))} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-medium disabled:opacity-40', focusRing)}>
          Previous
        </button>
        <button type="button" disabled={last >= total} onClick={() => onChange(first + pageSize)} className={cn('rounded-full bg-secondary px-4 py-2 text-sm font-medium disabled:opacity-40', focusRing)}>
          Next
        </button>
      </div>
    </nav>
  );
}

/** A short choice from a list, such as how to sort. */
function Choose<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={cn('h-10 rounded-full bg-muted pr-8 pl-4 text-sm font-medium text-foreground', focusRing)}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function EmptyKnowledge({ space, onWrite }: { space: SpaceData; onWrite?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted px-6 pt-4 pb-8 text-center">
      <img src={empty} alt="" width={960} height={640} className="w-56" />
      <p className="text-lg font-semibold">Nothing in {space.personal ? 'your personal space' : space.name} yet</p>
      <p className="max-w-sm text-base text-muted-foreground">What you and your assistant save here shows up as pages.</p>
      {onWrite && <Button size="lg" className="mt-3" onClick={onWrite}>New page</Button>}
    </div>
  );
}

/** A new page: what it's about, what kind of page it is if that helps, and who sees it. */
function NewPageForm({ space, types, create, onCancel }: { space: SpaceData; types: string[]; create: NewPage; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const shared = !space.private && audience === 'space';

  const save = async () => {
    setBusy(true);
    const answer = await create({ title: title.trim(), type: type.trim(), shared });
    setBusy(false);
    if ('problem' in answer) setProblem({ message: answer.problem });
    else navigate(`/pages/${answer.id}`);
  };

  return (
    <Section title="New page" tone="raised">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-page-title" className="text-base">What is it about?</Label>
        <Input id="new-page-title" className="h-11 text-base" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A person, a project, a decision" autoFocus disabled={busy} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-page-type" className="text-base">What kind of page <span className="font-normal text-muted-foreground">(if it helps)</span></Label>
        <Input id="new-page-type" list="new-page-types" className="h-11 text-base sm:max-w-xs" value={type} onChange={(event) => setType(event.target.value)} placeholder="person, meeting, decision" disabled={busy} />
        <datalist id="new-page-types">{types.map((option) => <option key={option} value={option} />)}</datalist>
      </div>
      {!space.private && <AudienceChoice space={space.name} people={space.members.length} above={space.reachedFromAbove} value={audience} onChange={setAudience} disabled={busy} surface="muted" />}
      {problem && <FieldError>{problem.message}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:justify-end">
        <Button variant="outline" size="lg" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button size="lg" className={cn(wrapsLabel, 'min-h-10')} disabled={busy || !title.trim()} onClick={save}>{shared ? `Share with ${space.name}` : 'Save for you'}</Button>
      </div>
    </Section>
  );
}
