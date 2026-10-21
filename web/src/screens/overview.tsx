import { useState, type ReactNode } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { cn } from 'cn';
import { AudienceChoice, type Audience } from '@/components/audience';
import { Markdown } from '@/components/markdown';
import { OnlyYou } from '@/components/only-you';
import { count, dateOf, focusRing, Section, wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { nameIn, nameOf, plain, type OverviewData, type WriteOverview } from '@/lib/knowledge';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';
import { PageRows } from '@/screens/pages';

/**
 * A space at a glance: what someone wrote about where it stands, if anyone has, and the map Homing
 * keeps by itself beside it: what's active, its collections and decisions, what waits here, and
 * the spaces inside it. It works without a written overview.
 */
export function Overview({ space, data, write, now }: { space: SpaceData; data: OverviewData; write?: WriteOverview; now?: Date }) {
  const [editing, setEditing] = useState(false);
  const where = space.personal ? 'your personal space' : space.name;
  const shared = data.overview.find((item) => item.shared);
  const mine = data.overview.find((item) => !item.shared);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,44rem)_15rem] lg:justify-between">
      <div className="flex min-w-0 flex-col gap-10">
        <section aria-label={`Where ${where} stands`} className="flex flex-col gap-3">
          {editing && write ? (
            <OverviewEditor space={space} current={mine ?? shared} hasShared={Boolean(shared)} write={write} onDone={() => setEditing(false)} />
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
                    {item.agent ? `${item.agent} wrote it${nameIn(item.by) ? ` for ${nameIn(item.by)}` : ''}` : `${nameOf(item.by)} wrote it`}, {dateOf(item.writtenAt)}.
                  </p>
                </div>
              ))}
              {write && <div><Button variant="outline" onClick={() => setEditing(true)}>Edit the overview</Button></div>}
            </>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-5 sm:p-6">
              <p className="text-base">No overview yet. A few lines on where {where} stands help whoever opens it next.</p>
              {write && <Button variant="outline" onClick={() => setEditing(true)}>Write an overview</Button>}
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
        {data.waiting.length > 0 && (
          <Part title="Waiting for you here">
            <ul className="-mx-2 flex flex-col">
              {data.waiting.map((item) => (
                <li key={item.id}>
                  <Link href={`/proposals/${item.id}`} className={cn('flex flex-col rounded-lg px-2 py-1.5 hover:bg-muted', focusRing)}>
                    <span className="line-clamp-2 text-base leading-snug font-semibold">{item.action === 'plan' && !item.text ? `${item.changes} changes` : (item.text ?? (item.included ? 'From a space you can’t open' : 'A rule change'))}</span>
                    <span className="text-sm text-muted-foreground">{item.action === 'plan' ? (item.text ? `${item.assistant} proposes this space, with ${item.changes === 1 ? 'a change' : `${item.changes} changes`} in it` : `${item.assistant} proposes them together`) : item.request && !item.request.yours ? `${item.request.by ?? 'A member'} asks` : item.action === 'publish' ? `${item.assistant} proposes sharing this` : item.action === 'share task' ? `${item.assistant} proposes sharing this task` : item.action === 'archive space' ? `${item.assistant} suggests archiving it` : item.action === 'archive page' ? `${item.assistant} ${item.asked ? 'proposes' : 'suggests'} archiving this page` : item.action === 'reopen page' ? `${item.assistant} proposes reopening this page` : item.action === 'change rule' ? `${item.assistant} proposes this wording` : item.action === 'remove rule' ? `${item.assistant} proposes removing it` : item.action === 'share space' ? `${item.assistant} proposes sharing it with others` : item.action === 'add space' ? (item.asked ? 'A new space, waiting for your approval' : `${item.assistant} suggests a space`) : item.action === 'change members' ? `${item.assistant} proposes ${{ add: 'adding them', 'make admin': 'making them an admin', 'make member': 'making them a member, not an admin', remove: 'removing them' }[item.member ?? 'add']}` : item.action === 'add include' || item.action === 'remove include' ? `${item.assistant} proposes ${item.action === 'add include' ? 'including' : 'no longer including'} ${item.included === 'skill' ? 'this skill' : 'its rules'}` : `${item.assistant} proposes`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Part>
        )}
        {(data.spaces.length > 0 || (space.admin && !space.archive)) && (
          <Part title="Spaces inside">
            <ul className="-mx-2 flex flex-col empty:hidden">
              {data.spaces.map((inside) => (
                <li key={inside.id}>
                  <Link href={`/spaces/${inside.id}`} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-base leading-snug font-semibold hover:bg-muted', inside.archived && 'text-muted-foreground', focusRing)}>
                    {inside.name}
                    {inside.archived && <span className="text-sm font-normal">Archived</span>}
                    <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
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
 * only you see; new writing starts as only yours, and the button names who will see it.
 */
function OverviewEditor({ space, current, hasShared, write, onDone }: {
  space: SpaceData;
  current?: OverviewData['overview'][number];
  hasShared: boolean;
  write: WriteOverview;
  onDone: () => void;
}) {
  const [text, setText] = useState(current?.text ?? '');
  const [audience, setAudience] = useState<Audience>('you');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const choice = !space.private;
  const shared = choice && audience === 'space';
  const left = 2000 - text.trim().length;

  const save = async () => {
    setBusy(true);
    const answer = await write(text.trim(), shared);
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
      {problem && <FieldError>{problem}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:justify-end">
        <Button variant="outline" size="lg" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button size="lg" className={cn(wrapsLabel, 'min-h-10')} disabled={busy || !text.trim() || left < 0} onClick={save}>{shared ? `Share with ${space.name}` : 'Save for you'}</Button>
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

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
