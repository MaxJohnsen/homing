import { cn } from 'cn';
import { OnlyYou } from '@/components/only-you';
import { focusRing, ScreenHeader, Section } from '@/components/screen';
import type { SkillData } from '@/lib/guidance';
import { Link } from '@/lib/router';

/** A skill opens like a page: what it does, its instructions and files, where it comes from and what it replaces. */
export function Skill({ skill }: { skill: SkillData }) {
  const space = skill.spaceId && skill.spaceName && (
    <Link href={`/spaces/${skill.spaceId}/skills`} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
      {skill.spaceName}
    </Link>
  );
  return (
    <>
      <ScreenHeader
        title={skill.name}
        aside={!skill.shared && <OnlyYou />}
        meta={
          !space
            ? 'A skill from a space above, which reaches you where you work.'
            : skill.shared
              ? <>A skill in {space}, for everyone in it and the spaces under it.</>
              : <>Your own skill in {space}, for you there and in the spaces under it.</>
        }
      />
      {skill.description && <p className="-mt-4 max-w-[65ch] text-lg leading-[1.6]">{skill.description}</p>}
      {skill.replaces.length > 0 && (
        <div className="flex max-w-[65ch] flex-col gap-1 rounded-xl bg-muted px-4 py-3 text-base">
          {skill.replaces.map((other) => (
            <p key={other.id}>
              Where it applies, it replaces{' '}
              <Link href={`/skills/${other.id}`} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
                {other.spaceName ? `${other.spaceName}’s ${skill.name}` : `the ${skill.name} from a space above`}
              </Link>
              .
            </p>
          ))}
        </div>
      )}
      <Section title="Instructions" tone="raised">
        {skill.instructions
          ? <p className="max-w-[65ch] text-base leading-[1.65] whitespace-pre-line">{skill.instructions}</p>
          : <p className="text-base text-muted-foreground">This skill has no instructions beyond its description.</p>}
      </Section>
      {skill.files.length > 0 && (
        <Section title="Files" description="Whether your assistant can use a skill’s files depends on the assistant.">
          <ul className="flex flex-col gap-2">
            {skill.files.map((file) => (
              <li key={file.path}>
                <details className="group rounded-xl bg-muted">
                  <summary className={cn('cursor-pointer list-none rounded-xl px-4 py-3 text-base font-medium [&::-webkit-details-marker]:hidden', focusRing)}>{file.path}</summary>
                  <pre className="overflow-x-auto px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap">{file.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
