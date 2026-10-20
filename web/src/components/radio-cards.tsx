import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from 'cn';
import { focusRing } from '@/components/screen';

/**
 * A choice between a few options, each a card with what choosing it means. It behaves like radio
 * buttons: one Tab stop, and the arrow keys move the choice. An option that keeps something to
 * yourself takes the private tint.
 */
export function RadioCards<T extends string>({ label, labelledBy, value, options, onChange, disabled, surface = 'card' }: {
  label?: string;
  labelledBy?: string;
  value?: T;
  options: { value: T; label: ReactNode; detail: ReactNode; private?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** What the cards sit on: white cards on a tinted panel, or tinted cards on a white one. */
  surface?: 'card' | 'muted';
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.findIndex((option) => option.value === value);
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className="flex flex-col gap-2 sm:flex-row">
      {options.map((option, index) => {
        const checked = index === chosen;
        return (
          <button
            key={option.value}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (chosen === -1 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              'flex flex-1 flex-col items-start gap-0.5 rounded-xl px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-60',
              surface === 'card' ? 'bg-card' : 'bg-muted',
              focusRing,
              checked && (option.private ? 'bg-private/40 hover:bg-private/40' : 'bg-accent'),
            )}
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden="true" className={cn('size-4 shrink-0 rounded-full border-2 border-input', checked && 'border-[5px] border-primary')} />
              {option.label}
            </span>
            <span className="pl-6 text-sm text-muted-foreground">{option.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
