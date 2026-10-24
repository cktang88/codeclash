import type { Platoon, World, WorldSnapshot } from './api.ts';
import { sharedMap } from './mapgen.ts';

/** The world without its map; the map is rebuilt from params on restore. */
export function snapshot(world: World): WorldSnapshot {
  const { map: _map, ...rest } = world;
  return { version: 2, world: JSON.parse(JSON.stringify(rest)) as unknown };
}

export function restore(snap: WorldSnapshot): World {
  if (snap.version !== 2) throw new Error(`unsupported snapshot version ${String(snap.version)}`);
  const w = JSON.parse(JSON.stringify(snap.world)) as Omit<World, 'map'>;
  for (const pl of w.platoons) drawnUpFresh(pl);
  return { ...w, map: sharedMap(w.params) };
}

/**
 * Snapshots taken before platoons had formations and routes: such a platoon
 * starts in column and is drawn up afresh on its next tick. Platoons that have
 * them are left exactly as they are.
 */
function drawnUpFresh(pl: Platoon): void {
  const p = pl as Partial<Platoon> & Platoon;
  if (Array.isArray(p.route) && Array.isArray(p.trail) && typeof p.form === 'number') return;
  p.form = 0;
  p.formAt = 0;
  p.threat = 0;
  p.threatAt = -1;
  p.formed = -1;
  p.frontage = 0;
  p.width = 0;
  p.length = 0;
  p.offset = 0;
  p.lag = 0;
  p.route = [];
  p.routeSite = -1;
  p.stuck = 0;
  p.trail = [];
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

export function checksum(world: World): number {
  let h = 0x811c9dc5 | 0;
  const int = (v: number) => {
    let k = Math.imul(v | 0, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    h ^= Math.imul(k, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  };
  const num = (v: number) => {
    // -0 survives in memory but becomes 0 through JSON; hash both alike so a restored world matches.
    f64[0] = v === 0 ? 0 : v;
    int(u32[0]!);
    int(u32[1]!);
  };
  num(world.tick);
  int(world.rng);
  num(world.nextId);
  int(world.leader);
  int(world.monolithFallen ? 1 : 0);
  int(world.units.length);
  for (const u of world.units) {
    num(u.id);
    int(u.p);
    num(u.platoon);
    int(u.kind);
    num(u.x);
    num(u.y);
    num(u.hp);
    num(u.maxHp);
    num(u.target);
    num(u.cooldown);
    num(u.swingAt);
    num(u.leavesAt);
    num(u.run);
    num(u.fx);
    num(u.fy);
    num(u.scorched);
  }
  int(world.platoons.length);
  for (const pl of world.platoons) {
    num(pl.id);
    int(pl.state);
    num(pl.x);
    num(pl.y);
    num(pl.hx);
    num(pl.hy);
    int(pl.site);
    num(pl.morale);
    num(pl.alive);
    num(pl.size);
    num(pl.kills);
    num(pl.calm);
    for (const n of pl.mustered) num(n);
    // Formation and route: a divergence here shows in the ranks a few ticks later.
    int(pl.form);
    num(pl.formAt);
    num(pl.threat);
    num(pl.threatAt);
    num(pl.formed);
    num(pl.frontage);
    num(pl.width);
    num(pl.length);
    num(pl.offset);
    num(pl.lag);
    num(pl.routeSite);
    num(pl.stuck);
    int(pl.route.length);
    for (const h of pl.route) num(h);
    int(pl.trail.length);
    for (const n of pl.trail) num(n);
  }
  for (const st of world.structures) {
    num(st.hp);
    num(st.maxHp);
    num(st.cooldown);
    num(st.ruinedUntil);
    int(st.sacked);
  }
  int(world.shots.length);
  for (const sh of world.shots) {
    num(sh.target);
    num(sh.landAt);
    num(sh.damage);
    int(sh.kind);
    num(sh.splash);
    num(sh.tx);
    num(sh.ty);
  }
  for (const p of world.players) {
    num(p.renown);
    num(p.kills);
    num(p.losses);
    int(p.doctrine);
    int(p.rallySite);
    num(p.rallyUntil);
    num(p.rallyAt);
    num(p.doctrineAt);
    num(p.cryUntil);
    int(p.cryUsed ? 1 : 0);
    num(p.pushes);
    num(p.quality);
    num(p.veterancy);
    // The books: a divergence here shows in the army only at the next push.
    for (const n of p.ledger.lines) num(n);
    num(p.ledger.files);
    num(p.ledger.branches);
    for (const n of p.ledger.purposeCode) num(n);
    for (const n of p.ledger.purposeRemoved) num(n);
    for (const n of p.raised) num(n);
    const f = p.feats;
    num(f.holdBest);
    num(f.routsCaused);
    num(f.cryKills);
    num(f.returns);
    num(f.heartCaptures);
    num(f.leaderTakes);
    num(f.homeKills);
    num(f.ledTicks);
    num(p.monolithDamage);
    num(p.structureDamage);
    int(p.queue.length);
  }
  for (const s of world.sites) {
    int(s.owner);
    int(s.capturer);
    num(s.heldSince);
    num(s.progress);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
