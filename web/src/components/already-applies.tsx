import { ChevronDown } from 'lucide-react';
import type { ProposalData } from '@/lib/proposals';

/** The rules that already apply where a new one would go, so the person sees what it joins. */
export function AlreadyApplies({ rules, precedence, open }: { rules: ProposalData['alreadyApplies']; precedence: string; open?: boolean }) {
  if (!rules.length) return null;
  return (
    <details open={open} className="group rounded-xl bg-muted">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base [&::-webkit-details-marker]:hidden">
        {rules.length === 1 ? '1 rule already applies here' : `${rules.length} rules already apply here`}
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="flex flex-col gap-3 px-4 pb-4">
        {rules.map((rule, index) => (
          <li key={index} className="flex flex-col gap-0.5 text-base">
            <span className="whitespace-pre-line">{rule.text}</span>
            <span className="text-sm text-muted-foreground">
              {rule.kind === 'requirement' ? 'Requirement' : 'Preference'}, from {rule.from}
            </span>
          </li>
        ))}
        <li className="text-sm text-muted-foreground">{precedence}</li>
      </ul>
    </details>
  );
}
