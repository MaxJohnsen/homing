import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import { hiddenMessage } from './bundle.ts';
import { abilitiesOf, ConnectRefused, connectionsOf, kindOf, placesIn, removePlace, revokeConnection, startConnecting, type Connection } from './connections.ts';
import type { Connectors } from './connectors.ts';
import { AccessDenied, personOf, withPrincipal, type Session } from './db.ts';
import { exportSpace } from './export.ts';
import { ImportRefused, importProgressOf, importsAgain, importSpace, preview as previewUpload, previewed, previewProgressOf, receive, turnNow, uploadTime, workFolder } from './import.ts';
import { addInclude, addRule, editRule, includesIn, includesNotOpen, IncludeRefused, removeInclude, removeRule, rulesFor, type Inclusion, type RuleKind } from './guidance.ts';
import { archivePage, createPage, gather, historyOf, importedAuthor, linksOf, overviewLength, overviewOf, pagesIn, publicationOf, publishItem, readItem, readPage, recentChanges, search, sourcesIn, sourceView, supersedeItem, TooLong, ungather, updateItem, writeItem, writeOverview, type Imported, type PageOrder } from './knowledge.ts';
import { estimateExtension, estimateLearning, extendLearning, forgetExtension, LearningRefused, mapLinesOf, nothingThere, notPlaced, pauseLearning, progressOf, resumeLearning, retryable, retryLearning, runsFor, setAsideSenders, setAsideWords, setLearningLimit, setLeftOut, startLearning, summarizeLearning, type MapLine, type Progress, type Run } from './learning.ts';
import { holdings, mapShown, suggestMap, summaryFor, type Held, type Summary } from './map.ts';
import { modelName, modelProcessingOf, modelStatement, modelUsageOfEveryone, modelUseThisMonth, monthlyLimit, setModelProcessing, setMonthlyLimit, setRunCeiling } from './model.ts';
import { mapWaiting, publicationData, requestsSent, shortAction, waitingFor } from './proposals.ts';
import { includable, readSkill, skillsHere } from './skills.ts';
import { accountFinder, isEmail } from './people.ts';
import { conversionOf, makeCollaborative, movedFrom } from './share-space.ts';
import { addTask, changeTask, searchTasks, shareTask, TaskRefused, tasksIn, type Task } from './tasks.ts';
import { archiveSpace, changeMember, listSpaces, newSpace, peopleNames, placeSpace, renameSpace, SpaceRefused, spaceView, type Space } from './spaces.ts';
import { json, readJson, type App } from './web.ts';

const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
/**
 * Who is exporting a space right now, until it has been made, checked and sent, or given up on,
 * and who is sending an export to import.
 */
const exporting = new Set<string>();
const uploading = new Set<string>();

/** How long an export may take to make and send before it's given up on. */
const exportTimeout = 30 * 60_000;
const tooBig = 'That space holds more than one export can, so Homing didn’t make it. Export the spaces in it one at a time.';
const tooSlowToCheck = 'Homing took too long to check that the export imports again, so it didn’t hand it out. Try again in a quiet moment.';
const kinds: RuleKind[] = ['requirement', 'preference'];
const orders: PageOrder[] = ['recent', 'name', 'match'];

/**
 * The endpoints of the app's own screens: spaces, exporting and importing them, what's waiting, knowledge, search, guidance, and looking after Homing. Each answers only
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
  const microsoft = app.connectors.get('microsoft')?.ready ?? false;
  const looksAfter = async () =>
    (await read((s) => s.tx<{ instanceAdmin: boolean }[]>`select instance_admin from people where id = ${person}::uuid`))[0]?.instanceAdmin ?? false;

  try {
    switch (route.name) {
      case 'spaces': {
        const spaces = await read(listSpaces);
        const open = new Set(spaces.map((space) => space.id));
        json(res, 200, {
          // A space whose parent the person can't open sits at the top for them, and the parent stays unnamed.
          spaces: spaces.map(({ id, name, parentId, closed, privateTo, admin, archived }) => ({
            id,
            name,
            parentId: parentId && open.has(parentId) ? parentId : null,
            closed,
            personal: privateTo !== null && parentId === null,
            private: privateTo !== null,
            admin,
            archived,
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

      case 'add member': {
        const body = await readJson(req);
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        if (!isEmail(email)) return answer(res, 400, { field: 'email', message: 'Write their email address.' });
        const space = await read((s) => spaceView(s, route.id));
        if (!space) return answer(res, 404, noSpace);
        if (!space.admin || space.privateTo) return answer(res, 403, { message: space.privateTo ? 'Spaces in your personal space are only yours. To add people, share the space first, from its Settings.' : `Only ${space.name}’s admins change who’s in it.` });
        // Signed in, an admin learns whether someone uses Homing with that email.
        const account = await accountFinder(app.authPool)(email);
        if (!account) {
          return answer(res, 400, { field: 'email', message: `No one uses Homing with ${email} yet. Once they’re invited to Homing, you can add them here.` });
        }
        await write((s) => changeMember(s, route.id, account.id, body.admin === true ? 'make admin' : 'add'));
        json(res, 200, { id: account.id, name: account.name });
        break;
      }

      case 'change member': {
        const body = await readJson(req);
        const change = (['make admin', 'make member', 'remove'] as const).find((candidate) => candidate === body.change);
        if (!change) return answer(res, 400, { message: 'Choose what changes.' });
        await write((s) => changeMember(s, route.id, route.person, change));
        json(res, 200, {});
        break;
      }

      case 'conversion': {
        // What sharing a space from your personal tree would do, for you to decide.
        const conversion = await read((s) => conversionOf(s, route.id));
        if (!conversion) return answer(res, 404, noSpace);
        json(res, 200, {
          rulesLeaving: conversion.rulesLeaving.map((rule) => ({ kind: rule.kind, text: rule.body, from: rule.spaceName, elsewhere: rule.elsewhere })),
          skillsLeaving: conversion.skillsLeaving,
          places: conversion.places,
          modelOff: conversion.modelOff,
        });
        break;
      }

      case 'convert space': {
        const body = await readJson(req);
        const rules = (['keep', 'share', 'drop'] as const).find((choice) => choice === body.rules);
        if (!rules) return answer(res, 400, { message: 'Choose what becomes of the rules that stop applying.' });
        const parent = typeof body.in === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.in) ? body.in.toLowerCase() : undefined;
        if (body.in !== undefined && body.in !== null && !parent) return answer(res, 400, { field: 'in', message: 'Choose where the space goes.' });
        const space = await write((s) => makeCollaborative(s, route.id, { in: parent, closed: body.closed === true, rules }));
        json(res, 200, { id: space.id });
        break;
      }

      case 'tasks': {
        const found = await read(async (s) => {
          if (!(await spaceView(s, route.id))) return undefined;
          const { open, done } = await tasksIn(s, route.id);
          const names = await peopleNames(s, [...open, ...done].flatMap((task) => [task.assignee, task.doneBy, task.writtenBy]));
          return { open, done, names };
        });
        if (!found) return answer(res, 404, noSpace);
        const shape = (task: Task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          due: task.due,
          shared: task.privateTo === null,
          // Someone the reader can't see stays unnamed, and so does their id. Someone named in an import is nobody here.
          assignee: task.assignee
            ? { id: found.names.has(task.assignee) ? task.assignee : null, name: found.names.get(task.assignee) ?? null, you: task.assignee === person }
            : task.imported?.assignee ? { id: null, name: task.imported.assignee.name, you: false, imported: true } : null,
          done: task.doneAt && {
            at: task.doneAt,
            by: task.doneBy ? { name: found.names.get(task.doneBy) ?? null, you: task.doneBy === person } : task.imported?.doneBy ? { name: task.imported.doneBy.name, you: false, imported: true } : null,
          },
          // Who kept it, and the assistant that did it for them, so a shared task says whose assistant that was.
          ...authorOf(found.names, person, task.writtenBy, task.agent, task.imported),
        });
        json(res, 200, { open: found.open.map(shape), done: found.done.map(shape) });
        break;
      }

      case 'add task': {
        const body = await readJson(req);
        if (!(await read((s) => spaceView(s, route.id)))) return answer(res, 404, noSpace);
        const task = await write((s) =>
          addTask(s, {
            spaceId: route.id,
            title: typeof body.title === 'string' ? body.title : '',
            description: typeof body.description === 'string' ? body.description : undefined,
            due: typeof body.due === 'string' && body.due ? body.due : undefined,
            assignee: typeof body.assignee === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.assignee) ? body.assignee : undefined,
            shared: body.shared === true,
          }),
        );
        json(res, 200, { id: task.id });
        break;
      }

      case 'change task': {
        const body = await readJson(req);
        const changed = await write((s) =>
          changeTask(s, route.id, {
            title: typeof body.title === 'string' ? body.title : undefined,
            description: typeof body.description === 'string' || body.description === null ? (body.description as string | null) : undefined,
            due: typeof body.due === 'string' && body.due ? body.due : body.due === null || body.due === '' ? null : undefined,
            assignee: typeof body.assignee === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.assignee) ? body.assignee : body.assignee === null ? null : undefined,
            done: typeof body.done === 'boolean' ? body.done : undefined,
          }),
        );
        if (!changed) return answer(res, 404, { message: 'There’s no task here that you can change.' });
        json(res, 200, { id: changed.id });
        break;
      }

      case 'share task': {
        if (!(await write((s) => shareTask(s, route.id)))) return answer(res, 404, { message: 'There’s no task of yours here to share.' });
        json(res, 200, {});
        break;
      }

      case 'archive space': {
        const body = await readJson(req);
        if (typeof body.archived !== 'boolean') return answer(res, 400, { message: 'Archive it or reopen it.' });
        const space = await write((s) => archiveSpace(s, route.id, body.archived as boolean));
        json(res, 200, { id: space.id, archived: space.archived });
        break;
      }

      case 'rename space': {
        const body = await readJson(req);
        const space = await write((s) => renameSpace(s, route.id, typeof body.name === 'string' ? body.name : ''));
        json(res, 200, { id: space.id, name: space.name });
        break;
      }

      case 'export': {
        // One at a time for each person, and only a few at once, until the work is done, whether the person waits for it or not.
        if (exporting.has(person) || exporting.size >= 2) return answer(res, 429, { message: 'Homing is making another export right now. Try again in a moment.' });
        exporting.add(person);
        const timeout = setTimeout(() => res.destroy(), exportTimeout);
        let file: string | undefined;
        try {
          await mkdir(workFolder, { recursive: true });
          // Everything the person sees in the space, read in one snapshot as them, into a file, a space at a time, while they wait for it.
          const exported = await withPrincipal(app.sql, { person }, (s) => exportSpace(s, route.id, app.url, workFolder, { gone: () => res.destroyed }), { snapshot: true });
          if (exported === 'gone') break;
          if (exported === 'too large') return answer(res, 413, { message: tooBig });
          if (!exported) return answer(res, 404, noSpace);
          file = exported.path;
          if (res.destroyed) break;
          // Read as an import would, so it's handed out only when it imports again.
          let again: Awaited<ReturnType<typeof importsAgain>>;
          try {
            again = await importsAgain(file);
          } catch (error) {
            if (!(error instanceof ImportRefused)) throw error;
            // Something Homing holds that an import refuses, which only says what's in their own export: said to them, never handed out.
            console.error('An export that wouldn’t import again:', error.message);
            const { hidden } = error;
            if (!hidden) return answer(res, 422, { message: `Something in that space keeps it from importing again, so Homing didn’t make the export. Importing it would say: ${error.message}` });
            // Their own they write again themselves, and what's shared only an admin of its space does.
            const theirs = !hidden.shared || (await read((s) => spaceView(s, hidden.space.id)))?.admin === true;
            return answer(res, 422, { message: hiddenMessage(hidden, theirs) });
          }
          if (again === 'too large') return answer(res, 413, { message: tooBig });
          if (again === 'too slow') return answer(res, 503, { message: tooSlowToCheck });
          if (res.destroyed) break;
          res.writeHead(200, {
            'content-type': 'application/zip',
            'content-length': exported.size,
            'content-disposition': `attachment; filename="${exported.filename}"`,
            'cache-control': 'no-store',
          });
          // Sent until it's all there, or the person goes away.
          await pipeline(createReadStream(exported.path), res).catch(() => {});
        } finally {
          clearTimeout(timeout);
          exporting.delete(person);
          if (file) await rm(file, { force: true });
        }
        break;
      }

      case 'import preview': {
        // An export from Homing, as the zip itself, onto disk. Each person sends one at a time, and a few people at once.
        if (uploading.has(person) || uploading.size >= 4) return answer(res, 429, { message: 'Homing is receiving other exports right now. Try again in a moment.' });
        uploading.add(person);
        const started = Date.now();
        let upload: Awaited<ReturnType<typeof receive>>;
        try {
          upload = await receive(req);
        } finally {
          uploading.delete(person);
        }
        // Nobody to answer.
        if (upload === 'gone') return true;
        if (typeof upload === 'string') {
          res.setHeader('connection', 'close');
          if (upload === 'too large') return answer(res, 413, { message: 'That file is larger than Homing imports, 2 GB. Exports from Homing never are.' });
          if (upload === 'not kept') return answer(res, 507, { message: 'Homing couldn’t keep that file on its disk, so it can’t import it. Whoever looks after this Homing can see why in its log.' });
          return answer(res, 408, { message: 'That file took too long to arrive. Try again on a steadier connection.' });
        }
        // Read one at a time on the whole instance, since reading a big export takes a lot of memory:
        // it waits its turn, within the time an upload has, unless the person goes away.
        const left = new AbortController();
        res.once('close', () => left.abort());
        // As the worker wrote it, so nothing large is built here.
        const shown = await previewUpload(person, upload, started + uploadTime, left.signal);
        if (shown === undefined) {
          if (res.destroyed) return true;
          return answer(res, 429, { message: 'Homing was reading other exports the whole time, so it didn’t read yours. Try again later.' });
        }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(shown);
        break;
      }

      case 'import': {
        // Of what the person previewed, as that file: it's never sent twice.
        const params = new URL(req.url ?? '', app.url).searchParams;
        const hash = params.get('hash') ?? '';
        if (!previewed(person, hash)) return answer(res, 400, { message: 'That isn’t the export you looked at. Choose it again to see what it brings.' });
        const { name } = await write((s) => placeSpace(s, { name: params.get('name') ?? '', who: 'with others' }));
        // Imported in the background, one at a time on the whole instance, while the app shows how far it's got.
        const giveBack = turnNow();
        if (!giveBack) return answer(res, 429, { message: 'Homing is reading another export right now. Try again in a moment.' });
        importSpace(app.sql, person, hash, name).catch(() => {}).finally(giveBack);
        json(res, 202, { importing: true });
        break;
      }

      case 'import progress':
        json(res, 200, importProgressOf(person) ?? { state: 'none' });
        break;

      case 'preview progress':
        json(res, 200, previewProgressOf(person) ?? { state: 'none' });
        break;

      case 'space': {
        const found = await read(async (s) => {
          const view = await spaceView(s, route.id);
          return view && { ...view, movedFrom: await movedFrom(s, route.id), archive: await archiveOf(s, view), modelProcessing: await modelProcessingData(s, route.id, person) };
        });
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
          // Where it was in your personal space before you shared it, which only you can open.
          movedFrom: found.movedFrom,
          archive: found.archive,
          modelProcessing: found.modelProcessing,
          model: modelStatement(app.model),
        });
        break;
      }

      case 'model processing': {
        const body = await readJson(req);
        if (typeof body.on !== 'boolean') return answer(res, 400, { message: 'Turn model processing on or off.' });
        const space = await read((s) => spaceView(s, route.id));
        if (!space) return answer(res, 404, noSpace);
        if (!space.admin) return answer(res, 403, { message: `Only ${space.name}’s admins turn model processing on or off.` });
        await write((s) => setModelProcessing(s, route.id, body.on as boolean));
        json(res, 200, { modelProcessing: await read((s) => modelProcessingData(s, route.id, person)) });
        break;
      }

      case 'model use': {
        // The person's own use of Homing's model this month, and the limit everyone here shares, without what anyone else spent.
        const found = await read(async (s) => ({ uses: await modelUseThisMonth(s), limit: await monthlyLimit(s), spaces: await listSpaces(s) }));
        const spaces = new Map(found.spaces.map((space) => [space.id, space]));
        json(res, 200, {
          model: modelStatement(app.model),
          limit: found.limit.limit,
          pausedAt: found.limit.pausedAt,
          uses: found.uses.map((use) => ({
            purpose: use.purpose,
            model: modelName(use.model),
            calls: use.calls,
            cost: use.cost,
            underWay: use.underWay,
            // Only the spaces the person can open now are named.
            spaces: use.spaces.flatMap((id) => {
              const space = spaces.get(id);
              return space ? [{ id, name: space.privateTo !== null && space.parentId === null ? 'your personal space' : space.name }] : [];
            }),
            elsewhere: use.spaces.filter((id) => !spaces.has(id)).length,
          })),
        });
        break;
      }

      case 'model limit': {
        if (!(await looksAfter())) return answer(res, 403, { message: 'Only whoever looks after Homing sets its limit.' });
        const body = await readJson(req);
        const dollars = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/^\$/, '').trim() || Number.NaN) : Number.NaN);
        const fits = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1_000_000;
        // The most a learning run may spend on history, beside the monthly limit: one or the other.
        if (body.ceiling !== undefined) {
          const ceiling = dollars(body.ceiling);
          if (!fits(ceiling)) return answer(res, 400, { field: 'ceiling', message: 'Write the limit in dollars, such as 25.' });
          await write((s) => setRunCeiling(s, Math.round(ceiling * 100) / 100));
          return answer(res, 200, {});
        }
        const limit = dollars(body.limit);
        if (!fits(limit)) return answer(res, 400, { field: 'limit', message: 'Write the limit in dollars, such as 20.' });
        await write((s) => setMonthlyLimit(s, Math.round(limit * 100) / 100));
        json(res, 200, {});
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
            asked: item.asked,
            member: item.member,
            included: item.included,
            changes: item.changes,
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
            included: request.included,
            state: request.state,
            requestedAt: request.requestedAt,
            emailed: request.adminsEmailed,
            admins: request.admins,
            decidedBy: request.decider,
            withdrawnBy: request.state === 'withdrawn' ? request.decidedIn : null,
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
                archived: query.get('archived') === '1',
                countArchived: true,
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
          const names = await peopleNames(s, [...[...page.items, ...history].map((entry) => entry.writtenBy), ...page.items.map((item) => item.publishedBy), page.archived?.by ?? null]);
          const links = await linksOf(s, page.id);
          const { total: gathers } = await pagesIn(s, page.spaceId, { in: page.id, limit: 1 });
          return { page, space, history, names, links, gathers };
        });
        if (!found) return answer(res, 404, noPage);
        const { page, space, history, names, links, gathers } = found;
        const by = (writtenBy: string | null) => authorOf(names, person, writtenBy, null, null).by;
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
          // When it was archived and by whom, unless that's someone the reader doesn't share a space with.
          // Archived by someone else before the reader could see the page, since then, by nobody named.
          archived: page.archived && { at: page.archived.at, by: by(page.archived.by), since: page.archived.since },
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
            ...authorOf(names, person, item.writtenBy, item.agent, item.imported, item.editAgent),
            writtenAt: item.updatedAt,
            // Who shared it from their own private side, and when, imported or not.
            sharedBy: item.privateTo !== null ? null : item.publishedBy ? by(item.publishedBy) : item.publishedAt && item.imported?.publishedBy ? { name: item.imported.publishedBy.name, you: false, imported: true } : null,
            sharedAt: item.privateTo === null ? item.publishedAt : null,
            sources: item.sources,
            // What it replaced, and so what others still see when it's your private update to something shared.
            replaced: item.replaced && { text: item.replaced.body, shared: item.replaced.shared, until: item.createdAt },
            earlier: history
              .filter((entry) => entry.itemId === item.id)
              .map((entry) => ({ text: entry.body, ...authorOf(names, person, entry.writtenBy, entry.agent, entry.imported, entry.editAgent), writtenAt: entry.writtenAt, until: entry.replacedAt })),
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
          ...authorOf(names, person, source.writtenBy, source.agent, source.imported),
          readIn: source.readIn,
          readFrom: source.readFrom,
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
        const { spaces, hits, tasks } = await read(async (s) => ({
          spaces: await listSpaces(s),
          // The same search assistants get, as many results as a person would look through, of each kind.
          hits: query ? [...(await search(s, query, { limit: 200, only: 'content' })), ...(await search(s, query, { limit: 200, only: 'sources' }))] : [],
          tasks: query ? await searchTasks(s, query, { limit: 200 }) : [],
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
            archived: hit.archived,
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
            .map((hit) => ({ id: hit.id, reference: hit.title, excerpt: hit.text, readFrom: hit.readFrom, onlyYou: hit.private, space: where(hit.spaceId) })),
          // Best match first, open before done, as assistants find them.
          tasks: tasks.map((task) => ({ id: task.id, title: task.title, due: task.due, done: task.doneAt !== null, onlyYou: task.privateTo !== null, space: where(task.spaceId) })),
        });
        break;
      }

      case 'changes': {
        const query = new URL(req.url ?? '', 'http://homing').searchParams;
        const limit = Math.min(50, Math.max(1, Number.parseInt(query.get('limit') ?? '50', 10) || 50));
        const { spaces, found, names } = await read(async (s) => {
          const spaces = await listSpaces(s);
          const found = await recentChanges(s, { offset: clamp(Number.parseInt(query.get('offset') ?? '0', 10)), limit, archived: query.get('archived') === '1', spaces });
          return { spaces, found, names: await peopleNames(s, found.changes.flatMap((change) => [change.writtenBy, change.publishedBy])) };
        });
        const where = placeIn(spaces);
        const archived = new Set(spaces.filter((space) => space.archived).map((space) => space.id));
        json(res, 200, {
          more: found.more,
          // Whether archived spaces and pages, left out, have changes to show on request.
          archived: found.archived,
          changes: found.changes.map((change) => ({
            itemId: change.itemId,
            pageId: change.pageId,
            title: change.overview ? 'Overview' : change.title,
            text: change.text,
            kind: change.kind,
            newPage: change.newPage,
            overview: change.overview,
            ...authorOf(names, person, change.writtenBy, change.agent, change.imported, change.editAgent),
            // Shared from someone's own side, the change is the sharing, so it says who shared it.
            sharedBy: change.publishedBy && change.publishedAt?.getTime() === change.at.getTime()
              ? { name: names.get(change.publishedBy) ?? null, you: change.publishedBy === person }
              : null,
            at: change.at,
            onlyYou: change.onlyYou,
            pageArchived: change.pageArchived,
            space: { ...where(change.spaceId), archived: archived.has(change.spaceId) },
          })),
        });
        break;
      }

      case 'overview': {
        const found = await read(async (s) => {
          const space = await spaceView(s, route.id);
          if (!space) return undefined;
          const overview = await overviewOf(s, route.id);
          const history = await historyOf(s, (overview?.items ?? []).map((item) => item.id));
          const names = await peopleNames(s, [...(overview?.items ?? []), ...history].map((entry) => entry.writtenBy));
          // The map beside it: what's active, its collections, recent decisions, what waits here, and the spaces inside.
          const [active, collections, decisions, waiting, spaces] = [
            await pagesIn(s, route.id, { limit: 8 }),
            await pagesIn(s, route.id, { collections: true, limit: 6 }),
            await pagesIn(s, route.id, { type: 'decision', limit: 3 }),
            (await waitingFor(s)).filter((item) => item.spaceId === route.id),
            (await listSpaces(s)).filter((other) => other.parentId === route.id),
          ];
          return { overview, history, names, active, collections, decisions, waiting, spaces };
        });
        if (!found) return answer(res, 404, noSpace);
        const { overview, history, names, active, collections, decisions, waiting, spaces } = found;
        json(res, 200, {
          overview: (overview?.items ?? []).map((item) => ({
            id: item.id,
            text: item.body,
            shared: item.privateTo === null,
            ...authorOf(names, person, item.writtenBy, item.agent, item.imported, item.editAgent),
            writtenAt: item.updatedAt,
            // Your own overview that explicitly replaces the shared one, which the others still see.
            replacesShared: item.privateTo !== null && item.replaced?.shared === true ? item.replaced.body : null,
            earlier: history
              .filter((entry) => entry.itemId === item.id)
              .map((entry) => ({ text: entry.body, ...authorOf(names, person, entry.writtenBy, entry.agent, entry.imported, entry.editAgent), writtenAt: entry.writtenAt, until: entry.replacedAt })),
          })),
          active: active.pages,
          pages: active.all,
          collections: collections.pages,
          decisions: decisions.pages,
          waiting: waiting.map((item) => ({ id: item.id, action: item.action, kind: item.kind, text: item.text, asked: item.asked, member: item.member, included: item.included, changes: item.changes, assistant: item.agent ?? 'Your assistant', request: item.request ? { by: item.askedBy, yours: item.yours, sent: item.sent } : null })),
          // Archived ones last, folded away as in the sidebar.
          spaces: [...spaces].sort((a, b) => Number(a.archived) - Number(b.archived)).map(({ id, name, closed, archived }) => ({ id, name, closed, archived })),
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
        // One overview in particular, such as one whose earlier version is restored: a shared one is
        // corrected for everyone, or replaced for you by your own, and yours is corrected where it is.
        if (body.item !== undefined) {
          const target = typeof body.item === 'string' && new RegExp(`^${uuid}$`).test(body.item) ? body.item : undefined;
          const found = target && (await read(async (s) => (await overviewOf(s, route.id))?.items.find((item) => item.id === target)));
          if (!found) return answer(res, 404, noItem);
          const changed = found.privateTo === null && body.shared !== true
            ? await write((s) => supersedeItem(s, found.id, { body: text }))
            : await write((s) => updateItem(s, found.id, { body: text }));
          if (!changed) return answer(res, 404, noItem);
          json(res, 200, { id: changed.id });
          break;
        }
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

      case 'publication': {
        // What sharing one of your own items would do, before you share it.
        const found = await read(async (s) => {
          const publication = await publicationOf(s, route.id);
          const space = publication && (await spaceView(s, publication.item.spaceId));
          return publication && space && !space.privateTo ? publicationData(publication, { people: space.members.length, above: space.reachedFromAbove }) : undefined;
        });
        if (!found) return answer(res, 404, noItem);
        json(res, 200, found);
        break;
      }

      case 'archive page': {
        const body = await readJson(req);
        if (typeof body.archived !== 'boolean') return answer(res, 400, { message: 'Archive it or reopen it.' });
        const done = await write((s) => archivePage(s, route.id, body.archived as boolean));
        if (done === undefined) return answer(res, 404, noPage);
        if (done === 'reserved') return answer(res, 400, { message: 'Rules, skills and the overview aren’t archived.' });
        json(res, 200, { id: route.id, archived: body.archived });
        break;
      }

      case 'publish item': {
        const body = await readJson(req);
        if (typeof body.shown !== 'string') return answer(res, 400, { message: 'Share what you were shown.' });
        const shared = await write((s) => publishItem(s, route.id, body.shown as string));
        if (!shared) return answer(res, 409, { message: 'This changed while you were reading. The page now shows it as it is.' });
        json(res, 200, { id: shared });
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
        const found = await read(async (s) => {
          if (!(await spaceView(s, route.id))) return undefined;
          const hidden = await notOpen(s, route.id, 'rules');
          return { rules: await rulesFor(s, route.id), includes: await includesIn(s, route.id), hidden };
        });
        if (!found) return answer(res, 404, noSpace);
        json(res, 200, {
          // In the order the assistant gets them, from least to most specific.
          rules: found.rules.map((rule) => ({
            id: rule.id,
            // A space above that the person can't open stays unnamed, and so does its id.
            spaceId: rule.spaceName === null && !rule.personal ? null : rule.spaceId,
            spaceName: rule.spaceName,
            personal: rule.personal,
            kind: rule.kind,
            text: rule.body,
            shared: rule.privateTo === null,
            onlyHere: rule.onlyHere,
            includedIn: inclusionData(rule.includedIn),
          })),
          // Other spaces' rules this space's guidance includes, even those with none yet.
          includes: [
            ...found.includes
              .filter((include) => !include.skill)
              .map((include) => ({ id: include.id, spaceId: include.from.id, spaceName: include.from.name, shared: include.privateTo === null, waiting: include.waiting })),
            // For an admin, what the space includes for everyone that they can't open: only that it's there.
            ...found.hidden,
          ],
        });
        break;
      }

      case 'includable': {
        // What the person could include here: other spaces they can open, and the skills in them.
        const found = await read(async (s) => ((await spaceView(s, route.id)) ? includable(s, route.id) : undefined));
        if (!found) return answer(res, 404, noSpace);
        json(res, 200, found);
        break;
      }

      case 'add include': {
        const body = await readJson(req);
        const id = (value: unknown) => (typeof value === 'string' && new RegExp(`^${uuid}$`, 'i').test(value) ? value.toLowerCase() : undefined);
        const [space, skill] = [id(body.space), id(body.skill)];
        if (!space === !skill) return answer(res, 400, { message: 'Choose a space or a skill to include.' });
        const include = await write((s) => addInclude(s, { spaceId: route.id, included: space ? { space } : { skill: skill! }, shared: body.shared === true }));
        json(res, 200, { id: include.id });
        break;
      }

      case 'remove include': {
        const body = await readJson(req);
        const space = typeof body.space === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.space) ? body.space.toLowerCase() : undefined;
        const nothing = { message: 'There’s nothing included here that you can change.' };
        if (!space || !(await write((s) => removeInclude(s, route.id, space)))) return answer(res, 404, nothing);
        json(res, 200, {});
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
        const found = await read(async (s) => ((await spaceView(s, route.id))
          ? { skills: await skillsHere(s, route.id), hidden: await notOpen(s, route.id, 'skill'), includes: await includesIn(s, route.id) }
          : undefined));
        if (!found) return answer(res, 404, noSpace);
        const { skills, hidden, includes } = found;
        json(res, 200, {
          // For an admin, the skills the space includes for everyone that they can't open: only that they're there.
          hidden,
          // The person's own includes of a skill, waiting while the space includes it for everyone.
          waiting: includes
            .filter((include) => include.waiting && include.skill)
            .map((include) => ({ id: include.id, name: include.skill!.name, spaceName: include.from.name })),
          skills: skills.map(({ pageId, name, description, spaceId, spaceName, privateTo, used, others, includedIn }) => ({
            id: pageId,
            name,
            description,
            spaceId: spaceName === null ? null : spaceId,
            spaceName,
            shared: privateTo === null,
            used,
            others: others.map((other) => ({ id: other.pageId, spaceName: other.spaceName })),
            includedIn: inclusionData(includedIn),
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
        // What the model cost this month, person by person, never on what or where.
        const model = app.model && (await read(async (s) => ({ limit: await monthlyLimit(s), usage: await modelUsageOfEveryone(s) })));
        json(res, 200, {
          host: app.url.host,
          email: { sends: Boolean(app.mailer), from: app.mailer?.from ?? null },
          people: rows.map((row) => ({ name: row.name, email: row.email, joinedAt: row.createdAt, you: row.id === person })),
          model: model
            ? {
                ...modelStatement(app.model),
                limit: model.limit.limit,
                pausedAt: model.limit.pausedAt,
                // The most a learning run may spend on a place's history.
                runCeiling: model.limit.runCeiling,
                // What the limit covers: what was spent, and the worst case of the calls under way.
                spent: model.usage.reduce((sum, row) => sum + row.cost, 0),
                underWay: model.usage.reduce((sum, row) => sum + row.underWay, 0),
                // What learning from history cost, which each run's own limit covers, not the monthly one.
                history: model.usage.reduce((sum, row) => sum + row.history, 0),
                people: model.usage.map((row) => ({ name: row.name, calls: row.calls, cost: row.cost + row.underWay + row.history, you: row.personId === person })),
              }
            : null,
        });
        break;
      }

      case 'connections': {
        // The person's own connections in the space, never anyone else's, and whether more can be connected here.
        const found = await read(async (s) => ((await spaceView(s, route.id)) ? placesIn(s, route.id) : undefined));
        if (!found) return answer(res, 404, noSpace);
        // How far Homing has learned from each, which only they see, as with the place.
        const { runs, spaces, ceiling } = await read(async (s) => {
          const runs = await runsFor(s, found.map((place) => place.id));
          return {
            runs: new Map(
              await Promise.all(
                [...runs].map(async ([place, run]) => {
                  // What each route holds, going by the summary, what the run met that no route names, its map line by line,
                  // and a map that waits for them to decide.
                  const summary = await summaryFor(s, run);
                  const held = summary ? holdings(summary, run.map, run.state === 'estimating' ? run.estimate : null) : [];
                  const address = found.find((one) => one.id === place)?.connection.address ?? '';
                  return [place, { run, progress: await progressOf(s, run), ...(await mapLinesOf(s, run)), summary, held, notPlaced: await notPlaced(s, run, address), waiting: await mapWaiting(s, place) }] as const;
                }),
              ),
            ),
            spaces: runs.size > 0 ? await listSpaces(s) : [],
            ceiling: (await monthlyLimit(s)).runCeiling,
          };
        });
        json(res, 200, {
          microsoft,
          // Whoever looks after Homing is told how to set it up; nobody else is offered anything that can't work.
          looksAfter: !microsoft && (await looksAfter()),
          // Which provider reads what Homing learns from, or null when Homing has no model, so it can't learn yet.
          model: modelStatement(app.model),
          // The most a learning run may spend on history here, which whoever looks after Homing sets.
          runCeiling: ceiling,
          places: found.map((place) => {
            const kind = kindOf(app.connectors.get(place.connection.provider), place.kind);
            const learning = runs.get(place.id);
            return {
              id: place.id,
              kind: place.kind,
              addedAt: place.addedAt,
              elsewhere: place.elsewhere,
              connection: connectionData(app.connectors, place.connection),
              // Whether Homing can learn from a place of this kind, how its items are worded, and how far it has learned.
              learns: Boolean(kind?.follow),
              words: { place: kind?.words.place ?? 'place', item: kind?.words.item ?? 'item', items: kind?.words.items ?? 'items', thread: kind?.words.related ?? 'thread' },
              // Whether Homing can summarize who writes there, which a map is worked out from.
              summarizes: Boolean(kind?.follow?.summary),
              learning: learning ? { ...learningData(learning.run, learning.progress, kind?.words ?? { item: 'item', items: 'items' }), ...mapData(learning, spaces) } : null,
            };
          }),
        });
        break;
      }

      case 'learning set aside': {
        // Everyone who sent what the person's own run set aside for one reason, a page at a time, or those whose address holds what they search for.
        const query = new URL(req.url ?? '', 'http://homing').searchParams;
        const from = Number.parseInt(query.get('from') ?? '0', 10);
        const found = await read(async (s) => {
          const run = (await runsFor(s, [route.id])).get(route.id);
          return run && setAsideSenders(s, run, (query.get('reason') ?? '').slice(0, 40), { search: query.get('q')?.slice(0, 200), from: clamp(from) });
        });
        if (!found) return answer(res, 404, { message: 'There’s nothing of yours to learn from here.' });
        json(res, 200, found);
        break;
      }

      case 'estimate learning':
      case 'summarize learning':
      case 'suggest map':
      case 'start learning':
      case 'pause learning':
      case 'resume learning':
      case 'estimate extension':
      case 'extend learning':
      case 'learning limit':
      case 'learning left out':
      case 'learning again': {
        // Learning from one of the person's own places, which they direct here. Anyone else's place isn't there for them.
        const nothing = { message: 'There’s nothing of yours to learn from here.' };
        const body = await readJson(req);
        const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.since) && !Number.isNaN(Date.parse(body.since)) ? new Date(body.since) : undefined;
        const amount = typeof body.limit === 'number' ? body.limit : typeof body.limit === 'string' ? Number(body.limit.replace(/^\$/, '').trim() || Number.NaN) : Number.NaN;
        const limit = Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000 ? Math.round(amount * 100) / 100 : undefined;
        const lines = (value: unknown) => (Array.isArray(value) && value.every((line) => typeof line === 'string') ? (value as string[]).map((line) => line.trim()).filter(Boolean) : undefined);
        try {
          if (route.name === 'estimate extension' && body.since === null) {
            // Not now: what was worked out for learning further back is let go.
            const done = await write(async (s) => {
              const run = (await runsFor(s, [route.id])).get(route.id);
              if (run) await forgetExtension(s, run);
              return Boolean(run);
            });
            if (!done) return answer(res, 404, nothing);
          } else if (route.name === 'summarize learning') {
            // Who writes there, which Homing's worker counts without a model. A started run is summarized over its own scope.
            await summarizeLearning(app.learning, { person, direct: true }, route.id, since);
          } else if (route.name === 'suggest map') {
            // Homing's own model answers where the mail belongs, and its answer waits as a proposal, as an assistant's does.
            const { proposal, unasked } = await suggestMap(app.learning, person, route.id);
            const note = unasked > 0 && `Homing’s model wasn’t asked about ${unasked.toLocaleString('en-US')} ${unasked === 1 ? 'sender' : 'senders'} whose mail goes to a space that isn’t sent to a model.`;
            return answer(res, 200, { proposal: proposal.id, ...(note && { message: note }) });
          } else if (route.name === 'estimate learning' || route.name === 'estimate extension') {
            if (!since) return answer(res, 400, { field: 'since', message: 'Choose how far back to learn.' });
            if (route.name === 'estimate learning') await estimateLearning(app.learning, { person, direct: true }, route.id, since);
            else if (!(await estimateExtension(app.learning, { person, direct: true }, route.id, since))) return answer(res, 409, { message: 'It already learns from that far back.' });
          } else {
            if ((route.name === 'start learning' || route.name === 'learning limit') && limit === undefined) {
              return answer(res, 400, { field: 'limit', message: 'Write the limit in dollars, such as 5.' });
            }
            if (route.name === 'extend learning' && !since) return answer(res, 400, { field: 'since', message: 'Choose how far back to learn.' });
            const [senders, folders, kept] = [lines(body.senders), lines(body.folders), lines(body.kept)];
            if (route.name === 'learning left out' && (!senders || !folders || !kept)) return answer(res, 400, { message: 'Write what to leave out, one on each line.' });
            // What the page showed when they pressed Start: how far back, and which estimate. Only that starts.
            const time = (value: unknown) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined);
            const [shownSince, estimated] = [time(body.since), time(body.estimated)];
            const reason = typeof body.reason === 'string' ? body.reason : undefined;
            const done = await write(async (s) => {
              const run = (await runsFor(s, [route.id])).get(route.id);
              if (!run) return false;
              if (route.name === 'start learning') {
                if (!run.estimate) throw new LearningRefused('Learning is estimated before it starts.');
                if (!shownSince || !estimated) throw new LearningRefused('The estimate changed since you saw it. Check it again before you start.');
                await startLearning(app.learning, s, { id: run.id, place: run.place, since: new Date(shownSince), estimate: { ...run.estimate, at: estimated } }, limit);
              } else if (route.name === 'learning again') {
                if (reason !== undefined && !retryable.includes(reason)) throw new LearningRefused('That isn’t something Homing tries again.');
                await retryLearning(s, run, reason);
              }
              else if (route.name === 'pause learning') await pauseLearning(s, run);
              else if (route.name === 'resume learning') await resumeLearning(app.learning, s, run);
              else if (route.name === 'extend learning') await extendLearning(app.learning, s, run, since!);
              else if (route.name === 'learning limit') await setLearningLimit(s, run, limit!);
              else await setLeftOut(s, run, { senders: senders!, folders: folders!, kept: kept! });
              return true;
            });
            if (!done) return answer(res, 404, nothing);
          }
        } catch (error) {
          if (error instanceof LearningRefused) return error.message === nothingThere ? answer(res, 404, nothing) : answer(res, 409, { message: error.message });
          throw error;
        }
        json(res, 200, {});
        break;
      }

      case 'connect': {
        // A system this Homing has a connector for, such as Microsoft 365, set up or not.
        const connector = app.connectors.get(route.connector);
        if (!connector) return answer(res, 404, { message: 'Not found.' });
        const body = await readJson(req);
        const again = typeof body.again === 'string' && new RegExp(`^${uuid}$`, 'i').test(body.again) ? body.again.toLowerCase() : undefined;
        try {
          const address = await startConnecting(app, { person, session: session.session.id }, route.id, connector, again);
          if (!address) return answer(res, 404, noSpace);
          json(res, 200, { url: address.toString() });
        } catch (error) {
          if (error instanceof ConnectRefused) return answer(res, 409, { message: error.message });
          throw error;
        }
        break;
      }

      case 'remove place': {
        if (!(await write((s) => removePlace(s, route.id)))) return answer(res, 404, { message: 'There’s nothing of yours to remove here.' });
        json(res, 200, {});
        break;
      }

      case 'accounts': {
        const found = await read(async (s) => ({ connections: await connectionsOf(s), spaces: await listSpaces(s) }));
        const spaces = new Map(found.spaces.map((space) => [space.id, space]));
        json(res, 200, {
          microsoft,
          connections: found.connections.map((connection) => ({
            ...connectionData(app.connectors, connection),
            // Where it's used, in the spaces the person can open.
            places: connection.places.flatMap(({ id, spaceId }) => {
              const space = spaces.get(spaceId);
              return space ? [{ id, space: { id: space.id, name: space.name, personal: space.privateTo !== null && space.parentId === null } }] : [];
            }),
          })),
        });
        break;
      }

      case 'revoke connection': {
        if (!(await write((s) => revokeConnection(s, route.id)))) return answer(res, 404, { message: 'There’s no account of yours to revoke here.' });
        json(res, 200, {});
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
    if (error instanceof SpaceRefused) return answer(res, error.status, { field: error.field, message: error.message });
    if (error instanceof IncludeRefused) return answer(res, error.status, { message: error.message });
    if (error instanceof TaskRefused) return answer(res, 400, { field: error.field, message: error.message });
    if (error instanceof TooLong) return answer(res, 400, { field: 'text', message: error.message });
    if (error instanceof ImportRefused) return answer(res, 400, { field: error.field, message: error.message });
    if (error instanceof postgres.PostgresError && error.message === "that person can't be given this task") {
      return answer(res, 400, { field: 'assignee', message: 'They can’t open this space, so they can’t be given the task.' });
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

/** Where an included rule or skill is included, for the app: a space above the person can't open stays unnamed, and so does its id. */
function inclusionData(includedIn: Inclusion | null) {
  if (!includedIn) return null;
  return {
    id: includedIn.id,
    spaceId: includedIn.spaceName === null ? null : includedIn.spaceId,
    spaceName: includedIn.personal ? 'your personal space' : includedIn.spaceName,
    shared: includedIn.shared,
  };
}

/** For a space's admin, what it includes for everyone that they can't open, of one kind: who added it, and when. */
async function notOpen(s: Session, spaceId: string, kind: 'rules' | 'skill') {
  const hidden = (await includesNotOpen(s, spaceId)).filter((include) => include.kind === kind);
  const names = await peopleNames(s, hidden.map((include) => include.addedBy).filter((id) => id !== null));
  // Someone named in an import is nobody here, so they're said to be imported.
  const adder = (include: (typeof hidden)[number]) =>
    include.addedBy ? (names.get(include.addedBy) ?? null) : include.importedAdder ? `${include.importedAdder} (imported)` : null;
  return hidden.map((include) => ({ id: include.id, spaceId: null, spaceName: null, shared: true, addedBy: adder(include), addedAt: include.addedAt }));
}

/** Where in a long list to start: from the top, and never past what any list could hold. */
function clamp(offset: number): number {
  return Number.isFinite(offset) ? Math.min(Math.max(0, Math.floor(offset)), 1_000_000) : 0;
}

/**
 * Who wrote something, as the app shows it: you, someone by name, or nobody named when they're no
 * longer someone the reader shares a space with, and the agent that wrote it for them. What still
 * says what it said when it was imported shows who wrote it before, credited to nobody here.
 * Nobody at all when a space's routine wrote it. A person's own text that their assistant changed
 * for them stays theirs, and says which assistant.
 */
function authorOf(names: Map<string, string>, person: string, writtenBy: string | null, agent: string | null, imported: Imported | null, editAgent: string | null = null) {
  const before = importedAuthor(imported);
  const edited = before ? (before.by === 'person' ? before.agent : null) : editAgent;
  return {
    by: before ? (before.person ? { name: before.name, you: false, imported: true } : null) : writtenBy === null ? null : { name: names.get(writtenBy) ?? null, you: writtenBy === person },
    agent: before ? (before.by === 'person' ? null : before.agent) : agent,
    ...(edited && { editAgent: edited }),
  };
}

/** A connection as the app shows it to its owner: what it is, what Homing may do, and whether it works. Never its credentials. */
function connectionData(connectors: Connectors, connection: Connection) {
  const { id, provider, address, name, status, connectedAt, refreshedAt } = connection;
  const service = connectors.get(provider)?.name ?? provider;
  return { id, service, address, name, can: abilitiesOf(connectors, connection), status, connectedAt, refreshedAt };
}

/** A learning run as the app shows it to its owner: where it stands, what it learned from, what it set aside and from whom, and what it spent against its limit. */
function learningData(run: Run, progress: Progress, words: { item: string; items: string }) {
  const { state, reason, waitingFor, waitingAtLimit, since, learnedUpTo, caughtUpAt, followedPartly, extending, limit, estimate, proposed, leftOut } = run;
  return {
    state,
    reason,
    waitingFor,
    waitingAtLimit,
    since,
    learnedUpTo,
    caughtUp: caughtUpAt !== null,
    followedPartly,
    extending,
    limit,
    estimate,
    proposed,
    leftOut,
    spent: progress.spent,
    followed: progress.followed,
    threads: progress.threads,
    learned: progress.learned,
    again: progress.again,
    setAside: progress.setAside.map((aside) => ({ ...aside, words: setAsideWords(aside.reason, aside.items, words) })),
  };
}

/**
 * A run's map as the app shows it: each route and everything else, by space name, with what it
 * holds, and who isn't placed. Whether a summary is there, being made or given up, and how much the
 * one there counted. And whether Homing's model is being asked for a map, or one waits for the
 * person to decide.
 */
function mapData({ run, lines, suggesting, summary, held, notPlaced: unplaced, waiting }: { run: Run; lines: MapLine[]; suggesting: boolean; summary: Summary | null; held: Held[]; notPlaced: Awaited<ReturnType<typeof notPlaced>>; waiting: string | undefined }, spaces: Space[]) {
  return {
    map: run.map,
    mapped: mapShown(run, lines, held, spaces),
    summarizing: run.summarizing,
    summarized: run.summarized,
    summaryFailed: run.summaryFailed,
    summary: summary && { since: summary.since, emails: summary.emails, senders: summary.senders.length + summary.rest.senders },
    held,
    notPlaced: unplaced,
    suggesting,
    waiting: waiting ?? null,
  };
}

function answer(res: ServerResponse, status: number, body: unknown): true {
  json(res, status, body);
  return true;
}

type Route =
  | { name: 'spaces' | 'waiting' | 'admin' | 'requests' | 'search' | 'changes' | 'create space' | 'import' | 'import preview' | 'import progress' | 'preview progress' | 'accounts' | 'model use' | 'model limit' }
 | { name: 'change member'; id: string; person: string }
  | { name: 'connect'; id: string; connector: string }
  | { name: 'space' | 'rename space' | 'archive space' | 'model processing' | 'add member' | 'conversion' | 'convert space' | 'export' | 'tasks' | 'add task' | 'change task' | 'share task' | 'pages' | 'page' | 'sources' | 'source' | 'add page' | 'add item' | 'correct item' | 'publication' | 'publish item' | 'archive page' | 'gather' | 'ungather' | 'overview' | 'write overview' | 'rules' | 'add rule' | 'skills' | 'edit rule' | 'remove rule' | 'skill' | 'includable' | 'add include' | 'remove include' | 'connections' | 'remove place' | 'revoke connection' | 'estimate learning' | 'summarize learning' | 'suggest map' | 'start learning' | 'pause learning' | 'resume learning' | 'estimate extension' | 'extend learning' | 'learning limit' | 'learning left out' | 'learning again' | 'learning set aside'; id: string };

function routeOf(method: string, path: string): Route | undefined {
  const match = (pattern: string) => new RegExp(`^${pattern}$`, 'i').exec(path)?.[1]?.toLowerCase();
  if (method === 'GET') {
    if (path === '/api/spaces') return { name: 'spaces' };
    if (path === '/api/waiting') return { name: 'waiting' };
    if (path === '/api/admin') return { name: 'admin' };
    if (path === '/api/requests') return { name: 'requests' };
    if (path === '/api/search') return { name: 'search' };
    if (path === '/api/changes') return { name: 'changes' };
    if (path === '/api/import') return { name: 'import progress' };
    if (path === '/api/import/preview') return { name: 'preview progress' };
    if (path === '/api/connections') return { name: 'accounts' };
    if (path === '/api/model') return { name: 'model use' };
    for (const [name, pattern] of [
      ['space', `/api/spaces/${uuid}`],
      ['pages', `/api/spaces/${uuid}/pages`],
      ['page', `/api/pages/${uuid}`],
      ['publication', `/api/items/${uuid}/publication`],
      ['sources', `/api/spaces/${uuid}/sources`],
      ['overview', `/api/spaces/${uuid}/overview`],
      ['conversion', `/api/spaces/${uuid}/conversion`],
      ['export', `/api/spaces/${uuid}/export`],
      ['tasks', `/api/spaces/${uuid}/tasks`],
      ['source', `/api/sources/${uuid}`],
      ['rules', `/api/spaces/${uuid}/rules`],
      ['includable', `/api/spaces/${uuid}/includable`],
      ['skills', `/api/spaces/${uuid}/skills`],
      ['skill', `/api/skills/${uuid}`],
      ['connections', `/api/spaces/${uuid}/connections`],
      ['learning set aside', `/api/places/${uuid}/learning/set-aside`],
    ] as const) {
      const id = match(pattern);
      if (id) return { name, id };
    }
  }
  if (method === 'POST') {
    if (path === '/api/spaces') return { name: 'create space' };
    if (path === '/api/import') return { name: 'import' };
    if (path === '/api/import/preview') return { name: 'import preview' };
    if (path === '/api/admin/model-limit') return { name: 'model limit' };
    const member = new RegExp(`^/api/spaces/${uuid}/members/${uuid}$`, 'i').exec(path);
    if (member) return { name: 'change member', id: member[1].toLowerCase(), person: member[2].toLowerCase() };
    // Connecting an account of a system, such as Microsoft 365, in a space.
    const connecting = new RegExp(`^/api/spaces/${uuid}/connections/([a-z][a-z0-9]*)$`, 'i').exec(path);
    if (connecting) return { name: 'connect', id: connecting[1].toLowerCase(), connector: connecting[2].toLowerCase() };
    for (const [name, pattern] of [
      ['rename space', `/api/spaces/${uuid}`],
      ['archive space', `/api/spaces/${uuid}/archive`],
      ['model processing', `/api/spaces/${uuid}/model-processing`],
      ['add member', `/api/spaces/${uuid}/members`],
      ['convert space', `/api/spaces/${uuid}/conversion`],
      ['add task', `/api/spaces/${uuid}/tasks`],
      ['change task', `/api/tasks/${uuid}`],
      ['share task', `/api/tasks/${uuid}/share`],
      ['add page', `/api/spaces/${uuid}/pages`],
      ['write overview', `/api/spaces/${uuid}/overview`],
      ['add item', `/api/pages/${uuid}/items`],
      ['gather', `/api/pages/${uuid}/gather`],
      ['ungather', `/api/pages/${uuid}/gather/remove`],
      ['correct item', `/api/items/${uuid}`],
      ['publish item', `/api/items/${uuid}/publish`],
      ['archive page', `/api/pages/${uuid}/archive`],
      ['add rule', `/api/spaces/${uuid}/rules`],
      ['edit rule', `/api/rules/${uuid}`],
      ['remove rule', `/api/rules/${uuid}/remove`],
      ['add include', `/api/spaces/${uuid}/includes`],
      ['remove include', `/api/includes/${uuid}/remove`],
      ['remove place', `/api/places/${uuid}/remove`],
      ['estimate learning', `/api/places/${uuid}/learning/estimate`],
      ['summarize learning', `/api/places/${uuid}/learning/summary`],
      ['suggest map', `/api/places/${uuid}/learning/map`],
      ['start learning', `/api/places/${uuid}/learning/start`],
      ['pause learning', `/api/places/${uuid}/learning/pause`],
      ['resume learning', `/api/places/${uuid}/learning/resume`],
      ['estimate extension', `/api/places/${uuid}/learning/extend/estimate`],
      ['extend learning', `/api/places/${uuid}/learning/extend`],
      ['learning limit', `/api/places/${uuid}/learning/limit`],
      ['learning left out', `/api/places/${uuid}/learning/left-out`],
      ['learning again', `/api/places/${uuid}/learning/again`],
      ['revoke connection', `/api/connections/${uuid}/revoke`],
    ] as const) {
      const id = match(pattern);
      if (id) return { name, id };
    }
  }
  return undefined;
}

/**
 * When a space was archived and by whom, or the space above it it was archived with. Someone the
 * reader can't see, or a space above they can't open, stays unnamed.
 */
async function archiveOf(s: Session, space: Space) {
  if (!space.archived) return null;
  if (space.archivedAt) {
    const [row] = await s.tx<{ archivedBy: string | null }[]>`select archived_by from spaces where id = ${space.id}::uuid`;
    const names = await peopleNames(s, [row?.archivedBy ?? null]);
    return { at: space.archivedAt, by: row?.archivedBy ? (names.get(row.archivedBy) ?? null) : null, you: row?.archivedBy === personOf(s.principal), with: null };
  }
  const above = (await listSpaces(s)).find((candidate) => candidate.id === space.archivedIn);
  return { at: above?.archivedAt ?? null, by: null, you: false, with: above ? { id: above.id, name: above.name } : null };
}

/**
 * Model processing in a space, as its settings show it: when it was turned off there and by whom,
 * or the space above it it's off in, named only when the reader can open that one too.
 */
async function modelProcessingData(s: Session, spaceId: string, person: string) {
  const found = await modelProcessingOf(s, spaceId);
  if (!found) return null;
  const names = await peopleNames(s, [found.offBy]);
  const above = found.offIn ? (await listSpaces(s)).find((candidate) => candidate.id === found.offIn) : undefined;
  return {
    on: found.on,
    offAt: found.offAt,
    offBy: found.offBy ? (names.get(found.offBy) ?? null) : null,
    you: found.offBy === person,
    offAbove: found.offAbove,
    offIn: above ? { id: above.id, name: above.name } : null,
  };
}
