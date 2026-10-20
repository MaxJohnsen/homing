import type { IncomingMessage, ServerResponse } from 'node:http';
import postgres from 'postgres';
import { AccessDenied, withPrincipal, type Session } from './db.ts';
import { addRule, editRule, removeRule, rulesFor, type RuleKind } from './guidance.ts';
import { createPage, gather, historyOf, linksOf, overviewLength, overviewOf, pagesIn, readItem, readPage, recentChanges, search, sourcesIn, sourceView, supersedeItem, ungather, updateItem, writeItem, writeOverview, type PageOrder } from './knowledge.ts';
import { requestsSent, shortAction, waitingFor } from './proposals.ts';
import { readSkill, skillsHere } from './skills.ts';
import { listSpaces, newSpace, peopleNames, renameSpace, SpaceRefused, spaceView } from './spaces.ts';
import { json, readJson, type App } from './web.ts';

const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const kinds: RuleKind[] = ['requirement', 'preference'];
const orders: PageOrder[] = ['recent', 'name', 'match'];

/**
 * The endpoints of the app's own screens: spaces, what's waiting, knowledge, search, guidance, and looking after Homing. Each answers only
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
  const noPage = { message: 'There’s no page here that you can open.' };
  const noItem = { message: 'There’s nothing here that you can change.' };
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

      case 'create space': {
        const body = await readJson(req);
        const who = body.who === 'just me' || body.who === 'with others' ? body.who : undefined;
        if (!who) return answer(res, 400, { field: 'who', message: 'Choose who the space is for.' });
        const parent = typeof body.in === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.in) ? body.in.toLowerCase() : undefined;
        if (body.in !== undefined && body.in !== null && !parent) return answer(res, 400, { field: 'in', message: 'Choose where the space goes.' });
        const space = await write((s) => newSpace(s, { name: typeof body.name === 'string' ? body.name : '', who, in: parent, closed: body.closed === true }));
        json(res, 200, { id: space.id });
        break;
      }

      case 'rename space': {
        const body = await readJson(req);
        const space = await write((s) => renameSpace(s, route.id, typeof body.name === 'string' ? body.name : ''));
        json(res, 200, { id: space.id, name: space.name });
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
            action: shortAction[item.action],
            kind: item.kind,
            text: item.text,
            // For a request: who asked, unless it's the person, and whether it's sent.
            request: item.request ? { by: item.askedBy, yours: item.yours, sent: item.sent } : null,
            createdAt: item.createdAt,
          })),
        });
        break;
      }

      case 'requests': {
        const sent = await read(requestsSent);
        json(res, 200, {
          requests: sent.map((request) => ({
            id: request.id,
            space: request.space,
            within: request.within,
            action: shortAction[request.action],
            kind: request.kind,
            text: request.text,
            state: request.state,
            requestedAt: request.requestedAt,
            emailed: request.adminsEmailed,
            admins: request.admins,
            decidedBy: request.decider,
          })),
        });
        break;
      }

      case 'pages': {
        const query = new URL(req.url ?? '', 'http://homing').searchParams;
        const order = orders.find((candidate) => candidate === query.get('sort'));
        const offset = Number.parseInt(query.get('offset') ?? '0', 10);
        const collection = query.get('in');
        if (collection !== null && !new RegExp(`^${uuid}$`, 'i').test(collection)) return answer(res, 404, noPage);
        const found = await read(async (s) =>
          (await spaceView(s, route.id))
            ? pagesIn(s, route.id, {
                query: query.get('q')?.slice(0, 200) ?? undefined,
                type: query.get('type') || undefined,
                order,
                offset: clamp(offset),
                collections: query.get('collections') === '1',
                in: collection ?? undefined,
              })
            : undefined,
        );
        if (!found) return answer(res, 404, noSpace);
        json(res, 200, found);
        break;
      }

      case 'page': {
        const found = await read(async (s) => {
          const page = await readPage(s, route.id);
          // Guidance and skills open as rules and skills, never as knowledge.
          if (!page || page.type === 'guidance' || page.type === 'skill' || page.type === 'overview') return undefined;
          const space = await spaceView(s, page.spaceId);
          if (!space) return undefined;
          const history = await historyOf(s, page.items.map((item) => item.id));
          const names = await peopleNames(s, [...page.items, ...history].map((entry) => entry.writtenBy));
          const links = await linksOf(s, page.id);
          const { total: gathers } = await pagesIn(s, page.spaceId, { in: page.id, limit: 1 });
          return { page, space, history, names, links, gathers };
        });
        if (!found) return answer(res, 404, noPage);
        const { page, space, history, names, links, gathers } = found;
        // Who wrote something: a person by name, or nobody named when they're no longer someone the reader shares a space with.
        const by = (writtenBy: string | null) => (writtenBy === null ? null : { name: names.get(writtenBy) ?? null, you: writtenBy === person });
        json(res, 200, {
          id: page.id,
          title: page.title,
          type: page.type,
          shared: page.shared,
          updatedAt: page.updatedAt,
          // How many pages it gathers, the collections it's in, and the pages that mention it, as the reader sees them.
          gathers,
          collections: links.collections,
          mentionedOn: links.mentionedOn,
          space: {
            id: space.id,
            name: space.name,
            personal: space.privateTo !== null && space.parentId === null,
            private: space.privateTo !== null,
            // How many people see what's shared there now, and whether people in a space above that the reader can't open do too.
            people: space.members.length,
            above: space.reachedFromAbove,
          },
          items: page.items.map((item) => ({
            id: item.id,
            text: item.body,
            shared: item.privateTo === null,
            by: by(item.writtenBy),
            agent: item.agent,
            writtenAt: item.updatedAt,
            sources: item.sources,
            // What it replaced, and so what others see when it's your private update to something shared.
            replaced: item.replaced && { text: item.replaced.body, shared: item.replaced.shared, until: item.createdAt },
            earlier: history
              .filter((entry) => entry.itemId === item.id)
              .map((entry) => ({ text: entry.body, by: by(entry.writtenBy), agent: entry.agent, writtenAt: entry.writtenAt, until: entry.replacedAt })),
          })),
        });
        break;
      }

      case 'sources': {
        const query = new URL(req.url ?? '', 'http://homing').searchParams;
        const offset = Number.parseInt(query.get('offset') ?? '0', 10);
        const found = await read(async (s) =>
          (await spaceView(s, route.id))
            ? sourcesIn(s, route.id, { query: query.get('q')?.slice(0, 200) ?? undefined, offset: clamp(offset) })
            : undefined,
        );
        if (!found) return answer(res, 404, noSpace);
        json(res, 200, found);
        break;
      }

      case 'source': {
        const found = await read(async (s) => {
          const source = await sourceView(s, route.id);
          if (!source) return undefined;
          const space = await spaceView(s, source.spaceId);
          if (!space) return undefined;
          const names = await peopleNames(s, [source.writtenBy]);
          return { source, space, names };
        });
        if (!found) return answer(res, 404, { message: 'There’s no source here that you can open.' });
        const { source, space, names } = found;
        // The pages it's used on, each with the items that rest on it.
        const pages = new Map<string, { id: string; title: string; items: { id: string; text: string; shared: boolean }[] }>();
        for (const use of source.uses) {
          const page = pages.get(use.pageId) ?? { id: use.pageId, title: use.title ?? 'Untitled', items: [] };
          page.items.push({ id: use.itemId, text: use.body, shared: use.privateTo === null });
          pages.set(use.pageId, page);
        }
        json(res, 200, {
          id: source.id,
          reference: source.reference,
          excerpt: source.excerpt,
          shared: source.privateTo === null,
          keptAt: source.createdAt,
          by: source.writtenBy === null ? null : { name: names.get(source.writtenBy) ?? null, you: source.writtenBy === person },
          agent: source.agent,
          space: { id: space.id, name: space.name, personal: space.privateTo !== null && space.parentId === null, private: space.privateTo !== null },
          pages: [...pages.values()],
        });
        break;
      }

      case 'gather':
      case 'ungather': {
        const body = await readJson(req);
        const pageId = typeof body.pageId === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.pageId) ? body.pageId.toLowerCase() : undefined;
        if (!pageId) return answer(res, 404, noPage);
        const input = { collectionId: route.id, pageId, shared: body.shared === true };
        if (route.name === 'gather') {
          await write((s) => gather(s, input));
        } else if (!(await write((s) => ungather(s, input)))) {
          return answer(res, 404, noPage);
        }
        json(res, 200, {});
        break;
      }

      case 'search': {
        const query = (new URL(req.url ?? '', 'http://homing').searchParams.get('q') ?? '').slice(0, 200).trim();
        const { spaces, hits } = await read(async (s) => ({
          spaces: await listSpaces(s),
          // The same search assistants get, as many results as a person would look through, of each kind.
          hits: query ? [...(await search(s, query, { limit: 200, only: 'content' })), ...(await search(s, query, { limit: 200, only: 'sources' }))] : [],
        }));
        const where = placeIn(spaces);
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const pages = new Map<string, unknown>();
        for (const hit of hits) {
          if (!hit.pageId || hit.pageType === 'guidance' || hit.pageType === 'skill' || pages.has(hit.pageId)) continue;
          // One row per page, with the best match on it.
          const overview = hit.pageType === 'overview';
          pages.set(hit.pageId, {
            id: hit.pageId,
            // A space's overview has no title of its own, and opens on the space.
            title: overview ? `Overview of ${where(hit.spaceId).name ?? 'a space above'}` : (hit.title ?? 'Untitled'),
            overview,
            type: hit.pageType,
            text: hit.kind === 'item' ? hit.text : null,
            onlyYou: hit.private,
            superseded: hit.superseded,
            updatesShared: hit.updatesShared,
            space: where(hit.spaceId),
          });
        }
        json(res, 200, {
          spaces: words.length
            ? spaces.filter((space) => words.every((word) => space.name.toLowerCase().includes(word))).slice(0, 50).map((space) => ({ ...where(space.id), id: space.id }))
            : [],
          pages: [...pages.values()],
          rules: hits
            .filter((hit) => hit.pageType === 'guidance' && (hit.itemKind === 'requirement' || hit.itemKind === 'preference'))
            .map((hit) => ({ id: hit.id, text: hit.text, kind: hit.itemKind, onlyYou: hit.private, space: where(hit.spaceId) })),
          skills: hits
            .filter((hit) => hit.pageType === 'skill' && hit.pageId)
            .map((hit) => ({ id: hit.pageId, name: hit.title, onlyYou: hit.private, space: where(hit.spaceId) })),
          sources: hits
            .filter((hit) => hit.kind === 'source')
            .map((hit) => ({ id: hit.id, reference: hit.title, excerpt: hit.text, onlyYou: hit.private, space: where(hit.spaceId) })),
        });
        break;
      }

      case 'changes': {
        const query = new URL(req.url ?? '', 'http://homing').searchParams;
        const limit = Math.min(50, Math.max(1, Number.parseInt(query.get('limit') ?? '50', 10) || 50));
        const { spaces, found, names } = await read(async (s) => {
          const found = await recentChanges(s, { offset: clamp(Number.parseInt(query.get('offset') ?? '0', 10)), limit });
          return { spaces: await listSpaces(s), found, names: await peopleNames(s, found.changes.map((change) => change.writtenBy)) };
        });
        const where = placeIn(spaces);
        json(res, 200, {
          more: found.more,
          changes: found.changes.map((change) => ({
            itemId: change.itemId,
            pageId: change.pageId,
            title: change.overview ? 'Overview' : change.title,
            text: change.text,
            kind: change.kind,
            newPage: change.newPage,
            overview: change.overview,
            by: change.writtenBy === null ? null : { name: names.get(change.writtenBy) ?? null, you: change.writtenBy === person },
            agent: change.agent,
            at: change.at,
            onlyYou: change.onlyYou,
            space: where(change.spaceId),
          })),
        });
        break;
      }

      case 'overview': {
        const found = await read(async (s) => {
          const space = await spaceView(s, route.id);
          if (!space) return undefined;
          const overview = await overviewOf(s, route.id);
          const names = await peopleNames(s, (overview?.items ?? []).map((item) => item.writtenBy));
          // The map beside it: what's active, its collections, recent decisions, what waits here, and the spaces inside.
          const [active, collections, decisions, waiting, spaces] = [
            await pagesIn(s, route.id, { limit: 8 }),
            await pagesIn(s, route.id, { collections: true, limit: 6 }),
            await pagesIn(s, route.id, { type: 'decision', limit: 3 }),
            (await waitingFor(s)).filter((item) => item.spaceId === route.id),
            (await listSpaces(s)).filter((other) => other.parentId === route.id),
          ];
          return { overview, names, active, collections, decisions, waiting, spaces };
        });
        if (!found) return answer(res, 404, noSpace);
        const { overview, names, active, collections, decisions, waiting, spaces } = found;
        json(res, 200, {
          overview: (overview?.items ?? []).map((item) => ({
            id: item.id,
            text: item.body,
            shared: item.privateTo === null,
            by: item.writtenBy === null ? null : { name: names.get(item.writtenBy) ?? null, you: item.writtenBy === person },
            agent: item.agent,
            writtenAt: item.updatedAt,
            // Your own overview that explicitly replaces the shared one, which the others still see.
            replacesShared: item.privateTo !== null && item.replaced?.shared === true ? item.replaced.body : null,
          })),
          active: active.pages,
          pages: active.all,
          collections: collections.pages,
          decisions: decisions.pages,
          waiting: waiting.map((item) => ({ id: item.id, action: item.action, kind: item.kind, text: item.text, assistant: item.agent ?? 'Your assistant', request: item.request ? { by: item.askedBy, yours: item.yours, sent: item.sent } : null })),
          spaces: spaces.map(({ id, name, closed }) => ({ id, name, closed })),
        });
        break;
      }

      case 'write overview': {
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > overviewLength) {
          return answer(res, 400, { field: 'text', message: text ? 'Keep the overview short, under 2,000 characters. Details belong on pages.' : 'Write where things stand.' });
        }
        if (!(await read((s) => spaceView(s, route.id)))) return answer(res, 404, noSpace);
        const item = await write((s) => writeOverview(s, { spaceId: route.id, text, shared: body.shared === true }));
        json(res, 200, { id: item.id });
        break;
      }

      case 'add page': {
        const body = await readJson(req);
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
        if (!title || title.length > 200) return answer(res, 400, { field: 'title', message: title ? 'Keep the title under 200 characters.' : 'Say what the page is about.' });
        if (type.length > 40) return answer(res, 400, { field: 'type', message: 'Keep the type to a word or two.' });
        if (type === 'guidance' || type === 'skill') return answer(res, 400, { field: 'type', message: 'Rules and skills are written under Guidance.' });
        if (type === 'overview') return answer(res, 400, { field: 'type', message: 'A space’s overview is written on its Overview.' });
        if (!(await read((s) => spaceView(s, route.id)))) return answer(res, 404, noSpace);
        const id = await write((s) => createPage(s, { spaceId: route.id, title, type: type || undefined, shared: body.shared === true }));
        json(res, 200, { id });
        break;
      }

      case 'add item': {
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 20_000) return answer(res, 400, { field: 'text', message: text ? 'Keep it under 20,000 characters, or split it over more items.' : 'Write what you know.' });
        const page = await read((s) => readPage(s, route.id));
        if (!page || page.type === 'guidance' || page.type === 'skill' || page.type === 'overview') return answer(res, 404, noPage);
        // On a page only you can see, everything stays yours. Sharing it is publishing, which comes with approvals.
        if (body.shared === true && !page.shared) {
          return answer(res, 403, { message: 'Only you see this page, so what you add to it stays yours.' });
        }
        const item = await write((s) => writeItem(s, { pageId: route.id, body: text, shared: body.shared === true }));
        json(res, 200, { id: item.id });
        break;
      }

      case 'correct item': {
        const body = await readJson(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 20_000) return answer(res, 400, { field: 'text', message: text ? 'Keep it under 20,000 characters.' : 'Write what it should say.' });
        const item = await read((s) => readItem(s, route.id));
        if (!item || item.kind !== 'text' || item.reachesDown) return answer(res, 404, noItem);
        if (item.replacedBy) return answer(res, 409, { message: 'This changed while you were reading. The page now shows it as it is.' });
        // A shared item is corrected for everyone, or replaced by your own version that only you see.
        const changed = item.privateTo === null && body.shared === false
          ? await write((s) => supersedeItem(s, route.id, { body: text }))
          : await write((s) => updateItem(s, route.id, { body: text }));
        if (!changed) return answer(res, 404, noItem);
        json(res, 200, { id: changed.id });
        break;
      }

      case 'rules': {
        const rules = await read(async (s) => ((await spaceView(s, route.id)) ? rulesFor(s, route.id) : undefined));
        if (!rules) return answer(res, 404, noSpace);
        json(res, 200, {
          // In the order the assistant gets them, from least to most specific.
          rules: rules.map((rule) => ({
            id: rule.id,
            // A space above that the person can't open stays unnamed, and so does its id.
            spaceId: rule.spaceName === null && !rule.personal ? null : rule.spaceId,
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
            spaceId: spaceName === null ? null : spaceId,
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
    if (error instanceof SpaceRefused) {
      const status = { name: 400, where: 400, admin: 403, missing: 404 }[error.reason];
      return answer(res, status, { ...(status === 400 && { field: error.reason === 'name' ? 'name' : 'in' }), message: error.message });
    }
    // The store refuses what the person may not do, such as a member changing a shared rule.
    if (error instanceof AccessDenied || (error instanceof postgres.PostgresError && error.code === '42501')) {
      return answer(res, 403, { message: error instanceof AccessDenied ? error.message : 'You can’t make that change here.' });
    }
    throw error;
  }
  return true;
}

/**
 * Where something is, for someone who can open these spaces: "your personal space", "Website in
 * Acme", or unnamed when it's in a space above that they can't open.
 */
function placeIn(spaces: Awaited<ReturnType<typeof listSpaces>>) {
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const personal = (space: (typeof spaces)[number]) => space.privateTo !== null && space.parentId === null;
  return (spaceId: string) => {
    const space = byId.get(spaceId);
    if (!space) return { id: null, name: null, within: null };
    const above = space.parentId ? byId.get(space.parentId) : undefined;
    return {
      id: space.id,
      name: personal(space) ? 'your personal space' : space.name,
      within: above ? (personal(above) ? 'your personal space' : above.name) : null,
      private: space.privateTo !== null,
    };
  };
}

/** Where in a long list to start: from the top, and never past what any list could hold. */
function clamp(offset: number): number {
  return Number.isFinite(offset) ? Math.min(Math.max(0, Math.floor(offset)), 1_000_000) : 0;
}

function answer(res: ServerResponse, status: number, body: unknown): true {
  json(res, status, body);
  return true;
}

type Route =
  | { name: 'spaces' | 'waiting' | 'admin' | 'requests' | 'search' | 'changes' | 'create space' }
  | { name: 'space' | 'rename space' | 'pages' | 'page' | 'sources' | 'source' | 'add page' | 'add item' | 'correct item' | 'gather' | 'ungather' | 'overview' | 'write overview' | 'rules' | 'add rule' | 'skills' | 'edit rule' | 'remove rule' | 'skill'; id: string };

function routeOf(method: string, path: string): Route | undefined {
  const match = (pattern: string) => new RegExp(`^${pattern}$`, 'i').exec(path)?.[1]?.toLowerCase();
  if (method === 'GET') {
    if (path === '/api/spaces') return { name: 'spaces' };
    if (path === '/api/waiting') return { name: 'waiting' };
    if (path === '/api/admin') return { name: 'admin' };
    if (path === '/api/requests') return { name: 'requests' };
    if (path === '/api/search') return { name: 'search' };
    if (path === '/api/changes') return { name: 'changes' };
    for (const [name, pattern] of [
      ['space', `/api/spaces/${uuid}`],
      ['pages', `/api/spaces/${uuid}/pages`],
      ['page', `/api/pages/${uuid}`],
      ['sources', `/api/spaces/${uuid}/sources`],
      ['overview', `/api/spaces/${uuid}/overview`],
      ['source', `/api/sources/${uuid}`],
      ['rules', `/api/spaces/${uuid}/rules`],
      ['skills', `/api/spaces/${uuid}/skills`],
      ['skill', `/api/skills/${uuid}`],
    ] as const) {
      const id = match(pattern);
      if (id) return { name, id };
    }
  }
  if (method === 'POST') {
    if (path === '/api/spaces') return { name: 'create space' };
    for (const [name, pattern] of [
      ['rename space', `/api/spaces/${uuid}`],
      ['add page', `/api/spaces/${uuid}/pages`],
      ['write overview', `/api/spaces/${uuid}/overview`],
      ['add item', `/api/pages/${uuid}/items`],
      ['gather', `/api/pages/${uuid}/gather`],
      ['ungather', `/api/pages/${uuid}/gather/remove`],
      ['correct item', `/api/items/${uuid}`],
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
