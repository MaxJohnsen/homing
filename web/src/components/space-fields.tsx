import { useEffect, useId, useRef } from 'react';
import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import { RadioCards } from '@/components/radio-cards';
import { focusRing } from '@/components/screen';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inOrder, type SpaceSummary } from '@/lib/spaces';

export type Who = 'just me' | 'with others';

/** A space a new one can go in. */
export interface Place {
  id: string;
  /** Its name first, then where it sits: "Website, in Acme › Havbris", or "Reading, in your personal space". */
  label: string;
  name: string;
  /** In your personal tree, for a space just for you. Otherwise a shared space you're an admin of. */
  mine: boolean;
  /** Your personal space itself. */
  personal: boolean;
  /** For a shared space, when known: how many people have it, and whether people above it you can't open have it too. */
  people?: number;
  above?: boolean;
}

/** A new space as it's being set: its name, who it's for, and where it goes for each. */
export interface SpaceDraft {
  name: string;
  who?: Who;
  /** Where it goes just for you: your personal space, or a space in it. */
  inMine: string;
  /** Where it goes with others: a shared space you're an admin of, or '' for a space of its own. */
  inShared: string;
  closed: boolean;
}

/** The space to create, as the server takes it. */
export interface SpaceSet {
  name: string;
  who: Who;
  in: string | null;
  closed: boolean;
}

/** Who has a shared space now, as far as you can see: how many people, and whether people above it too. */
export interface Audience {
  people: number;
  above: boolean;
}

/** Where a new space can go, from the spaces you have. */
export function placesIn(spaces: SpaceSummary[]): Place[] {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const label = (space: SpaceSummary) => {
    if (space.personal) return 'Your personal space';
    const above: string[] = [];
    for (let at = space.parentId ? byId.get(space.parentId) : undefined; at; at = at.parentId ? byId.get(at.parentId) : undefined) {
      above.unshift(at.personal ? 'your personal space' : at.name);
    }
    return above.length ? `${space.name}, in ${above.join(' › ')}` : space.name;
  };
  return [
    ...inOrder(spaces.filter((space) => space.private)).map((space) => ({ id: space.id, label: label(space), name: space.name, mine: true, personal: space.personal })),
    ...spaces.filter((space) => !space.private && space.admin).map((space) => ({ id: space.id, label: label(space), name: space.name, mine: false, personal: false })),
  ];
}

/** A draft to start from: empty, or as suggested, or started from a space it would go in. */
export function draftOf(places: Place[], start: Partial<SpaceSet> = {}): SpaceDraft {
  const personal = places.find((place) => place.personal);
  const from = start.in ? places.find((place) => place.id === start.in) : undefined;
  const who = start.who ?? (from ? (from.mine ? 'just me' : 'with others') : undefined);
  return {
    name: start.name ?? '',
    who,
    inMine: from?.mine ? from.id : (personal?.id ?? ''),
    inShared: from && !from.mine ? from.id : '',
    closed: start.closed ?? false,
  };
}

/** The space a draft describes, once it says who it's for, among the places it can go now. */
export function spaceOf(draft: SpaceDraft, places: Place[]): SpaceSet | undefined {
  if (!draft.who) return undefined;
  const parent = parentOf(draft, places);
  return { name: draft.name.trim(), who: draft.who, in: parent?.id ?? null, closed: draft.who === 'with others' && Boolean(parent) && draft.closed };
}

/** Where the draft puts it, if that's still a place it can go. */
export function parentOf(draft: SpaceDraft, places: Place[]): Place | undefined {
  if (draft.who === 'just me') return places.find((place) => place.mine && place.id === draft.inMine);
  if (draft.who === 'with others') return places.find((place) => !place.mine && place.id === draft.inShared);
}

/**
 * Setting up a new space: its name and who it's for, because that decides where it can go. Just for
 * you, it goes in your personal space, where nobody else can ever be added. With others, it's a
 * space of its own, or goes in a shared space you're an admin of, open to everyone there or closed.
 * It says who will have it before anything is created.
 */
export function SpaceFields({ draft, onChange, places, audience, problem, disabled = false, autoFocus = false }: {
  draft: SpaceDraft;
  onChange: (draft: SpaceDraft) => void;
  places: Place[];
  /** Who has the shared space it would go in, once known. */
  audience?: Audience;
  /** What's wrong, and with which field. */
  problem?: { field?: string; message: string };
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const nameField = useRef<HTMLInputElement>(null);
  // A problem with the name takes you to it.
  useEffect(() => {
    if (problem?.field === 'name') nameField.current?.focus();
  }, [problem]);
  const mine = places.filter((place) => place.mine);
  const shared = places.filter((place) => !place.mine);
  const set = (change: Partial<SpaceDraft>) => onChange({ ...draft, ...change });
  const parent = parentOf(draft, places);
  const others = audience ? audience.people - 1 : 0;
  const everyone = !parent
    ? ''
    : !audience
      ? 'Everyone there now, and anyone who joins later.'
      : audience.above
      ? `${others > 0 ? `${count(others)}, ` : ''}everyone who can open the space above it, and anyone who joins ${parent.name} later.`
      : others > 0
        ? `${count(others)} now, and anyone who joins ${parent.name} later.`
        : `Anyone who joins ${parent.name} later.`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`} className="text-base">Name</Label>
        <Input
          ref={nameField}
          id={`${id}-name`}
          className="h-11 text-base md:text-base"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder="Such as a client or a project"
          maxLength={100}
          aria-invalid={problem?.field === 'name' || undefined}
          aria-describedby={problem?.field === 'name' ? `${id}-name-problem` : undefined}
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {problem?.field === 'name' && <FieldError id={`${id}-name-problem`}>{problem.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <p id={`${id}-who`} className="text-base font-medium">Who is it for?</p>
        <RadioCards
          labelledBy={`${id}-who`}
          surface="muted"
          value={draft.who}
          onChange={(who) => set({ who })}
          disabled={disabled}
          options={[
            { value: 'just me', label: 'Just me', detail: 'In your personal space, only yours until you share it from its Settings.', private: true },
            { value: 'with others', label: 'With others', detail: 'For people you add, or everyone in a shared space you’re an admin of. What you write in it starts as only yours.' },
          ]}
        />
      </div>

      {draft.who === 'just me' && mine.length > 1 && (
        <Where id={`${id}-in`} value={parent?.id ?? ''} onChange={(inMine) => set({ inMine })} options={mine} disabled={disabled} />
      )}
      {draft.who === 'with others' && shared.length > 0 && (
        <Where id={`${id}-in`} value={parent?.id ?? ''} onChange={(inShared) => set({ inShared })} options={[{ id: '', label: 'On its own' }, ...shared]} disabled={disabled} />
      )}
      {draft.who === 'with others' && parent && (
        <div className="flex flex-col gap-2">
          <p id={`${id}-access`} className="text-base font-medium">Who has access?</p>
          <RadioCards
            labelledBy={`${id}-access`}
            surface="muted"
            value={draft.closed ? 'closed' : 'open'}
            onChange={(value) => set({ closed: value === 'closed' })}
            disabled={disabled}
            options={[
              { value: 'open', label: `Everyone in ${parent.name}`, detail: everyone },
              { value: 'closed', label: 'Only people you add', detail: `Others in ${parent.name} don’t see it.` },
            ]}
          />
        </div>
      )}

      {draft.who && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {draft.who === 'just me' && <OnlyYou />}
          {draft.who === 'just me'
            ? 'Only you have it.'
            : !parent
              ? 'A space of its own, with you as its admin. Only you have it until you add people.'
              : `${parent.name}’s shared rules apply in it, with you as its admin.`}
        </p>
      )}
    </>
  );
}

const count = (n: number) => (n === 1 ? '1 other person' : `${n.toLocaleString('en-US')} other people`);

function Where({ id, value, options, onChange, disabled }: {
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
