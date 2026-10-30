// Every unit, in a fixed order: a unit's index here is its type in the simulation.
import type { UnitDef } from './assets.ts';
import { KAYKIT } from './packs/kaykit.ts';
import { KEVIN } from './packs/kevin.ts';
import { QUATERNIUS } from './packs/quaternius.ts';

export const PACKS: [string, UnitDef[]][] = [
  ['KayKit (CC0)', KAYKIT],
  ['Quaternius (CC0)', QUATERNIUS],
  ['Kevin Iglesias (local only)', KEVIN],
];
export const UNITS: UnitDef[] = PACKS.flatMap(([, d]) => d);
export const typeOf = (id: string): number => {
  const i = UNITS.findIndex((d) => d.id === id);
  if (i < 0) throw new Error(`no unit ${id}`);
  return i;
};
