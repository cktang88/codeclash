import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home' }
  | { page: 'league'; slug: string; tab: string | null; member: number | null }
  | { page: 'battle'; id: number }
  | { page: 'demo' }
  | { page: 'notfound' };

export function parse(path: string): Route {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'home' };
  if (parts[0] === 'demo') return { page: 'demo' };
  if (parts[0] === 'l' && parts[1]) {
    const tab = parts[2] ?? null;
    // A lord's id: a whole number (sparring bots' are negative); anything else shows the viewer's own city.
    const member = tab === 'city' && parts[3] && /^-?\d+$/.test(parts[3]) ? Number(parts[3]) : null;
    return { page: 'league', slug: parts[1], tab, member };
  }
  if (parts[0] === 'b' && parts[1] && /^\d+$/.test(parts[1])) return { page: 'battle', id: Number(parts[1]) };
  return { page: 'notfound' };
}

export function go(path: string): void {
  const keep = new URLSearchParams(location.search).get('invite');
  const url = keep && !path.includes('?') ? `${path}?invite=${encodeURIComponent(keep)}` : path;
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname));
  useEffect(() => {
    const on = () => setRoute(parse(location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return route;
}

/** A click the browser should handle itself: a new tab or window (ctrl, ⌘, shift, middle button) or a download (alt). */
export const browserClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button?: number }): boolean =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button ?? 0) !== 0;

/** An in-app link. */
export function linkProps(path: string) {
  return {
    href: path,
    onClick: (e: { preventDefault(): void; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button?: number }) => {
      if (browserClick(e)) return;
      e.preventDefault();
      go(path);
    },
  };
}
