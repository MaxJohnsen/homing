import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import welcome from '@/assets/illustrations/welcome.png';
import { ago, capitalize, count, focusRing, ScreenHeader } from '@/components/screen';
import type { ChangeData } from '@/lib/knowledge';
import { eitherOf, placeOf, wantsTo, type RequestData, type WaitingData } from '@/lib/proposals';
import { Link } from '@/lib/router';
import type { SpaceSummary } from '@/lib/spaces';
import { CopyAddress } from '@/screens/account';
import { ArchivedNote, ChangeList, IncludeArchived, type ArchivedChanges } from '@/screens/changes';

/** What Home needs: what waits for you, and whether an assistant is connected yet. */
export interface HomeData {
  name: string;
  waiting: WaitingData[];
  assistants: number;
  /** The address assistants connect to. */
  mcpUrl: string;
  /** Requests you sent to a space's admins. */
  requests?: RequestData[];
  /** The latest changes to what Homing knows, and whether there are more. */
  changes?: ChangeData[];
  moreChanges?: boolean;
  /** Archived spaces were left out, and they have changes. */
  archivedChanges?: boolean;
  /** Changes in archived spaces show too. */
  withArchived?: boolean;
}

const shown = 3;

/**
 * Where you start. What needs you comes first, capped so it never takes over the page. Someone
 * who has just joined is helped to connect their assistant. The sidebar is the way to your spaces,
 * so Home doesn't list them.
 */
export function Home({ data, recent = [], now, onArchived }: { data: HomeData; recent?: SpaceSummary[]; now?: Date; onArchived?: (include: boolean) => void }) {
  const { waiting } = data;
  const archived: ArchivedChanges = { archived: data.archivedChanges, withArchived: data.withArchived, onArchived };
  if (waiting.length > 0) {
    return (
      <>
        <ScreenHeader title={waiting.length === 1 ? 'One change is waiting for you' : `${count(waiting.length, 'change', 'changes')} are waiting for you`} />
        <WaitingList waiting={waiting} now={now} />
        <RecentSpaces spaces={recent} />
        <WhatChanged changes={data.changes ?? []} more={data.moreChanges} now={now} {...archived} />
        <YourRequests requests={data.requests ?? []} now={now} />
      </>
    );
  }
  if (data.assistants === 0) return <Welcome data={data} />;
  // A quiet day: nothing needs you, so Home leads with what changed.
  if (data.changes?.length) {
    return (
      <>
        <ScreenHeader title="What changed" meta="Nothing is waiting for you. This is what’s new in your spaces." below={<ArchivedNote {...archived} />} />
        <RecentSpaces spaces={recent} />
        <WhatChanged changes={data.changes} more={data.moreChanges} now={now} heading={false} {...archived} />
        <YourRequests requests={data.requests ?? []} now={now} />
      </>
    );
  }
  return (
    <>
      <ScreenHeader
        title="Nothing is waiting for you"
        meta="When your assistant proposes a change that needs your approval, it waits here."
        below={<IncludeArchived {...archived} />}
      />
      <RecentSpaces spaces={recent} />
      <YourRequests requests={data.requests ?? []} now={now} />
    </>
  );
}

/** The latest few changes, with the way to all of them, and to those in archived spaces. */
function WhatChanged({ changes, more, now, heading = true, ...archived }: { changes: ChangeData[]; more?: boolean; now?: Date; heading?: boolean } & ArchivedChanges) {
  if (changes.length === 0 && !(archived.archived && archived.onArchived)) return null;
  return (
    <section aria-labelledby={heading ? 'what-changed' : undefined} aria-label={heading ? undefined : 'What changed'} className="flex flex-col gap-4">
      {heading && (
        <div className="flex flex-col gap-2">
          <h2 id="what-changed" className="text-lg leading-snug font-semibold">What changed</h2>
          <ArchivedNote {...archived} />
        </div>
      )}
      {changes.length > 0 && <ChangeList changes={changes} now={now} />}
      {(more || archived.archived) && (
        <div className="flex flex-col gap-2">
          {more && (
            <Link href={archived.withArchived ? '/changes?archived=1' : '/changes'} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
              See everything that changed
            </Link>
          )}
          <IncludeArchived {...archived} />
        </div>
      )}
    </section>
  );
}

/** On a phone the sidebar is tucked away, so the spaces you opened lately are a tap away here. */
function RecentSpaces({ spaces }: { spaces: SpaceSummary[] }) {
  if (spaces.length < 2) return null;
  return (
    <nav aria-label="Recent spaces" className="-mt-4 flex gap-2 overflow-x-auto md:hidden">
      {spaces.map((space) => (
        <Link key={space.id} href={`/spaces/${space.id}`} className={cn('shrink-0 rounded-full bg-shelf px-4 py-2 text-sm font-semibold', focusRing)}>
          {space.name}
        </Link>
      ))}
    </nav>
  );
}

function WaitingList({ waiting, now }: { waiting: WaitingData[]; now?: Date }) {
  const more = waiting.slice(shown);
  const spaces = new Set(more.map((item) => item.spaceId)).size;
  return (
    <section aria-label="Waiting for you" className="-mt-4 flex flex-col gap-2 rounded-2xl bg-accent p-2 sm:p-3">
      <ul className="flex flex-col gap-2">
        {waiting.slice(0, shown).map((item) => <WaitingRow key={item.id} item={item} now={now} />)}
      </ul>
      {more.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <p className="text-base text-primary-ink">
            {count(more.length, 'more', 'more')}{spaces > 1 ? ` in ${spaces} spaces` : ''}.
          </p>
          <Link href="/waiting" className={cn('rounded-full bg-card px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-background', focusRing)}>
            See all {waiting.length}
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * One change to decide. The whole row opens the decision, where the full change is shown first.
 * Each row is a decision of its own, so each has its own primary Review.
 */
export function WaitingRow({ item, now, compact }: { item: WaitingData; now?: Date; /** Smaller, under a heading that names the space. */ compact?: boolean }) {
  return (
    <li>
      <Link href={`/proposals/${item.id}`} className={cn('group flex items-center gap-4 rounded-xl bg-card px-5 py-4 transition-colors hover:bg-background', focusRing)}>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base font-semibold">{wantsTo(item, !compact)}</span>
          {/* A change of members names who, and archiving names the space, in the line above. */}
          {item.text && item.action !== 'members' && item.action !== 'archive' && item.action !== 'convert' && <span className={cn('line-clamp-2 whitespace-pre-line', compact ? 'text-base' : 'text-lg leading-snug')}>{item.text}</span>}
          <span className="text-sm text-muted-foreground">{capitalize(ago(item.createdAt, now))}</span>
        </div>
        <span className="hidden shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90 sm:block">
          Review
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground sm:hidden" />
      </Link>
    </li>
  );
}

/** What you asked a space's admins for. Worth tracking, but it waits on someone else, so it sits back. */
function YourRequests({ requests, now }: { requests: RequestData[]; now?: Date }) {
  if (requests.length === 0) return null;
  return (
    <section aria-labelledby="your-requests" className="flex flex-col gap-3">
      <h2 id="your-requests" className="text-lg leading-snug font-semibold tracking-[-0.01em]">Your requests</h2>
      <ul className="-mx-3 flex flex-col gap-1">
        {requests.map((request) => (
          <li key={request.id}>
            <Link href={`/proposals/${request.id}`} className={cn('group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-base font-semibold">
                  You asked the admins of {placeOf({ ...request, personal: false })} to {request.action === 'add' ? 'add a rule' : `${request.action} a ${request.kind}`}
                </span>
                {request.text && <span className="line-clamp-2 text-base">{request.text}</span>}
                <span className="text-sm text-muted-foreground">{statusOf(request, now)}</span>
              </div>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where a request stands, in a line. */
function statusOf(request: RequestData, now?: Date): string {
  if (request.state === 'approved') return request.decidedBy ? `${request.decidedBy} approved it.` : 'Approved.';
  if (request.state === 'rejected') return request.decidedBy ? `${request.decidedBy} didn’t approve it. Nothing changed.` : 'Not approved. Nothing changed.';
  if (request.state === 'expired') return 'Nobody decided it in time, so nothing changed.';
  if (request.state === 'withdrawn') return `${request.withdrawnBy ? `${request.withdrawnBy} withdrew it` : 'You withdrew it'}, so nothing changed.`;
  return request.emailed === false
    ? `Waiting for ${eitherOf(request.admins)}. Homing couldn’t email them, so let them know.`
    : `Waiting for ${eitherOf(request.admins)}, sent ${ago(request.requestedAt, now)}.`;
}

/** For someone who has just joined: what Homing is for, and connecting their assistant first. */
function Welcome({ data }: { data: HomeData }) {
  return (
    <>
      <ScreenHeader title={`Welcome to Homing, ${data.name.split(' ')[0]}`} />
      <section aria-label="Connect your assistant" className="-mt-4 grid items-center gap-6 rounded-2xl bg-card p-6 sm:grid-cols-[1fr_14rem] sm:p-8">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="max-w-[52ch] text-lg leading-relaxed">
            Your assistant keeps what it learns for you here, and you can read and correct all of it. Start by connecting it.
          </p>
          <p className="max-w-[60ch] text-base">
            In Claude, ChatGPT or another assistant, add Homing as a connector with this address. Then sign in and connect it.
          </p>
          <CopyAddress value={data.mcpUrl} />
          <p className="max-w-[60ch] text-base text-muted-foreground">
            Your personal space is ready for anything that’s just yours.{' '}
            <Link href="/spaces/new" className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>Start a space</Link>{' '}
            for a client, a project or anything you share with others.
          </p>
        </div>
        <img src={welcome} alt="" width={960} height={640} className="hidden w-full sm:block" />
      </section>
    </>
  );
}
