import type { IncomingMessage, ServerResponse } from 'node:http';
import postgres from 'postgres';
import { AccessDenied, withPrincipal, type Session } from './db.ts';
import { addRule, editRule, removeRule, rulesFor, type RuleKind } from './guidance.ts';
import { waitingFor } from './proposals.ts';
import { readSkill, skillsHere } from './skills.ts';
import { listSpaces, spaceView } from './spaces.ts';
import { json, readJson, type App } from './web.ts';

const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const kinds: RuleKind[] = ['requirement', 'preference'];

/**
 * The endpoints of the app's own screens: spaces, what's waiting, guidance, and looking after Homing. Each answers only
 * with what the signed-in person can open, and the database checks the same underneath. Returns
 * whether it answered.
 */
export async function handleAppApi(app: App, req: IncomingMessage, res: ServerResponse, path: string, headers: Headers): Promise<boolean> {
  const route = routeOf(req.method ?? 'GET', path);
  if (!route) return false;
  const session = await app.auth.api.getSession({ headers });
  if (!session) {
    json(res, 401, { message: 'Sign in first.' });
    return true;
  }
  const person = session.user.id;
  // Reading as the person, and writing as the person directly, never their assistant.
  const read = <T>(fn: (s: Session) => Promise<T>) => withPrincipal(app.sql, { person }, fn);
  const write = <T>(fn: (s: Session) => Promise<T>) => withPrincipal(app.sql, { person, direct: true }, fn);
  const noSpace = { message: 'There’s no space here that you can open.' };
  const noRule = { message: 'There’s no rule here that you can change.' };

  try {
    switch (route.name) {
      case 'spaces': {
        const spaces = await read(listSpaces);
        const open = new Set(spaces.map((space) => space.id));
        json(res, 200, {
          // A space whose parent the person can't open sits at the top for them, and the parent stays unnamed.
          spaces: spaces.map(({ id, name, parentId, closed, privateTo, admin }) => ({
            id,
            name,
            parentId: parentId && open.has(parentId) ? parentId : null,
            closed,
            personal: privateTo !== null && parentId === null,
            private: privateTo !== null,
            admin,
          })),
        });
        break;
      }

      case 'space': {
        const found = await read((s) => spaceView(s, route.id));
        if (!found) return answer(res, 404, noSpace);
        const { id, name, parentId, closed, privateTo, admin, path: above, reachedFromAbove, members } = found;
        json(res, 200, {
          id,
          name,
          parentId,
          closed,
          personal: privateTo !== null && parentId === null,
          private: privateTo !== null,
          admin,
          path: above,
          reachedFromAbove,
          members: members.map((member) => ({ ...member, you: member.id === person })),
        });
        break;
      }

      case 'waiting': {
        const waiting = await read(waitingFor);
        json(res, 200, {
          waiting: waiting.map((item) => ({
            id: item.id,
            assistant: item.agent ?? 'Your assistant',
            spaceId: item.spaceId,
            space: item.space,
            personal: item.personal,
            within: item.within,
            action: ({ 'add rule': 'add', 'change rule': 'change', 'remove rule': 'remove' } as const)[item.action],
            kind: item.kind,
            text: item.text,
            // For a request: who asked, unless it's the person, and whether it's sent.
            request: item.request ? { by: item.askedBy, sent: item.sent } : null,
            createdAt: item.createdAt,
          })),
        });
        break;
      }

      case 'rules': {
        const rules = await read(async (s) => ((await spaceView(s, route.id)) ? rulesFor(s, route.id) : undefined));
        if (!rules) return answer(res, 404, noSpace);
        json(res, 200, {
          // In the order the assistant gets them, from least to most specific.
          rules: rules.map((rule) => ({
            id: rule.id,
            spaceId: rule.spaceId,
            spaceName: rule.spaceName,
            personal: rule.personal,
            kind: rule.kind,
            text: rule.body,
            shared: rule.privateTo === null,
            onlyHere: rule.onlyHere,
          })),
        });
        break;
      }

      case 'add rule': {
        const body = await readJson(req);
        const kind = kinds.find((candidate) => candidate === body.kind);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!kind) return answer(res, 400, { message: 'Choose a requirement or a preference.' });
        if (!text || text.length > 4000) return answer(res, 400, { field: 'text', message: text ? 'Keep a rule under 4,000 characters.' : 'Write the rule.' });
        const space = await read((s) => spaceView(s, route.id));
        if (!space) return answer(res, 404, noSpace);
        if (body.shared === true && !space.admin) return answer(res, 403, { message: `Only ${space.name}’s admins change its shared rules.` });
        const rule = await write((s) => addRule(s, { spaceId: route.id, kind, body: text, shared: body.shared === true, onlyHere: body.onlyHere === true }));
        json(res, 200, { id: rule.id });
        break;
      }

      case 'edit rule': {
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 4000) return answer(res, 400, { field: 'text', message: text ? 'Keep a rule under 4,000 characters.' : 'Write the rule.' });
        const rule = await write((s) => editRule(s, route.id, text));
        if (!rule) return answer(res, 404, noRule);
        json(res, 200, { id: rule.id });
        break;
      }

      case 'remove rule': {
        if (!(await write((s) => removeRule(s, route.id)))) return answer(res, 404, noRule);
        json(res, 200, {});
        break;
      }

      case 'skills': {
        const skills = await read(async (s) => ((await spaceView(s, route.id)) ? skillsHere(s, route.id) : undefined));
        if (!skills) return answer(res, 404, noSpace);
        json(res, 200, {
          skills: skills.map(({ pageId, name, description, spaceId, spaceName, privateTo, used, others }) => ({
            id: pageId,
            name,
            description,
            spaceId,
            spaceName,
            shared: privateTo === null,
            used,
            others: others.map((other) => ({ id: other.pageId, spaceName: other.spaceName })),
          })),
        });
        break;
      }

      case 'admin': {
        const [me] = await read((s) => s.tx<{ instanceAdmin: boolean }[]>`select instance_admin from people where id = ${person}::uuid`);
        if (!me?.instanceAdmin) return answer(res, 403, { message: 'Only whoever looks after Homing sees this.' });
        // Everyone with an account, from sign-in's own tables. Looking after Homing opens no spaces.
        const { rows } = await app.authPool.query<{ id: string; name: string; email: string; createdAt: Date }>(
          'select "id", "name", "email", "createdAt" as "createdAt" from auth."user" order by "createdAt"',
        );
        json(res, 200, {
          host: app.url.host,
          email: { sends: Boolean(app.mailer), from: app.mailer?.from ?? null },
          people: rows.map((row) => ({ name: row.name, email: row.email, joinedAt: row.createdAt, you: row.id === person })),
        });
        break;
      }

      case 'skill': {
        const skill = await read((s) => readSkill(s, route.id));
        if (!skill) return answer(res, 404, { message: 'There’s no skill here that you can open.' });
        const { pageId, name, description, spaceId, spaceName, privateTo, instructions, files, replaces } = skill;
        json(res, 200, {
          id: pageId,
          name,
          description,
          // Only a space the person can open is named, and only then can they go there.
          spaceId: spaceName === null ? null : spaceId,
          spaceName,
          shared: privateTo === null,
          instructions,
          files,
          replaces: replaces.map((other) => ({ id: other.pageId, spaceName: other.spaceName })),
        });
        break;
      }
    }
  } catch (error) {
    // The store refuses what the person may not do, such as a member changing a shared rule.
    if (error instanceof AccessDenied || (error instanceof postgres.PostgresError && error.code === '42501')) {
      return answer(res, 403, { message: error instanceof AccessDenied ? error.message : 'You can’t change this rule.' });
    }
    throw error;
  }
  return true;
}

function answer(res: ServerResponse, status: number, body: unknown): true {
  json(res, status, body);
  return true;
}

type Route =
  | { name: 'spaces' | 'waiting' | 'admin' }
  | { name: 'space' | 'rules' | 'add rule' | 'skills' | 'edit rule' | 'remove rule' | 'skill'; id: string };

function routeOf(method: string, path: string): Route | undefined {
  const match = (pattern: string) => new RegExp(`^${pattern}$`, 'i').exec(path)?.[1]?.toLowerCase();
  if (method === 'GET') {
    if (path === '/api/spaces') return { name: 'spaces' };
    if (path === '/api/waiting') return { name: 'waiting' };
    if (path === '/api/admin') return { name: 'admin' };
    for (const [name, pattern] of [
      ['space', `/api/spaces/${uuid}`],
      ['rules', `/api/spaces/${uuid}/rules`],
      ['skills', `/api/spaces/${uuid}/skills`],
      ['skill', `/api/skills/${uuid}`],
    ] as const) {
      const id = match(pattern);
      if (id) return { name, id };
    }
  }
  if (method === 'POST') {
    for (const [name, pattern] of [
      ['add rule', `/api/spaces/${uuid}/rules`],
      ['edit rule', `/api/rules/${uuid}`],
      ['remove rule', `/api/rules/${uuid}/remove`],
    ] as const) {
      const id = match(pattern);
      if (id) return { name, id };
    }
  }
  return undefined;
}
