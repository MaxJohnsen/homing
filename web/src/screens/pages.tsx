import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import empty from '@/assets/illustrations/empty.png';
import { OnlyYou } from '@/components/only-you';
import { ago, capitalize, count, focusRing } from '@/components/screen';
import { Input } from '@/components/ui/input';
import { plain, type PageOrder, type PagesData, type PageSummary } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** What the list shows: a search, one type, an order, and where in the list. */
export interface PageFilters {
  q: string;
  type: string;
  sort?: PageOrder;
  from: number;
}

export const pageSize = 50;

/**
 * Everything a space knows, as pages, findable however many there are: a search within the space,
 * a filter for each type that exists, an order, and fifty at a time.
 */
export function Pages({ space, data, filters, onFilters, now }: {
  space: SpaceData;
  /** Undefined while the first answer is on its way. */
  data?: PagesData;
  filters: PageFilters;
  onFilters: (next: PageFilters) => void;
  now?: Date;
}) {
  const [query, setQuery] = useState(filters.q);

  // Searching waits until typing pauses, and starts from the top.
  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => onFilters({ ...filters, q: query, sort: undefined, from: 0 }), 250);
    return () => clearTimeout(timer);
  }, [query, filters, onFilters]);

  if (!data) return null;
  if (data.all === 0) return <EmptyKnowledge space={space} />;

  const searching = filters.q.trim() !== '';
  const sort = filters.sort ?? (searching ? 'match' : 'recent');
  const untyped = data.all - data.types.reduce((sum, entry) => sum + entry.count, 0);
  // A filter is only offered when it would leave something out.
  const typeChoices = data.types.length > 1 || (data.types.length === 1 && untyped > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          aria-label={`Search pages in ${space.name}`}
          placeholder={`Search ${count(data.all, 'page', 'pages')} in ${space.name}`}
          className="h-11 rounded-full border-0 bg-muted px-5 text-base sm:max-w-md"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
          <Pager total={data.total} from={filters.from} onChange={(from) => onFilters({ ...filters, from })} />
          <ul className="-mx-3 flex flex-col gap-1">
            {data.pages.map((page) => <PageRow key={page.id} page={page} space={space} now={now} />)}
          </ul>
          {data.total > pageSize && <Pager total={data.total} from={filters.from} onChange={(from) => { onFilters({ ...filters, from }); scrollTo({ top: 0 }); }} />}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">
          {searching ? `No pages in ${space.name} match “${filters.q.trim()}”.` : `No pages in ${space.name} are of that type.`}
        </p>
      )}
    </div>
  );
}

function PageRow({ page, space, now }: { page: PageSummary; space: SpaceData; now?: Date }) {
  const updated = `updated ${ago(page.updatedAt, now)}`;
  return (
    <li>
      <Link href={`/pages/${page.id}`} className={cn('group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
            <span className="min-w-0 break-words">{page.title}</span>
            {page.onlyYou && !space.private && <OnlyYou />}
          </span>
          {page.excerpt && <span className="line-clamp-2 text-sm text-muted-foreground">{plain(page.excerpt)}</span>}
          <span className="text-sm text-muted-foreground">{page.type ? `${capitalize(page.type)}, ${updated}` : capitalize(updated)}</span>
        </div>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** "Showing 51–100 of 1,240 pages", with the way to the pages before and after. Nothing when everything fits. */
function Pager({ total, from, onChange }: { total: number; from: number; onChange: (from: number) => void }) {
  const first = Math.min(from, Math.max(0, total - 1));
  const last = Math.min(total, first + pageSize);
  if (total <= pageSize) return <p className="text-sm text-muted-foreground">{count(total, 'page', 'pages')}</p>;
  return (
    <nav aria-label="Pages of the list" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {(first + 1).toLocaleString('en-US')}–{last.toLocaleString('en-US')} of {count(total, 'page', 'pages')}
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

function EmptyKnowledge({ space }: { space: SpaceData }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted px-6 pt-4 pb-8 text-center">
      <img src={empty} alt="" width={960} height={640} className="w-56" />
      <p className="text-lg font-semibold">Nothing in {space.personal ? 'your personal space' : space.name} yet</p>
      <p className="max-w-sm text-base text-muted-foreground">What you and your assistant save here shows up as pages.</p>
    </div>
  );
}
