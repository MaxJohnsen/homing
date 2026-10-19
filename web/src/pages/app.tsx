import { useEffect, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { ScreenHeader } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import type { RuleActions, RuleData, SkillData, SkillSummary } from '@/lib/guidance';
import { reload, useLoad } from '@/lib/load';
import type { WaitingData } from '@/lib/proposals';
import { useRecent } from '@/lib/recent';
import { routeOf, useAddress, type Route, type SpaceView } from '@/lib/router';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import { AccountPage } from '@/pages/account';
import { ProposalPage } from '@/pages/proposal';
import type { AccountData } from '@/screens/account';
import { Admin, type AdminData, type InviteMade } from '@/screens/admin';
import { Home } from '@/screens/home';
import { Rules, Skills } from '@/screens/guidance';
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
  const spaceId = route.name === 'space' ? route.id : route.name === 'skill' ? (skill?.spaceId ?? undefined) : undefined;
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
      <Screen key={address} route={route} me={me} waiting={waiting} recent={recent.map((id) => spaces.find((space) => space.id === id)).filter((space) => space !== undefined)} />
    </Shell>
  );
}

function Screen({ route, me, waiting, recent }: { route: Route; me: AccountData; waiting?: WaitingData[]; recent: SpaceSummary[] }) {
  switch (route.name) {
    case 'home':
      return <Titled title="Home">{waiting && <Home data={{ name: me.name, waiting, assistants: me.assistants.length, mcpUrl: me.mcpUrl }} recent={recent} />}</Titled>;
    case 'waiting':
      return <Titled title="Waiting for you">{waiting && <Waiting waiting={waiting} />}</Titled>;
    case 'account':
      return <Titled title="Your account"><AccountPage /></Titled>;
    case 'admin':
      return <Titled title="Looking after Homing"><AdminPage /></Titled>;
    case 'proposal':
      return <Titled title="A decision"><ProposalPage id={route.id} /></Titled>;
    case 'space':
      return <SpacePage id={route.id} view={route.view ?? 'rules'} />;
    case 'skill':
      return <SkillPage id={route.id} />;
  }
}

function SpacePage({ id, view }: { id: string; view: SpaceView }) {
  const { data: space, error } = useLoad<SpaceData>(`/api/spaces/${id}`);
  const rules = useLoad<{ rules: RuleData[] }>(view === 'rules' ? `/api/spaces/${id}/rules` : '').data?.rules;
  const skills = useLoad<{ skills: SkillSummary[] }>(view === 'skills' ? `/api/spaces/${id}/skills` : '').data?.skills;
  return (
    <Titled title={space?.name ?? 'Space'}>
      {error?.status === 404 && <ScreenHeader title="There’s no space here" meta="It may have been removed, or you can’t open it." />}
      {space && (
        <Space space={space} view={space.private && view === 'members' ? 'rules' : view}>
          {(view === 'rules' || (space.private && view === 'members')) && rules && <Rules space={space} rules={rules} actions={ruleActions(id)} />}
          {view === 'skills' && skills && <Skills space={space} skills={skills} />}
          {view === 'members' && !space.private && <Members space={space} />}
        </Space>
      )}
    </Titled>
  );
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
