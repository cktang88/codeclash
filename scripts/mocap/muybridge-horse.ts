// Horse gaits for the cavalry, measured from Muybridge's photographs (there is no horse motion
// capture in the CMU database: trial 79_65 "horse" is an actor miming one).
//
//   pnpm tsx scripts/mocap/muybridge-horse.ts      writes src/client/render/paper/motion/horse-*.json
//
// The gallop keys are angles read off Animal Locomotion Plate 626 ("A galloping horse and rider",
// 16 exposures, Wellcome Collection, public domain) with a measuring grid over each exposure
// (references/motion/cells/gallopmax/, git-ignored). They are estimates (about ±10°): a scan of a
// collotype is soft, and the near and far legs overlap. The walk follows Plate 574 ("A horse
// walking", 24 exposures): the lateral four-beat sequence and the stance / swing shapes are read off
// the plate, then laid out evenly (LH 0, LF 1/4, RH 1/2, RF 3/4 of the stride), as gait studies give
// it. Each leg is two segments: upper (elbow to knee, stifle to hock) and lower (to the hoof).
//
// Angles are sagittal (the horse seen from the side, facing right): rig convention, 0 = straight
// down, + = forward. They are projected into the SE and NE facings the same way as the mocap.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatClip, OUT_DIR, project, type DrawnFacing, type MotionClip, type MotionKey } from './bvh-to-paper.ts';
import { EASE, type Curve } from '../../src/client/render/paper/skeleton.ts';

/** One measured or modelled pose. Legs: [upper, lower] sagittal degrees. */
interface HorseFrame {
  f: number;
  pitch: number;
  neck: number;
  head: number;
  tail: number;
  /** Barrel drop (units, + = lower) and the hooves on the ground. */
  drop: number;
  hindN: [number, number];
  hindF: [number, number];
  foreN: [number, number];
  foreF: [number, number];
  down: { HN: boolean; HF: boolean; FN: boolean; FF: boolean };
  /** Exposure number on the plate, for the notes. */
  photo?: number;
}

// The lead legs are N (near): the lead hind lands second, the lead fore lands last.
const GALLOP: HorseFrame[] = [
  // gathered suspension: hinds swing under the belly, both fores folded (the lead just pushed off)
  { photo: 1, f: 0, pitch: 2, neck: 122, head: 55, tail: -95, drop: -0.6, hindF: [-50, 45], hindN: [-60, 30], foreN: [-25, -40], foreF: [20, -90], down: { HN: false, HF: false, FN: false, FF: false } },
  // the trailing hind lands, croup low, fores reaching forward folded
  { photo: 5, f: 3, pitch: 3, neck: 126, head: 58, tail: -100, drop: -0.2, hindF: [25, 15], hindN: [35, 25], foreN: [45, 30], foreF: [30, -40], down: { HN: false, HF: true, FN: false, FF: false } },
  // both hinds down, the fores stretch out
  { photo: 7, f: 5, pitch: 1, neck: 120, head: 55, tail: -100, drop: 0, hindF: [-10, -20], hindN: [25, 30], foreN: [50, 45], foreF: [40, 20], down: { HN: true, HF: true, FN: false, FF: false } },
  // the trailing hind pushes off, the trailing fore lands
  { photo: 9, f: 6, pitch: -2, neck: 112, head: 52, tail: -105, drop: 0.2, hindF: [-45, -60], hindN: [0, 0], foreN: [45, 40], foreF: [20, 20], down: { HN: true, HF: false, FN: false, FF: true } },
  // the lead hind pushes off, the trailing fore is vertical under the weight, the lead fore reaches
  { photo: 11, f: 8, pitch: -4, neck: 106, head: 48, tail: -105, drop: 0.5, hindF: [-60, -60], hindN: [-45, -65], foreN: [50, 55], foreF: [0, 0], down: { HN: false, HF: false, FN: false, FF: true } },
  // the lead fore is down; the hinds fold up behind; the trailing fore lifts behind
  { photo: 13, f: 10, pitch: -3, neck: 110, head: 50, tail: -100, drop: 0.3, hindF: [-55, -100], hindN: [-40, -30], foreN: [20, 20], foreF: [-50, -60], down: { HN: false, HF: false, FN: true, FF: false } },
  // the lead fore pushes off; the hinds swing forward with the hocks bent
  { photo: 15, f: 11, pitch: 0, neck: 116, head: 53, tail: -98, drop: -0.2, hindF: [-15, 15], hindN: [-25, 0], foreN: [-15, -20], foreF: [10, -80], down: { HN: false, HF: false, FN: true, FF: false } },
];

/** Plate 574's walk, laid out as an even lateral sequence (one loop = one stride, 12 frames). */
function walkFrames(): HorseFrame[] {
  const out: HorseFrame[] = [];
  const STANCE = 0.62;
  // A leg at phase p (0 = touchdown): stance sweeps the straight leg from +20° to -22°; swing lifts
  // it with the lower leg folded (fore: cannon back under the knee; hind: hock flexed).
  const leg = (p: number, fore: boolean): { a: [number, number]; down: boolean } => {
    const q = ((p % 1) + 1) % 1;
    if (q < STANCE) {
      const u = q / STANCE;
      const up = 20 - 42 * u;
      // the pastern sinks under the weight in mid-stance; the lower leg trails at push-off
      return { a: [up, up - (fore ? 6 : 4) * Math.sin(Math.PI * u) - (u > 0.8 ? (u - 0.8) * 60 : 0)], down: true };
    }
    const u = (q - STANCE) / (1 - STANCE);
    const up = -22 + 42 * (0.5 - 0.5 * Math.cos(Math.PI * u));
    const fold = Math.sin(Math.PI * Math.min(1, u * 1.15));
    return { a: [up, up - (fore ? 75 : 45) * fold], down: false };
  };
  for (let f = 0; f < 12; f += 1) {
    const t = f / 12;
    const hf = leg(t, false), ff = leg(t - 0.25, true), hn = leg(t - 0.5, false), fn = leg(t - 0.75, true);
    // the head nods down as each fore lands (t = 1/4 and 3/4): two nods per stride
    const nod = Math.cos(4 * Math.PI * (t - 0.25));
    out.push({
      f,
      pitch: 0.8 * Math.cos(4 * Math.PI * t),
      neck: 128 - 5 * nod,
      head: 30 - 6 * nod,
      tail: -20 + 6 * Math.sin(2 * Math.PI * t),
      drop: 0.15 * Math.cos(4 * Math.PI * (t - 0.1)),
      hindF: hf.a,
      foreF: ff.a,
      hindN: hn.a,
      foreN: fn.a,
      down: { HF: hf.down, FF: ff.down, HN: hn.down, FN: fn.down },
    });
  }
  return out;
}

const LENGTHS = { barrel: 7, neck: 4.6, head: 3.2, foreUpper: 3.4, foreLower: 3.8, hindUpper: 3.6, hindLower: 4.2, tail: 3.4 };
/** Barrel (girth) height above the ground at rest, units (a 1.55 m horse beside a 14-unit man). */
const BARREL_HEIGHT = 8.6;

const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const rHalf = (v: number): number => Math.round(v * 2) / 2 + 0;
/** A sagittal angle seen in a drawn facing. */
function seen(a: number, facing: DrawnFacing): number {
  const t = (a * Math.PI) / 180;
  const [x, y] = project(Math.sin(t), 0, -Math.cos(t), facing);
  let d = (Math.atan2(x, y) * 180) / Math.PI;
  d -= 360 * Math.round((d - a) / 360);
  return d;
}

function clip(name: string, anim: 'Run' | 'Walk', frames: HorseFrame[], meta: Record<string, unknown>, curve: Curve | undefined): MotionClip {
  const facings = { se: { keys: [] as MotionKey[] }, ne: { keys: [] as MotionKey[] } };
  for (const fc of ['se', 'ne'] as const) {
    for (const h of frames) {
      const bones: Record<string, number> = {
        barrel: rHalf(seen(90 + h.pitch, fc)),
        neck: rHalf(seen(h.neck, fc)),
        head: rHalf(seen(h.head, fc)),
        tail: rHalf(seen(h.tail, fc)),
        foreUpperN: rHalf(seen(h.foreN[0], fc)),
        foreLowerN: rHalf(seen(h.foreN[1], fc)),
        foreUpperF: rHalf(seen(h.foreF[0], fc)),
        foreLowerF: rHalf(seen(h.foreF[1], fc)),
        hindUpperN: rHalf(seen(h.hindN[0], fc)),
        hindLowerN: rHalf(seen(h.hindN[1], fc)),
        hindUpperF: rHalf(seen(h.hindF[0], fc)),
        hindLowerF: rHalf(seen(h.hindF[1], fc)),
      };
      const key: MotionKey = {
        f: h.f,
        root: [0, r2(h.drop)],
        height: r2(BARREL_HEIGHT - h.drop),
        // contact N/F: any hoof of that side down (the per-hoof flags are in `hooves`)
        contact: { N: h.down.HN || h.down.FN, F: h.down.HF || h.down.FF },
        bones,
        twist: { pelvis: 0, chest: 0 },
      };
      (key as MotionKey & { hooves?: HorseFrame['down'] }).hooves = { ...h.down };
      if (curve) key.c = curve;
      facings[fc].keys.push(key);
    }
  }
  const events = frames.flatMap((h, i) => {
    const prev = frames[(i + frames.length - 1) % frames.length]!.down;
    return (['HN', 'HF', 'FN', 'FF'] as const).filter((k) => h.down[k] && !prev[k]).map((k) => ({ f: h.f, name: 'step', bone: k }));
  });
  return { name, anim, body: 'horse', frames: 12, loop: true, angles: 'world', restHeight: 14, restHip: BARREL_HEIGHT, lengths: { ...LENGTHS }, facings, events, meta };
}

function main(): void {
  const gallop = clip('horse-gallop', 'Run', GALLOP, {
    source: 'Eadweard Muybridge, Animal Locomotion (1887), Plate 626 "A galloping horse and rider", exposures 1-15; Wellcome Collection https://wellcomecollection.org/works/uwc8xuuu',
    licence: 'Public domain (Public Domain Mark, Wellcome Collection)',
    measured: 'angles read by eye off exposures 1, 5, 7, 9, 11, 13, 15 with a measuring grid; about ±10°',
    why: 'One stride (exposures 1 to 16) as one Run loop: suspension gathered under the belly, trailing hind, lead hind, trailing fore, lead fore. Cross-checked against The Horse in Motion (1878, 11 frames).',
    sides: 'N = the lead legs (the lead hind lands second, the lead fore last)',
  }, EASE);
  const walk = clip('horse-walk', 'Walk', walkFrames(), {
    source: 'Eadweard Muybridge, Animal Locomotion (1887), Plate 574 "A horse walking" (24 exposures); Wellcome Collection https://wellcomecollection.org/works/a98xvb7f',
    licence: 'Public domain (Public Domain Mark, Wellcome Collection)',
    measured: 'stance and swing shapes read off the plate; the footfalls laid out as an even lateral sequence (LH, LF, RH, RF at quarter-stride intervals, duty factor 0.62)',
    why: 'One stride per Walk loop; the head nods down as each fore hoof lands (two nods per stride).',
    sides: 'N = right legs, F = left legs; frame 0 is the far (left) hind landing',
  }, undefined);
  for (const c of [gallop, walk]) {
    writeFileSync(join(OUT_DIR, `${c.name}.json`), formatClip(c));
    console.log(`${c.name}: ${c.facings.se.keys.length} keys, events ${c.events.map((e) => `${e.bone}@${e.f}`).join(' ')}`);
  }
}

main();
