import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import type { ApiError } from '@/lib/api';
import { reload } from '@/lib/load';

/** The focus ring on links and rows that aren't buttons. */
export const focusRing = 'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none';

/**
 * For a button whose label can be long, as one with a space's name in it: the label wraps inside the
 * button instead of running past its edge. Follow it with the button's usual height as a minimum,
 * such as min-h-11, and less padding on a smaller button (py-1.5 by default, py-1 small) so one line
 * keeps that height.
 */
export const wrapsLabel = 'h-auto max-w-full py-2 text-center whitespace-normal text-balance';

/** A screen's title, at the top of the scale, with a line under it saying where it is. */
export function ScreenHeader({ title, meta, aside, below }: { title: ReactNode; meta?: ReactNode; aside?: ReactNode; below?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance [overflow-wrap:anywhere]">{title}</h1>
        {aside}
      </div>
      {meta && <p className="max-w-[65ch] text-base text-muted-foreground">{meta}</p>}
      {below}
    </header>
  );
}

/** One part of a screen. Plain by default; raised lifts it a step to white. */
export function Section({ title, description, children, tone = 'plain', className }: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  tone?: 'plain' | 'raised';
  className?: string;
}) {
  const id = title && `section-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-4', tone === 'raised' && 'rounded-2xl bg-card p-5 sm:p-6', className)}>
      {title && (
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="text-lg leading-snug font-semibold tracking-[-0.01em]">{title}</h2>
          {description && <p className="max-w-[65ch] text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A small label, such as "Admin". */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground', className)}>
      {children}
    </span>
  );
}

/** Initials in a circle, for a person. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold', className)}>
      {initials}
    </span>
  );
}

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** "5 minutes ago", "yesterday", or a date once it's more than a week ago. */
export function ago(at: string, now = new Date()): string {
  const minutes = Math.round((new Date(at).getTime() - now.getTime()) / 60000);
  if (minutes > -60) return relative.format(Math.min(minutes, -1), 'minute');
  if (minutes > -60 * 24) return relative.format(Math.round(minutes / 60), 'hour');
  if (minutes > -60 * 24 * 7) return relative.format(Math.round(minutes / (60 * 24)), 'day');
  return dateOf(at);
}

/** "1 change", "3 changes". */
export function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const dayOnly = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** "October 14", with the year when it isn't this year. */
export function dateOf(at: string): string {
  const date = new Date(at);
  return (date.getFullYear() === new Date().getFullYear() ? dayOnly : dayYear).format(date);
}

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "2:05 PM". */
export function timeOf(at: string): string {
  return time.format(new Date(at));
}

/** Whether a load failed for a reason other than there being nothing there to open. */
export function failed(...errors: (ApiError | undefined)[]): boolean {
  return errors.some((error) => error !== undefined && error.status !== 404);
}

/** Said in place of something that didn't load, with a way to try again. */
export function LoadFailed({ paths }: { paths: string[] }) {
  return (
    <div role="alert" className="flex max-w-[65ch] flex-col items-start gap-3 rounded-2xl bg-muted p-5">
      <p className="text-base font-semibold">This didn’t load.</p>
      <p className="text-sm text-muted-foreground">Homing may be restarting, or the connection dropped. Try again in a moment.</p>
      <Button variant="outline" onClick={() => Promise.all(paths.map((path) => reload(path)))}>Try again</Button>
    </div>
  );
}
