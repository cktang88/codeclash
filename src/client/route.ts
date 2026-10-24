export type Route =
  | { kind: 'home' }
  | { kind: 'demo' }
  | { kind: 'room'; slug: string; invite: string | null }
  | { kind: 'digest'; slug: string; warId: number; invite?: string | null }
  | { kind: 'replay'; slug: string; warId: number; tick: number | null; invite?: string | null }
  | { kind: 'history'; slug: string; invite?: string | null }
  | { kind: 'profile'; login: string }
  | { kind: 'armory' }
  | { kind: 'hall'; slug: string; invite?: string | null }
  | { kind: 'season'; slug: string; invite?: string | null }
  | { kind: 'preview'; owner: string | null; repo: string | null; branch: string | null }
  | { kind: 'lost'; path: string };

const SLUG = '([a-z0-9-]{3,48})';

/**
 * A private room's invite code rides along on every page of that room (history, digest, replay,
 * season, hall) as `?invite=`, so a guest who arrived by invite link is not refused one click later.
 */
function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function parseRoute(pathname: string, search = ''): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(search);
  const invite = q.get('invite') || null;
  let m: RegExpExecArray | null;
  if (path === '/') return { kind: 'home' };
  if (path === '/demo') return { kind: 'demo' };
  if (path === '/armory') return { kind: 'armory' };
  if (path === '/preview') return { kind: 'preview', owner: null, repo: null, branch: null };
  m = /^\/preview\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(path);
  if (m) return { kind: 'preview', owner: m[1]!, repo: m[2]!, branch: q.get('branch') || null };
  m = new RegExp(`^/r/${SLUG}$`).exec(path);
  if (m) return { kind: 'room', slug: m[1]!, invite };
  m = new RegExp(`^/r/${SLUG}/history$`).exec(path);
  if (m) return { kind: 'history', slug: m[1]!, invite };
  m = new RegExp(`^/r/${SLUG}/hall$`).exec(path);
  if (m) return { kind: 'hall', slug: m[1]!, invite };
  m = new RegExp(`^/r/${SLUG}/season$`).exec(path);
  if (m) return { kind: 'season', slug: m[1]!, invite };
  m = new RegExp(`^/r/${SLUG}/day/(\\d+)$`).exec(path);
  if (m) return { kind: 'digest', slug: m[1]!, warId: Number(m[2]), invite };
  m = new RegExp(`^/r/${SLUG}/replay/(\\d+)$`).exec(path);
  if (m) {
    const t = q.get('t');
    return { kind: 'replay', slug: m[1]!, warId: Number(m[2]), tick: t !== null && /^\d+$/.test(t) ? Number(t) : null, invite };
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
      return `/r/${route.slug}${query({ invite: route.invite })}`;
    case 'history':
      return `/r/${route.slug}/history${query({ invite: route.invite })}`;
    case 'digest':
      return `/r/${route.slug}/day/${route.warId}${query({ invite: route.invite })}`;
    case 'replay':
      return `/r/${route.slug}/replay/${route.warId}${query({ t: route.tick, invite: route.invite })}`;
    case 'profile':
      return `/u/${route.login}`;
    case 'armory':
      return '/armory';
    case 'hall':
      return `/r/${route.slug}/hall${query({ invite: route.invite })}`;
    case 'season':
      return `/r/${route.slug}/season${query({ invite: route.invite })}`;
    case 'preview':
      return route.owner && route.repo ? `/preview/${route.owner}/${route.repo}${query({ branch: route.branch })}` : '/preview';
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
