import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { MeResponse } from '../protocol.ts';
import { ArmoryPage, HallPage, SeasonPage } from './meta/index.ts';
import { api } from './net/api.ts';
import { DemoPage } from './pages/Demo.tsx';
import { DigestPage } from './pages/Digest.tsx';
import { HistoryPage } from './pages/History.tsx';
import { HomePage } from './pages/Home.tsx';
import { LostPage } from './pages/Notice.tsx';
import { ProfilePage } from './pages/Profile.tsx';
import { ReplayPage } from './pages/Replay.tsx';
import { RoomPage } from './pages/Room.tsx';
import { parseRoute } from './route.ts';

const subscribeLocation = (fn: () => void) => {
  window.addEventListener('popstate', fn);
  return () => window.removeEventListener('popstate', fn);
};
const currentLocation = () => location.pathname + location.search;

export function Root() {
  const href = useSyncExternalStore(subscribeLocation, currentLocation);
  const route = parseRoute(location.pathname, location.search);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState(false);

  const loadMe = useCallback(() => {
    api.me().then(
      (m) => {
        setMe(m);
        setMeError(false);
      },
      () => setMeError(true),
    );
  }, []);
  useEffect(loadMe, [loadMe]);

  useEffect(() => {
    const titles: Record<string, string> = { home: 'Pushfront', demo: 'Demo war · Pushfront', lost: 'Lost · Pushfront', armory: 'Armory · Pushfront', hall: 'Hall of Legends · Pushfront', season: 'Season · Pushfront' };
    // Every route sets a title, so one page's never lingers on the next; pages refine theirs once data arrives.
    const named: Partial<Record<string, string>> = {
      room: route.kind === 'room' ? route.slug : undefined,
      digest: 'Daily digest',
      replay: 'Replay',
      history: 'Past wars',
      profile: route.kind === 'profile' ? `@${route.login}` : undefined,
    };
    document.title = titles[route.kind] ?? (named[route.kind] ? `${named[route.kind]} · Pushfront` : 'Pushfront');
    window.scrollTo(0, 0);
  }, [href, route.kind]);

  switch (route.kind) {
    case 'home':
      return <HomePage me={me} meError={meError} onMeChanged={loadMe} />;
    case 'demo':
      return <DemoPage me={me} />;
    case 'room':
      return <RoomPage key={route.slug} slug={route.slug} invite={route.invite} me={me} onMeChanged={loadMe} />;
    case 'digest':
      return <DigestPage key={`${route.slug}:${route.warId}`} slug={route.slug} warId={route.warId} invite={route.invite ?? null} />;
    case 'replay':
      return <ReplayPage key={`${route.slug}:${route.warId}`} slug={route.slug} warId={route.warId} tick={route.tick} invite={route.invite ?? null} me={me} />;
    case 'history':
      return <HistoryPage key={route.slug} slug={route.slug} invite={route.invite ?? null} />;
    case 'profile':
      return <ProfilePage key={route.login} login={route.login} />;
    case 'armory':
      return <ArmoryPage me={me} />;
    case 'hall':
      return <HallPage key={route.slug} slug={route.slug} invite={route.invite ?? null} />;
    case 'season':
      return <SeasonPage key={route.slug} slug={route.slug} invite={route.invite ?? null} />;
    case 'lost':
      return <LostPage path={route.path} />;
  }
}
