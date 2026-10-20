import { cn } from 'cn';
import { focusRing } from '@/components/screen';

export type Audience = 'you' | 'space';

/**
 * Who will see what you're writing, said before you save: only you, or everyone in the space,
 * with how many people that is now and that anyone who joins later sees it too.
 */
export function AudienceChoice({ space, people, above = false, value, onChange, disabled }: {
  space: string;
  /** How many people see what's shared in the space now, you included, that you can see. */
  people: number;
  /** People who can open a space above it, which you can't, see it too; how many isn't yours to know. */
  above?: boolean;
  value: Audience;
  onChange: (value: Audience) => void;
  disabled?: boolean;
}) {
  const others = people - 1;
  const options: { value: Audience; label: string; detail: string }[] = [
    { value: 'you', label: 'Only you', detail: 'Nobody else sees it, and your assistant can use it.' },
    {
      value: 'space',
      label: `Everyone in ${space}`,
      detail: above
        ? others > 0
          ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`}, everyone who can open the space above it, and anyone who joins later.`
          : 'Everyone who can open the space above it, and anyone who joins later.'
        : others > 0
          ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`} now, and anyone who joins later.`
          : 'Only you are in it now, but anyone who joins later sees it too.',
    },
  ];
  return (
    <div role="radiogroup" aria-label="Who sees it" className="flex flex-col gap-2 sm:flex-row">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex flex-1 flex-col items-start gap-0.5 rounded-xl bg-card px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60',
            focusRing,
            value === option.value && (option.value === 'you' ? 'bg-private/40 hover:bg-private/40' : 'bg-accent'),
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
  );
}
