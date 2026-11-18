// Imports skills, until Homing's web app and assistants can, and gives people
// a sign-in link when they can't sign in. Everything here is a person editing
// directly. Spaces and their members are changed in the web app or through an
// assistant, and rules through assistants, with approval.

import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { authDatabaseUrl, connect, withPrincipal } from './db.ts';
import { rulesFor, type Rule } from './guidance.ts';
import { readSkillFolder, removeSkill, saveSkill, skillsFor } from './skills.ts';
import { createAuth } from './auth.ts';
import { operatorSignInLink } from './recovery.ts';
import { configuredUrl } from './server.ts';
import { listSpaces, type Space } from './spaces.ts';

const usage = `Usage: node src/cli.ts <command>

  people                                  Everyone with an account, with their ids
  sign-in-link <email>                    A one-time link for someone who can't sign in
  spaces <person>

  rules <person> <space>                  The rules that apply in a space, least specific first

  skills <person> <space>                 The skills that apply in a space
  import-skill <person> <space> <folder> [--private]
                                          Adds a SKILL.md folder, or updates the skill with its name
  remove-skill <person> <skill>

Skills are shared with the space unless --private is given, or the space is
in your personal tree. They also apply in the spaces below their own. To
change rules, ask your assistant: you approve each change in Homing.`;

const sql = connect();
const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith('--')));
const args = rest.filter((arg) => !arg.startsWith('--'));
const as = <T>(person: string, fn: Parameters<typeof withPrincipal<T>>[2]) =>
  withPrincipal(sql, { person, direct: true }, fn);

try {
  if (command === 'people' && args.length === 0) {
    // Only sign-in's own role can read accounts, which share their person's id.
    const accounts = connect(authDatabaseUrl);
    try {
      for (const account of await accounts`select id, name, email from auth."user" order by "createdAt"`) {
        console.log(`${account.id}  ${account.name} <${account.email}>`);
      }
    } finally {
      await accounts.end();
    }
  } else if (command === 'sign-in-link' && args.length === 1) {
    const url = configuredUrl ?? new URL('http://localhost:4100');
    const pool = new Pool({ connectionString: authDatabaseUrl, options: '-c search_path=auth' });
    try {
      // Making a sign-in link signs nothing, so the command line needs no secret of the server's.
      const secret = randomBytes(32).toString('base64url');
      const auth = createAuth(sql, pool, { url, secret, passwords: false, rateLimit: false, assistantSites: [] });
      const link = await operatorSignInLink(auth, url, args[0]);
      console.log(link ? `Send this to them. It signs them in once, within 15 minutes:\n\n  ${link}` : 'There is no account with that email.');
    } finally {
      await pool.end();
    }
  } else if (command === 'spaces' && args.length === 1) {
    for (const space of await as(args[0], listSpaces)) console.log(`${space.id}  ${space.name}`);
  } else if (command === 'rules' && args.length === 2) {
    printRules(await as(args[0], (s) => rulesFor(s, args[1])));
  } else if (command === 'skills' && args.length === 2) {
    const skills = await as(args[0], (s) => skillsFor(s, args[1]));
    if (skills.length === 0) console.log('  None');
    for (const skill of skills) {
      const from = [skill.spaceName ?? 'a space above', skill.privateTo && 'private'].filter(Boolean).join(', ');
      console.log(`  ${skill.pageId}  ${skill.name} (${from}): ${skill.description}`);
    }
  } else if (command === 'import-skill' && args.length === 3) {
    const [person, spaceId, folder] = args;
    const { files, skipped } = await readSkillFolder(folder);
    await as(person, async (s) => {
      const space = await spaceById(s, spaceId);
      const shared = !flags.has('--private') && !space.privateTo;
      const skill = await saveSkill(s, { spaceId, files, shared });
      if (skill.created) {
        console.log(`Added ${skill.name} to ${space.name} as a ${shared ? 'shared' : 'private'} skill with ${files.length} files (${skill.pageId}).`);
      } else {
        const changes = [`${skill.changed.length} changed`, `${skill.added.length} added`, `${skill.removed.length} removed`];
        console.log(`Updated ${skill.name} in ${space.name}: ${changes.join(', ')}. Earlier versions are kept.`);
      }
      if (skipped.length) console.log(`Skipped hidden files: ${skipped.join(', ')}.`);
      if (shared) console.log(reach(space));
    });
  } else if (command === 'remove-skill' && args.length === 2) {
    const removed = await as(args[0], (s) => removeSkill(s, args[1]));
    console.log(removed ? 'Removed. It stays in the history.' : 'There is no skill with that id that you can change.');
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}

async function spaceById(s: Parameters<typeof listSpaces>[0], spaceId: string): Promise<Space> {
  const space = (await listSpaces(s)).find((candidate) => candidate.id === spaceId);
  if (!space) throw new Error('There is no space with that id that you can see.');
  return space;
}

/** Shown whenever someone changes shared guidance (spec §2). */
function reach(space: Space): string {
  return (
    `It also applies to the spaces below ${space.name}, including closed ones you can't access, ` +
    'and their members may receive it.'
  );
}

function printRules(rules: Rule[]) {
  if (rules.length === 0) console.log('  None');
  for (const rule of rules) {
    const from = rule.personal ? 'your personal space' : (rule.spaceName ?? 'a space above');
    const notes = [from, rule.privateTo && 'private', rule.onlyHere && 'only here'].filter(Boolean).join(', ');
    console.log(`  ${rule.id}  ${rule.kind} (${notes}): ${rule.body}`);
  }
}
