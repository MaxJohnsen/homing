import { useState } from 'react';
import { cn } from 'cn';
import { wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Wordmark } from '@/components/wordmark';

export interface ConnectingAssistant {
  name: string;
  /** Where the assistant says it is, from the address of its metadata document. */
  site: string;
}

/** Choosing whether to connect an assistant, which then reads what you can see in Homing. */
export function Connect({
  assistant,
  person,
  decide,
}: {
  assistant: ConnectingAssistant;
  person: string;
  /** Allows or refuses. Resolves to a message to show, or nothing once on the way back to the assistant. */
  decide?: (allow: boolean) => Promise<string | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const choose = async (allow: boolean) => {
    if (!decide) return;
    setBusy(true);
    setMessage(await decide(allow));
    setBusy(false);
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-5">
        <Wordmark />
        <span className="text-sm text-muted-foreground">{person}</span>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 pb-16">
        <div className="flex flex-col gap-6 rounded-2xl bg-card p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Connect {assistant.name} to Homing?</h1>
            <p className="text-base text-muted-foreground">
              Connect it only if you came here from <span className="font-medium text-foreground">{assistant.site}</span>.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg bg-change p-5 text-base">
            <p>{assistant.name} can read the knowledge you have access to, and save what it learns privately.</p>
            <p>Changing rules or sharing knowledge requires your approval.</p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap-reverse sm:justify-end">
            <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={() => choose(false)}>Cancel</Button>
            <Button size="lg" className={cn(wrapsLabel, 'min-h-11 text-base sm:px-5')} disabled={busy} onClick={() => choose(true)}>Connect {assistant.name}</Button>
          </div>
          {message && <FieldError>{message}</FieldError>}
          <p className="text-sm text-muted-foreground">You can disconnect it at any time from your account.</p>
        </div>
      </main>
    </div>
  );
}
