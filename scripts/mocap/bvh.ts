// A small BVH (Biovision hierarchy) reader with forward kinematics, for the CMU motion capture
// trials (cgspeed's MotionBuilder-friendly conversion). Offline tooling only: it runs under tsx
// when clips are converted, never in the game, so it may use Math.sin and friends freely.

export type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number];

export interface BvhJoint {
  name: string;
  parent: number;
  offset: V3;
  /** Channel names in file order (e.g. Xposition, Zrotation...). */
  channels: string[];
  /** Index of this joint's first channel in a frame row. */
  ch0: number;
  /** An End Site joint (no channels): named `<parent>_End`. */
  end: boolean;
}

export interface Bvh {
  joints: BvhJoint[];
  byName: Map<string, number>;
  frames: Float64Array[];
  frameTime: number;
}

/** Parses a BVH file's text. */
export function parseBvh(text: string): Bvh {
  const tok = text.split(/\s+/).filter((t) => t.length > 0);
  let i = 0;
  const next = (): string => {
    const t = tok[i++];
    if (t === undefined) throw new Error('BVH: unexpected end of file');
    return t;
  };
  const expect = (want: string): void => {
    const t = next();
    if (t !== want) throw new Error(`BVH: expected ${want}, got ${t}`);
  };
  const joints: BvhJoint[] = [];
  let nch = 0;
  const readJoint = (parent: number, end: boolean): void => {
    const name = end ? `${joints[parent]!.name}_End` : next();
    if (end) next(); // "Site"
    expect('{');
    expect('OFFSET');
    const offset: V3 = [Number(next()), Number(next()), Number(next())];
    const j: BvhJoint = { name, parent, offset, channels: [], ch0: nch, end };
    const idx = joints.push(j) - 1;
    for (;;) {
      const t = next();
      if (t === 'CHANNELS') {
        const n = Number(next());
        for (let k = 0; k < n; k++) j.channels.push(next());
        nch += n;
      } else if (t === 'JOINT') readJoint(idx, false);
      else if (t === 'End') readJoint(idx, true);
      else if (t === '}') return;
      else throw new Error(`BVH: unexpected ${t}`);
    }
  };
  expect('HIERARCHY');
  expect('ROOT');
  readJoint(-1, false);
  expect('MOTION');
  expect('Frames:');
  const nf = Number(next());
  expect('Frame');
  expect('Time:');
  const frameTime = Number(next());
  const frames: Float64Array[] = [];
  for (let f = 0; f < nf; f++) {
    const row = new Float64Array(nch);
    for (let c = 0; c < nch; c++) row[c] = Number(next());
    frames.push(row);
  }
  return { joints, byName: new Map(joints.map((j, k) => [j.name, k])), frames, frameTime };
}

const DEG = Math.PI / 180;
const mul = (a: M3, b: M3): M3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function rot(axis: string, deg: number): M3 {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** World positions of every joint (and End Site) at a frame (a fractional frame interpolates positions). */
export function jointPositions(bvh: Bvh, frame: number): V3[] {
  const f0 = Math.max(0, Math.min(bvh.frames.length - 1, Math.floor(frame)));
  const f1 = Math.min(bvh.frames.length - 1, f0 + 1);
  const u = frame - f0;
  const a = fkRow(bvh, bvh.frames[f0]!);
  if (u <= 1e-9 || f1 === f0) return a;
  const b = fkRow(bvh, bvh.frames[f1]!);
  return a.map((p, k) => {
    const q = b[k]!;
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  });
}

function fkRow(bvh: Bvh, row: Float64Array): V3[] {
  const pos: V3[] = [];
  const rots: M3[] = [];
  for (const j of bvh.joints) {
    let local: M3 = I3;
    let tr: V3 = [0, 0, 0];
    j.channels.forEach((ch, k) => {
      const v = row[j.ch0 + k]!;
      if (ch.endsWith('position')) tr = ch[0] === 'X' ? [v, tr[1], tr[2]] : ch[0] === 'Y' ? [tr[0], v, tr[2]] : [tr[0], tr[1], v];
      else local = mul(local, rot(ch[0]!, v));
    });
    const off: V3 = [j.offset[0] + tr[0], j.offset[1] + tr[1], j.offset[2] + tr[2]];
    if (j.parent < 0) {
      pos.push(off);
      rots.push(local);
    } else {
      const pr = rots[j.parent]!;
      const pp = pos[j.parent]!;
      const o = apply(pr, off);
      pos.push([pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]]);
      rots.push(mul(pr, local));
    }
  }
  return pos;
}
