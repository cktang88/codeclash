import { describe, expect, it } from 'vitest';
import { parseRoute, pathFor, type Route } from '../route.ts';

const roundTrip = (r: Route) => {
  const href = pathFor(r);
  const i = href.indexOf('?');
  return parseRoute(i < 0 ? href : href.slice(0, i), i < 0 ? '' : href.slice(i));
};

describe('meta routes', () => {
  it('round-trips the Armory, the Hall and the Season', () => {
    const routes: Route[] = [{ kind: 'armory' }, { kind: 'hall', slug: 'night-shift', invite: null }, { kind: 'season', slug: 'night-shift', invite: null }];
    for (const r of routes) expect(roundTrip(r)).toEqual(r);
  });

  it("carries a private room's invite code on every page of the room", () => {
    const invite = 'a b/c';
    const routes: Route[] = [
      { kind: 'room', slug: 'night-shift', invite },
      { kind: 'history', slug: 'night-shift', invite },
      { kind: 'hall', slug: 'night-shift', invite },
      { kind: 'season', slug: 'night-shift', invite },
      { kind: 'digest', slug: 'night-shift', warId: 7, invite },
      { kind: 'replay', slug: 'night-shift', warId: 7, tick: 120, invite },
      { kind: 'replay', slug: 'night-shift', warId: 7, tick: null, invite },
    ];
    for (const r of routes) expect(roundTrip(r)).toEqual(r);
    expect(pathFor({ kind: 'history', slug: 'night-shift', invite: 'xyz' })).toBe('/r/night-shift/history?invite=xyz');
    expect(pathFor({ kind: 'history', slug: 'night-shift' })).toBe('/r/night-shift/history');
  });
});

describe('army preview route', () => {
  it('round-trips the empty page, a repository and a branch', () => {
    const routes: Route[] = [
      { kind: 'preview', owner: null, repo: null, branch: null },
      { kind: 'preview', owner: 'vercel', repo: 'next.js', branch: null },
      { kind: 'preview', owner: 'ironquill', repo: 'siegeworks', branch: 'release/1.x' },
    ];
    for (const r of routes) expect(roundTrip(r)).toEqual(r);
    expect(pathFor({ kind: 'preview', owner: 'a', repo: 'b', branch: null })).toBe('/preview/a/b');
    expect(parseRoute('/preview/a')).toEqual({ kind: 'lost', path: '/preview/a' });
  });
});
