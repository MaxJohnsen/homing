import { useEffect, type ReactNode } from 'react';
import { Shell } from '@/components/app-shell';
import { ScreenHeader } from '@/components/screen';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/load';
import type { WaitingData } from '@/lib/proposals';
import { routeOf, useAddress, type Route } from '@/lib/router';
import type { SpaceData, SpaceSummary } from '@/lib/spaces';
import { AccountPage } from '@/pages/account';
import { ProposalPage } from '@/pages/proposal';
import type { AccountData } from '@/screens/account';
import { Home } from '@/screens/home';
import { Space } from '@/screens/space';
import { Waiting } from '@/screens/waiting';

/** The signed-in app: the shelf with your spaces, and the screen you're on beside it. */
export function AppPage() {
  const address = useAddress();
  const route = routeOf(location.pathname) ?? { name: 'home' };
  const me = useLoad<AccountData>('/api/me').data;
  const spaces = useLoad<{ spaces: SpaceSummary[] }>('/api/spaces').data?.spaces;
  const waiting = useLoad<{ waiting: WaitingData[] }>('/api/waiting').data?.waiting;

  const spaceId = route.name === 'space' ? route.id : undefined;

  if (!me || !spaces) return null;
  return (
    <Shell
      person={me}
      spaces={spaces}
      waiting={waiting?.length ?? 0}
      route={route}
      spaceId={spaceId}
      onSignOut={async () => {
        await api('/api/auth/sign-out', {});
        location.assign('/sign-in');
      }}
    >
      <Screen key={address} route={route} me={me} waiting={waiting} />
    </Shell>
  );
}

function Screen({ route, me, waiting }: { route: Route; me: AccountData; waiting?: WaitingData[] }) {
  switch (route.name) {
    case 'home':
      return <Titled title="Home">{waiting && <Home data={{ name: me.name, waiting, assistants: me.assistants.length, mcpUrl: me.mcpUrl }} />}</Titled>;
    case 'waiting':
      return <Titled title="Waiting for you">{waiting && <Waiting waiting={waiting} />}</Titled>;
    case 'account':
      return <Titled title="Your account"><AccountPage /></Titled>;
    case 'proposal':
      return <Titled title="A decision"><ProposalPage id={route.id} /></Titled>;
    case 'space':
      return <SpacePage id={route.id} />;
  }
}

function SpacePage({ id }: { id: string }) {
  const { data, error } = useLoad<SpaceData>(`/api/spaces/${id}`);
  return (
    <Titled title={data?.name ?? 'Space'}>
      {error?.status === 404 && <ScreenHeader title="There’s no space here" meta="It may have been removed, or you can’t open it." />}
      {data && <Space space={data} />}
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
