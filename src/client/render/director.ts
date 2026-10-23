import type { TickEvents, World } from '../../sim/api.ts';

const CELL = 220;
const HALF_LIFE_S = 9;
const DWELL_MS = 6500;
const SWITCH_RATIO = 1.5;
const QUIET = 6;

export interface Shot {
  x: number;
  y: number;
  zoom: number;
}

/** Picks where an unattended camera should look: the hottest fight, held long enough to watch. */
export class Director {
  private heat = new Map<number, { h: number; x: number; y: number; n: number }>();
  private current: { key: number; since: number } | null = null;
  private shot: Shot = { x: 0, y: 0, zoom: 0.5 };

  constructor(private overviewZoom: () => number) {}

  private add(x: number, y: number, h: number): void {
    const key = (Math.floor(x / CELL) + 64) * 128 + (Math.floor(y / CELL) + 64);
    const c = this.heat.get(key);
    if (c) {
      c.h += h;
      c.x += x * h;
      c.y += y * h;
      c.n += h;
    } else this.heat.set(key, { h, x: x * h, y: y * h, n: h });
  }

  observe(ev: TickEvents, world: World): void {
    const pos = new Map<number, { x: number; y: number }>();
    if (ev.swings.length + ev.deaths.length > 0) for (const u of world.units) pos.set(u.id, u);
    for (const d of ev.deaths) this.add(d.x, d.y, 3);
    for (const s of ev.swings) {
      const u = pos.get(s.from);
      if (u) this.add(u.x, u.y, 0.3);
    }
    for (const h of ev.hits) {
      if (h.structure < 0) continue;
      const st = world.structures[h.structure];
      const site = st ? world.map.sites[st.site] : undefined;
      if (site) this.add(site.x, site.y, 0.6);
    }
    for (const s of ev.sacks) {
      const site = world.map.sites[s.site]!;
      this.add(site.x, site.y, 40);
    }
    if (ev.monolith) this.add(0, 0, 60);
    for (const c of ev.captures) {
      const site = world.map.sites[c.site]!;
      this.add(site.x, site.y, 12);
    }
  }

  next(dtMs: number, now: number): Shot {
    const decay = Math.pow(0.5, dtMs / 1000 / HALF_LIFE_S);
    let bestKey = -1;
    let best = 0;
    for (const [key, c] of this.heat) {
      c.h *= decay;
      if (c.h < 0.05) {
        this.heat.delete(key);
        continue;
      }
      if (c.h > best) {
        best = c.h;
        bestKey = key;
      }
    }
    const cur = this.current ? this.heat.get(this.current.key) : undefined;
    const dwelt = this.current ? now - this.current.since : Infinity;
    if (best < QUIET) {
      if (!this.current || dwelt > DWELL_MS || !cur) {
        this.current = null;
        this.shot = { x: 0, y: 0, zoom: this.overviewZoom() };
      }
    } else if (!this.current || !cur || (bestKey !== this.current.key && dwelt > DWELL_MS && best > cur.h * SWITCH_RATIO)) {
      this.current = { key: bestKey, since: now };
    }
    const c = this.current ? this.heat.get(this.current.key) : undefined;
    if (c) this.shot = { x: c.x / c.n, y: c.y / c.n, zoom: Math.max(this.overviewZoom() * 1.6, Math.min(1.5, 0.9 + c.h / 80)) };
    return this.shot;
  }
}
