import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { ScreenHeader } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import type { RuleActions, RuleData, SkillData, SkillSummary } from '@/lib/guidance';
import type { NewPage, PageActions, PageData, PageOrder, PagesData, SourceData, SourcesData } from '@/lib/knowledge';
import { reload, useLoad } from '@/lib/load';
import type { RequestData, WaitingData } from '@/lib/proposals';
import { useRecent } from '@/lib/recent';
import { navigate, routeOf, useAddress, type Route, type SpaceView } from '@/lib/router';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import { AccountPage } from '@/pages/account';
import { ProposalPage } from '@/pages/proposal';
import type { AccountData } from '@/screens/account';
import { Admin, type AdminData, type InviteMade } from '@/screens/admin';
import { Home } from '@/screens/home';
import { Rules, Skills } from '@/screens/guidance';
import { Page } from '@/screens/page';
import { Pages, type PageFilters } from '@/screens/pages';
import { Source, Sources } from '@/screens/sources';
import { Skill } from '@/screens/skill';
import { Members, Space } from '@/screens/space';
import { Waiting } from '@/screens/waiting';

/** The signed-in app: the shelf with your spaces, and the screen you're on beside it. */
export function AppPage() {
  const address = useAddress();
  const route = routeOf(location.pathname) ?? { name: 'home' };
  const me = useLoad<AccountData>('/api/me').data;
  const spaces = useLoad<{ spaces: SpaceSummary[] }>('/api/spaces').data?.spaces;
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

  if (!me || !spaces) return null;
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
      <Screen key={address.split('?')[0]} route={route} me={me} waiting={waiting} recent={recent.map((id) => spaces.find((space) => space.id === id)).filter((space) => space !== undefined)} />
    </Shell>
  );
}

function Screen({ route, me, waiting, recent }: { route: Route; me: AccountData; waiting?: WaitingData[]; recent: SpaceSummary[] }) {
  switch (route.name) {
    case 'home':
      return <Titled title="Home"><HomePage me={me} waiting={waiting} recent={recent} /></Titled>;
    case 'waiting':
      return <Titled title="Waiting for you">{waiting && <Waiting waiting={waiting} />}</Titled>;
    case 'account':
      return <Titled title="Your account"><AccountPage /></Titled>;
    case 'admin':
      return <Titled title="Looking after Homing"><AdminPage /></Titled>;
    case 'proposal':
      return <Titled title="A decision"><ProposalPage id={route.id} /></Titled>;
    case 'space':
      return <SpacePage id={route.id} view={route.view ?? 'pages'} />;
    case 'page':
      return <PagePage id={route.id} />;
    case 'source':
      return <SourcePage id={route.id} />;
    case 'skill':
      return <SkillPage id={route.id} />;
  }
}

function HomePage({ me, waiting, recent }: { me: AccountData; waiting?: WaitingData[]; recent: SpaceSummary[] }) {
  const requests = useLoad<{ requests: RequestData[] }>('/api/requests').data?.requests;
  if (!waiting || !requests) return null;
  return <Home data={{ name: me.name, waiting, assistants: me.assistants.length, mcpUrl: me.mcpUrl, requests }} recent={recent} />;
}

function SpacePage({ id, view }: { id: string; view: SpaceView }) {
  const { data: space, error } = useLoad<SpaceData>(`/api/spaces/${id}`);
  const rules = useLoad<{ rules: RuleData[] }>(view === 'rules' ? `/api/spaces/${id}/rules` : '').data?.rules;
  const skills = useLoad<{ skills: SkillSummary[] }>(view === 'skills' ? `/api/spaces/${id}/skills` : '').data?.skills;
  const pages = useList<PagesData>(view === 'pages' ? `/api/spaces/${id}/pages` : undefined);
  const sources = useList<SourcesData>(view === 'sources' ? `/api/spaces/${id}/sources` : undefined);
  return (
    <Titled title={space?.name ?? 'Space'}>
      {error?.status === 404 && <ScreenHeader title="There’s no space here" meta="It may have been removed, or you can’t open it." />}
      {space && (
        <Space space={space} view={space.private && view === 'members' ? 'rules' : view}>
          {view === 'pages' && <Pages space={space} data={pages.data} filters={pages.filters} onFilters={pages.change} create={newPage(id)} />}
          {view === 'sources' && <Sources space={space} data={sources.data} filters={sources.filters} onFilters={sources.change} />}
          {(view === 'rules' || (space.private && view === 'members')) && rules && <Rules space={space} rules={rules} actions={ruleActions(id)} />}
          {view === 'skills' && skills && <Skills space={space} skills={skills} />}
          {view === 'members' && !space.private && <Members space={space} />}
        </Space>
      )}
    </Titled>
  );
}

/**
 * A long list, such as a space's pages, as the search, type, order and place in the address ask,
 * so the back button returns to the same list. While a new answer is on its way, the last one stays.
 */
function useList<T>(path: string | undefined) {
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
  const api = new URLSearchParams(query);
  api.delete('from');
  if (filters.from) api.set('offset', String(filters.from));
  const { data } = useLoad<T>(path ? `${path}${api.size ? `?${api}` : ''}` : '');
  const last = useRef<T>(undefined);
  if (data) last.current = data;
  const change = useCallback((next: PageFilters) => {
    const address = new URLSearchParams();
    if (next.q.trim()) address.set('q', next.q.trim());
    if (next.type) address.set('type', next.type);
    if (next.sort) address.set('sort', next.sort);
    if (next.from) address.set('from', String(next.from));
    // Typing a search replaces the address instead of adding to the history.
    navigate(`${location.pathname}${address.size ? `?${address}` : ''}`, { replace: next.q !== new URLSearchParams(location.search).get('q') && next.q !== '' });
  }, []);
  return { data: data ?? last.current, filters, change };
}

function SourcePage({ id }: { id: string }) {
  const { data, error } = useLoad<SourceData>(`/api/sources/${id}`);
  return (
    <Titled title={data?.reference ?? 'Source'}>
      {error?.status === 404 && <ScreenHeader title="There’s no source here" meta="It may have been removed, or you can’t open it." />}
      {data && <Source source={data} />}
    </Titled>
  );
}

function PagePage({ id }: { id: string }) {
  const { data, error } = useLoad<PageData>(`/api/pages/${id}`);
  return (
    <Titled title={data?.title ?? 'Page'}>
      {error?.status === 404 && <ScreenHeader title="There’s no page here" meta="It may have been removed, or you can’t open it." />}
      {data && <Page page={data} actions={pageActions(data)} />}
    </Titled>
  );
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

/** Writing on a page directly, then showing it as it is now, and the space's list with it. */
function pageActions(page: PageData): PageActions {
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await reload(`/api/pages/${page.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) await reload(`/api/pages/${page.id}`);
      return error instanceof Error ? error.message : 'Something went wrong. Try again.';
    }
  };
  return {
    add: (text, shared) => run(() => api(`/api/pages/${page.id}/items`, { text, shared })),
    correct: (itemId, text, shared) => run(() => api(`/api/items/${itemId}`, { text, shared })),
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
      {data && <Skill skill={data} />}
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
