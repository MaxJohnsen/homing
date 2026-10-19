import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';

export type RuleKind = 'requirement' | 'preference';

const kindLabel: Record<RuleKind, string> = { requirement: 'Requirement', preference: 'Preference' };

/**
 * The exact change someone is deciding on, word for word and set apart from everything around it.
 * It is always shown in full, because approving runs exactly what was shown. A short rule is set
 * large; a longer one at reading size, keeping its line breaks. The label says what the text is,
 * the rule's kind unless given.
 */
export function ProposedChange({ kind, text, label, onlyYou, settled, className }: {
  kind: RuleKind;
  text: string;
  label?: string;
  /** Marks a rule only the viewer has. */
  onlyYou?: boolean;
  settled?: boolean;
  className?: string;
}) {
  const long = text.length > 120 || text.includes('\n');
  return (
    <figure className={cn('flex flex-col gap-1.5 rounded-lg bg-change px-4 py-3.5', settled && 'bg-muted', className)}>
      <figcaption className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        {label ?? kindLabel[kind]}
        {onlyYou && <OnlyYou />}
      </figcaption>
      <blockquote
        className={cn(
          'max-w-prose whitespace-pre-line',
          long ? 'text-base leading-relaxed' : 'text-lg leading-snug font-medium',
          settled && 'text-muted-foreground',
        )}
      >
        {text}
      </blockquote>
    </figure>
  );
}
