import { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from 'cn';
import { Markdown } from '@/components/markdown';
import { OnlyYou } from '@/components/only-you';
import { ago, count, dateOf, focusRing, ScreenHeader, Section } from '@/components/screen';
import { Input } from '@/components/ui/input';
import { nameOf, type SourceData, type SourcesData, type SourceSummary } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';
import { Pager, pageSize, type PageFilters } from '@/screens/pages';

/**
 * What a space learned from: the sources it kept, newest first, searchable and fifty at a time.
 * Each says how many pages use it, and one that isn't on a page yet is still found by search.
 */
export function Sources({ space, data, filters, onFilters, now }: {
  space: SpaceData;
  data?: SourcesData;
  filters: PageFilters;
  onFilters: (next: PageFilters) => void;
  now?: Date;
}) {
  const [query, setQuery] = useState(filters.q);
  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => onFilters({ ...filters, q: query, from: 0 }), 250);
    return () => clearTimeout(timer);
  }, [query, filters, onFilters]);

  if (!data) return null;
  if (data.all === 0) {
    return (
      <p className="max-w-[65ch] text-base text-muted-foreground">
        No sources in {space.personal ? 'your personal space' : space.name} yet. When you or your assistant keep where something came from, such as an email or meeting notes, it shows up here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Input
        type="search"
        aria-label={`Search sources in ${space.name}`}
        placeholder={`Search ${count(data.all, 'source', 'sources')} in ${space.name}`}
        className="h-11 rounded-full border-0 bg-muted px-5 text-base sm:max-w-md"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {data.sources.length > 0 ? (
        <div className="flex flex-col gap-4">
          <Pager total={data.total} from={filters.from} onChange={(from) => onFilters({ ...filters, from })} noun={['source', 'sources']} />
          <ul className="-mx-3 flex flex-col gap-1">
            {data.sources.map((source) => <SourceRow key={source.id} source={source} space={space} now={now} />)}
          </ul>
          {data.total > pageSize && <Pager total={data.total} from={filters.from} onChange={(from) => { onFilters({ ...filters, from }); scrollTo({ top: 0 }); }} noun={['source', 'sources']} />}
        </div>
      ) : (
        <p className="text-base text-muted-foreground">No sources in {space.name} say “{filters.q.trim()}”.</p>
      )}
    </div>
  );
}

function SourceRow({ source, space, now }: { source: SourceSummary; space: SpaceData; now?: Date }) {
  const used = source.pages === 0 ? 'not on a page yet' : `used on ${count(source.pages, 'page', 'pages')}`;
  return (
    <li>
      <Link href={`/sources/${source.id}`} className={cn('group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
            <span className="min-w-0 break-words">{source.reference ?? 'A source without a name'}</span>
            {source.onlyYou && !space.private && <OnlyYou />}
          </span>
          <span className="line-clamp-2 text-sm text-muted-foreground">“{source.excerpt.replace(/\s+/g, ' ').trim()}”</span>
          <span className="text-sm text-muted-foreground">Kept {ago(source.createdAt, now)}, {used}</span>
        </div>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/**
 * One source, in a view of its own, because it's evidence and not a page: what Homing kept of it
 * and the pages that rest on it. The original stays where it lives, opened through your own access.
 */
export function Source({ source }: { source: SourceData }) {
  const where = source.space.personal ? 'your personal space' : source.space.name;
  const kept = source.agent
    ? `${source.agent} kept it${source.by?.you ? ' for you' : source.by?.name ? ` for ${source.by.name}` : ''}`
    : source.by ? `${nameOf(source.by)} kept it` : 'Homing kept it';
  const who = source.space.private || !source.shared ? 'Only you have it.' : `Everyone in ${source.space.name} has it.`;
  const original = /^https?:\/\/\S+$/i.test(source.reference ?? '') ? source.reference! : undefined;
  return (
    <>
      <ScreenHeader
        title={source.reference ?? 'A source without a name'}
        aside={!source.shared && !source.space.private && <OnlyYou />}
        meta={
          <>
            A source in{' '}
            <Link href={`/spaces/${source.space.id}/sources`} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
              {where}
            </Link>
            . {kept} on {dateOf(source.keptAt)}. {who}
          </>
        }
      />
      <Section title="What Homing kept of it" description="Only what may be kept. The rest stays where it came from." tone="raised" className="max-w-[44rem]">
        <blockquote className="max-w-[65ch] text-base leading-[1.65] whitespace-pre-line">{source.excerpt}</blockquote>
        {original && (
          <a href={original} target="_blank" rel="noopener noreferrer nofollow" className={cn('flex w-fit items-center gap-1.5 rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
            Open the original
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        )}
      </Section>
      <Section
        title={source.pages.length ? `Used on ${count(source.pages.length, 'page', 'pages')}` : 'Not on a page yet'}
        description={source.pages.length ? undefined : 'Search still finds it, and a page can be built from it when the subject comes up again.'}
        className="max-w-[44rem]"
      >
        {source.pages.length > 0 && (
          <ul className="flex flex-col gap-4">
            {source.pages.map((page) => (
              <li key={page.id} className="flex flex-col gap-2">
                <Link href={`/pages/${page.id}`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
                  {page.title}
                </Link>
                {page.items.map((item) => (
                  <div key={item.id} className={cn('flex flex-col gap-2 rounded-xl px-4 py-3', !item.shared && !source.space.private ? 'bg-private/25' : 'bg-muted')}>
                    {!item.shared && !source.space.private && <OnlyYou className="self-start" />}
                    <Markdown text={item.text} />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
