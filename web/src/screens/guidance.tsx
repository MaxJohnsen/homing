import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import type { RuleKind } from '@/components/proposed-change';
import { RadioCards } from '@/components/radio-cards';
import { RuleReach } from '@/components/rule-reach';
import { dateOf, focusRing, Tag } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { IncludableData, IncludeSummary, RuleActions, RuleData, SkillSummary, WaitingSkill } from '@/lib/guidance';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** "Northwind", or "your personal space". */
function placeOf(space: Pick<SpaceData, 'name' | 'personal'>) {
  return space.personal ? 'your personal space' : space.name;
}

/**
 * The rules that apply in a space, split by where they come from, so it's clear why an assistant
 * behaves as it does. You change your own rules here, and an admin the space's shared ones. Rules
 * from spaces above are changed where they're set, and so are the rules this space includes from
 * other spaces, which those allowed include here or stop including.
 */
export function Rules({ space, rules, includes = [], includable, actions }: {
  space: SpaceData;
  rules: RuleData[];
  /** The other spaces whose rules this space includes, even those with none yet. */
  includes?: IncludeSummary[];
  /** What the person could include here, when they may include anything. */
  includable?: IncludableData;
  actions?: RuleActions;
}) {
  const here = (rule: RuleData) => (rule.includedIn ? rule.includedIn.spaceId : rule.spaceId) === space.id;
  const shared = (rule: RuleData) => (rule.includedIn ? rule.includedIn.shared : rule.shared);
  const sharedHere = rules.filter((rule) => !rule.includedIn && here(rule) && rule.shared);
  const yoursHere = rules.filter((rule) => !rule.includedIn && here(rule) && !rule.shared);
  const includedHere = rules.filter((rule) => rule.includedIn && here(rule));
  // Your own, from elsewhere: your rules above, and what's included above only for you. Nearest first.
  const yoursAbove = rules.filter((rule) => !here(rule) && !shared(rule)).reverse();
  // The shared ones from above, by the space they're set or included in, nearest first. The server lists them from the top down.
  const sharedAbove = rules.filter((rule) => !here(rule) && shared(rule));
  const levelOf = (rule: RuleData) => (rule.includedIn ? rule.includedIn.spaceId : rule.spaceId);
  const above = [...new Set(sharedAbove.map(levelOf))].reverse();

  return (
    <>
      <div className="flex max-w-[65ch] flex-col gap-2">
        <p className="text-base">
          Your assistant gets these rules in {placeOf(space)}. Requirements always apply. Among preferences, the one closest to this space comes first.
        </p>
        <details className="group text-sm">
          <summary className={cn('w-fit cursor-pointer rounded-sm font-semibold text-primary-ink', focusRing)}>How rules combine</summary>
          <p className="mt-2 text-muted-foreground">
            Rules from your personal space count as the least specific, and between equally specific preferences your own comes first.
            Rules a space includes from another count as set where they’re included, before the rules set there.
            Homing doesn’t decide whether two rules contradict each other. Your assistant does, and if two requirements can’t both be met, it stops and tells you.
          </p>
        </details>
      </div>

      {!space.private && (sharedHere.length > 0 || space.admin) && (
        <RuleSection
          title={`${space.name}’s rules`}
          description={
            space.admin
              ? `For everyone in ${space.name} and the spaces under it. As an admin, you can change them.`
              : `For everyone in ${space.name} and the spaces under it. Only its admins change them.`
          }
          space={space}
          rules={sharedHere}
          actions={space.admin ? actions : undefined}
          shared
        />
      )}

      <RuleSection
        title={space.personal ? 'Your personal rules' : space.private ? 'Rules here' : 'Your own rules'}
        description={
          space.personal
            ? 'They follow you into every space you work in.'
            : space.private
              ? `Only you have ${space.name}, so its rules are yours.`
              : 'Only you see them, and they only change what your assistant does.'
        }
        tone={space.private ? 'raised' : 'private'}
        space={space}
        rules={yoursHere}
        actions={actions}
        reaching={yoursAbove}
      />

      {(includes.length > 0 || (actions && includable && includable.spaces.length > 0)) && (
        <Included space={space} includes={includes} rules={includedHere} includable={includable} actions={actions} />
      )}

      {above.map((spaceId) => {
        const from = sharedAbove.filter((rule) => levelOf(rule) === spaceId);
        const name = from[0].includedIn ? from[0].includedIn.spaceName : from[0].spaceName;
        return (
          <RuleSection
            key={spaceId ?? 'above'}
            title={name ? `From ${name}` : 'From a space above'}
            description={
              name ? (
                <>
                  Set by {name}’s admins for everyone in it, including here.{' '}
                  <TextLink href={`/spaces/${spaceId}/rules`}>See them in {name}</TextLink>
                </>
              ) : (
                `Set for everyone in a space above ${space.name} that you can’t open, and they reach you here.`
              )
            }
            tone="field"
            space={space}
            rules={from}
          />
        );
      })}
    </>
  );
}

/**
 * The other spaces whose rules a space includes, each with the rules it brings in now and who gets
 * them, and for those allowed, including another or no longer including one.
 */
function Included({ space, includes, rules, includable, actions }: {
  space: SpaceData;
  includes: IncludeSummary[];
  rules: RuleData[];
  includable?: IncludableData;
  actions?: RuleActions;
}) {
  const [adding, setAdding] = useState(false);
  const canInclude = Boolean(actions && includable && includable.spaces.length > 0);
  return (
    <section aria-labelledby="rules-included" className="flex flex-col gap-4 rounded-2xl bg-muted p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="rules-included" className="text-lg font-semibold tracking-[-0.01em]">Included here</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            Rules set in other spaces that apply here too, before {space.personal ? 'your personal ones' : `${space.name}’s own`}. They stay as they’re set there, and reach only people who can open those spaces.
          </p>
        </div>
        {canInclude && !adding && <Button variant="outline" onClick={() => setAdding(true)}>Include rules</Button>}
      </div>
      {adding && actions && includable && (
        <IncludeForm
          space={space}
          what="rules"
          options={includable.spaces}
          include={(id, shared) => actions.include({ space: id, shared })}
          onDone={() => setAdding(false)}
        />
      )}
      {includes.length > 0 ? (
        <div className="flex flex-col gap-5">
          {includes.map((include) => (
            <IncludedFrom
              key={include.id}
              space={space}
              include={include}
              rules={rules.filter((rule) => rule.includedIn?.id === include.id)}
              stop={actions && (!include.shared || space.admin) ? () => actions.stopIncluding(include.id) : undefined}
            />
          ))}
        </div>
      ) : (
        !adding && <p className="text-base text-muted-foreground">No rules included yet.</p>
      )}
    </section>
  );
}

/**
 * One included space: where it's from and for whom, its rules as they are now, and stopping it,
 * asking first. For an admin, one they can't open says only that it's there, and who added it when.
 */
function IncludedFrom({ space, include, rules, stop }: { space: SpaceData; include: IncludeSummary; rules: RuleData[]; stop?: () => Promise<string | undefined> }) {
  const [removing, setRemoving] = useState(false);
  const from = include.spaceName ?? 'a space you can’t open';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {include.spaceId ? <span>From <TextLink href={`/spaces/${include.spaceId}/rules`}>{include.spaceName}</TextLink></span> : 'From a space you can’t open'}
          {!include.shared && <OnlyYou />}
        </h3>
        {stop && !removing && <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>Stop including</Button>}
      </div>
      {removing && stop && (
        <StopIncluding
          className="bg-card"
          what={include.shared
            ? `They stop applying in ${space.name} and every space under it, for everyone who doesn’t include them for themselves. They stay in ${from}.`
            : include.waiting
              ? `Yours goes. ${space.name} still includes them for everyone.`
              : `They stop applying to you in ${placeOf(space)} and the spaces under it. They stay in ${from}.`}
          stop={stop}
          onKeep={() => setRemoving(false)}
        />
      )}
      {include.waiting ? (
        <p className="text-sm text-muted-foreground">{space.name} includes them for everyone, so yours waits, and applies again if that one stops.</p>
      ) : !include.spaceId ? (
        <p className="text-sm text-muted-foreground">
          {include.addedBy && include.addedAt ? `Added by ${include.addedBy} on ${dateOf(include.addedAt)}. ` : ''}
          Everyone here who can open it gets its rules. As an admin you see that it’s here, but not what it is.
        </p>
      ) : rules.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rules.map((rule) => <RuleRow key={rule.id} rule={rule} space={space} />)}
        </ul>
      ) : (
        <p className="text-base text-muted-foreground">{include.spaceName} has no rules for other spaces yet.</p>
      )}
    </div>
  );
}

/**
 * Including another space's rules, or a skill: which one, and for everyone or only for you. A
 * member includes only for themselves, and so does anyone in a space only they have, or with what
 * only they have.
 */
function IncludeForm({ space, what, options, include, onDone }: {
  space: SpaceData;
  what: 'rules' | 'skill';
  options: { id: string; name: string; label: string; onlyYours: boolean }[];
  include: (id: string, shared: boolean) => Promise<string | undefined>;
  onDone: () => void;
}) {
  const [chosen, setChosen] = useState(options[0]?.id ?? '');
  const [everyone, setEveryone] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const choice = options.find((option) => option.id === chosen);
  const canShare = space.admin && !space.private && !choice?.onlyYours;
  const shared = canShare && everyone;
  const id = `include-${what}-${space.id}`;
  const reach = what === 'rules'
    ? `They apply ${shared ? '' : 'to you '}in ${placeOf(space)} and the spaces under it, before its own rules, and stay as they’re set there.`
    : `It applies ${shared ? '' : 'to you '}in ${placeOf(space)} and the spaces under it, unless a skill with its name is set closer, and stays as it’s set there.`;

  const add = async () => {
    setBusy(true);
    const problem = await include(chosen, shared);
    setBusy(false);
    if (problem) setMessage(problem);
    else onDone();
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id} className="text-base">{what === 'rules' ? 'Which space’s rules?' : 'Which skill?'}</Label>
        <select
          id={id}
          value={chosen}
          onChange={(event) => { setChosen(event.target.value); setMessage(undefined); }}
          disabled={busy}
          className={cn('h-11 w-full rounded-4xl border border-input bg-card px-3.5 text-base disabled:opacity-50 sm:max-w-md', focusRing)}
        >
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </div>
      {canShare ? (
        <RadioCards
          label={what === 'rules' ? 'Who gets them?' : 'Who gets it?'}
          surface="muted"
          value={everyone ? 'everyone' : 'you'}
          onChange={(value) => setEveryone(value === 'everyone')}
          disabled={busy}
          options={[
            { value: 'you', label: 'Only you', detail: `Only your assistant gets ${what === 'rules' ? 'them' : 'it'} here.`, private: true },
            {
              value: 'everyone',
              label: `Everyone in ${space.name}`,
              detail: what === 'rules'
                ? 'Only those who can open where they’re set get them, and nobody else learns of them.'
                : 'Only those who can open where it’s set get it, and nobody else learns of it.',
            },
          ]}
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <OnlyYou />
          {space.private
            ? `Only you have ${space.name}.`
            : choice?.onlyYours
              ? what === 'rules' ? `${choice.name} is only yours, so its rules are only for you.` : `The skill ${choice.name} is only yours, so it’s only for you.`
              : `Only ${space.name}’s admins include for everyone.`}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{reach}</p>
      {message && <FieldError>{message}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button disabled={busy || !chosen} onClick={add}>{shared ? `Include for ${space.name}` : 'Include for you'}</Button>
      </div>
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
      {children}
    </Link>
  );
}

function RuleSection({ title, description, space, rules, actions, shared = false, tone = 'raised', reaching = [] }: {
  title: string;
  description: ReactNode;
  space: SpaceData;
  rules: RuleData[];
  /** Given when the person may change these rules here. */
  actions?: RuleActions;
  shared?: boolean;
  tone?: 'raised' | 'field' | 'private';
  /** The person's own rules reaching here from elsewhere, shown after the space's own. */
  reaching?: RuleData[];
}) {
  const [adding, setAdding] = useState(false);
  const id = `rules-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className={cn('flex flex-col gap-4 rounded-2xl p-5 sm:p-6', tone === 'raised' && 'bg-card', tone === 'field' && 'bg-muted', tone === 'private' && 'bg-private/25')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-[-0.01em]">
            {title}
            {tone === 'private' && <OnlyYou />}
          </h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && !adding && <Button variant="outline" onClick={() => setAdding(true)}>Add a rule</Button>}
      </div>
      {adding && actions && <RuleForm space={space} shared={shared} actions={actions} onDone={() => setAdding(false)} />}
      {rules.length + reaching.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rules.map((rule) => <RuleRow key={rule.id} rule={rule} space={space} actions={actions} />)}
          {reaching.map((rule) => <RuleRow key={rule.id} rule={rule} space={space} />)}
        </ul>
      ) : (
        !adding && <p className="text-base text-muted-foreground">No rules yet.</p>
      )}
    </section>
  );
}

/** One rule, with what kind it is and where it applies. The person can change it if actions are given. */
function RuleRow({ rule, space, actions }: { rule: RuleData; space: SpaceData; actions?: RuleActions }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'remove'>('view');
  const [draft, setDraft] = useState(rule.text);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const here = rule.spaceId === space.id;
  // An included rule's own group says where it's from, unless it's included in a space above.
  const where = rule.includedIn
    ? rule.includedIn.spaceId === space.id ? '' : `, from ${rule.spaceName}, included in ${rule.includedIn.spaceName ?? 'a space above'}`
    : here
      ? rule.onlyHere ? `, only in ${placeOf(space)}` : ''
      : rule.personal ? ', from your personal space' : `, from ${rule.spaceName ?? 'a space above'}`;
  const reach = { space: space.name, shared: rule.shared, personal: space.personal, onlyHere: rule.onlyHere };

  const run = async (action: () => Promise<string | undefined>) => {
    setBusy(true);
    const problem = await action();
    setMessage(problem);
    setBusy(false);
    if (!problem) setMode('view');
  };

  if (mode === 'edit' && actions) {
    return (
      <li className="flex flex-col gap-3 py-2">
        <Textarea aria-label="The rule" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} autoFocus disabled={busy} />
        <RuleReach id={`reach-${rule.id}`} {...reach} />
        {message && <FieldError>{message}</FieldError>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy} onClick={() => { setMessage(undefined); setMode('view'); }}>Cancel</Button>
          <Button disabled={busy || !draft.trim() || draft.trim() === rule.text} onClick={() => run(() => actions.edit(rule.id, draft.trim()))}>Save rule</Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex flex-col gap-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base whitespace-pre-line">{rule.text}</span>
          <span className="text-sm text-muted-foreground">{rule.kind === 'requirement' ? 'Requirement' : 'Preference'}{where}</span>
        </div>
        {actions && mode === 'view' && (
          <div className="-ml-2.5 flex shrink-0 gap-1 sm:ml-0">
            <Button variant="ghost" size="sm" onClick={() => { setDraft(rule.text); setMode('edit'); }}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('remove')}>Remove</Button>
          </div>
        )}
      </div>
      {mode === 'remove' && actions && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <RuleReach id={`remove-${rule.id}`} {...reach} removing />
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { setMessage(undefined); setMode('view'); }}>Keep it</Button>
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(() => actions.remove(rule.id))}>Remove rule</Button>
            </div>
          </div>
          {message && <FieldError>{message}</FieldError>}
        </div>
      )}
    </li>
  );
}

/** A new rule: what kind, the exact words, and how far it reaches. */
function RuleForm({ space, shared, actions, onDone }: { space: SpaceData; shared: boolean; actions: RuleActions; onDone: () => void }) {
  const [kind, setKind] = useState<RuleKind>('preference');
  const [text, setText] = useState('');
  const [onlyHere, setOnlyHere] = useState(false);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const problem = await actions.add({ kind, text: text.trim(), shared, onlyHere });
    setBusy(false);
    if (problem) setMessage(problem);
    else onDone();
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:p-5">
      <div role="radiogroup" aria-label="Kind of rule" className="inline-flex w-fit flex-wrap gap-1 rounded-full bg-secondary p-1">
        {(['preference', 'requirement'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => setKind(option)}
            className={cn('rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', focusRing, kind === option && 'bg-card text-foreground')}
          >
            {option === 'preference' ? 'Preference' : 'Requirement'}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {kind === 'requirement' ? 'Your assistant must follow it.' : 'Your assistant follows it unless a rule closer to the work says otherwise.'}
      </p>
      <Textarea aria-label="The rule" value={text} onChange={(event) => setText(event.target.value)} rows={2} placeholder="Write status reports in Norwegian." autoFocus disabled={busy} />
      <RuleReach id={`new-${space.id}-${shared ? 'shared' : 'yours'}`} space={space.name} shared={shared} personal={space.personal} onlyHere={onlyHere} onOnlyHereChange={setOnlyHere} disabled={busy} />
      {message && <FieldError>{message}</FieldError>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={busy} onClick={onDone}>Cancel</Button>
        <Button disabled={busy || !text.trim()} onClick={add}>Add rule</Button>
      </div>
    </div>
  );
}

/**
 * The skills that apply in a space, with where each comes from and which one is used, and for those
 * allowed, including a skill from another space or no longer including one.
 */
export function Skills({ space, skills, hidden = [], waiting = [], includable, actions }: {
  space: SpaceData;
  skills: SkillSummary[];
  /** For an admin, the skills the space includes for everyone that they can't open. */
  hidden?: IncludeSummary[];
  /** Your own includes of a skill, waiting while the space includes it for everyone. */
  waiting?: WaitingSkill[];
  includable?: IncludableData;
  actions?: RuleActions;
}) {
  const [adding, setAdding] = useState(false);
  const canInclude = Boolean(actions && includable && includable.skills.length > 0);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[65ch] text-base">
          {skills.length || hidden.length || waiting.length
            ? `How your assistant does particular tasks in ${placeOf(space)}. A skill set closer to this space replaces one with the same name from further up, and one set here replaces one included here.`
            : `No skills apply in ${placeOf(space)} yet.`}
        </p>
        {canInclude && !adding && <Button variant="outline" onClick={() => setAdding(true)}>Include a skill</Button>}
      </div>
      {adding && actions && includable && (
        <IncludeForm
          space={space}
          what="skill"
          options={includable.skills.map((option) => ({ id: option.id, name: option.name, label: `${option.name}, from ${option.from}`, onlyYours: option.onlyYours }))}
          include={(id, shared) => actions.include({ skill: id, shared })}
          onDone={() => setAdding(false)}
        />
      )}
      {skills.length + hidden.length + waiting.length > 0 && (
        <ul className="-mx-3 flex flex-col gap-1">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              space={space}
              skill={skill}
              stop={actions && skill.includedIn?.spaceId === space.id && (!skill.includedIn.shared || space.admin) ? () => actions.stopIncluding(skill.includedIn!.id) : undefined}
            />
          ))}
          {hidden.map((include) => <HiddenSkill key={include.id} space={space} include={include} stop={actions && (() => actions.stopIncluding(include.id))} />)}
          {waiting.map((include) => <WaitingSkillRow key={include.id} space={space} include={include} stop={actions && (() => actions.stopIncluding(include.id))} />)}
        </ul>
      )}
    </>
  );
}

/** A skill: what it does, where it comes from and whether it's used, and stopping including it, asking first. */
function SkillRow({ space, skill, stop }: { space: SpaceData; skill: SkillSummary; stop?: () => Promise<string | undefined> }) {
  const [removing, setRemoving] = useState(false);
  const { includedIn } = skill;
  const from = includedIn
    ? `From ${skill.spaceName}, included ${includedIn.spaceId === space.id ? 'here' : `in ${includedIn.spaceName ?? 'a space above'}`}`
    : skill.spaceId === space.id ? `Set in ${placeOf(space)}` : `From ${skill.spaceName ?? 'a space above'}`;
  const other = skill.others[0];
  const replacing = skill.used && other ? `, replaces ${other.spaceName ? `${other.spaceName}’s` : 'one from a space above'}` : '';
  const instead = !skill.used && other ? `, ${other.spaceName ? `${other.spaceName}’s own` : 'another'} is used instead` : '';
  return (
    <li className="flex flex-col">
      <div className="flex items-center">
        <Link href={`/skills/${skill.id}`} className={cn('group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
              {skill.name}
              {(!skill.shared || includedIn?.shared === false) && <OnlyYou />}
              {!skill.used && <Tag>Replaced here</Tag>}
            </span>
            {skill.description && <span className="line-clamp-2 text-sm text-muted-foreground">{skill.description}</span>}
            <span className="text-sm text-muted-foreground">{from}{replacing}{instead}</span>
          </div>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      {stop && !removing && <Button variant="ghost" size="sm" className="ml-0.5 w-fit" onClick={() => setRemoving(true)}>Stop including</Button>}
      {removing && stop && (
        <StopIncluding
          className="mx-3 bg-muted"
          what={includedIn?.shared
            ? `It stops applying in ${space.name} and every space under it, for everyone who doesn’t include it for themselves. It stays in ${skill.spaceName}.`
            : `It stops applying to you in ${placeOf(space)} and the spaces under it. It stays in ${skill.spaceName}.`}
          stop={stop}
          onKeep={() => setRemoving(false)}
        />
      )}
    </li>
  );
}

/** For an admin, a skill the space includes for everyone that they can't open: only that it's there, and stopping it. */
function HiddenSkill({ space, include, stop }: { space: SpaceData; include: IncludeSummary; stop?: () => Promise<string | undefined> }) {
  const [removing, setRemoving] = useState(false);
  return (
    <li className="flex flex-col">
      <div className="flex min-w-0 flex-col gap-1 px-3 py-3">
        <span className="text-base leading-snug font-semibold">A skill from a space you can’t open</span>
        <span className="text-sm text-muted-foreground">
          {include.addedBy && include.addedAt ? `Added by ${include.addedBy} on ${dateOf(include.addedAt)}. ` : ''}
          Everyone here who can open it gets it.
        </span>
      </div>
      {stop && !removing && <Button variant="ghost" size="sm" className="ml-0.5 w-fit" onClick={() => setRemoving(true)}>Stop including</Button>}
      {removing && stop && (
        <StopIncluding className="mx-3 bg-muted" what={`It stops applying in ${space.name} and every space under it, for everyone.`} stop={stop} onKeep={() => setRemoving(false)} />
      )}
    </li>
  );
}

/** Your own include of a skill, waiting while the space includes it for everyone, and stopping it. */
function WaitingSkillRow({ space, include, stop }: { space: SpaceData; include: WaitingSkill; stop?: () => Promise<string | undefined> }) {
  const [removing, setRemoving] = useState(false);
  return (
    <li className="flex flex-col">
      <div className="flex min-w-0 flex-col gap-1 px-3 py-3">
        <span className="flex flex-wrap items-center gap-2 text-base leading-snug font-semibold">
          {include.name}
          <OnlyYou />
        </span>
        <span className="text-sm text-muted-foreground">
          From {include.spaceName}. {space.name} includes it for everyone, so yours waits, and applies again if that one stops.
        </span>
      </div>
      {stop && !removing && <Button variant="ghost" size="sm" className="ml-0.5 w-fit" onClick={() => setRemoving(true)}>Stop including</Button>}
      {removing && stop && <StopIncluding className="mx-3 bg-muted" what={`Yours goes. ${space.name} still includes it for everyone.`} stop={stop} onKeep={() => setRemoving(false)} />}
    </li>
  );
}

/** Asks before no longer including something, in place, saying what stops applying and where. */
function StopIncluding({ what, stop, onKeep, className }: { what: string; stop: () => Promise<string | undefined>; onKeep: () => void; className?: string }) {
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl p-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{what}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onKeep}>Keep it</Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const problem = await stop();
              setBusy(false);
              setMessage(problem);
              if (!problem) onKeep();
            }}
          >
            Stop including
          </Button>
        </div>
      </div>
      {message && <FieldError>{message}</FieldError>}
    </div>
  );
}
