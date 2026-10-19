import type { ReactNode } from 'react';
import { Wordmark } from '@/components/wordmark';

/**
 * Where someone meets Homing: signing in and joining. The form is on the left,
 * and on a desktop a drawing and the tagline on the right. On a phone only the
 * form shows, starting near the top.
 */
export function SplitLayout({ illustration, children }: { illustration: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <a href="/" className="w-fit rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/70 focus-visible:outline-none">
          <Wordmark className="text-lg" />
        </a>
        <main className="flex flex-1 items-start pt-24 pb-10 sm:items-center lg:pt-10">{children}</main>
      </div>

      <aside className="m-3 hidden flex-col items-center justify-center gap-8 rounded-3xl bg-muted px-12 py-16 lg:flex">
        <img src={illustration} alt="" width={960} height={640} loading="lazy" className="w-full max-w-md" />
        <div className="flex max-w-md flex-col gap-3 text-center">
          <p className="text-2xl leading-snug font-semibold tracking-tight text-balance">A home for everything worth knowing.</p>
          <p className="text-base leading-relaxed text-pretty text-muted-foreground">
            Homing brings together what you and your AI assistants learn, keeps it useful as life and work evolve, and lets you share it with the people who matter.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** The card a split layout's form sits in. */
export function FormCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`relative mx-auto flex w-full max-w-sm flex-col gap-7 rounded-2xl bg-card p-6 sm:p-8 ${className}`}>{children}</div>;
}
