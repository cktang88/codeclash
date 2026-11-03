import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_MODES, artMode, cityArt, isHdArt, nextArt, parseArt, setArtMode } from './settings.ts';

describe('art mode setting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses every mode and falls back to classic', () => {
    for (const m of ART_MODES) expect(parseArt(m)).toBe(m);
    expect(parseArt(null)).toBe('classic');
    expect(parseArt('HD')).toBe('classic');
    expect(parseArt('hd128')).toBe('classic');
  });

  it('HD 64 changes battles only: its city is the HD city', () => {
    expect(cityArt('classic')).toBe('classic');
    expect(cityArt('hd')).toBe('hd');
    expect(cityArt('hd64')).toBe('hd');
    expect(isHdArt('hd64')).toBe(true);
    expect(isHdArt('classic')).toBe(false);
  });

  it('cycles classic → HD → HD 64 → classic', () => {
    expect(nextArt('classic')).toBe('hd');
    expect(nextArt('hd')).toBe('hd64');
    expect(nextArt('hd64')).toBe('classic');
  });

  it('keeps the choice and tells the page', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const heard: unknown[] = [];
    win.addEventListener('codeclash:art', (e) => heard.push((e as CustomEvent).detail));
    for (const m of ART_MODES) {
      setArtMode(m);
      expect(artMode()).toBe(m);
    }
    expect(heard).toEqual([...ART_MODES]);
  });

  it('reads classic and still announces the choice when storage is refused', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    let heard = 0;
    win.addEventListener('codeclash:art', () => heard++);
    expect(artMode()).toBe('classic');
    setArtMode('hd64');
    expect(heard).toBe(1);
  });
});
