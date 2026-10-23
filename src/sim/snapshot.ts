import type { World, WorldSnapshot } from './api.ts';
import { generateMap } from './mapgen.ts';

/** The world without its map; the map is rebuilt from params on restore. */
export function snapshot(world: World): WorldSnapshot {
  const { map: _map, ...rest } = world;
  return { version: 2, world: JSON.parse(JSON.stringify(rest)) as unknown };
}

export function restore(snap: WorldSnapshot): World {
  if (snap.version !== 2) throw new Error(`unsupported snapshot version ${String(snap.version)}`);
  const w = JSON.parse(JSON.stringify(snap.world)) as Omit<World, 'map'>;
  return { ...w, map: generateMap(w.params) };
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
    f64[0] = v;
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
  }
  for (const st of world.structures) {
    num(st.hp);
    num(st.cooldown);
    num(st.ruinedUntil);
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
    num(p.cryUntil);
    num(p.monolithDamage);
    num(p.structureDamage);
    int(p.queue.length);
  }
  for (const s of world.sites) {
    int(s.owner);
    int(s.capturer);
    num(s.progress);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
