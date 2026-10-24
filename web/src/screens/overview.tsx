import { useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from 'cn';
import { AudienceChoice, type Audience } from '@/components/audience';
import { EarlierVersions } from '@/components/history';
import { Markdown } from '@/components/markdown';
import { OnlyYou } from '@/components/only-you';
import { count, dateOf, focusRing, Section, wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { nameIn, nameOf, plain, theirAssistant, type OverviewData, type WriteOverview } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';
import { PageRows } from '@/screens/pages';

/**
 * A space at a glance: what someone wrote about where it stands, if anyone has, and the map Homing
 * keeps by itself beside it: what's active, its collections and decisions, what waits here, and
 * the spaces inside it. It works without a written overview.
 */
export function Overview({ space, data, write, now }: { space: SpaceData; data: OverviewData; write?: WriteOverview; now?: Date }) {
  // Writing it, from what it says now, or one of them from an earlier version being restored.
  const [editing, setEditing] = useState<{ from?: string; item?: OverviewData['overview'][number] } | false>(false);
  // The overview whose earlier versions are open.
  const [history, setHistory] = useState<string>();
  const where = space.personal ? 'your personal space' : space.name;
  const shared = data.overview.find((item) => item.shared);
  const mine = data.overview.find((item) => !item.shared);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,44rem)_15rem] lg:justify-between">
      <div className="flex min-w-0 flex-col gap-10">
        {/* On a phone the column beside comes last, so what waits for you comes first here instead. */}
        {data.waiting.length > 0 && <div className="lg:hidden"><WaitingHere waiting={data.waiting} /></div>}
        <section aria-label={`Where ${where} stands`} className="flex flex-col gap-3">
          {editing && write ? (
            <OverviewEditor space={space} current={editing.item ?? mine ?? shared} restoring={editing.item} from={editing.from} hasShared={Boolean(shared)} write={write} onDone={() => setEditing(false)} />
          ) : data.overview.length > 0 ? (
            <>
              {data.overview.map((item) => (
                <div key={item.id} className={cn('flex flex-col gap-3 rounded-2xl p-5 sm:p-6', !item.shared && !space.private ? 'bg-private/25' : 'bg-card')}>
                  {!item.shared && !space.private && <OnlyYou className="self-start" />}
                  <Markdown text={item.text} />
                  {item.replacesShared && (
                    <p className="rounded-lg bg-card px-4 py-3 text-sm">
                      <span className="font-semibold">Your own overview.</span> Others in {space.name} still see “{plain(item.replacesShared)}”
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {item.agent
                      ? `${item.agent} wrote it${nameIn(item.by) ? ` for ${nameIn(item.by)}` : ''}, ${dateOf(item.writtenAt)}.`
                      : item.editAgent
                        ? `${nameOf(item.by)} wrote it, and ${theirAssistant(item.by, item.editAgent)} changed it on ${dateOf(item.writtenAt)}.`
                        : `${nameOf(item.by)} wrote it, ${dateOf(item.writtenAt)}.`}
                  </p>
                  {(item.earlier?.length ?? 0) > 0 && (
                    <div className="flex flex-col items-start gap-3 text-sm">
                      <Button variant="outline" size="sm" aria-expanded={history === item.id} onClick={() => setHistory(history === item.id ? undefined : item.id)}>
                        {history === item.id ? 'Hide earlier versions' : 'Earlier versions'}
                      </Button>
                      {history === item.id && (
                        <EarlierVersions current={item} earlier={item.earlier!} onRestore={write && ((text) => setEditing({ from: text, item }))} />
                      )}
                    </div>
                  )}
                </div>
              ))}
              {write && <div><Button variant="outline" onClick={() => setEditing({})}>Edit the overview</Button></div>}
            </>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-5 sm:p-6">
              <p className="text-base">No overview yet. A few lines on where {where} stands help whoever opens it next.</p>
              {write && <Button variant="outline" onClick={() => setEditing({})}>Write an overview</Button>}
            </div>
          )}
        </section>

        <Section title="Active pages" description={data.pages > 0 ? 'Changed most recently.' : undefined}>
          {data.active.length > 0 ? (
            <>
              <PageRows pages={data.active} space={space} now={now} />
              {data.pages > data.active.length && <More href={`/spaces/${space.id}/pages`}>All {count(data.pages, 'page', 'pages')}</More>}
            </>
          ) : (
            <p className="text-base text-muted-foreground">
              No pages yet. What you and your assistant save shows up here. <Link href={`/spaces/${space.id}/pages`} className={cn('rounded-sm font-semibold text-primary-ink hover:underline', focusRing)}>Write a page</Link>
            </p>
          )}
        </Section>

        {data.collections.length > 0 && (
          <Section title="Collections">
            <PageRows pages={data.collections} space={space} now={now} />
            <More href={`/spaces/${space.id}/collections`}>All collections</More>
          </Section>
        )}

        {data.decisions.length > 0 && (
          <Section title="Recent decisions">
            <PageRows pages={data.decisions} space={space} now={now} />
            <More href={`/spaces/${space.id}/pages?type=decision`}>All decisions</More>
          </Section>
        )}
      </div>

      <aside aria-label={`Beside ${where}`} className="flex flex-col gap-7 lg:sticky lg:top-10 lg:self-start">
        {data.waiting.length > 0 && <div className="hidden lg:block"><WaitingHere waiting={data.waiting} /></div>}
        {(data.spaces.length > 0 || (space.admin && !space.archive)) && (
          <Part title="Spaces inside">
            <ul className="-mx-2 flex flex-col empty:hidden">
              {data.spaces.map((inside) => (
                <li key={inside.id}>
                  <Link href={`/spaces/${inside.id}`} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-base leading-snug font-semibold hover:bg-muted', inside.archived && 'text-muted-foreground', focusRing)}>
                    <span className="min-w-0 break-words">{inside.name}</span>
                    {inside.archived && <span className="shrink-0 text-sm font-normal">Archived</span>}
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            {space.admin && !space.archive && (
              <Link href={`/spaces/new?in=${space.id}`} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 text-base text-muted-foreground hover:bg-muted hover:text-foreground', focusRing)}>
                <Plus aria-hidden="true" className="size-4" />
                New space in {space.personal ? 'your personal space' : space.name}
              </Link>
            )}
          </Part>
        )}
      </aside>
    </div>
  );
}

/**
 * Writing the overview. The shared one is corrected for everyone, or replaced by your own, which
 * only you see; new writing starts as only yours, and the button names who will see it. Restoring
 * an earlier version writes that overview in particular: the shared one for everyone, or replaced
 * by your own, and your own where it is.
 */
function OverviewEditor({ space, current, restoring, from, hasShared, write, onDone }: {
  space: SpaceData;
  current?: OverviewData['overview'][number];
  /** The overview whose earlier version is restored. */
  restoring?: OverviewData['overview'][number];
  /** The earlier version being restored, to start from. */
  from?: string;
  hasShared: boolean;
  write: WriteOverview;
  onDone: () => void;
}) {
  const [text, setText] = useState(from ?? current?.text ?? '');
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Your own overview, restored, stays yours.
  const choice = !space.private && !(restoring && !restoring.shared);
  const shared = choice && audience === 'space';
  const left = 2000 - text.trim().length;

  const save = async () => {
    setBusy(true);
    const answer = await write(text.trim(), shared, restoring?.id);
    setBusy(false);
    if (answer) setProblem(answer);
    else onDone();
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-muted p-4 sm:p-5">
      <Textarea
        aria-label="Where the space stands"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
        className="bg-card text-base"
        placeholder={`Where ${space.personal ? 'your personal space' : space.name} stands: what it’s for, what’s happening now, and what comes next.`}
        autoFocus
        disabled={busy}
      />
      <p className={cn('text-sm', left < 0 ? 'text-destructive' : 'text-muted-foreground')}>
        {left >= 0 ? 'Keep it short: details belong on pages.' : `${count(-left, 'character', 'characters')} too long. Details belong on pages.`}
      </p>
      {choice && <AudienceChoice space={space.name} people={space.members.length} above={space.reachedFromAbove} value={audience} onChange={setAudience} disabled={busy} />}
      {choice && (
        <p className="text-sm text-muted-foreground">
          {shared
            ? hasShared ? 'Everyone sees your correction. What it said before stays in its history.' : 'It becomes the overview everyone in the space sees.'
            : hasShared ? `Your own overview takes the shared one’s place for you. Others in ${space.name} still see theirs.` : 'Only you see it, until you share it.'}
        </p>
      )}
      {restoring && !restoring.shared && <p className="text-sm text-muted-foreground">What it says now stays in its history.</p>}
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:justify-end">
        <Button variant="outline" size="lg" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button size="lg" className={cn(wrapsLabel, 'min-h-10')} disabled={busy || !text.trim() || left < 0} onClick={save}>{shared ? (restoring ? `Restore it for ${space.name}` : `Share with ${space.name}`) : restoring ? 'Restore for you' : 'Save for you'}</Button>
      </div>
    </div>
  );
}

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
      {children}
    </Link>
  );
}

/** What waits for you in the space, each saying who proposes what. */
function WaitingHere({ waiting }: { waiting: OverviewData['waiting'] }) {
  return (
    <Part title="Waiting for you here">
      <ul className="-mx-2 flex flex-col">
        {waiting.map((item) => (
          <li key={item.id}>
            <Link href={`/proposals/${item.id}`} className={cn('flex flex-col rounded-lg px-2 py-1.5 hover:bg-muted', focusRing)}>
              <span className="line-clamp-2 text-base leading-snug font-semibold">{item.action === 'plan' && !item.text ? `${item.changes} changes` : (item.text ?? (item.included ? 'From a space you can’t open' : 'A rule change'))}</span>
              <span className="text-sm text-muted-foreground">{whoProposes(item)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Part>
  );
}

/** "Claude proposes sharing this", "Cara Lund asks", and so on for each kind of change. */
function whoProposes(item: OverviewData['waiting'][number]): string {
  const { assistant } = item;
  if (item.action === 'plan') return item.text ? `${assistant} proposes this space, with ${item.changes === 1 ? 'a change' : `${item.changes} changes`} in it` : `${assistant} proposes them together`;
  if (item.request && !item.request.yours) return `${item.request.by ?? 'A member'} asks`;
  switch (item.action) {
    case 'publish': return `${assistant} proposes sharing this`;
    case 'share task': return `${assistant} proposes sharing this task`;
    case 'archive space': return `${assistant} suggests archiving it`;
    case 'archive page': return `${assistant} ${item.asked ? 'proposes' : 'suggests'} archiving this page`;
    case 'reopen page': return `${assistant} proposes reopening this page`;
    case 'change rule': return `${assistant} proposes this wording`;
    case 'remove rule': return `${assistant} proposes removing it`;
    case 'share space': return `${assistant} proposes sharing it with others`;
    case 'add space': return item.asked ? 'A new space, waiting for your approval' : `${assistant} suggests a space`;
    case 'change members': return `${assistant} proposes ${{ add: 'adding them', 'make admin': 'making them an admin', 'make member': 'making them a member, not an admin', remove: 'removing them' }[item.member ?? 'add']}`;
    case 'add include': return `${assistant} proposes including ${item.included === 'skill' ? 'this skill' : 'its rules'}`;
    case 'remove include': return `${assistant} proposes no longer including ${item.included === 'skill' ? 'this skill' : 'its rules'}`;
    default: return `${assistant} proposes`;
  }
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
