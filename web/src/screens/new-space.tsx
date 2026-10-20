import { useId, useState } from 'react';
import { cn } from 'cn';
import { focusRing, ScreenHeader, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inOrder, type SpaceSummary } from '@/lib/spaces';

export type Who = 'just me' | 'with others';

export type CreateSpace = (input: { name: string; who: Who; in?: string; closed: boolean }) => Promise<{ id: string } | { problem: string; field?: string }>;

/**
 * Starting a space (spec §1). It asks who it's for, because that decides where it can go: just for
 * you, it goes in your personal space, where nobody else can ever be added. With others, it's a
 * space of its own, or goes in a shared space you look after, open to everyone there or closed.
 */
export function NewSpace({ spaces, start, create, onCreated, onCancel }: {
  spaces: SpaceSummary[];
  /** The space it was started from, such as Acme's "New space in Acme". */
  start?: string;
  create: CreateSpace;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const from = start ? byId.get(start) : undefined;
  const mine = inOrder(spaces.filter((space) => space.private)).map((space) => ({ id: space.id, label: pathOf(space, byId) }));
  const shared = spaces.filter((space) => !space.private && space.admin).map((space) => ({ id: space.id, label: pathOf(space, byId) }));
  const personal = mine[0];

  const [name, setName] = useState('');
  const [who, setWho] = useState<Who | undefined>(from ? (from.private ? 'just me' : from.admin ? 'with others' : undefined) : undefined);
  const [inMine, setInMine] = useState(from?.private ? from.id : (personal?.id ?? ''));
  const [inShared, setInShared] = useState(from && !from.private && from.admin ? from.id : '');
  const [closed, setClosed] = useState(false);
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);

  const parent = who === 'just me' ? byId.get(inMine) : who === 'with others' && inShared ? byId.get(inShared) : undefined;
  const save = async () => {
    if (!who) return;
    setBusy(true);
    const answer = await create({ name: name.trim(), who, in: parent?.id, closed: who === 'with others' && Boolean(parent) && closed });
    setBusy(false);
    if ('problem' in answer) setProblem({ field: answer.field, message: answer.problem });
    else onCreated(answer.id);
  };

  return (
    <>
      <ScreenHeader title="New space" meta="A space keeps one client, project or part of your life together: what’s known about it, its rules and who’s in it." />
      <Section tone="raised" className="max-w-2xl">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-space-name" className="text-base">Name</Label>
          <Input
            id="new-space-name"
            className="h-11 text-base"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Such as Northwind or Renovation"
            maxLength={100}
            aria-invalid={problem?.field === 'name' || undefined}
            autoFocus
            disabled={busy}
          />
          {problem?.field === 'name' && <FieldError>{problem.message}</FieldError>}
        </div>

        <Options
          label="Who is it for?"
          value={who}
          onChange={setWho}
          disabled={busy}
          options={[
            { value: 'just me', label: 'Just me', detail: 'In your personal space. Nobody else can ever be added.' },
            { value: 'with others', label: 'With others', detail: 'You choose who joins. What you write in it stays yours until you share it.' },
          ]}
        />

        {who === 'just me' && mine.length > 1 && (
          <Place id="new-space-in-mine" value={inMine} onChange={setInMine} options={mine} disabled={busy} />
        )}
        {who === 'with others' && shared.length > 0 && (
          <Place id="new-space-in-shared" value={inShared} onChange={setInShared} options={[{ id: '', label: 'On its own' }, ...shared]} disabled={busy} />
        )}
        {who === 'with others' && parent && (
          <Options
            label="Who has access?"
            value={closed ? 'closed' : 'open'}
            onChange={(value) => setClosed(value === 'closed')}
            disabled={busy}
            options={[
              { value: 'open', label: `Everyone in ${parent.name}`, detail: `Including people who join ${parent.name} later.` },
              { value: 'closed', label: 'Only people you add', detail: `Others in ${parent.name} don’t see it.` },
            ]}
          />
        )}

        {who && <p className="text-sm text-muted-foreground">{consequence(who, parent, closed)}</p>}
        {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button size="lg" disabled={busy || !name.trim() || !who} onClick={save}>Create space</Button>
        </div>
      </Section>
    </>
  );
}

/** What creating it this way means, said before it's created. */
function consequence(who: Who, parent: SpaceSummary | undefined, closed: boolean): string {
  if (who === 'just me') return parent && !parent.personal ? `It goes in ${parent.name}, in your personal space. Only you have it.` : 'It goes in your personal space. Only you have it.';
  if (!parent) return 'A space of its own. Only you have it until you add people, and you look after it.';
  return closed
    ? `Only the people you add have access. ${parent.name}’s rules still apply in it.`
    : `Everyone in ${parent.name} has access, and ${parent.name}’s rules apply in it.`;
}

/** "Your personal space › Reading", or "Acme › Website": where a space sits, from the top. */
function pathOf(space: SpaceSummary, byId: Map<string, SpaceSummary>): string {
  const names: string[] = [];
  for (let at: SpaceSummary | undefined = space; at; at = at.parentId ? byId.get(at.parentId) : undefined) {
    names.unshift(at.personal ? 'Your personal space' : at.name);
  }
  return names.join(' › ');
}

function Place({ id, value, options, onChange, disabled }: {
  id: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-base">Where does it go?</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className={cn('h-11 w-full rounded-4xl border border-input bg-card px-3.5 text-base disabled:opacity-50 sm:max-w-md', focusRing)}
      >
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </div>
  );
}

/** A choice between a few options, each with what it means. */
function Options<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value?: T;
  options: { value: T; label: string; detail: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="text-base font-medium">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-2 sm:flex-row">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-1 flex-col items-start gap-0.5 rounded-xl bg-muted px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60',
              focusRing,
              value === option.value && 'bg-accent',
            )}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden="true" className={cn('size-4 shrink-0 rounded-full border-2 border-input', value === option.value && 'border-[5px] border-primary')} />
              {option.label}
            </span>
            <span className="pl-6 text-sm text-muted-foreground">{option.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
