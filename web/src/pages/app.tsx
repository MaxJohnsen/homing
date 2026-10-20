import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { failed, LoadFailed, ScreenHeader } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import type { RuleActions, RuleData, SkillData, SkillSummary } from '@/lib/guidance';
import type { ChangeData, NewPage, OverviewData, PageActions, PageData, PageOrder, PagesData, SourceData, SourcesData, WriteOverview } from '@/lib/knowledge';
import { reload, useLoad } from '@/lib/load';
import type { PublicationData, RequestData, WaitingData } from '@/lib/proposals';
import { useRecent } from '@/lib/recent';
import { navigate, routeOf, useAddress, type Route, type SpaceView } from '@/lib/router';
import type { SearchData, SearchKind } from '@/lib/search';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import { AccountPage } from '@/pages/account';
import { ProposalPage } from '@/pages/proposal';
import type { AccountData } from '@/screens/account';
import { Admin, type AdminData, type InviteMade } from '@/screens/admin';
import { Home } from '@/screens/home';
import { Rules, Skills } from '@/screens/guidance';
import { Page } from '@/screens/page';
import { Pages, type PageFilters } from '@/screens/pages';
import { Changes } from '@/screens/changes';
import { Overview } from '@/screens/overview';
import { Search } from '@/screens/search';
import { Source, Sources } from '@/screens/sources';
import { Skill } from '@/screens/skill';
import { NewSpace } from '@/screens/new-space';
import { Members, Space, SpaceSettings, type MemberActions } from '@/screens/space';
import { Waiting } from '@/screens/waiting';

/** The signed-in app: the shelf with your spaces, and the screen you're on beside it. */
export function AppPage() {
  const address = useAddress();
  const route = routeOf(location.pathname) ?? { name: 'home' };
  const meLoad = useLoad<AccountData>('/api/me');
  const spacesLoad = useLoad<{ spaces: SpaceSummary[] }>('/api/spaces');
  const me = meLoad.data;
  const spaces = spacesLoad.data?.spaces;
  const waiting = useLoad<{ waiting: WaitingData[] }>('/api/waiting').data?.waiting;

  const skill = useLoad<SkillData>(route.name === 'skill' ? `/api/skills/${route.id}` : '').data;
  const page = useLoad<PageData>(route.name === 'page' ? `/api/pages/${route.id}` : '').data;
  const source = useLoad<SourceData>(route.name === 'source' ? `/api/sources/${route.id}` : '').data;
  // The space the screen is in, so the shelf shows where you are.
  const spaceId = route.name === 'space' ? route.id
    : route.name === 'skill' ? (skill?.spaceId ?? undefined)
      : route.name === 'page' ? page?.space.id
        : route.name === 'source' ? source?.space.id : undefined;
  const { recent, opened } = useRecent(me?.email ?? '');
  // Only a space that opened counts as visited.
  const visited = route.name === 'space' && spaces?.some((space) => space.id === route.id) ? route.id : undefined;
  useEffect(() => {
    if (me && visited) opened(visited);
  }, [me, visited, opened]);

  if (!me || !spaces) {
    return failed(meLoad.error, spacesLoad.error) ? (
      <main className="mx-auto max-w-xl px-4 py-16"><LoadFailed paths={['/api/me', '/api/spaces']} /></main>
    ) : null;
  }
  return (
    <Shell
      person={me}
      spaces={spaces}
      waiting={waiting?.length ?? 0}
      recent={recent}
      route={route}
      spaceId={spaceId}
      onSignOut={async () => {
        await api('/api/auth/sign-out', {});
        location.assign('/sign-in');
      }}
    >
      {/* A new screen for each address; searching and filtering within one keeps it. */}
      <Screen key={route.name === 'new space' ? address : address.split('?')[0]} route={route} me={me} spaces={spaces} waiting={waiting} recent={recent.map((id) => spaces.find((space) => space.id === id)).filter((space) => space !== undefined)} />
    </Shell>
  );
}

function Screen({ route, me, spaces, waiting, recent }: { route: Route; me: AccountData; spaces: SpaceSummary[]; waiting?: WaitingData[]; recent: SpaceSummary[] }) {
  switch (route.name) {
    case 'home':
      return <Titled title="Home"><HomePage me={me} waiting={waiting} recent={recent} /></Titled>;
    case 'search':
      return <Titled title="Search"><SearchPage /></Titled>;
    case 'changes':
      return <Titled title="What changed"><ChangesPage /></Titled>;
    case 'waiting':
      return <Titled title="Waiting for you">{waiting && <Waiting waiting={waiting} />}</Titled>;
    case 'account':
      return <Titled title="Your account"><AccountPage /></Titled>;
    case 'admin':
      return <Titled title="Looking after Homing"><AdminPage /></Titled>;
    case 'proposal':
      return <Titled title="A decision"><ProposalPage id={route.id} /></Titled>;
    case 'new space':
      return <Titled title="New space"><NewSpacePage spaces={spaces} /></Titled>;
    case 'space':
      return <SpacePage id={route.id} view={route.view ?? 'overview'} />;
    case 'page':
      return <PagePage id={route.id} />;
    case 'source':
      return <SourcePage id={route.id} />;
    case 'skill':
      return <SkillPage id={route.id} />;
  }
}

function HomePage({ me, waiting, recent }: { me: AccountData; waiting?: WaitingData[]; recent: SpaceSummary[] }) {
  const { data, error } = useLoad<{ requests: RequestData[] }>('/api/requests');
  const changes = useLoad<{ changes: ChangeData[]; more: boolean }>('/api/changes?limit=5');
  const requests = data?.requests;
  if (failed(error, changes.error)) return <LoadFailed paths={['/api/requests', '/api/waiting', '/api/changes?limit=5']} />;
  if (!waiting || !requests || !changes.data) return null;
  return (
    <Home
      data={{ name: me.name, waiting, assistants: me.assistants.length, mcpUrl: me.mcpUrl, requests, changes: changes.data.changes, moreChanges: changes.data.more }}
      recent={recent}
    />
  );
}

/** Starting a space, from the sidebar or from the space it goes in, then opening it. */
function NewSpacePage({ spaces }: { spaces: SpaceSummary[] }) {
  const search = new URLSearchParams(location.search);
  return (
    <NewSpace
      spaces={spaces}
      start={search.get('in') ?? undefined}
      name={search.get('name')?.slice(0, 100) ?? undefined}
      create={async (input) => {
        try {
          return await api<{ id: string }>('/api/spaces', input);
        } catch (error) {
          return { problem: error instanceof Error ? error.message : 'Something went wrong. Try again.', field: error instanceof ApiError ? error.field : undefined };
        }
      }}
      onCreated={async (id) => {
        await reload('/api/spaces');
        navigate(`/spaces/${id}`);
      }}
      onCancel={() => (history.length > 1 ? history.back() : navigate('/'))}
    />
  );
}

/** Changing who is in a space directly, then showing its members as they are now. */
function memberActions(spaceId: string): MemberActions {
  const fresh = () => Promise.all([reload(`/api/spaces/${spaceId}`), reload('/api/spaces')]);
  return {
    add: async (email, admin) => {
      try {
        const added = await api<{ name: string }>(`/api/spaces/${spaceId}/members`, { email, admin });
        await fresh();
        return { name: added.name };
      } catch (error) {
        return { problem: error instanceof Error ? error.message : 'Something went wrong. Try again.', field: error instanceof ApiError ? error.field : undefined };
      }
    },
    change: async (personId, change) => {
      try {
        await api(`/api/spaces/${spaceId}/members/${personId}`, { change });
        // Leaving a space can take it, and the spaces in it, out of your sidebar.
        await fresh();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) await fresh();
        return error instanceof Error ? error.message : 'Something went wrong. Try again.';
      }
    },
  };
}

/** Renaming a space, then showing it, and the sidebar, with its new name. */
function renameSpace(spaceId: string) {
  return async (name: string) => {
    try {
      await api(`/api/spaces/${spaceId}`, { name });
      await Promise.all([reload(`/api/spaces/${spaceId}`), reload('/api/spaces')]);
    } catch (error) {
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
    }
  };
}

function SpacePage({ id, view: asked }: { id: string; view: SpaceView }) {
  const { data: space, error } = useLoad<SpaceData>(`/api/spaces/${id}`);
  // Settings are only for a space's admins, and a personal space has none.
  const view = asked === 'settings' && space && (!space.admin || space.personal) ? 'overview' : asked;
  const rulesLoad = useLoad<{ rules: RuleData[] }>(view === 'rules' ? `/api/spaces/${id}/rules` : '');
  const skillsLoad = useLoad<{ skills: SkillSummary[] }>(view === 'skills' ? `/api/spaces/${id}/skills` : '');
  const rules = rulesLoad.data?.rules;
  const skills = skillsLoad.data?.skills;
  const overview = useLoad<OverviewData>(view === 'overview' ? `/api/spaces/${id}/overview` : '');
  const pages = useList<PagesData>(view === 'pages' ? `/api/spaces/${id}/pages` : undefined);
  const collections = useList<PagesData>(view === 'collections' ? `/api/spaces/${id}/pages` : undefined, { collections: '1' });
  const sources = useList<SourcesData>(view === 'sources' ? `/api/spaces/${id}/sources` : undefined);
  return (
    <Titled title={space?.name ?? 'Space'}>
      {error?.status === 404 && <ScreenHeader title="There’s no space here" meta="It may have been removed, or you can’t open it." />}
      {failed(error) && <LoadFailed paths={[`/api/spaces/${id}`]} />}
      {space && !error && (
        <Space space={space} view={space.private && view === 'members' ? 'rules' : view}>
          {failed(rulesLoad.error, skillsLoad.error, pages.error, collections.error, sources.error, overview.error) && (
            <LoadFailed paths={[pages.path, collections.path, sources.path, view === 'rules' ? `/api/spaces/${id}/rules` : '', view === 'skills' ? `/api/spaces/${id}/skills` : '', view === 'overview' ? `/api/spaces/${id}/overview` : ''].filter(Boolean)} />
          )}
          {view === 'overview' && overview.data && <Overview space={space} data={overview.data} write={writeOverview(id)} />}
          {view === 'pages' && <Pages space={space} data={pages.data} filters={pages.filters} onFilters={pages.change} create={newPage(id)} />}
          {view === 'collections' && <Pages space={space} data={collections.data} filters={collections.filters} onFilters={collections.change} collections />}
          {view === 'sources' && <Sources space={space} data={sources.data} filters={sources.filters} onFilters={sources.change} />}
          {(view === 'rules' || (space.private && view === 'members')) && rules && <Rules space={space} rules={rules} actions={ruleActions(id)} />}
          {view === 'skills' && skills && <Skills space={space} skills={skills} />}
          {view === 'members' && !space.private && <Members space={space} actions={memberActions(id)} />}
          {view === 'settings' && <SpaceSettings space={space} rename={renameSpace(id)} />}
        </Space>
      )}
    </Titled>
  );
}

/**
 * A long list, such as a space's pages, as the search, type, order and place in the address ask,
 * so the back button returns to the same list. While a new answer is on its way, the last one stays.
 */
function useList<T>(path: string | undefined, fixed: Record<string, string> = {}) {
  const search = new URLSearchParams(location.search);
  const filters: PageFilters = {
    q: search.get('q') ?? '',
    type: search.get('type') ?? '',
    sort: (['recent', 'name', 'match'] as const).find((order) => order === search.get('sort')) satisfies PageOrder | undefined,
    from: Math.max(0, Number.parseInt(search.get('from') ?? '0', 10) || 0),
  };
  const query = new URLSearchParams();
  if (filters.q.trim()) query.set('q', filters.q.trim());
  if (filters.type) query.set('type', filters.type);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.from) query.set('from', String(filters.from));
  const api = new URLSearchParams({ ...fixed, ...Object.fromEntries(query) });
  api.delete('from');
  if (filters.from) api.set('offset', String(filters.from));
  const address = path ? `${path}${api.size ? `?${api}` : ''}` : '';
  const { data, error } = useLoad<T>(address);
  const last = useRef<T>(undefined);
  if (data) last.current = data;
  const change = useCallback((next: PageFilters) => {
    const address = new URLSearchParams();
    if (next.q.trim()) address.set('q', next.q.trim());
    if (next.type) address.set('type', next.type);
    if (next.sort) address.set('sort', next.sort);
    if (next.from) address.set('from', String(next.from));
    // Typing a search, or clearing it, replaces the address instead of adding to the history.
    navigate(`${location.pathname}${address.size ? `?${address}` : ''}`, { replace: next.q !== (new URLSearchParams(location.search).get('q') ?? '') });
  }, []);
  return { data: data ?? last.current, error, path: address, filters, change };
}

function SourcePage({ id }: { id: string }) {
  const { data, error } = useLoad<SourceData>(`/api/sources/${id}`);
  return (
    <Titled title={data?.reference ?? 'Source'}>
      {error?.status === 404 && <ScreenHeader title="There’s no source here" meta="It may have been removed, or you can’t open it." />}
      {failed(error) && <LoadFailed paths={[`/api/sources/${id}`]} />}
      {data && !error && <Source source={data} />}
    </Titled>
  );
}

function PagePage({ id }: { id: string }) {
  const { data, error } = useLoad<PageData>(`/api/pages/${id}`);
  // A collection's pages, by name, fifty at a time.
  const [from, setFrom] = useState(0);
  const gatheredPath = data && data.gathers > 0 ? `/api/spaces/${data.space.id}/pages?in=${id}&sort=name${from ? `&offset=${from}` : ''}` : '';
  const gathered = useLoad<PagesData>(gatheredPath).data;
  return (
    <Titled title={data?.title ?? 'Page'}>
      {error?.status === 404 && <ScreenHeader title="There’s no page here" meta="It may have been removed, or you can’t open it." />}
      {failed(error) && <LoadFailed paths={[`/api/pages/${id}`]} />}
      {data && !error && <Page page={data} actions={pageActions(data, gatheredPath)} gathered={gathered} gatheredFrom={from} onGatheredFrom={setFrom} />}
    </Titled>
  );
}

/** Everything that changed, fifty at a time, with the place in the list in the address. */
function ChangesPage() {
  const from = Math.max(0, Number.parseInt(new URLSearchParams(location.search).get('from') ?? '0', 10) || 0);
  const path = `/api/changes${from ? `?offset=${from}` : ''}`;
  const { data, error } = useLoad<{ changes: ChangeData[]; more: boolean }>(path);
  if (failed(error)) return <LoadFailed paths={[path]} />;
  return (
    <Changes
      changes={data?.changes}
      more={data?.more ?? false}
      from={from}
      onFrom={(next) => {
        navigate(next ? `/changes?from=${next}` : '/changes');
        scrollTo({ top: 0 });
      }}
    />
  );
}

/** Searching everything, with the search, the kind shown and the place in the list in the address. */
function SearchPage() {
  const search = new URLSearchParams(location.search);
  const query = search.get('q')?.trim() ?? '';
  const kind = (['pages', 'sources', 'rules', 'skills', 'spaces'] as const).find((candidate) => candidate === search.get('kind')) ?? 'all';
  const from = Math.max(0, Number.parseInt(search.get('from') ?? '0', 10) || 0);
  const { data, error } = useLoad<SearchData>(query ? `/api/search?q=${encodeURIComponent(query)}` : '');
  const go = (next: { kind?: SearchKind; from?: number }) => {
    const address = new URLSearchParams({ q: query });
    if ((next.kind ?? kind) !== 'all') address.set('kind', next.kind ?? kind);
    if (next.from) address.set('from', String(next.from));
    navigate(`/search?${address}`);
    scrollTo({ top: 0 });
  };
  if (failed(error)) return <LoadFailed paths={[`/api/search?q=${encodeURIComponent(query)}`]} />;
  return <Search data={data} query={query} kind={kind} from={from} onKind={(next) => go({ kind: next, from: 0 })} onFrom={(next) => go({ from: next })} />;
}

/** Writing a space's overview, then showing it as it is now. */
function writeOverview(spaceId: string): WriteOverview {
  return async (text, shared) => {
    try {
      await api(`/api/spaces/${spaceId}/overview`, { text, shared });
      await reload(`/api/spaces/${spaceId}/overview`);
    } catch (error) {
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
    }
  };
}

/** Starting a page in a space. */
function newPage(spaceId: string): NewPage {
  return async (input) => {
    try {
      return await api<{ id: string }>(`/api/spaces/${spaceId}/pages`, input);
    } catch (error) {
      return { problem: error instanceof Error ? error.message : 'Something went wrong. Try again.' };
    }
  };
}

/** Writing on a page directly, then showing it as it is now, with the pages it gathers. */
function pageActions(page: PageData, gatheredPath: string): PageActions {
  const run = async (action: () => Promise<unknown>) => {
    const fresh = () => Promise.all([reload(`/api/pages/${page.id}`), gatheredPath && reload(gatheredPath)]);
    try {
      await action();
      await fresh();
    } catch (error) {
      // Gone, refused or changed meanwhile: show the page as it is now, with the reason.
      if (error instanceof ApiError && [403, 404, 409].includes(error.status)) await fresh();
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
    }
  };
  return {
    add: (text, shared) => run(() => api(`/api/pages/${page.id}/items`, { text, shared })),
    correct: (itemId, text, shared) => run(() => api(`/api/items/${itemId}`, { text, shared })),
    gather: (pageId, shared) => run(() => api(`/api/pages/${page.id}/gather`, { pageId, shared })),
    ungather: (pageId, shared) => run(() => api(`/api/pages/${page.id}/gather/remove`, { pageId, shared })),
    join: (collectionId, shared) => run(() => api(`/api/pages/${collectionId}/gather`, { pageId: page.id, shared })),
    leave: (collectionId, shared) => run(() => api(`/api/pages/${collectionId}/gather/remove`, { pageId: page.id, shared })),
    find: async (query, collections) => {
      const search = new URLSearchParams({ sort: query ? 'match' : 'name', ...(query && { q: query }), ...(collections && { collections: '1' }) });
      try {
        return (await api<PagesData>(`/api/spaces/${page.space.id}/pages?${search}`)).pages;
      } catch {
        return [];
      }
    },
    publication: async (itemId) => {
      try {
        return await api<PublicationData>(`/api/items/${itemId}/publication`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    // Shared directly, as the person: what they were shown, and the page as it is now.
    publish: (itemId, shown) => run(() => api(`/api/items/${itemId}/publish`, { shown })),
  };
}

/** Changing rules directly, then showing them as they are now. */
function ruleActions(spaceId: string): RuleActions {
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await reload(`/api/spaces/${spaceId}/rules`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) await reload(`/api/spaces/${spaceId}/rules`);
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
    }
  };
  return {
    add: (input) => run(() => api(`/api/spaces/${spaceId}/rules`, input)),
    edit: (id, text) => run(() => api(`/api/rules/${id}`, { text })),
    remove: (id) => run(() => api(`/api/rules/${id}/remove`, {})),
  };
}

function AdminPage() {
  const { data, error } = useLoad<AdminData>('/api/admin');
  if (error?.status === 403) return <ScreenHeader title="Looking after Homing" meta="Only whoever looks after Homing sees this page." />;
  if (failed(error)) return <LoadFailed paths={['/api/admin']} />;
  if (!data) return null;
  return (
    <Admin
      data={data}
      invite={async (email) => {
        try {
          return await api<InviteMade>('/api/invites', { email });
        } catch (error) {
          return { problem: error instanceof Error ? error.message : 'Something went wrong. Try again.' };
        }
      }}
    />
  );
}

function SkillPage({ id }: { id: string }) {
  const { data, error } = useLoad<SkillData>(`/api/skills/${id}`);
  return (
    <Titled title={data?.name ?? 'Skill'}>
      {error?.status === 404 && <ScreenHeader title="There’s no skill here" meta="It may have been removed, or it doesn’t reach you." />}
      {failed(error) && <LoadFailed paths={[`/api/skills/${id}`]} />}
      {data && !error && <Skill skill={data} />}
    </Titled>
  );
}

/** Names the browser tab after the screen. */
function Titled({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title === 'Home' ? 'Homing' : `${title} | Homing`;
  }, [title]);
  return <>{children}</>;
}
