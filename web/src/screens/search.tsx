import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Search as SearchIcon } from 'lucide-react';
import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import { capitalize, count, focusRing, ScreenHeader } from '@/components/screen';
import { plain } from '@/lib/knowledge';
import { Link, navigate } from '@/lib/router';
import { placeName, type SearchData, type SearchKind } from '@/lib/search';
import { Pager, pageSize } from '@/screens/pages';

/** How many of each kind show when looking at everything. */
const glimpse = 5;

/** The most of one kind a search brings back. */
const cap = 200;

/** "12", or "200+" when there may be more. */
function amount(n: number): string {
  return n >= cap ? `${cap}+` : n.toLocaleString('en-US');
}

/**
 * Everything you can see that matches, the same results your assistant gets: what Homing knows,
 * the rules and skills assistants follow, the sources it learned from, and spaces. Search first,
 * then narrow it to one kind, fifty at a time.
 */
export function Search({ data, query, kind, from, onKind, onFrom }: {
  /** Undefined while the answer is on its way. */
  data?: SearchData;
  query: string;
  kind: SearchKind;
  from: number;
  onKind: (kind: SearchKind) => void;
  onFrom: (from: number) => void;
}) {
  const [typed, setTyped] = useState(query);
  useEffect(() => setTyped(query), [query]);
  const groups = data ? kinds(data) : [];
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  // Search brings back the best 200 of each kind, which is more than anyone looks through.
  const capped = groups.some((group) => group.count >= cap);
  const shown = kind === 'all' ? groups : groups.filter((group) => group.kind === kind);

  return (
    <>
      <ScreenHeader
        title="Search"
        meta={query
          ? data
            ? capped ? `The best matches for “${query}” in all your spaces.` : `${count(total, 'result', 'results')} for “${query}” in all your spaces.`
            : `Searching for “${query}”.`
          : 'In all your spaces, the same as your assistant would find.'}
      />
      <form
        role="search"
        className="relative max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim()) navigate(`/search?q=${encodeURIComponent(typed.trim())}`);
        }}
      >
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search Homing"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="People, projects, decisions"
          autoFocus={!query}
          className={cn('h-12 w-full rounded-full bg-card pr-4 pl-11 text-base outline-none placeholder:text-muted-foreground', focusRing)}
        />
      </form>

      {query && data && total > 0 && (
        <nav aria-label="Show" className="-mt-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1">
          {[{ kind: 'all' as const, label: 'Everything' }, ...groups.map((group) => ({ kind: group.kind, label: `${group.title} ${amount(group.count)}` }))].map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={kind === option.kind}
              onClick={() => onKind(option.kind)}
              className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground', focusRing, kind === option.kind && 'bg-card text-foreground')}
            >
              {option.label}
            </button>
          ))}
        </nav>
      )}

      {query && data && total === 0 && <p className="text-base text-muted-foreground">Nothing you can see matches “{query}”.</p>}

      {shown.map((group) => {
        const rows = kind === 'all' ? group.rows.slice(0, glimpse) : group.rows.slice(from, from + pageSize);
        return (
          <section key={group.kind} aria-labelledby={`results-${group.kind}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <h2 id={`results-${group.kind}`} className="text-lg leading-snug font-semibold">{group.title}</h2>
                {group.description && <p className="text-sm text-muted-foreground">{group.description}</p>}
              </div>
              {kind === 'all' && group.count > glimpse && (
                <button type="button" onClick={() => onKind(group.kind)} className={cn('rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
                  All {amount(group.count)}
                </button>
              )}
            </div>
            <ul className="-mx-3 flex flex-col gap-1">{rows}</ul>
            {kind !== 'all' && group.count > pageSize && <Pager total={group.count} from={from} onChange={onFrom} noun={['result', 'results']} />}
          </section>
        );
      })}
    </>
  );
}

/** The results as groups of rows, leaving out the kinds with nothing. */
function kinds(data: SearchData): { kind: Exclude<SearchKind, 'all'>; title: string; description?: string; count: number; rows: ReactNode[] }[] {
  return [
    {
      kind: 'pages' as const,
      title: 'Pages',
      description: 'What Homing knows',
      count: data.pages.length,
      rows: data.pages.map((page) => (
        <Row
          key={page.id}
          href={`/pages/${page.id}`}
          title={page.title}
          onlyYou={page.onlyYou && !page.space.private}
          text={page.text ? plain(page.text) : undefined}
          detail={[
            `${page.type ? capitalize(page.type) : 'A page'} in ${placeName(page.space)}`,
            page.superseded && 'What it says matched is no longer true',
            page.updatesShared && 'Your update, which others don’t see yet',
          ].filter(Boolean).join('. ')}
        />
      )),
    },
    {
      kind: 'sources' as const,
      title: 'Sources',
      description: 'Where Homing learned it, including what isn’t on a page yet',
      count: data.sources.length,
      rows: data.sources.map((source) => (
        <Row key={source.id} href={`/sources/${source.id}`} title={source.reference ?? 'A source without a name'} onlyYou={source.onlyYou && !source.space.private} text={`“${source.excerpt.replace(/\s+/g, ' ').trim()}”`} detail={`In ${placeName(source.space)}`} />
      )),
    },
    {
      kind: 'rules' as const,
      title: 'Rules',
      count: data.rules.length,
      rows: data.rules.map((rule) => (
        <Row
          key={rule.id}
          href={rule.space.id ? `/spaces/${rule.space.id}/rules` : undefined}
          title={rule.text}
          onlyYou={rule.onlyYou && !rule.space.private}
          detail={`${rule.kind === 'requirement' ? 'Requirement' : 'Preference'} in ${placeName(rule.space)}`}
        />
      )),
    },
    {
      kind: 'skills' as const,
      title: 'Skills',
      count: data.skills.length,
      rows: data.skills.map((skill) => (
        <Row key={skill.id} href={`/skills/${skill.id}`} title={skill.name} onlyYou={skill.onlyYou && !skill.space.private} detail={`In ${placeName(skill.space)}`} />
      )),
    },
    {
      kind: 'spaces' as const,
      title: 'Spaces',
      count: data.spaces.length,
      rows: data.spaces.map((space) => (
        <Row key={space.id} href={`/spaces/${space.id}`} title={space.name} detail={space.within ? `In ${space.within}` : 'At the top'} />
      )),
    },
  ].filter((group) => group.count > 0);
}

/** A result: what it is, a glimpse of what matched, and where it is. Without an address it's for reading only. */
function Row({ href, title, onlyYou, text, detail }: { href?: string; title: string; onlyYou?: boolean; text?: string; detail: string }) {
  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
        <span className="min-w-0 break-words">{title}</span>
        {onlyYou && <OnlyYou />}
      </span>
      {text && <span className="line-clamp-2 text-sm text-muted-foreground">{text}</span>}
      <span className="text-sm text-muted-foreground">{detail}</span>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cn('group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
          {body}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <div className="flex px-3 py-3">{body}</div>
      )}
    </li>
  );
}

