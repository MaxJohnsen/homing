import { Wordmark } from '@/components/wordmark';

/** An address that leads nowhere, with the mark and name top left like every page outside the app. */
export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
      <a href="/" className="w-fit rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/70 focus-visible:outline-none">
        <Wordmark className="text-lg" />
      </a>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">There’s no page here</h1>
        <a href="/" className="w-fit rounded-sm text-base font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary focus-visible:ring-[3px] focus-visible:ring-ring/70 focus-visible:outline-none">Go to Homing</a>
      </main>
    </div>
  );
}
