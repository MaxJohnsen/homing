import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { Session } from './db.ts';
import { applying } from './guidance.ts';
import { checkSpace, current, insertItem, itemColumns, sideOf, visible, visibleContent, type Item } from './knowledge.ts';
import { accessibleSpaces } from './spaces.ts';

/** A file in a skill's folder, such as SKILL.md or references/tone.md. */
export interface SkillFile {
  path: string;
  body: string;
}

export interface Skill {
  pageId: string;
  name: string;
  description: string;
  spaceId: string;
  /** The name of the skill's space, or null when the viewer can't open it. */
  spaceName: string | null;
  privateTo: string | null;
}

/** The largest file Homing keeps in a skill for now, so it can still be searched. */
const largest = 512 * 1024;

/**
 * Reads a skill folder in the Agent Skills format: a SKILL.md with a name
 * and a description, and any other files. Hidden files, such as .DS_Store,
 * are skipped and listed. Homing keeps only text files up to 512 KB for
 * now, and doesn't follow links, so a folder with anything else is refused
 * as a whole, naming what it can't keep.
 */
export async function readSkillFolder(folder: string): Promise<{ files: SkillFile[]; skipped: string[] }> {
  const files: SkillFile[] = [];
  const skipped: string[] = [];
  const refused = { links: [] as string[], binary: [] as string[], large: [] as string[] };
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    const path = relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (path.split('/').some((part) => part.startsWith('.'))) skipped.push(path);
    else if (!entry.isFile()) refused.links.push(path);
    else {
      const bytes = await readFile(join(folder, path));
      const body = asText(bytes);
      if (body === undefined) refused.binary.push(path);
      else if (bytes.length > largest) refused.large.push(path);
      else files.push({ path, body });
    }
  }
  const problems = [
    refused.binary.length && `These aren't text: ${refused.binary.sort().join(', ')}.`,
    refused.large.length && `These are larger than 512 KB: ${refused.large.sort().join(', ')}.`,
    refused.links.length && `These are links, which Homing doesn't follow: ${refused.links.sort().join(', ')}.`,
  ].filter(Boolean);
  if (problems.length) {
    throw new Error(`Homing keeps only text files up to 512 KB in skills for now. ${problems.join(' ')}`);
  }
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), skipped: skipped.sort() };
}

/**
 * Saves a skill in a space, or updates the one with the same name on the
 * same side: changed files keep what they said before, and files no longer
 * in the folder are removed. Only a person editing directly can, and a
 * shared skill needs an admin. A skill reaches the spaces below its own.
 */
export async function saveSkill(s: Session, input: { spaceId: string; files: SkillFile[]; shared?: boolean }) {
  const { name } = describe(input.files);
  const privateTo = sideOf(s, input.shared);
  await checkSpace(s, input.spaceId, input.shared);

  const [existing] = await s.tx<{ pageId: string }[]>`
    select t.page_id from content t
    join pages p on p.id = t.page_id and p.type = 'skill'
    where t.space_id = ${input.spaceId}::uuid and t.kind = 'title' and t.body = ${name}
      and t.private_to is not distinct from ${privateTo}::uuid and ${visible(s, 't')} and ${current(s, 't')}
  `;
  const pageId = existing?.pageId ?? randomUUID();
  const item = { pageId, spaceId: input.spaceId, privateTo, reachesDown: true };
  if (!existing) {
    await s.tx`insert into pages (id, space_id, type) values (${pageId}::uuid, ${input.spaceId}::uuid, 'skill')`;
    await insertItem(s, { ...item, kind: 'title', body: name });
  }

  const stored = await s.tx<Item[]>`
    select ${itemColumns(s)} from content
    where page_id = ${pageId}::uuid and kind = 'file' and private_to is not distinct from ${privateTo}::uuid
      and ${visible(s, 'content')} and ${current(s, 'content')}
  `;
  const changed: string[] = [];
  const added: string[] = [];
  for (const file of input.files) {
    const before = stored.find((candidate) => candidate.path === file.path);
    if (!before) {
      await insertItem(s, { ...item, kind: 'file', path: file.path, body: file.body });
      added.push(file.path);
    } else if (before.body !== file.body) {
      await s.tx`update content set body = ${file.body} where id = ${before.id}::uuid`;
      changed.push(file.path);
    }
  }
  const removed = stored.filter((file) => !input.files.some((candidate) => candidate.path === file.path));
  for (const file of removed) {
    await insertItem(s, { ...item, kind: 'removed', body: '', supersedes: file.id });
  }
  return { pageId, name, created: !existing, added, changed, removed: removed.map((file) => file.path!) };
}

/**
 * Removes a skill, with all its files, for everyone it reaches. It stays in
 * the history, and an inherited skill with the same name applies again.
 */
export async function removeSkill(s: Session, pageId: string): Promise<boolean> {
  const items = await s.tx<Item[]>`
    select ${itemColumns(s)} from content
    where page_id = ${pageId}::uuid and page_id in (select id from pages where type = 'skill')
      and kind in ('title', 'file') and ${visible(s, 'content')} and ${current(s, 'content')}
  `;
  for (const item of items) {
    await insertItem(s, { ...item, kind: 'removed', body: '', supersedes: item.id, path: null });
  }
  return items.some((item) => item.kind === 'title');
}

/**
 * The skills that apply in a space, by name. A skill in a more specific
 * space replaces an inherited one with the same name, personal skills are
 * the least specific, and between equally specific ones the private one
 * wins. The agent picks the ones a task needs by their descriptions.
 */
export async function skillsFor(s: Session, spaceId: string): Promise<Skill[]> {
  const skills = await s.tx<(Omit<Skill, 'description'> & { skillMd: string | null })[]>`
    ${applying(s, spaceId)}
    select distinct on (t.body) t.page_id, t.body as name, t.space_id, sp.name as space_name, t.private_to, f.body as skill_md
    from applies a
    join content t on t.space_id = a.space_id and t.kind = 'title'
    join pages p on p.id = t.page_id and p.type = 'skill'
    join lateral (
      select f.body from content f
      where f.page_id = t.page_id and f.kind = 'file' and f.path = 'SKILL.md'
        and f.private_to is not distinct from t.private_to
        and ${visibleContent(s, 'f')} and ${current(s, 'f')}
      order by f.created_at
      limit 1
    ) f on true
    left join spaces sp on sp.id = t.space_id and sp.id in (${accessibleSpaces(s)})
    where ${visibleContent(s, 't')}
    order by t.body, a.distance, t.private_to is null
  `;
  return skills.map(({ skillMd, ...skill }) => ({ ...skill, description: frontmatter(skillMd ?? '').description ?? '' }));
}

/** A skill that applies in a space, and whether another with its name is used there instead. */
export interface SkillHere extends Skill {
  /** Whether the person's assistant gets this one here. */
  used: boolean;
  /** For one that's used, the ones with its name it replaces; for one that isn't, the one used instead. */
  others: { pageId: string; spaceName: string | null }[];
}

/**
 * Every skill that applies in a space, including the ones a closer skill with the same name
 * replaces, in the order skillsFor picks them: by name, the closest first, and between equally
 * close ones the private one.
 */
export async function skillsHere(s: Session, spaceId: string): Promise<SkillHere[]> {
  const rows = await s.tx<(Omit<Skill, 'description'> & { skillMd: string | null })[]>`
    ${applying(s, spaceId)}
    select t.page_id, t.body as name, t.space_id, sp.name as space_name, t.private_to, f.body as skill_md
    from applies a
    join content t on t.space_id = a.space_id and t.kind = 'title'
    join pages p on p.id = t.page_id and p.type = 'skill'
    join lateral (
      select f.body from content f
      where f.page_id = t.page_id and f.kind = 'file' and f.path = 'SKILL.md'
        and f.private_to is not distinct from t.private_to
        and ${visibleContent(s, 'f')} and ${current(s, 'f')}
      order by f.created_at
      limit 1
    ) f on true
    left join spaces sp on sp.id = t.space_id and sp.id in (${accessibleSpaces(s)})
    where ${visibleContent(s, 't')} and ${current(s, 't')}
    order by t.body, a.distance, t.private_to is null
  `;
  const skills = rows.map(({ skillMd, ...skill }) => ({ ...skill, description: frontmatter(skillMd ?? '').description ?? '' }));
  return skills.map((skill) => {
    const named = skills.filter((other) => other.name === skill.name);
    const used = named[0] === skill;
    const others = used ? named.slice(1) : [named[0]];
    return { ...skill, used, others: others.map(({ pageId, spaceName }) => ({ pageId, spaceName })) };
  });
}

/** A skill as its own page shows it: what it does, its instructions and its other files. */
export interface SkillView extends Skill {
  /** SKILL.md without its frontmatter. */
  instructions: string;
  files: SkillFile[];
  /** Skills with its name from the spaces above its own, which it replaces there. */
  replaces: { pageId: string; spaceName: string | null }[];
}

/** A skill the person's assistant can get, whether its space is one they can open or one above. */
export async function readSkill(s: Session, pageId: string): Promise<SkillView | undefined> {
  const [title] = await s.tx<{ name: string; spaceId: string; privateTo: string | null }[]>`
    select t.body as name, t.space_id, t.private_to from content t
    join pages p on p.id = t.page_id and p.type = 'skill'
    where t.page_id = ${pageId}::uuid and t.kind = 'title' and ${visibleContent(s, 't')} and ${current(s, 't')}
    order by t.private_to is null
    limit 1
  `;
  if (!title) return undefined;
  const files = await s.tx<SkillFile[]>`
    select path, body from content
    where page_id = ${pageId}::uuid and kind = 'file' and private_to is not distinct from ${title.privateTo}::uuid
      and ${visibleContent(s, 'content')} and ${current(s, 'content')}
    order by path
  `;
  const skillMd = files.find((file) => file.path === 'SKILL.md')?.body ?? '';
  const [space] = await s.tx<{ name: string }[]>`
    select name from spaces where id = ${title.spaceId}::uuid and id in (${accessibleSpaces(s)})
  `;
  // In its own space it replaces the ones with its name that come after it.
  const named = (await skillsHere(s, title.spaceId)).filter((other) => other.name === title.name);
  const above = named.slice(named.findIndex((other) => other.pageId === pageId) + 1);
  return {
    pageId,
    name: title.name,
    description: frontmatter(skillMd).description ?? '',
    spaceId: title.spaceId,
    spaceName: space?.name ?? null,
    privateTo: title.privateTo,
    instructions: skillMd.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '').trim(),
    files: files.filter((file) => file.path !== 'SKILL.md'),
    replaces: above.map(({ pageId: other, spaceName }) => ({ pageId: other, spaceName })),
  };
}

/** The name and description of a skill, from the frontmatter of its SKILL.md. */
function describe(files: SkillFile[]): { name: string; description: string } {
  const skillMd = files.find((file) => file.path === 'SKILL.md');
  if (!skillMd) throw new Error('A skill needs a SKILL.md file.');
  const { name, description } = frontmatter(skillMd.body);
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw new Error('SKILL.md needs a name in its frontmatter, in lowercase letters, numbers and hyphens, such as status-report.');
  }
  if (!description || description.length > 1024) {
    throw new Error('SKILL.md needs a description of up to 1024 characters in its frontmatter, saying what the skill does and when to use it.');
  }
  return { name, description };
}

/** A SKILL.md's name and description, from its frontmatter, where it has them. */
export function frontmatter(skillMd: string): { name?: string; description?: string } {
  const yaml = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(skillMd)?.[1];
  try {
    const fields = yaml ? parse(yaml) : undefined;
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
    return { name: text(fields?.name), description: text(fields?.description) };
  } catch {
    return {};
  }
}

/** The file's text, or undefined when it isn't text. */
function asText(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
