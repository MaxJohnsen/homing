import { useState } from 'react';
import { OnlyYou } from '@/components/only-you';
import { dateOf, ScreenHeader, Section } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** What an export would bring, before anything is created. */
export interface ImportPreviewData {
  name: string;
  from: { instance: string; exportedBy: string; exportedAt: string };
  /** The exported space first, and each below the one it's in. */
  spaces: { name: string; depth: number; closed: boolean; archived: boolean; pages: number; sources: number; tasks: number }[];
  /** How much of it the export shared, and how much was private to whoever exported it. */
  shared: number;
  private: number;
  rules: { space: string; kind: 'requirement' | 'preference'; text: string; onlyHere: boolean; private: boolean }[];
  skills: { space: string; name: string; private: boolean }[];
}

export interface ImportActions {
  preview: (file: File) => Promise<{ preview: ImportPreviewData } | { problem: string }>;
  import: (file: File, name: string) => Promise<{ id: string } | { problem: string; field?: string }>;
}

/**
 * Importing a space from an export (spec §3): choose the zip, see what it brings, its rules word
 * for word, then it becomes a new space only you have, and opens.
 */
export function ImportSpace({ actions, onImported, onCancel, shown }: {
  actions: ImportActions;
  onImported: (id: string) => void;
  onCancel: () => void;
  /** A preview to start from, for the screens' samples. */
  shown?: ImportPreviewData;
}) {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ImportPreviewData | undefined>(shown);
  const [name, setName] = useState(shown?.name ?? '');
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);

  const choose = async (chosen: File | undefined) => {
    setFile(chosen);
    setPreview(undefined);
    setProblem(undefined);
    if (!chosen) return;
    setBusy(true);
    const answer = await actions.preview(chosen);
    setBusy(false);
    if ('problem' in answer) setProblem({ message: answer.problem });
    else {
      setPreview(answer.preview);
      setName(answer.preview.name);
    }
  };

  const bring = async () => {
    if (!file || !name.trim()) return;
    setBusy(true);
    const answer = await actions.import(file, name.trim());
    setBusy(false);
    if ('problem' in answer) setProblem({ field: answer.field, message: answer.problem });
    else onImported(answer.id);
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
            <Input
              id="import-file"
              type="file"
              accept=".zip,application/zip"
              className="h-11 py-2 text-base md:text-base"
              disabled={busy}
              onChange={(event) => void choose(event.target.files?.[0])}
              aria-invalid={Boolean(problem && !preview) || undefined}
              aria-describedby={problem && !preview ? 'import-problem' : undefined}
            />
            {busy && !preview && <p role="status" className="text-sm text-muted-foreground">Reading the export…</p>}
            {problem && !preview && <FieldError id="import-problem">{problem.message}</FieldError>}
          </div>
          {preview && (
            <>
              <p className="text-base">
                {top} was exported from {hostOf(preview.from.instance)} by {exporter} on {dateOf(preview.from.exportedAt)}.
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
            {busy && <p role="status" className="text-sm text-muted-foreground">Importing. A big space takes a little while.</p>}
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
