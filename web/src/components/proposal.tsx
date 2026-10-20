import { ShareSpaceFields, type ShareChoice } from '@/components/share-space-fields';
import { FieldError } from '@/components/ui/field';
import { CircleCheck, CircleSlash, Clock, Send } from 'lucide-react';
import { cn } from 'cn';
import { AlreadyApplies } from '@/components/already-applies';
import { ProposedChange } from '@/components/proposed-change';
import { RuleReach } from '@/components/rule-reach';
import { parentOf, SpaceFields, type SpaceDraft } from '@/components/space-fields';
import { Avatar, dateOf } from '@/components/screen';
import { placeOf, precedenceOf, type ProposalData, type PublicationData, type TaskShareData } from '@/lib/proposals';

/**
 * The exact change an assistant proposed, as the decision page and the card show it: a new rule
 * with where it applies and the rules already there, a change with the rule now above its new
 * wording, or a removal with where it stops applying.
 */
export function ProposalDetails({ proposal, onlyHere, onOnlyHereChange, draft, onDraftChange, problem, disabled, idPrefix, share, onShareChange }: {
  proposal: ProposalData;
  onlyHere: boolean;
  /** Left out where the reach is as asked, such as a request on its way to the admins. */
  onOnlyHereChange?: (value: boolean) => void;
  /** A suggested space as the person is setting it. */
  draft?: SpaceDraft;
  onDraftChange?: (draft: SpaceDraft) => void;
  problem?: { field?: string; message: string };
  disabled?: boolean;
  idPrefix: string;
  /** Sharing a space from the personal tree: where it goes and what becomes of its rules, as the person is setting them. */
  share?: ShareChoice;
  onShareChange?: (choice: ShareChoice) => void;
}) {
  const { action, kind, rule, shared, personal, space } = proposal;
  if (action === 'convert') {
    if (!proposal.conversion || !share || !onShareChange) return null;
    return (
      <>
        <p className="text-base">{space} is in your personal space, so only you have it. Shared, it leaves your personal space and you can add people. Everything in it stays only yours until you share it.</p>
        <ShareSpaceFields name={space} conversion={proposal.conversion} choice={share} onChange={onShareChange} disabled={disabled} idPrefix={`${idPrefix}-share`} />
        {/* A name that's taken where it would go is said here, as the other problems are under the buttons. */}
        {problem?.field === 'name' && <FieldError>{problem.message}</FieldError>}
      </>
    );
  }
  if (action === 'members') return proposal.member ? <MemberChangeDetails proposal={proposal} member={proposal.member} /> : null;
  if (action === 'publish') return proposal.publication ? <PublishDetails proposal={proposal} publication={proposal.publication} /> : null;
  if (action === 'task') return proposal.task ? <TaskShareDetails place={placeOf(proposal)} task={proposal.task} /> : null;
  if (action === 'archive') return proposal.archive ? <ArchiveDetails proposal={proposal} archive={proposal.archive} /> : null;
  if (action === 'archive page' || action === 'reopen page') return proposal.page?.title ? <PageArchiveDetails proposal={proposal} title={proposal.page.title} shared={proposal.page.shared} /> : null;
  if (action === 'space') {
    if (!draft || !onDraftChange || !proposal.suggestion) return null;
    // Who has the shared space it would go in, from Homing, since the card can't ask for it.
    const parent = parentOf(draft, proposal.suggestion.places);
    const audience = parent?.people !== undefined ? { people: parent.people, above: parent.above ?? false } : undefined;
    return <SpaceFields draft={draft} onChange={onDraftChange} places={proposal.suggestion.places} audience={audience} problem={problem} disabled={disabled} />;
  }
  if (action === 'add') {
    return (
      <>
        <ProposedChange kind={kind} text={proposal.text!} onlyYou={!shared} />
        <RuleReach
          id={`${idPrefix}-only-here`}
          space={space}
          shared={shared}
          personal={personal}
          onlyHere={onlyHere}
          onOnlyHereChange={onOnlyHereChange}
          disabled={disabled}
        />
        <AlreadyApplies rules={proposal.alreadyApplies} precedence={precedenceOf(proposal)} />
      </>
    );
  }
  return (
    <>
      {action === 'change' ? (
        <div className="flex flex-col gap-3">
          <ProposedChange kind={kind} text={rule!.text} label="Now" settled />
          <ProposedChange kind={kind} text={proposal.text!} label="Changed to" onlyYou={!shared} />
        </div>
      ) : (
        <ProposedChange kind={kind} text={rule!.text} onlyYou={!shared} />
      )}
      <RuleReach id={`${idPrefix}-only-here`} space={space} shared={shared} personal={personal} onlyHere={proposal.onlyHere} removing={action === 'remove'} />
    </>
  );
}

/** What was decided, greyed: the new rule or wording, or the rule as it was when it went. */
export function SettledChange({ proposal }: { proposal: ProposalData }) {
  const { action, kind, state, rule, suggestion, member } = proposal;
  if (action === 'members') return member && <Who member={member} settled />;
  if (action === 'publish') return proposal.publication && <ProposedChange kind="preference" label={`On ${proposal.publication.page}`} text={proposal.publication.text} settled />;
  if (action === 'task') return proposal.task && <ProposedChange kind="preference" label="Task" text={proposal.task.title} settled />;
  if (action === 'archive' || action === 'convert') return <ProposedChange kind="preference" label="Space" text={proposal.space} settled />;
  if (action === 'archive page' || action === 'reopen page') return proposal.page?.title && <ProposedChange kind="preference" label="Page" text={proposal.page.title} settled />;
  if (action === 'space') {
    return suggestion && <p className="rounded-xl bg-muted px-4 py-3 text-base text-muted-foreground">{suggestion.created?.name ?? suggestion.name}</p>;
  }
  const shown = action === 'remove' || (state === 'open' && action !== 'add') ? rule?.text : proposal.text;
  if (!shown) return null;
  return <ProposedChange kind={kind} text={shown} label={action === 'change' && state === 'approved' ? 'Changed to' : undefined} settled />;
}

/**
 * A change of who is in a space: who it's about, and what it shares or stops sharing with them. For
 * an email nobody uses Homing with, it says they need an invitation first.
 */
function MemberChangeDetails({ proposal, member }: { proposal: ProposalData; member: NonNullable<ProposalData['member']> }) {
  const place = placeOf(proposal);
  const who = member.name ?? member.email ?? 'They';
  const sees = `${who} will see ${place}’s shared knowledge and rules, including what was shared before they joined, and the spaces in it that aren’t closed.`;
  return (
    <>
      <Who member={member} />
      {member.found === false ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          {member.email
            ? `No one uses Homing with ${member.email} yet. Once they’re invited to Homing, they can be added.`
            : `You no longer share a space with ${who}, so they can’t be added this way. Ask for their email instead.`}
        </p>
      ) : (
        <p className="text-base">
          {member.change === 'add'
            ? sees
            : member.change === 'make admin'
              ? member.inSpace
                ? `${who} already sees ${place}. As an admin, they also change its shared rules and who’s in it.`
                : `${sees} As an admin, they also change its shared rules and who’s in it.`
              : member.change === 'make member'
                ? `${who} keeps access, but no longer changes its shared rules or who’s in it.`
                : member.through
                  ? `${who} will no longer be a member of ${place}, but still has access through ${member.through}.`
                  : `${who} loses access to ${place} and the spaces in it at once.`}
        </p>
      )}
    </>
  );
}

/**
 * Sharing one of your private items: exactly what everyone in the space would see, on which page,
 * how many people that is, and what it rests on that they can't see, which stays yours.
 */
function PublishDetails({ proposal, publication }: { proposal: ProposalData; publication: NonNullable<ProposalData['publication']> }) {
  return <SharingDetails place={placeOf(proposal)} publication={publication} />;
}

/**
 * What sharing an item with a space does, wherever it's decided: exactly what everyone there would
 * see, how many people that is, and what it rests on that they won't see.
 */
export function SharingDetails({ place, publication }: { place: string; publication: PublicationData }) {
  const who = whoWillSee(place, publication.audience);
  const sources = [
    ...publication.hidden.map((source) => (source.space ? `information from ${source.space}` : `your source “${source.reference}”`)),
    ...(publication.hiddenUnseen > 0 ? [publication.hiddenUnseen === 1 ? 'a source you can no longer open' : `${publication.hiddenUnseen} sources you can no longer open`] : []),
  ];
  const listed = sources.length > 1 ? `${sources.slice(0, -1).join(', ')} and ${sources.at(-1)}` : sources[0];
  return (
    <>
      {publication.sharedText !== null && publication.sharedText !== publication.text ? (
        <div className="flex flex-col gap-3">
          <ProposedChange kind="preference" label="Everyone sees now" text={publication.sharedText} settled />
          <ProposedChange kind="preference" label={`Changed to, on ${publication.page}`} text={publication.text} />
        </div>
      ) : (
        <ProposedChange kind="preference" label={`On ${publication.page}`} text={publication.text} />
      )}
      <p className="text-base">{who}</p>
      {sources.length > 0 && (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          It’s based on {listed}. Everyone in {place} will see what it says and that you shared it, but not {sources.length === 1 ? 'that source' : 'those sources'}.
        </p>
      )}
      {publication.sharesTitle && (
        <p className="text-base">Only you have the page “{publication.page}”, so its title is shared too. The rest of it stays yours.</p>
      )}
    </>
  );
}

/** "Everyone in Acme will see it: 25 other people now, and anyone who joins later." */
function whoWillSee(place: string, audience: { people: number; above: boolean } | null): string {
  const others = audience ? audience.people - 1 : 0;
  const count = (n: number) => (n === 1 ? '1 other person' : `${n.toLocaleString('en-US')} other people`);
  return audience?.above
    ? `Everyone in ${place} will see it: ${others > 0 ? `${count(others)} now, ` : ''}everyone who can open the space above it, and anyone who joins later.`
    : `Everyone in ${place} will see it: ${others > 0 ? count(others) : 'only you'} now, and anyone who joins later.`;
}

/** Archiving a space: which, what goes with it, and what archiving does and doesn't do. */
function ArchiveDetails({ proposal, archive }: { proposal: ProposalData; archive: NonNullable<ProposalData['archive']> }) {
  const who = archive.private ? '' : ' for everyone there';
  const what =
    archive.spaces === 0
      ? `It leaves everyday context${who}, and stays searchable.`
      : `It and the ${archive.spaces === 1 ? 'space' : `${archive.spaces} spaces`} in it leave everyday context${who}, and stay searchable.`;
  return (
    <>
      <ProposedChange kind="preference" label="Space" text={proposal.space} />
      <p className="text-base">{what} Nothing is deleted, and you can reopen it in its Settings.</p>
    </>
  );
}

/**
 * Archiving or reopening a page in a space others can open: which, and what it does. A page with
 * shared knowledge is seen by everyone in the space; otherwise it says only what's true for anyone,
 * and nothing about who else has something on it.
 */
function PageArchiveDetails({ proposal, title, shared }: { proposal: ProposalData; title: string; shared: boolean }) {
  const where = placeOf(proposal);
  const [who, list] = shared ? [`everyone in ${where}`, 'the list of pages'] : ['everyone who sees it', `the list of pages in ${where}`];
  return (
    <>
      <ProposedChange kind="preference" label="Page" text={title} />
      <p className="text-base">
        {proposal.action === 'archive page'
          ? `For ${who}, it leaves everyday context and ${list}, and stays searchable. Nothing is deleted, and it can be reopened on the page.`
          : `For ${who}, it comes back into everyday context and ${list}.`}
      </p>
    </>
  );
}

/** Sharing one of your private tasks: the task as everyone in the space would see it, and who that is. */
function TaskShareDetails({ place, task }: { place: string; task: TaskShareData }) {
  const due = task.due ? `, due ${dateOf(new Date(`${task.due}T12:00:00`).toISOString())}` : '';
  return (
    <>
      <ProposedChange kind="preference" label={`Task${due}`} text={task.description ? `${task.title}\n\n${task.description}` : task.title} />
      <p className="text-base">{whoWillSee(place, task.audience)} Any of them can tick it off.</p>
    </>
  );
}

/** Who a change of members is about: their name and the email given, or just the email. */
function Who({ member, settled = false }: { member: NonNullable<ProposalData['member']>; settled?: boolean }) {
  const name = member.name ?? member.email ?? 'Someone';
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3', settled ? 'bg-muted text-muted-foreground' : 'bg-change')}>
      {member.name && <Avatar name={member.name} className="size-10 bg-card text-sm" />}
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-base font-semibold">{name}</span>
        {member.name && member.email && <span className="truncate text-sm text-muted-foreground">{member.email}</span>}
      </div>
    </div>
  );
}

/** The mark beside an outcome. */
export function OutcomeIcon({ kind, className }: { kind: 'approved' | 'rejected' | 'expired' | 'gone' | 'sent'; className?: string }) {
  const Icon = kind === 'approved' ? CircleCheck : kind === 'expired' ? Clock : kind === 'sent' ? Send : CircleSlash;
  return <Icon aria-hidden="true" className={cn('shrink-0', kind === 'approved' || kind === 'sent' ? 'text-primary' : 'text-muted-foreground', className)} />;
}
