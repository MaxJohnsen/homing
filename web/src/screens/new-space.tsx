import { useState } from 'react';
import { draftOf, parentOf, placesIn, SpaceFields, spaceOf, type SpaceSet } from '@/components/space-fields';
import { cn } from 'cn';
import { focusRing, ScreenHeader, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { useLoad } from '@/lib/load';
import { Link } from '@/lib/router';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';

export type CreateSpace = (input: SpaceSet) => Promise<{ id: string } | { problem: string; field?: string }>;

/** Starting a space (spec §1): its name and who it's for, then where it goes, then it opens. */
export function NewSpace({ spaces, start, name, create, onCreated, onCancel }: {
  spaces: SpaceSummary[];
  /** The space it was started from, such as Acme's "New space in Acme". */
  start?: string;
  /** A name to start with, such as one an assistant filled in. */
  name?: string;
  create: CreateSpace;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const places = placesIn(spaces);
  const [draft, setDraft] = useState(() => draftOf(places, { in: start, name }));
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const space = spaceOf(draft, places);
  // Who has the shared space it would go in, so the choice says how many people that is.
  const parent = draft.who === 'with others' ? parentOf(draft, places) : undefined;
  const audience = useLoad<SpaceData>(parent ? `/api/spaces/${parent.id}` : '').data;

  const save = async () => {
    if (!space?.name) return;
    setBusy(true);
    const answer = await create(space);
    setBusy(false);
    if ('problem' in answer) setProblem({ field: answer.field, message: answer.problem });
    else onCreated(answer.id);
  };

  return (
    <>
      <ScreenHeader title="New space" meta="A space keeps one client, project or part of your life together: what’s known about it, its rules and who’s in it." />
      <Section tone="raised" className="max-w-2xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SpaceFields
            draft={draft}
            onChange={setDraft}
            places={places}
            audience={audience && audience.id === parent?.id ? { people: audience.members.length, above: audience.reachedFromAbove } : undefined}
            problem={problem}
            disabled={busy}
            autoFocus
          />
          {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !space?.name}>Create space</Button>
          </div>
        </form>
      </Section>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Moving a space from another Homing, or bringing one back?{' '}
        <Link href="/spaces/import" className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
          Import its export
        </Link>
        , and it becomes a space of its own that only you have.
      </p>
    </>
  );
}
