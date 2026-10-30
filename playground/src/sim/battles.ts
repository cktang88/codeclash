// Battles as simulation inputs: armies drawn up in formation blocks, melee in front, missiles behind.
import { typeOf, UNITS } from '../units.ts';
import { FOOTPRINTS } from './footprints.ts';
import type { SimInput, UnitType } from './sim.ts';

export const BATTLES = {
  types: UNITS.map(
    (d): UnitType => ({ id: d.id, ...d.stats, radius: FOOTPRINTS[d.id] ?? d.stats.radius, swing: d.stats.swing ?? 0.9, variants: 4 }),
  ),
};

/** A share of the army, its block's depth (0 front, 1 behind) and its files. */
type Part = [id: string, share: number, line: number];
export type Army = Part[];

export const ARMIES: Record<string, [Army, Army]> = {
  'men vs monsters': [
    [['kaykit-knight', 0.3, 0], ['kaykit-barbarian', 0.15, 0], ['kaykit-champion', 0.03, 0], ['kaykit-ranger', 0.32, 1], ['kaykit-mage', 0.1, 1], ['quat-cleric', 0.1, 1]],
    [['kaykit-skeleton', 0.35, 0], ['kaykit-minion', 0.25, 0], ['own-troll', 0.03, 0], ['own-golem', 0.02, 0], ['kaykit-skeleton-mage', 0.15, 1], ['quat-bat', 0.1, 1], ['quat-skeleton', 0.1, 1]],
  ],
  'mirror match': [
    [['kaykit-knight', 0.4, 0], ['kaykit-barbarian', 0.1, 0], ['kaykit-ranger', 0.35, 1], ['kaykit-mage', 0.15, 1]],
    [['quat-warrior', 0.4, 0], ['kaykit-rogue', 0.1, 0], ['quat-ranger', 0.35, 1], ['quat-wizard', 0.15, 1]],
  ],
  'dragon raid': [
    [['kaykit-knight', 0.4, 0], ['kaykit-ranger', 0.45, 1], ['kaykit-mage', 0.15, 1]],
    [['quat-dragon', 0.01, 1], ['quat-bat', 0.3, 0], ['kaykit-skeleton', 0.69, 0]],
  ],
};

/** Musters an army of about `perSide` soldiers: each part a block, blocks side by side within their line. */
export function armyInputs(army: Army, side: 0 | 1, perSide: number, tick: number): SimInput[] {
  const out: SimInput[] = [];
  const dir = side === 0 ? -1 : 1;
  for (const line of [0, 1]) {
    const parts = army.filter((p) => p[2] === line);
    const blocks = parts.map(([id, share]) => {
      const type = typeOf(id);
      const count = Math.max(1, Math.round(perSide * share));
      const r = BATTLES.types[type]!.radius;
      // Wide, shallow blocks: about three files for every rank.
      const files = Math.max(1, Math.round(Math.sqrt(count * 3)));
      return { type, count, files, width: files * r * 2.3, depth: Math.ceil(count / files) * r * 2.3 };
    });
    const total = blocks.reduce((a, b) => a + b.width + 2, 0);
    let z = -total / 2;
    for (const b of blocks) {
      z += b.width / 2 + 1;
      out.push({ tick, kind: 'muster', side, type: b.type, count: b.count, files: b.files, x: dir * (14 + line * 10 + b.depth / 2), z });
      z += b.width / 2 + 1;
    }
  }
  return out;
}

export function battleInputs(perSide: number, tick: number, name = 'men vs monsters'): SimInput[] {
  const [a, b] = ARMIES[name]!;
  return [...armyInputs(a, 0, perSide, tick), ...armyInputs(b, 1, perSide, tick)];
}
