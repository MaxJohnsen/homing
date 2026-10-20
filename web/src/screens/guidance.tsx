import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import type { RuleKind } from '@/components/proposed-change';
import { RuleReach } from '@/components/rule-reach';
import { focusRing, Tag } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { RuleActions, RuleData, SkillSummary } from '@/lib/guidance';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** "Northwind", or "your personal space". */
function placeOf(space: Pick<SpaceData, 'name' | 'personal'>) {
  return space.personal ? 'your personal space' : space.name;
}

/**
 * The rules that apply in a space, split by where they come from, so it's clear why an assistant
 * behaves as it does. You change your own rules here, and an admin the space's shared ones. Rules
 * from spaces above are changed where they're set.
 */
export function Rules({ space, rules, actions }: { space: SpaceData; rules: RuleData[]; actions?: RuleActions }) {
  const sharedHere = rules.filter((rule) => rule.spaceId === space.id && rule.shared);
  const yoursHere = rules.filter((rule) => rule.spaceId === space.id && !rule.shared);
  const yoursAbove = rules.filter((rule) => rule.spaceId !== space.id && !rule.shared).reverse();
  // Nearest space first. The server lists rules from the top of the tree down.
  const above = [...new Set(rules.filter((rule) => rule.spaceId !== space.id && rule.shared).map((rule) => rule.spaceId))].reverse();

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

      {above.map((spaceId) => {
        const from = rules.filter((rule) => rule.spaceId === spaceId && rule.shared);
        const name = from[0].spaceName;
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
  const where = here
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

/** The skills that apply in a space, with where each comes from and which one is used. */
export function Skills({ space, skills }: { space: SpaceData; skills: SkillSummary[] }) {
  if (!skills.length) return <p className="text-base text-muted-foreground">No skills apply in {placeOf(space)} yet.</p>;
  return (
    <>
      <p className="max-w-[65ch] text-base">
        How your assistant does particular tasks in {placeOf(space)}. A skill set closer to this space replaces one with the same name from further up.
      </p>
      <ul className="-mx-3 flex flex-col gap-1">
        {skills.map((skill) => {
          const from = skill.spaceId === space.id ? `Set in ${placeOf(space)}` : `From ${skill.spaceName ?? 'a space above'}`;
          const other = skill.others[0];
          const replacing = skill.used && other ? `, replaces ${other.spaceName ? `${other.spaceName}’s` : 'one from a space above'}` : '';
          const instead = !skill.used && other ? `, ${other.spaceName ? `${other.spaceName}’s own` : 'another'} is used instead` : '';
          return (
            <li key={skill.id}>
              <Link href={`/skills/${skill.id}`} className={cn('group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted', focusRing)}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-base leading-snug font-semibold">
                    {skill.name}
                    {!skill.shared && <OnlyYou />}
                    {!skill.used && <Tag>Replaced here</Tag>}
                  </span>
                  {skill.description && <span className="line-clamp-2 text-sm text-muted-foreground">{skill.description}</span>}
                  <span className="text-sm text-muted-foreground">{from}{replacing}{instead}</span>
                </div>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
