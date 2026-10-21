import { useEffect, useRef, useState } from 'react';
import { OnlyYou } from '@/components/only-you';
import { dateOf, ScreenHeader, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from 'cn';

/** What an export would bring, before anything is created. */
export interface ImportPreviewData {
  name: string;
  from: { instance: string; exportedBy: string; exportedAt: string };
  /** The exported space first, and each below the one it's in. */
  spaces: { name: string; depth: number; closed: boolean; archived: boolean; pages: number; sources: number; tasks: number }[];
  /** How much of it the export shared, and how much was private to whoever exported it. */
  shared: number;
  private: number;
  /** Each rule word for word, with what it refers to in the export by name. */
  rules: { space: string; kind: 'requirement' | 'preference'; text: string; onlyHere: boolean; private: boolean }[];
  skills: { space: string; name: string; private: boolean }[];
  /** What a space's guidance includes from another, its rules or a skill: from the file, or from outside it, which won't come along. */
  includes: { space: string; kind: 'rules' | 'skill'; from: string; skill: string | null; private: boolean; waiting: boolean; inFile: boolean }[];
  /** A fingerprint of the export, so the import is of exactly what was shown. */
  hash: string;
}

/** How far along a preview being read, or an import, is, as Homing says. */
export type ImportProgress =
  | { state: 'reading' | 'importing'; done: number; total: number }
  | { state: 'done'; id: string }
  | { state: 'failed'; message: string }
  | { state: 'none' };

export interface ImportActions {
  /** Sends the file to be read, saying how much of it is sent as it goes. */
  preview: (file: File, sent: (fraction: number) => void) => Promise<{ preview: ImportPreviewData } | { problem: string }>;
  /** Starts importing what was previewed, under a name. */
  import: (name: string, hash: string) => Promise<{ started: true } | { problem: string; field?: string }>;
  progress: () => Promise<ImportProgress>;
}

/**
 * Importing a space from an export (spec §3): choose the zip, see what it brings, its rules word
 * for word, then it becomes a new space only you have, and opens.
 */
export function ImportSpace({ actions, onImported, onCancel, shown, underWay }: {
  actions: ImportActions;
  onImported: (id: string) => void;
  onCancel: () => void;
  /** A preview to start from, and what's under way, for the screens' samples. */
  shown?: ImportPreviewData;
  underWay?: { doing: 'sending' | 'reading' | 'importing'; fraction: number; file?: File };
}) {
  const [file, setFile] = useState<File | undefined>(underWay?.file);
  const [preview, setPreview] = useState<ImportPreviewData | undefined>(shown);
  const [name, setName] = useState(shown?.name ?? '');
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  // What's under way: sending the file, Homing reading it, or importing it, and how far along.
  const [step, setStep] = useState<{ doing: 'sending' | 'reading' | 'importing'; fraction: number } | undefined>(underWay);
  const picker = useRef<HTMLInputElement>(null);
  const busy = step !== undefined;

  // An import that's still going, as when the person comes back to this screen, carries on here.
  useEffect(() => {
    if (shown) return;
    void actions.progress().then((now) => {
      if (now.state === 'importing') void follow();
    });
  }, []);

  /** Follows an import until it's done, then opens the new space. */
  const follow = async () => {
    setStep({ doing: 'importing', fraction: 0 });
    for (;;) {
      const now = await actions.progress();
      if (now.state === 'done') return onImported(now.id);
      if (now.state === 'failed') {
        setStep(undefined);
        setProblem({ message: now.message });
        return;
      }
      if (now.state === 'importing') setStep({ doing: 'importing', fraction: now.total ? now.done / now.total : 0 });
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  };

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    setPreview(undefined);
    setProblem(undefined);
    setStep({ doing: 'sending', fraction: 0 });
    let reading = false;
    const answer = actions.preview(chosen, (fraction) => {
      // Once it's all sent, Homing reads it, and says how far it's got.
      if (fraction >= 1 && !reading) {
        reading = true;
        void (async () => {
          while (reading) {
            setStep((last) => (last && last.doing !== 'importing' ? { doing: 'reading', fraction: last.doing === 'reading' ? last.fraction : 0 } : last));
            const now = await actions.progress();
            if (!reading) break;
            if (now.state === 'reading') setStep({ doing: 'reading', fraction: now.total ? now.done / now.total : 0 });
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        })();
      } else if (!reading) setStep({ doing: 'sending', fraction });
    });
    const result = await answer;
    reading = false;
    setStep(undefined);
    if ('problem' in result) setProblem({ message: result.problem });
    else {
      setPreview(result.preview);
      setName(result.preview.name);
    }
  };

  const bring = async () => {
    if (!preview || !name.trim()) return;
    setProblem(undefined);
    setStep({ doing: 'importing', fraction: 0 });
    const answer = await actions.import(name.trim(), preview.hash);
    if ('problem' in answer) {
      setStep(undefined);
      setProblem({ field: answer.field, message: answer.problem });
      return;
    }
    await follow();
  };

  const exporter = preview?.from.exportedBy || 'whoever exported it';
  const top = preview?.spaces[0]?.name;

  const here = (space: string) => (space === top ? name.trim() || top : space);

  return (
    <>
      <ScreenHeader title="Import a space" meta="From a space exported from Homing, here or elsewhere. It becomes a new space that only you have, until you add people." />
      <form
        className="flex max-w-2xl flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          void bring();
        }}
      >
        <Section tone="raised">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-file">The export, a zip file</Label>
            <input
              ref={picker}
              id="import-file"
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              tabIndex={-1}
              disabled={busy}
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 text-base sm:px-5"
                disabled={busy}
                onClick={() => picker.current?.click()}
                aria-invalid={Boolean(problem && !preview) || undefined}
                aria-describedby={problem && !preview ? 'import-problem' : undefined}
              >
                {file ? 'Choose another file' : 'Choose the zip'}
              </Button>
              <span className="text-sm text-muted-foreground break-all">{file ? `${file.name}, ${sizeOf(file.size)}` : 'No file chosen yet'}</span>
            </div>
            {step && step.doing !== 'importing' && (
              <UnderWay label={step.doing === 'sending' ? `Sending ${file?.name ?? 'the export'}` : 'Reading the export'} fraction={step.fraction} />
            )}
            {problem && !preview && <FieldError id="import-problem">{problem.message}</FieldError>}
          </div>
          {preview && (
            <>
              <p className="text-base">
                The file says {top} was exported from {hostOf(preview.from.instance)} by {exporter} on {dateOf(preview.from.exportedAt)}.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="import-name">Name</Label>
                <Input
                  id="import-name"
                  className="h-11 text-base md:text-base sm:max-w-sm"
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={problem?.field === 'name' || undefined}
                  aria-describedby={problem?.field === 'name' ? 'import-name-problem' : undefined}
                  disabled={busy}
                />
                {problem?.field === 'name' && <FieldError id="import-name-problem">{problem.message}</FieldError>}
              </div>
              <ul className="flex flex-col gap-1 rounded-xl bg-muted p-4">
                {preview.spaces.map((space, index) => (
                  <li key={index} className="text-base" style={{ paddingLeft: `${space.depth * 1.25}rem` }}>
                    <span className="font-semibold">{index === 0 ? here(space.name) : space.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {' '}
                      {[count(space.pages, 'page'), space.sources > 0 && count(space.sources, 'source'), space.tasks > 0 && count(space.tasks, 'task'), space.closed && 'closed', space.archived && 'archived'].filter(Boolean).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-base">
                Only you will have it. What the export shared, {count(preview.shared, 'item')}, goes on its shared side, for the people you add later.
                {preview.private > 0 && ` What was private to ${exporter}, ${count(preview.private, 'item')}, is only yours.`}{' '}
                Who wrote each item comes along by name, marked as imported, and nobody here is credited with it.
              </p>
            </>
          )}
        </Section>
        {preview && (
          <Section
            title="Rules your assistants will follow"
            description={preview.rules.length ? 'Read them before you import. Each applies in its space and the spaces in it, unless it’s only there.' : 'The export has no rules.'}
          >
            {preview.rules.length > 0 && (
              <ul className="flex flex-col gap-1">
                {preview.rules.map((rule, index) => (
                  <li key={index} className="flex flex-col gap-0.5 py-2">
                    <span className="text-base whitespace-pre-line">{rule.text}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {rule.kind === 'requirement' ? 'Requirement' : 'Preference'}, {rule.onlyHere ? 'only in' : 'in'} {here(rule.space)}
                      {rule.private && <OnlyYou />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
        {preview && preview.includes.length > 0 && (
          <Section title="Included from other spaces" description="Guidance a space brings in from another by link, as if it were set there.">
            <ul className="flex flex-col gap-1">
              {preview.includes.map((include, index) => {
                const what = include.kind === 'rules' ? `the rules of ${include.inFile ? here(include.from) : include.from}` : `the skill ${include.skill} from ${include.inFile ? here(include.from) : include.from}`;
                return (
                  <li key={index} className="flex flex-col gap-0.5 py-2">
                    <span className="text-base">
                      {include.inFile
                        ? `${here(include.space)} includes ${what}.`
                        : `${here(include.space)} included ${what}, which isn’t in the file. ${include.kind === 'rules' ? 'They' : 'It'} won’t apply here.`}
                    </span>
                    {(include.private || include.waiting) && (
                      <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {include.waiting && 'Waiting, since it’s included for everyone too'}
                        {include.private && <OnlyYou />}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        {preview && preview.skills.length > 0 && (
          <Section title="Skills" description="Instructions your assistants can use there, with their files.">
            <ul className="flex flex-col gap-1">
              {preview.skills.map((skill, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2 py-1 text-base">
                  <span className="font-semibold">{skill.name}</span>
                  <span className="text-sm text-muted-foreground">in {here(skill.space)}</span>
                  {skill.private && <OnlyYou />}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {preview && (
          <div className="flex flex-col gap-3">
            {problem && problem.field !== 'name' && <FieldError>{problem.message}</FieldError>}
            {step?.doing === 'importing' && <UnderWay label={`Importing ${name.trim() || top}`} note="You can leave this page, and it carries on." fraction={step.fraction} />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onCancel}>Cancel</Button>
              <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !name.trim()}>Import {name.trim() || top}</Button>
            </div>
          </div>
        )}
      </form>
    </>
  );
}

/** How far along something is, as a bar and in words. */
function UnderWay({ label, note, fraction }: { label: string; note?: string; fraction: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <div role="status" className="flex flex-col gap-1.5">
      <span className="text-sm text-muted-foreground">{label}: {percent}%{note ? `. ${note}` : ''}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
        <div className={cn('h-full rounded-full bg-primary transition-[width]')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** A file's size, in words. */
function sizeOf(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function count(n: number, noun: string): string {
  return `${n.toLocaleString('en')} ${noun}${n === 1 ? '' : 's'}`;
}

/** "app.homing.place", for an instance's address. */
function hostOf(instance: string): string {
  try {
    return new URL(instance).host;
  } catch {
    return 'another Homing';
  }
}
