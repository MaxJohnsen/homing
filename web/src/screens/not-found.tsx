import { Wordmark } from '@/components/wordmark';

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
      <Wordmark className="text-lg" />
      <h1 className="text-2xl font-semibold tracking-tight">There’s no page here</h1>
      <a href="/" className="text-base text-primary underline-offset-4 hover:underline">Go to Homing</a>
    </main>
  );
}
