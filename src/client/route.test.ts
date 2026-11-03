import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkProps, parse } from './route.ts';

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

describe('linkProps', () => {
  afterEach(() => vi.unstubAllGlobals());

  const click = (mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }>) => {
    const pushed: string[] = [];
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('history', { pushState: (_: unknown, __: string, url: string) => pushed.push(url) });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { scrollTo: () => {} }));
    vi.stubGlobal('PopStateEvent', class extends Event {});
    let prevented = false;
    linkProps('/demo').onClick({ preventDefault: () => (prevented = true), metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });
    return { prevented, pushed };
  };

  it('navigates in the app on a plain click', () => {
    expect(click({})).toEqual({ prevented: true, pushed: ['/demo'] });
  });

  it('leaves a modified or non-primary click to the browser (new tab, new window, download)', () => {
    for (const mods of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(click(mods)).toEqual({ prevented: false, pushed: [] });
    }
  });
});
