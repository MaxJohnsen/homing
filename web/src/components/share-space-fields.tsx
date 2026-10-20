import { cn } from 'cn';
import { ProposedChange } from '@/components/proposed-change';
import { RadioCards } from '@/components/radio-cards';
import { focusRing } from '@/components/screen';
import { Label } from '@/components/ui/label';

/** What sharing a space from your personal tree would do: the rules that stop applying, and where it can go. */
export interface ConversionData {
  rulesLeaving: { kind: 'requirement' | 'preference'; text: string; from: string | null }[];
  skillsLeaving: { name: string; from: string | null }[];
  places: { id: string; name: string; label: string; people: number; above: boolean }[];
  /** On a proposal: the rules leaving as shown, which approving sends back. */
  shown?: string;
}

/** Where it goes, whether only the people you add have it there, and what becomes of the rules leaving. */
export interface ShareChoice {
  inside: string;
  closed: boolean;
  rules: 'keep' | 'share' | 'drop';
}

export const firstChoice: ShareChoice = { inside: '', closed: false, rules: 'keep' };

/** The choice as Homing takes it: where, closed only inside another space, and the rules. */
export function shareOf(choice: ShareChoice, conversion: ConversionData) {
  const parent = conversion.places.find((place) => place.id === choice.inside);
  return { in: parent?.id ?? null, closed: Boolean(parent) && choice.closed, rules: choice.rules };
}

/** The button names who will have it: everyone in a space it goes in, or for now only you. */
export function shareButton(name: string, choice: ShareChoice, conversion: ConversionData): string {
  const parent = conversion.places.find((place) => place.id === choice.inside);
  return parent && !choice.closed ? `Share with ${parent.name}` : `Move ${name} out of your personal space`;
}

/**
 * Sharing a space from your personal tree (spec §1), in Settings and on the approval card: where it
 * goes and who has access, what that means, and what becomes of the rules and skills from your
 * personal space that stop applying in it.
 */
export function ShareSpaceFields({ name, conversion, choice, onChange, disabled, idPrefix }: {
  name: string;
  conversion: ConversionData;
  choice: ShareChoice;
  onChange: (choice: ShareChoice) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const parent = conversion.places.find((place) => place.id === choice.inside);
  const others = parent ? parent.people - 1 : 0;
  const set = (change: Partial<ShareChoice>) => onChange({ ...choice, ...change });
  return (
    <div className="flex flex-col gap-4">
      {conversion.places.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-in`} className="text-base">Where does it go?</Label>
          <select
            id={`${idPrefix}-in`}
            value={choice.inside}
            onChange={(event) => set({ inside: event.target.value })}
            disabled={disabled}
            className={cn('h-11 w-full rounded-4xl border border-input bg-card px-3.5 text-base disabled:opacity-50 sm:max-w-md', focusRing)}
          >
            <option value="">On its own</option>
            {conversion.places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
          </select>
        </div>
      )}
      {parent && (
        <RadioCards
          label="Who has access?"
          surface="muted"
          value={choice.closed ? 'closed' : 'open'}
          onChange={(value) => set({ closed: value === 'closed' })}
          disabled={disabled}
          options={[
            {
              value: 'open',
              label: `Everyone in ${parent.name}`,
              detail: parent.above
                ? `${others > 0 ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`}, ` : ''}everyone who can open the space above it, and anyone who joins later.`
                : `${others > 0 ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`} now, and ` : ''}anyone who joins ${parent.name} later.`,
            },
            { value: 'closed', label: 'Only people you add', detail: `Others in ${parent.name} don’t see it.` },
          ]}
        />
      )}
      <p className="text-base">
        {!parent
          ? 'A space of its own, with you as its admin. Only you have it until you add people.'
          : choice.closed
            ? `In ${parent.name}, with you as its admin. Only the people you add have it, and ${parent.name}’s shared rules apply in it.`
            : `In ${parent.name}. Everyone there sees its name and the spaces under it, ${parent.name}’s admins look after it with you, and its shared rules apply in it.`}
      </p>
      {conversion.rulesLeaving.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-base font-medium">These rules from your personal space stop applying in it:</p>
          <ul className="flex flex-col gap-2">
            {conversion.rulesLeaving.map((rule, index) => (
              <li key={index}>
                <ProposedChange kind={rule.kind} label={`${rule.kind === 'requirement' ? 'Requirement' : 'Preference'} from ${rule.from ?? 'a space above'}`} text={rule.text} settled />
              </li>
            ))}
          </ul>
          <RadioCards
            label="What becomes of them?"
            surface="muted"
            value={choice.rules}
            onChange={(rules) => set({ rules })}
            disabled={disabled}
            options={[
              { value: 'keep', label: 'Keep them for me', detail: `In ${name}, only for you.`, private: true },
              { value: 'share', label: 'Add them for everyone', detail: `In ${name}, for everyone who has it.` },
              { value: 'drop', label: 'Let them go', detail: 'They stay in your personal space.' },
            ]}
          />
        </div>
      )}
      {conversion.skillsLeaving.length > 0 && (
        <p className="text-base">
          {conversion.skillsLeaving.length === 1 ? 'The skill' : 'The skills'} {conversion.skillsLeaving.map((skill) => `“${skill.name}”`).join(', ')} from your personal space stop applying in it too. Add {conversion.skillsLeaving.length === 1 ? 'it' : 'them'} to {name}’s Guidance afterwards if you need {conversion.skillsLeaving.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}
