import { ShareSpaceFields, type ShareChoice } from '@/components/share-space-fields';
import { FieldError } from '@/components/ui/field';
import { CircleCheck, CircleSlash, Clock, Send } from 'lucide-react';
import { cn } from 'cn';
import { AlreadyApplies } from '@/components/already-applies';
import { OnlyYou } from '@/components/only-you';
import { ProposedChange } from '@/components/proposed-change';
import { RuleReach } from '@/components/rule-reach';
import { parentOf, SpaceFields, type SpaceDraft } from '@/components/space-fields';
import { Avatar, dateOf } from '@/components/screen';
import { placeOf, precedenceOf, type IncludeData, type PlanData, type PlanStepData, type ProposalData, type PublicationData, type TaskShareData } from '@/lib/proposals';

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
  if (action === 'plan') return proposal.plan ? <PlanDetails proposal={proposal} plan={proposal.plan} idPrefix={idPrefix} /> : null;
  if (action === 'members') return proposal.member ? <MemberChangeDetails proposal={proposal} member={proposal.member} /> : null;
  if (action === 'publish') return proposal.publication ? <PublishDetails proposal={proposal} publication={proposal.publication} /> : null;
  if (action === 'task') return proposal.task ? <TaskShareDetails place={placeOf(proposal)} task={proposal.task} /> : null;
  if (action === 'archive') return proposal.archive ? <ArchiveDetails proposal={proposal} archive={proposal.archive} /> : null;
  if (action === 'archive page' || action === 'reopen page') return proposal.page?.title ? <PageArchiveDetails proposal={proposal} title={proposal.page.title} shared={proposal.page.shared} /> : null;
  if (action === 'include' || action === 'exclude') return proposal.include ? <IncludeDetails proposal={proposal} include={proposal.include} /> : null;
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
  if (action === 'plan') {
    return proposal.plan && (
      <ol aria-label="The changes" className="flex flex-col gap-2">
        {proposal.plan.create && (
          <li><ProposedChange kind="preference" label="New space" text={proposal.plan.create.name} settled /></li>
        )}
        {proposal.plan.steps.map((step, index) => <li key={index}><SettledStep step={step} /></li>)}
      </ol>
    );
  }
  if (action === 'members') return member && <Who member={member} settled />;
  if (action === 'publish') return proposal.publication && <ProposedChange kind="preference" label={`On ${proposal.publication.page}`} text={proposal.publication.text} settled />;
  if (action === 'task') return proposal.task && <ProposedChange kind="preference" label="Task" text={proposal.task.title} settled />;
  if (action === 'archive' || action === 'convert') return <ProposedChange kind="preference" label="Space" text={proposal.space} settled />;
  if (action === 'archive page' || action === 'reopen page') return proposal.page?.title && <ProposedChange kind="preference" label="Page" text={proposal.page.title} settled />;
  if (action === 'include' || action === 'exclude') {
    const { include } = proposal;
    const name = include?.skill?.name ?? include?.space?.name;
    return name ? <ProposedChange kind="preference" label={include?.skill ? 'Skill' : 'Rules from'} text={name} settled /> : null;
  }
  if (action === 'space') {
    return suggestion && <p className="rounded-xl bg-muted px-4 py-3 text-base text-muted-foreground">{suggestion.created?.name ?? suggestion.name}</p>;
  }
  const shown = action === 'remove' || (state === 'open' && action !== 'add') ? rule?.text : proposal.text;
  if (!shown) return null;
  return <ProposedChange kind={kind} text={shown} label={action === 'change' && state === 'approved' ? 'Changed to' : undefined} settled />;
}

/** One change of a plan once it's decided, greyed. */
function SettledStep({ step }: { step: PlanStepData }) {
  if (step.member) return <Who member={step.member} settled />;
  if (step.item) return <ProposedChange kind="preference" label={`On ${step.item.page}`} text={step.item.text} settled />;
  if (step.task) return <ProposedChange kind="preference" label="Task" text={step.task.title} settled />;
  const text = step.rule?.text ?? step.rule?.now;
  if (step.rule && text) return <ProposedChange kind={step.rule.kind} label={step.action === 'change' ? 'Changed to' : undefined} text={text} settled />;
  return null;
}

/**
 * A plan: every change it makes, in order, each shown as its own decision would show it, more
 * briefly, with what it does. Then who will see what it shares, and the rules already there when it
 * adds one. A change that can't be made now says why, under it.
 */
function PlanDetails({ proposal, plan, idPrefix }: { proposal: ProposalData; plan: PlanData; idPrefix: string }) {
  const place = plan.create ? plan.create.name : placeOf(proposal);
  const shares = plan.steps.some((step) => step.action === 'publish' || step.action === 'task');
  const rules = plan.steps.flatMap((step) => (step.action === 'add' && step.rule ? [step.rule.kind] : []));
  return (
    <>
      <ol aria-label="The changes" className="flex flex-col gap-6">
        {plan.create && (
          <li className="flex flex-col gap-2">
            <ProposedChange kind="preference" label={`New space in ${plan.create.in ?? 'a shared space'}`} text={plan.create.name} />
            <p className="text-sm text-muted-foreground">
              {plan.create.in ? `Everyone in ${plan.create.in} has it: ${people(plan.create.people)} now${plan.create.above ? ', everyone who can open the space above it' : ''}, and anyone who joins later. ${plan.create.in}’s shared rules apply in it.` : 'Everyone in the space it goes in has it.'}
            </p>
            {plan.create.problem && <FieldError>{plan.create.problem}</FieldError>}
          </li>
        )}
        {plan.steps.map((step, index) => (
          <li key={index} className="flex flex-col gap-2">
            <PlanStep step={step} place={place} sees={plan.sees} personal={proposal.personal && !plan.create} id={`${idPrefix}-change-${index}`} />
            {step.problem && <FieldError>{step.problem}</FieldError>}
          </li>
        ))}
      </ol>
      {shares && <p className="text-base">{whoWillSeeShared(place, plan.audience)}</p>}
      {rules.length > 0 && (
        <AlreadyApplies
          rules={proposal.alreadyApplies}
          precedence={rules.includes('requirement') ? 'If a new requirement disagrees with another, your assistant stops and tells you.' : 'If a new rule disagrees with a requirement, the requirement wins.'}
        />
      )}
    </>
  );
}

/** One change in a plan, as its own decision would show it, more briefly. */
function PlanStep({ step, place, sees, personal, id }: { step: PlanStepData; place: string; sees: PlanData['sees']; personal: boolean; id: string }) {
  const gone = (what: string) => <p className="rounded-xl bg-muted px-4 py-3 text-base">{what}</p>;
  if (step.action === 'publish') {
    const { publication } = step;
    if (!publication) return step.item ? <ProposedChange kind="preference" label={`Share on ${step.item.page}`} text={step.item.text} /> : gone('Something to share that you can’t see anymore.');
    const sources = sourcesOf(publication);
    const notes = [
      sources && `Everyone will see what it says and that you shared it, but not ${sources}.`,
      publication.sharesTitle && `Only you have the page “${publication.page}”, so its title is shared too.`,
    ].filter(Boolean);
    return (
      <>
        {publication.sharedText !== null && publication.sharedText !== publication.text ? (
          <div className="flex flex-col gap-3">
            <ProposedChange kind="preference" label="Everyone sees now" text={publication.sharedText} settled />
            <ProposedChange kind="preference" label={`Changed to, on ${publication.page}`} text={publication.text} />
          </div>
        ) : (
          <ProposedChange kind="preference" label={`Share on ${publication.page}`} text={publication.text} />
        )}
        {notes.length > 0 && <p className="text-sm text-muted-foreground">{notes.join(' ')}</p>}
      </>
    );
  }
  if (step.action === 'task') {
    if (!step.task) return gone('A task you can’t see anymore.');
    const due = step.task.due ? `, due ${dateOf(new Date(`${step.task.due}T12:00:00`).toISOString())}` : '';
    return <ProposedChange kind="preference" label={`Share the task${due}`} text={step.task.description ? `${step.task.title}\n\n${step.task.description}` : step.task.title} />;
  }
  if (step.member) {
    const { member } = step;
    const label = { add: `Add to ${place}`, 'make admin': `Make an admin of ${place}`, 'make member': `Make a member of ${place}, not an admin`, remove: `Remove from ${place}` }[member.change];
    return (
      <>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Who member={member} />
        {member.found !== false && <p className="text-base">{memberSees(member, place, sees)}</p>}
      </>
    );
  }
  const { rule } = step;
  const text = rule?.text ?? rule?.now;
  if (!rule || !text) return gone('A rule you can’t see anymore.');
  if (step.action === 'change') {
    return (
      <div className="flex flex-col gap-3">
        {rule.now && <ProposedChange kind={rule.kind} label={`${rule.kind === 'requirement' ? 'Requirement' : 'Preference'} now`} text={rule.now} settled />}
        <ProposedChange kind={rule.kind} label="Changed to" text={text} onlyYou={!rule.shared} />
      </div>
    );
  }
  return (
    <>
      <ProposedChange kind={rule.kind} label={`${step.action === 'add' ? 'Add' : 'Remove'} a ${rule.kind}`} text={text} onlyYou={!rule.shared} />
      <RuleReach id={id} space={place} shared={rule.shared} personal={personal} onlyHere={rule.onlyHere} removing={step.action === 'remove'} />
    </>
  );
}

/**
 * What a plan's change of members means for them: what someone it adds will see there, in numbers,
 * or what they keep or lose.
 */
function memberSees(member: NonNullable<PlanStepData['member']>, place: string, sees: PlanData['sees']): string {
  const who = member.name ?? member.email ?? 'They';
  const admin = member.change === 'make admin' ? ' As an admin, they also change its shared rules and who’s in it.' : '';
  if (member.change === 'make member') return `${who} keeps access, but no longer changes its shared rules or who’s in it.`;
  if (member.change === 'remove') return member.through ? `${who} will no longer be a member of ${place}, but still has access through ${member.through}.` : `${who} loses access to ${place} and the spaces in it.`;
  if (member.inSpace) return `${who} already sees ${place}.${admin}`;
  if (member.through) return `${who} already sees ${place} through ${member.through}.${admin}`;
  const parts = sees
    ? [
        sees.pages ? `${plural(sees.pages, 'shared page')}${sees.archived ? ` (and ${sees.archived} archived)` : ''}` : '',
        sees.tasks ? plural(sees.tasks, 'shared task') : '',
        sees.rules ? plural(sees.rules, 'rule') : '',
        sees.spaces ? `the ${sees.spaces === 1 ? 'space' : `${sees.spaces} spaces`} in it that ${sees.spaces === 1 ? 'isn’t' : 'aren’t'} closed` : '',
      ].filter(Boolean)
    : [];
  if (!sees) return `${who} will see ${place}’s shared knowledge and rules, including what was shared before they joined.${admin}`;
  const listed = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${who} will see ${place}’s name${listed ? `, ${listed.startsWith('the ') ? '' : 'its '}${listed},` : ''} and what’s shared there later.${admin}`;
}

/** "Everyone in Kitchen will see what’s shared: only you now, Jonas Berg from when you approve, and anyone who joins later." */
function whoWillSeeShared(place: string, audience: PlanData['audience']): string {
  const now = audience.people > 1 ? `${people(audience.people)} now` : 'only you now';
  const adding = audience.adding.length ? `, ${audience.adding.length > 1 ? `${audience.adding.slice(0, -1).join(', ')} and ${audience.adding.at(-1)}` : audience.adding[0]} from when you approve` : '';
  return `Everyone in ${place} will see what’s shared: ${now}${audience.above ? ', everyone who can open the space above it' : ''}${adding}, and anyone who joins later.`;
}

/** "1 other person", "4 other people": everyone with access but you. */
function people(withYou: number): string {
  const others = withYou - 1;
  return others <= 0 ? 'only you' : others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`;
}

const plural = (n: number, thing: string) => `${n} ${thing}${n === 1 ? '' : 's'}`;

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
  const sources = sourceList(publication);
  const listed = sourcesOf(publication);
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

/** What sharing an item rests on that its space can't see: your own sources, or another space's. */
function sourceList(publication: PublicationData): string[] {
  return [
    ...publication.hidden.map((source) => (source.space ? `information from ${source.space}` : `your source “${source.reference}”`)),
    ...(publication.hiddenUnseen > 0 ? [publication.hiddenUnseen === 1 ? 'a source you can no longer open' : `${publication.hiddenUnseen} sources you can no longer open`] : []),
    ...(publication.hiddenElsewhere ? [publication.hiddenElsewhere === 1 ? 'a source that didn’t come with the import' : `${publication.hiddenElsewhere} sources that didn’t come with the import`] : []),
  ];
}

/** "your source “Email from Gunnar” and information from Beta", or undefined when it rests on nothing hidden. */
function sourcesOf(publication: PublicationData): string | undefined {
  const sources = sourceList(publication);
  return sources.length > 1 ? `${sources.slice(0, -1).join(', ')} and ${sources.at(-1)}` : sources[0];
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

/**
 * Including another space's rules or a skill, or no longer: what it points to, set apart, where it
 * applies and who gets it, and what it brings in now. Someone who can't open what it points to
 * learns nothing of it, and can only decline.
 */
function IncludeDetails({ proposal, include }: { proposal: ProposalData; include: IncludeData }) {
  const place = placeOf(proposal);
  const removing = proposal.action === 'exclude';
  if (!include.open) {
    // An admin can stop including what they can't open, knowing only that it's there.
    if (removing && include.current) {
      return (
        <>
          <ProposedChange kind="preference" label="Stop including" text={proposal.included === 'skill' ? 'A skill from a space you can’t open' : 'Rules from a space you can’t open'} />
          <p className="text-sm text-muted-foreground">{proposal.included === 'skill' ? 'It stops' : 'They stop'} applying in {place} and the spaces under it, for everyone who doesn’t include {proposal.included === 'skill' ? 'it' : 'them'} for themselves.</p>
        </>
      );
    }
    return <p className="rounded-xl bg-muted px-4 py-3 text-base">It’s about guidance from a space you can’t open, so you can only decline it.</p>;
  }
  const from = include.space?.name ?? include.skill?.from ?? 'another space';
  const who = proposal.shared ? `everyone in ${place} who can open ${from}` : 'you';
  if (include.skill) {
    return (
      <>
        <ProposedChange kind="preference" label={removing ? 'Stop including the skill' : 'Include the skill'} text={include.skill.name} onlyYou={!proposal.shared} />
        {include.skill.description && <p className="text-base">{include.skill.description}</p>}
        <p className="text-sm text-muted-foreground">
          {removing
            ? `It stops applying in ${place} and the spaces under it, for ${proposal.shared ? 'everyone who doesn’t include it for themselves' : 'you'}.`
            : `It’s set in ${from}, and stays as it’s set there. It applies in ${place} and the spaces under it, for ${who}, unless a skill with its name is set closer.`}
        </p>
      </>
    );
  }
  return (
    <>
      <ProposedChange kind="preference" label={removing ? 'Stop including the rules from' : 'Include the rules from'} text={from} onlyYou={!proposal.shared} />
      <p className="text-sm text-muted-foreground">
        {removing
          ? `They stop applying in ${place} and the spaces under it, for ${proposal.shared ? 'everyone who doesn’t include them for themselves' : 'you'}.`
          : proposal.shared
            ? `In ${place} and the spaces under it, everyone who can open ${from} gets them, before ${place}’s own rules, and nobody else learns of them. They stay as they’re set in ${from}.`
            : `In ${place} and the spaces under it, you get them before ${place}’s own rules. They stay as they’re set in ${from}.`}
      </p>
      {!removing && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted px-4 py-3">
          {include.rules.length ? (
            <>
              <p className="text-base">{include.rules.length === 1 ? 'The rule it brings in now:' : `The ${include.rules.length} rules it brings in now:`}</p>
              <ul className="flex flex-col gap-3">
                {include.rules.map((rule, index) => (
                  <li key={index} className="flex flex-col gap-0.5">
                    <span className="text-base whitespace-pre-line">{rule.text}</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {rule.kind === 'requirement' ? 'Requirement' : 'Preference'}
                      {rule.yours && <OnlyYou />}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-base">{from} has no rules for other spaces yet. Any it gets later apply here too.</p>
          )}
        </div>
      )}
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
