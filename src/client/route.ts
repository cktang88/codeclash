export type Route =
  | { kind: 'home' }
  | { kind: 'demo' }
  | { kind: 'room'; slug: string; invite: string | null }
  | { kind: 'digest'; slug: string; warId: number }
  | { kind: 'replay'; slug: string; warId: number; tick: number | null }
  | { kind: 'history'; slug: string }
  | { kind: 'profile'; login: string }
  | { kind: 'armory' }
  | { kind: 'hall'; slug: string }
  | { kind: 'season'; slug: string }
  | { kind: 'lost'; path: string };

const SLUG = '([a-z0-9-]{3,48})';

export function parseRoute(pathname: string, search = ''): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(search);
  if (path === '/') return { kind: 'home' };
  if (path === '/demo') return { kind: 'demo' };
  if (path === '/armory') return { kind: 'armory' };
  let m = new RegExp(`^/r/${SLUG}$`).exec(path);
  if (m) return { kind: 'room', slug: m[1]!, invite: q.get('invite') };
  m = new RegExp(`^/r/${SLUG}/history$`).exec(path);
  if (m) return { kind: 'history', slug: m[1]! };
  m = new RegExp(`^/r/${SLUG}/hall$`).exec(path);
  if (m) return { kind: 'hall', slug: m[1]! };
  m = new RegExp(`^/r/${SLUG}/season$`).exec(path);
  if (m) return { kind: 'season', slug: m[1]! };
  m = new RegExp(`^/r/${SLUG}/day/(\\d+)$`).exec(path);
  if (m) return { kind: 'digest', slug: m[1]!, warId: Number(m[2]) };
  m = new RegExp(`^/r/${SLUG}/replay/(\\d+)$`).exec(path);
  if (m) {
    const t = q.get('t');
    return { kind: 'replay', slug: m[1]!, warId: Number(m[2]), tick: t !== null && /^\d+$/.test(t) ? Number(t) : null };
  }
  m = /^\/u\/([A-Za-z0-9-]{1,39})$/.exec(path);
  if (m) return { kind: 'profile', login: m[1]! };
  return { kind: 'lost', path: pathname };
}

export function pathFor(route: Route): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'demo':
      return '/demo';
    case 'room':
      return `/r/${route.slug}${route.invite ? `?invite=${encodeURIComponent(route.invite)}` : ''}`;
    case 'history':
      return `/r/${route.slug}/history`;
    case 'digest':
      return `/r/${route.slug}/day/${route.warId}`;
    case 'replay':
      return `/r/${route.slug}/replay/${route.warId}${route.tick !== null ? `?t=${route.tick}` : ''}`;
    case 'profile':
      return `/u/${route.login}`;
    case 'armory':
      return '/armory';
    case 'hall':
      return `/r/${route.slug}/hall`;
    case 'season':
      return `/r/${route.slug}/season`;
    case 'lost':
      return route.path;
  }
}

export function navigate(route: Route, replace = false): void {
  const href = pathFor(route);
  if (href === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
