import { describe, expect, it } from 'vitest';
import { parse } from './route.ts';

describe('parse', () => {
  it('reads every page', () => {
    expect(parse('/')).toEqual({ page: 'home' });
    expect(parse('/demo')).toEqual({ page: 'demo' });
    expect(parse('/b/12')).toEqual({ page: 'battle', id: 12 });
    expect(parse('/b/x')).toEqual({ page: 'notfound' });
    expect(parse('/l/watch')).toEqual({ page: 'league', slug: 'watch', tab: null, member: null });
    expect(parse('/l/watch/battles')).toEqual({ page: 'league', slug: 'watch', tab: 'battles', member: null });
    // Sparring bots have negative ids.
    expect(parse('/l/watch/city/-3')).toEqual({ page: 'league', slug: 'watch', tab: 'city', member: -3 });
    expect(parse('/l/watch/city/abc')).toEqual({ page: 'league', slug: 'watch', tab: 'city', member: null });
    expect(parse('/nowhere')).toEqual({ page: 'notfound' });
  });

  it('takes only a whole number for a lord', () => {
    expect(parse('/l/watch/city/1.5')).toMatchObject({ member: null });
    expect(parse('/l/watch/city/1e3')).toMatchObject({ member: null });
  });
});
