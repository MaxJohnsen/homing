import { Lock } from 'lucide-react';
import { cn } from 'cn';

/** Marks what only the viewer can see. The label is always there; the color and lock only support it. */
export function OnlyYou({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-private px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-private-foreground', className)}>
      <Lock aria-hidden="true" className="size-3" />
      Only you
    </span>
  );
}
