import { useRef, useState, type FormEvent } from 'react';
import { cn } from 'cn';
import { count, dateOf, focusRing, Section, wrapsLabel } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { modelsOf, purposes, usd, type ModelSpendingData, type ModelUseData } from '@/lib/model';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

const deploymentGuide = 'https://github.com/MaxJohnsen/homing/blob/main/docs/deployment.md#a-model';

/** Said wherever it applies: the setting is about Homing's own model, not what assistants do. */
const assistantsAside = 'It doesn’t change what your assistants, such as Claude, can read.';

/**
 * Model processing in a space's Settings (spec §11): which provider Homing sends what it learns
 * from to, in plain words, and whether this space is kept from it. Its admins turn it off, which
 * covers the spaces in it too, and turning it back on asks first, since it sends content out.
 */
export function ModelProcessing({ space, set }: { space: SpaceData; set?: (on: boolean) => Promise<string | undefined> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const opener = useRef<HTMLButtonElement>(null);
  const state = space.modelProcessing;
  if (!state) return null;
  const name = space.personal ? 'your personal space' : space.name;
  const model = space.model;
  const run = async (on: boolean) => {
    if (!set) return;
    setBusy(true);
    const answer = await set(on);
    setBusy(false);
    setProblem(answer);
    if (!answer) setAsking(false);
  };

  let description: string;
  if (state.offAbove) {
    description = `It’s off in ${state.offIn?.name ?? 'a space above it'}, so nothing in ${name} is sent to a model, and what lands here is kept without one. ${assistantsAside}`;
  } else if (!state.on) {
    description = `Nothing in ${name}, or in the spaces in it, is sent to a model, and what lands here is kept without one. ${assistantsAside}`;
  } else if (model) {
    description = `Homing sends what it learns from in ${name} to ${model.provider} (${modelsOf(model)}) to understand it. Turned off, nothing in ${name} or the spaces in it is sent. ${assistantsAside}`;
  } else {
    description = `Homing has no model set up, so nothing in ${name} is sent to one. Turning it off here keeps it that way if one is added.`;
  }
  const by = state.you ? ' by you' : state.offBy ? ` by ${state.offBy}` : '';

  return (
    <Section title={state.on ? 'Model processing' : 'Model processing is off'} className="max-w-2xl" description={description}>
      {!state.on && state.offAt && <p className="text-base">Turned off on {dateOf(state.offAt)}{by}.</p>}
      {state.offAbove && state.offIn && (
        <Link href={`/spaces/${state.offIn.id}/settings`} className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
          Open {state.offIn.name}
        </Link>
      )}
      {!state.offAbove && !space.admin && <p className="text-base">{state.on ? `${space.name}’s admins can turn it off.` : `${space.name}’s admins can turn it back on.`}</p>}
      {!state.offAbove && space.admin && set && (
        state.on ? (
          <div>
            <Button variant="outline" size="lg" className={cn(wrapsLabel, 'min-h-11 text-base sm:px-5')} disabled={busy} onClick={() => run(false)}>
              Turn off for {name}
            </Button>
          </div>
        ) : asking ? (
          <div role="group" aria-label={`Turn on model processing for ${name}`} className="flex flex-col gap-3 rounded-xl bg-muted p-3">
            <p className="text-sm">
              {space.private ? 'Turn it on?' : `Turn it on for everyone in ${name}?`}{' '}
              {model
                ? `What Homing learns from in ${name}, and in the spaces in it, will be sent to ${model.provider} to understand it.`
                : `Once Homing has a model, what it learns from in ${name}, and in the spaces in it, will be sent to it.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} autoFocus onClick={() => {
                setAsking(false);
                requestAnimationFrame(() => opener.current?.focus());
              }}>Keep it off</Button>
              <Button disabled={busy} onClick={() => run(true)}>Turn on</Button>
            </div>
          </div>
        ) : (
          <div>
            <Button ref={opener} variant="outline" size="lg" className={cn(wrapsLabel, 'min-h-11 text-base sm:px-5')} onClick={() => setAsking(true)}>
              Turn on for {name}
            </Button>
          </div>
        )
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </Section>
  );
}

/** "Acme and your personal space", with the spaces you can no longer open counted. */
function spacesOf(use: ModelUseData['uses'][number]): string {
  const names = [...use.spaces.map((space) => space.name), ...(use.elsewhere ? [count(use.elsewhere, 'space you can’t open now', 'spaces you can’t open now')] : [])];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

/**
 * What Homing's model did for you this month, on your account: what for, where, with which model,
 * and what it cost, against the limit everyone here shares. Only you see it.
 */
export function ModelUse({ data }: { data: ModelUseData }) {
  if (!data.model && data.uses.length === 0) return null;
  const cost = data.uses.reduce((sum, use) => sum + use.cost, 0);
  const underWay = data.uses.reduce((sum, use) => sum + use.underWay, 0);
  const calls = data.uses.reduce((sum, use) => sum + use.calls, 0);
  return (
    <section aria-labelledby="model-heading" className="flex flex-col gap-4 rounded-2xl bg-card px-6 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <h2 id="model-heading" className="text-lg font-semibold tracking-tight">Homing’s model</h2>
        <p className="text-base text-muted-foreground">
          {data.model ? `What Homing sent to ${data.model.provider} for you this month, to learn from it, and what that cost. Only you see it.` : 'What Homing’s model did for you this month. Only you see it.'}
        </p>
      </div>
      {data.pausedAt && (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          Learning is paused for everyone here since {dateOf(data.pausedAt)}: this month’s limit of {usd(data.limit)} is reached. Whoever looks after Homing can raise it.
        </p>
      )}
      {calls === 0 ? (
        <p className="text-base">Nothing yet this month.</p>
      ) : (
        <>
          <p className="text-base">
            This month it cost {usd(cost)} for you, in {count(calls, 'call', 'calls')}{underWay >= 0.005 ? `, with up to ${usd(underWay)} more under way` : ''}.
          </p>
          <ul className="flex flex-col gap-2">
            {data.uses.map((use) => (
              <li key={`${use.purpose} ${use.model} ${use.spaces.map((space) => space.id).join(' ')} ${use.elsewhere}`} className="flex flex-col gap-0.5 rounded-xl bg-muted px-4 py-3">
                <span className="text-base font-semibold [overflow-wrap:anywhere]">{purposes[use.purpose]} in {spacesOf(use)}</span>
                <span className="text-sm text-muted-foreground">{count(use.calls, 'call', 'calls')} to {use.model}, {usd(use.cost)}{use.underWay >= 0.005 ? `, and up to ${usd(use.underWay)} under way` : ''}.</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm text-muted-foreground">Homing’s monthly limit for learning is {usd(data.limit)}, shared by everyone here.</p>
    </section>
  );
}

/**
 * For whoever looks after Homing: which model it uses, what that cost this month against the
 * monthly limit, person by person, and changing the limit, which resumes learning paused at it.
 * Never what the calls were about, or where.
 */
export function ModelSpending({ data, setLimit }: { data: ModelSpendingData | null; setLimit?: (limit: string) => Promise<string | undefined> }) {
  const [limit, setValue] = useState(data ? String(data.limit) : '');
  const [problem, setProblem] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) {
    return (
      <Section title="Homing’s model" tone="raised" description="Homing has no model set up, so it learns only through people’s assistants. With a provider’s API key, it learns in the background too, within a monthly limit you set.">
        <a href={deploymentGuide} target="_blank" rel="noreferrer" className={cn('w-fit rounded-sm text-base font-semibold text-primary-ink hover:underline', focusRing)}>
          How to set it up
        </a>
      </Section>
    );
  }
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!setLimit) return;
    setBusy(true);
    setSaved(false);
    const answer = await setLimit(limit.trim());
    setBusy(false);
    setProblem(answer);
    setSaved(!answer);
  };
  return (
    <Section title="Homing’s model" tone="raised" description={`Homing uses ${data.provider}: ${modelsOf(data)}. Each space’s admins can keep it from their space.`}>
      <p className="text-base">
        This month learning has cost {usd(data.spent)} of its {usd(data.limit)} limit{data.underWay >= 0.005 ? `, with up to ${usd(data.underWay)} more under way` : ''}.
        {!data.pausedAt && data.spent + data.underWay >= data.limit && ' That’s all of it, so learning pauses before its next call.'}
      </p>
      {data.pausedAt && (
        <p className="rounded-xl bg-muted px-4 py-3 text-base">
          Learning paused on {dateOf(data.pausedAt)}, when the next call could have passed the limit. Raise the limit, or save it as it is, to resume it.
        </p>
      )}
      {data.people.length > 0 && (
        <ul className="flex flex-col gap-1">
          {data.people.map((person, index) => (
            <li key={`${person.name} ${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 text-base">
              <span className="min-w-0 [overflow-wrap:anywhere]">{person.name ?? 'Someone who left'}{person.you && ' (you)'}</span>
              <span className="text-sm text-muted-foreground">{usd(person.cost)} in {count(person.calls, 'call', 'calls')}</span>
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-col gap-3" onSubmit={save} noValidate>
        <Field data-invalid={Boolean(problem) || undefined}>
          <FieldLabel htmlFor="model-limit">Monthly limit, in dollars</FieldLabel>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              id="model-limit"
              inputMode="decimal"
              className="h-11 text-base md:text-base sm:max-w-40"
              value={limit}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              aria-invalid={Boolean(problem) || undefined}
              aria-describedby={problem ? 'model-limit-problem' : undefined}
              disabled={busy}
            />
            <Button type="submit" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !limit.trim() || (Number(limit) === data.limit && !data.pausedAt)}>
              {data.pausedAt ? 'Raise and resume' : 'Change limit'}
            </Button>
          </div>
        </Field>
        {problem && <FieldError id="model-limit-problem">{problem}</FieldError>}
        {saved && <p role="status" className="text-sm text-muted-foreground">The limit is {usd(data.limit)} a month now.</p>}
        <p className="text-sm text-muted-foreground">Homing pauses learning before a call could take what was spent past it, and holds back calls while those under way could. A limit set at the provider too is a second guard.</p>
      </form>
    </Section>
  );
}
