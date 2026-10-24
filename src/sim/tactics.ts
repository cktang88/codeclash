// The tactical layer: how each soldier picks its foe once its platoon is in
// line or engaged. Every role scores the enemies in reach and takes the lowest
// score; ties go to the lower index, so the choice is deterministic.

import { Kind, type Unit, type World } from './api.ts';
import type { Scratch } from './scratch.ts';
import { bucketX, bucketY } from './spatial.ts';
import { STATS, matchup } from './stats.ts';

export const Role = { Melee: 0, Brute: 1, Champion: 2, Ranged: 3, Cavalry: 4, Healer: 5 } as const;
export type Role = (typeof Role)[keyof typeof Role];

const ROLE: Role[] = [];
for (let k = 0; k < STATS.length; k++) {
  const kind = k as Kind;
  ROLE[k] =
    kind === Kind.Troll || kind === Kind.BoneGolem ? Role.Brute
    : kind === Kind.Champion ? Role.Champion
    : kind === Kind.Knight || kind === Kind.Outrider || kind === Kind.GriffinRider ? Role.Cavalry
    : kind === Kind.Cleric || kind === Kind.Herald || kind === Kind.Paladin ? Role.Healer
    : STATS[k]!.ranged ? Role.Ranged
    : Role.Melee;
}

export function roleOf(kind: Kind): Role {
  return ROLE[kind]!;
}

/** How far from its place in the line a soldier of each role may go after a foe. */
export function cohesion(kind: Kind): number {
  switch (ROLE[kind]) {
    case Role.Brute:
      return 64;
    case Role.Champion:
      return 84;
    case Role.Cavalry:
      return 160;
    case Role.Healer:
      return kind === Kind.Paladin ? 40 : 26;
    case Role.Ranged:
      return STATS[kind]!.range + 16;
    default:
      return 52;
  }
}

/** Healers fight only what reaches them: this close, they strike back. */
export function guardRadius(kind: Kind): number {
  return kind === Kind.Paladin ? 44 : 24;
}

/** Melee attackers one soldier draws before others look elsewhere; big soldiers take more. */
export function attackerCap(kind: Kind): number {
  return 2 + Math.floor(STATS[kind]!.size / 4);
}

/** Whether a melee soldier of role-default kind should give up a foe already beset by more than its fill. */
export function overCap(s: Scratch, u: Unit, v: Unit, t: number): boolean {
  const role = ROLE[u.kind];
  if ((role !== Role.Melee && role !== Role.Cavalry) || s.attackers[t]! <= attackerCap(v.kind)) return false;
  const arm = STATS[u.kind]!.range + STATS[v.kind]!.size * 0.5 + ARM;
  const dx = v.x - u.x;
  const dy = v.y - u.y;
  return dx * dx + dy * dy > arm * arm;
}

/** Kinds cavalry rides down first: missile troops, casters and the soft rear. */
function soft(kind: Kind): boolean {
  return STATS[kind]!.ranged || kind === Kind.Cleric || kind === Kind.Herald || kind === Kind.Sapper;
}

const FAVORED = 0.42;
/** Slack beyond striking reach within which a soldier counts as already at a foe's side. */
export const ARM = 4;
/** Cavalry's eye for the soft rear: such a foe counts as this much nearer, squared. */
const SOFT = 0.15;
const BEHIND = 2;
const BRUTE_CENTRE = 60 * 60;

/** Lowest multiplier a role's score can take, so the ring search can stop early. */
const FLOOR: number[] = [FAVORED, FAVORED, FAVORED / 961, 0.0002, FAVORED * SOFT, FAVORED];

export interface Pick {
  /** Search radius around the soldier. */
  radius: number;
  /** The banner and its leash: foes beyond it are left alone. */
  ax: number;
  ay: number;
  leash: number;
  /** The soldier's place and how far from it the foe may stand; Infinity in column. */
  sx: number;
  sy: number;
  reach: number;
  /** The way the line faces, for preferring foes in front; 0, 0 in column. */
  hx: number;
  hy: number;
}

/** The best foe for soldier `i` by its role, as an index into world.units, or -1. */
export function pickTarget(world: World, s: Scratch, i: number, q: Pick): number {
  const { units } = world;
  const hash = s.hash;
  const u = units[i]!;
  const role = ROLE[u.kind]!;
  const st = STATS[u.kind]!;
  const { head, next, cols, ux, uy, up } = hash;
  const ox = u.x;
  const oy = u.y;
  // Only the soldiers of this army's foes on the ring: its neighbours (and the rising at its gates).
  const foes = u.p >= 0 && u.p < s.ring.foes.length ? s.ring.foes[u.p]! : 0;
  const bx = bucketX(hash, ox);
  const by = bucketY(hash, oy);
  const rings = Math.floor(q.radius / hash.cell) + 1;
  const r2 = q.radius * q.radius;
  const leash2 = q.leash * q.leash;
  const reach2 = q.reach === Infinity ? Infinity : q.reach * q.reach;
  const range2 = st.range * st.range;
  const floor = FLOOR[role]!;
  let best = -1;
  let bestScore = Infinity;
  let inRange = false;
  for (let k = 0; k <= rings; k++) {
    if (best >= 0 && k > 1) {
      const near = (k - 1) * hash.cell;
      if (near * near * floor >= bestScore) break;
      // A foe in range beats any beyond it: missile troops need look no further.
      if (inRange && near > st.range) break;
    }
    const y0 = by - k;
    const y1 = by + k;
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= hash.rows) continue;
      const step = y === y0 || y === y1 ? 1 : 2 * k;
      for (let x = bx - k; x <= bx + k; x += step === 0 ? 1 : step) {
        if (x < 0 || x >= hash.cols) continue;
        for (let j = head[y * cols + x]!; j >= 0; j = next[j]!) {
          const side = up[j]!;
          if (side < 0 || ((foes >>> side) & 1) === 0) continue;
          const vx = ux[j]!;
          const vy = uy[j]!;
          const dx = vx - ox;
          const dy = vy - oy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const lx = vx - q.ax;
          const ly = vy - q.ay;
          if (lx * lx + ly * ly > leash2) continue;
          if (reach2 !== Infinity) {
            const sx = vx - q.sx;
            const sy = vy - q.sy;
            if (sx * sx + sy * sy > reach2) continue;
          }
          const v = units[j]!;
          const vs = STATS[v.kind]!;
          let m = matchup(u.kind, v.kind) > 1 ? FAVORED : 1;
          switch (role) {
            case Role.Ranged: {
              // Focus fire: the wounded and the valuable, among those already in range.
              const hurt = 0.1 + 0.9 * (v.hp / v.maxHp);
              m *= d2 <= range2 ? (hurt * hurt) / (1 + 0.1 * vs.value) : 3;
              break;
            }
            case Role.Champion: {
              // A duel with the enemy's best.
              const worth = 1 + vs.value;
              m *= (1 + 0.3 * s.attackers[j]!) / (worth * worth);
              break;
            }
            case Role.Brute: {
              // Push the centre: the nearer the foe stands to its own banner, the better.
              const pi = s.unitPlatoon[j]!;
              if (pi >= 0) {
                const pl = world.platoons[pi]!;
                const cx = v.x - pl.x;
                const cy = v.y - pl.y;
                m *= 1 + (cx * cx + cy * cy) / BRUTE_CENTRE;
              }
              break;
            }
            case Role.Cavalry: {
              const a = s.attackers[j]!;
              if (a >= attackerCap(v.kind)) {
                const arm = st.range + vs.size * 0.5 + ARM;
                if (d2 > arm * arm) continue;
                m *= 6;
              } else m *= 1 + 0.3 * a;
              if (soft(v.kind)) m *= SOFT;
              break;
            }
            default: {
              // Spread along the enemy line rather than dogpiling one foe: one already
              // beset by its fill of attackers is left to them unless it is within arm's reach.
              const a = s.attackers[j]!;
              if (a >= attackerCap(v.kind)) {
                const arm = st.range + vs.size * 0.5 + ARM;
                if (d2 > arm * arm) continue;
                m *= 6;
              } else m *= 1 + 0.6 * a;
            }
          }
          if (role !== Role.Ranged && (q.hx !== 0 || q.hy !== 0) && dx * q.hx + dy * q.hy < 0) m *= BEHIND;
          const score = d2 * m;
          if (score < bestScore || (score === bestScore && j < best)) {
            bestScore = score;
            best = j;
            inRange = role === Role.Ranged && d2 <= range2;
          }
        }
      }
    }
  }
  return best;
}
