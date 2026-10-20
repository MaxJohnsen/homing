import { RadioCards } from '@/components/radio-cards';

export type Audience = 'you' | 'space';

/** "25 other people now, and anyone who joins later.": who everyone in a space is. */
export function everyoneIn(people: number, above = false): string {
  const others = people - 1;
  const count = others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`;
  if (above) return others > 0 ? `${count}, everyone who can open the space above it, and anyone who joins later.` : 'Everyone who can open the space above it, and anyone who joins later.';
  return others > 0 ? `${count} now, and anyone who joins later.` : 'Only you are in it now, but anyone who joins later sees it too.';
}

/**
 * Who will see what you're writing, said before you save: only you, or everyone in the space,
 * with how many people that is now and that anyone who joins later sees it too.
 */
export function AudienceChoice({ space, people, above = false, value, onChange, disabled, surface = 'card' }: {
  space: string;
  /** How many people see what's shared in the space now, you included, that you can see. */
  people: number;
  /** People who can open a space above it, which you can't, see it too; how many isn't yours to know. */
  above?: boolean;
  value: Audience;
  onChange: (value: Audience) => void;
  disabled?: boolean;
  /** What the choices sit on: a tinted panel, or a white one such as a form. */
  surface?: 'card' | 'muted';
}) {
  const options: { value: Audience; label: string; detail: string }[] = [
    { value: 'you', label: 'Only you', detail: 'Nobody else sees it, and your assistant can use it.' },
    { value: 'space', label: `Everyone in ${space}`, detail: everyoneIn(people, above) },
  ];
  return (
    <RadioCards
      label="Who sees it"
      surface={surface}
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={options.map((option) => ({ ...option, private: option.value === 'you' }))}
    />
  );
}
