import { describe, expect, it } from 'vitest';
import { parseRoute, pathFor, type Route } from '../route.ts';

describe('meta routes', () => {
  it('round-trips the Armory, the Hall and the Season', () => {
    const routes: Route[] = [{ kind: 'armory' }, { kind: 'hall', slug: 'night-shift' }, { kind: 'season', slug: 'night-shift' }];
    for (const r of routes) expect(parseRoute(pathFor(r))).toEqual(r);
  });
});
