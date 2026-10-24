import { describe, expect, it } from 'vitest';
import { Kind } from '../sim/api.ts';
import { Wait, type WaitInfo } from '../sim/stance.ts';
import { BARK_FADE_IN, BARK_GAP, BARK_JITTER, BARK_LINES, BARK_MAX, BARK_MS, BarkRank, BarkScheduler, barkLine, spoken, stateWord, statusLine, type BarkCandidate, type BarkNames } from './barks.ts';

const names: BarkNames = {
  player: (p) => `@bot${p}`,
  site: (k) => (k === 7 ? 'the Ash Fort' : `site ${k}`),
  clock: () => '15:36',
};
const info = (kind: Wait, more: Partial<WaitInfo> = {}): WaitInfo => ({ kind, eta: -1, n: 0, m: 0, site: 7, foe: 1, by: -1, ...more });
// A minute of the war is 300 ticks.
const MIN = 300;

describe('bark lines', () => {
  it('has several variants for every state, and fills every placeholder', () => {
    for (const lines of Object.values(BARK_LINES)) expect(lines.length).toBeGreaterThanOrEqual(3);
    for (let kind = 0; kind <= 11; kind++) {
      for (let nth = 0; nth < 8; nth++) {
        const line = barkLine(40 + nth, 0, info(kind as Wait, { eta: 72 * MIN, n: 12, m: 25 }), nth, 0, names);
        expect(line).not.toMatch(/[{}]/);
        expect(line.length).toBeLessThan(60);
      }
    }
  });

  it('is deterministic per platoon, and varies across platoons and over its barks', () => {
    const w = info(Wait.Sieges, { eta: 180 * MIN });
    expect(barkLine(5, 0, w, 1, 0, names)).toBe(barkLine(5, 0, w, 1, 0, names));
    const lines = new Set<string>();
    for (let id = 0; id < 30; id++) lines.add(barkLine(id, 0, w, 1, 0, names));
    expect(lines.size).toBeGreaterThan(2);
    const over = new Set<string>();
    for (let nth = 0; nth < 12; nth++) over.add(barkLine(5, 0, w, nth, 0, names));
    expect(over.size).toBeGreaterThan(1);
  });

  it('speaks to the case: the clock, the muster count, the engine shooting at it', () => {
    const lines = new Set<string>();
    for (let id = 0; id < 40; id++) lines.add(barkLine(id, 0, info(Wait.Sieges, { eta: 180 * MIN }), 1, 0, names));
    expect([...lines].some((l) => l.startsWith('3 hours till the rams may roll'))).toBe(true);
    const massing = new Set<string>();
    for (let id = 0; id < 40; id++) massing.add(barkLine(id, 0, info(Wait.Massing, { n: 12, m: 25 }), 1, 0, names));
    expect(massing.has('We need more swords — 12 of 25.')).toBe(true);
    const hunt = new Set<string>();
    for (let id = 0; id < 40; id++) hunt.add(barkLine(id, 0, info(Wait.Fighting, { by: Kind.Trebuchet }), 1, 0, names));
    expect(hunt.has('Trebuchet! Ride it down!')).toBe(true);
    const barred = new Set<string>();
    for (let id = 0; id < 40; id++) barred.add(barkLine(id, 0, info(Wait.Barred, { eta: 30 * MIN }), 1, 0, names));
    expect(barred.has('Their gates are barred till 15:36!')).toBe(true);
    // No eta to speak of: no "a while till the rams".
    for (let id = 0; id < 40; id++) expect(barkLine(id, 0, info(Wait.Besieging, { eta: -1 }), 1, 0, names)).not.toContain('Breach in');
  });

  it('names the state in a word and in a full status line', () => {
    expect(stateWord(info(Wait.Massing, { n: 12, m: 25 }), names)).toBe('Massing 12/25');
    expect(stateWord(info(Wait.Sieges, { eta: 72 * MIN }), names)).toBe('Waiting · sieges in 1h 12m');
    expect(stateWord(info(Wait.Besieging), names)).toBe('Besieging @bot1');
    expect(statusLine(info(Wait.Sieges, { eta: 72 * MIN, n: 12, m: 25 }), names)).toBe('Massing at the Ash Fort — 12 of 25 soldiers; sieges open in 1h 12m.');
    expect(spoken(180 * MIN)).toBe('3 hours');
    expect(spoken(40 * MIN)).toBe('40 minutes');
  });
});

describe('when to bark', () => {
  const cands = (n: number, rank: number = BarkRank.OnScreen, kind: Wait = Wait.Sieges): BarkCandidate[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, kind, rank }));
  const open = { far: false, reducedMotion: false };

  it('stays quiet at first sight, then barks staggered, never more than the limit at once', () => {
    const s = new BarkScheduler();
    const list = cands(20);
    expect(s.update(list, 0, open)).toHaveLength(0);
    let most = 0;
    const barked = new Set<number>();
    const firsts: number[] = [];
    for (let t = 0; t <= 200_000; t += 100) {
      const shown = s.update(list, t, open);
      most = Math.max(most, shown.length);
      for (const b of shown) {
        if (!barked.has(b.id)) firsts.push(t);
        barked.add(b.id);
      }
    }
    expect(most).toBeLessThanOrEqual(BARK_MAX);
    expect(barked.size).toBeGreaterThan(10);
    // Not all at once: the first barks spread over tens of seconds.
    expect(Math.max(...firsts.slice(0, 8)) - Math.min(...firsts.slice(0, 8))).toBeGreaterThan(10_000);
  });

  it('a platoon barks again only after 45 to 90 seconds, but at once on a change of state', () => {
    const s = new BarkScheduler();
    const one: BarkCandidate[] = [{ id: 3, kind: Wait.Sieges, rank: BarkRank.Mine }];
    s.update(one, 0, open);
    const times: number[] = [];
    let was = false;
    for (let t = 0; t <= 400_000; t += 100) {
      const on = s.update(one, t, open).length > 0;
      if (on && !was) times.push(t);
      was = on;
    }
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(BARK_GAP);
      expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(BARK_GAP + BARK_JITTER + 200);
    }
    // A change of state is called out straight away.
    const t0 = times[times.length - 1]! + BARK_MS + 1000;
    s.update(one, t0, open);
    const shown = s.update([{ id: 3, kind: Wait.PullBack, rank: BarkRank.Mine }], t0 + 100, open);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.kind).toBe(Wait.PullBack);
  });

  it('puts the selected platoon first, and far out lets only it speak', () => {
    const s = new BarkScheduler();
    const list = cands(8, BarkRank.Mine);
    s.update(list, 0, open);
    // Everyone is due: change all their states at once.
    const changed = list.map((c) => ({ ...c, kind: Wait.Massing }));
    let shown = s.update(changed, 1000, open);
    expect(shown).toHaveLength(BARK_MAX);
    // The selected platoon changes state too: it takes a place.
    const sel = changed.map((c) => (c.id === 8 ? { ...c, rank: BarkRank.Selected, kind: Wait.Holding } : c));
    shown = s.update(sel, 1100, open);
    expect(shown.length).toBeLessThanOrEqual(BARK_MAX);
    expect(shown.some((b) => b.id === 8)).toBe(true);
    // Far out: only the selected platoon's bark remains.
    shown = s.update(sel, 1200, { far: true, reducedMotion: false });
    expect(shown.map((b) => b.id)).toEqual([8]);
  });

  it('fades in and out, except under reduced motion', () => {
    const s = new BarkScheduler();
    const one: BarkCandidate[] = [{ id: 1, kind: Wait.Sieges, rank: BarkRank.Selected }];
    s.update(one, 0, open);
    const changed: BarkCandidate[] = [{ id: 1, kind: Wait.Massing, rank: BarkRank.Selected }];
    expect(s.update(changed, 10, open)[0]!.alpha).toBe(0);
    expect(s.update(changed, 10 + BARK_FADE_IN / 2, open)[0]!.alpha).toBeCloseTo(0.5, 1);
    expect(s.update(changed, 10 + BARK_MS - 100, open)[0]!.alpha).toBeLessThan(0.5);
    const r = new BarkScheduler();
    r.update(one, 0, { far: false, reducedMotion: true });
    expect(r.update(changed, 10, { far: false, reducedMotion: true })[0]!.alpha).toBe(1);
  });

  it('off-screen platoons never bark', () => {
    const s = new BarkScheduler();
    const list = cands(5, 0);
    for (let t = 0; t < 300_000; t += 500) expect(s.update(list, t, open)).toHaveLength(0);
  });
});
