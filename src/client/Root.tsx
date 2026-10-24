import { Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import type { MeResponse } from '../protocol.ts';
import { api } from './net/api.ts';
import { HomePage } from './pages/Home.tsx';
import { LostPage } from './pages/Notice.tsx';
import { RoomPage } from './pages/Room.tsx';
import { parseRoute } from './route.ts';

// The front page and the live room ship in the first bundle; every other page loads on its first
// visit, so a viewer opening a room does not download the digest, the replay and the Hall too.
const DemoPage = page(() => import('./pages/Demo.tsx').then((m) => m.DemoPage));
const DigestPage = page(() => import('./pages/Digest.tsx').then((m) => m.DigestPage));
const HistoryPage = page(() => import('./pages/History.tsx').then((m) => m.HistoryPage));
const ProfilePage = page(() => import('./pages/Profile.tsx').then((m) => m.ProfilePage));
const ReplayPage = page(() => import('./pages/Replay.tsx').then((m) => m.ReplayPage));
const ArmoryPage = page(() => import('./meta/ArmoryPage.tsx').then((m) => m.ArmoryPage));
const HallPage = page(() => import('./meta/HallPage.tsx').then((m) => m.HallPage));
const PreviewPage = page(() => import('./pages/Preview.tsx').then((m) => m.PreviewPage));
const SeasonPage = page(() => import('./meta/SeasonPage.tsx').then((m) => m.SeasonPage));

/**
 * A lazily loaded page. A page from an older build (a cached shell after a deploy) may ask for a
 * chunk the server no longer has: reload once for the current build rather than show nothing.
 */
function page<P extends object>(load: () => Promise<ComponentType<P>>) {
  return lazy(() =>
    load().then(
      (c) => ({ default: c }),
      (err: unknown) => {
        const key = 'pf:chunk-reload';
        let reloaded = false;
        try {
          reloaded = sessionStorage.getItem(key) === location.pathname;
          sessionStorage.setItem(key, location.pathname);
        } catch {
          /* storage blocked: reload at most this once anyway */
        }
        if (!reloaded) location.reload();
        throw err;
      },
    ),
  );
}

/** While a page's code arrives: the page's paper, without a flash of anything else. */
function Paged({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{children}</Suspense>;
}

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
    const titles: Record<string, string> = { home: 'Pushfront', demo: 'Demo war · Pushfront', lost: 'Lost · Pushfront', armory: 'Armory · Pushfront', hall: 'Hall of Legends · Pushfront', season: 'Season · Pushfront', preview: 'Army preview · Pushfront' };
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
      return <Paged><DemoPage me={me} /></Paged>;
    case 'room':
      return <RoomPage key={route.slug} slug={route.slug} invite={route.invite} me={me} onMeChanged={loadMe} />;
    case 'digest':
      return <Paged><DigestPage key={`${route.slug}:${route.warId}`} slug={route.slug} warId={route.warId} invite={route.invite ?? null} /></Paged>;
    case 'replay':
      return <Paged><ReplayPage key={`${route.slug}:${route.warId}`} slug={route.slug} warId={route.warId} tick={route.tick} invite={route.invite ?? null} me={me} /></Paged>;
    case 'history':
      return <Paged><HistoryPage key={route.slug} slug={route.slug} invite={route.invite ?? null} /></Paged>;
    case 'profile':
      return <Paged><ProfilePage key={route.login} login={route.login} /></Paged>;
    case 'armory':
      return <Paged><ArmoryPage me={me} /></Paged>;
    case 'hall':
      return <Paged><HallPage key={route.slug} slug={route.slug} invite={route.invite ?? null} /></Paged>;
    case 'season':
      return <Paged><SeasonPage key={route.slug} slug={route.slug} invite={route.invite ?? null} /></Paged>;
    case 'preview':
      return <Paged><PreviewPage owner={route.owner} repo={route.repo} branch={route.branch} me={me} /></Paged>;
    case 'lost':
      return <LostPage path={route.path} />;
  }
}
