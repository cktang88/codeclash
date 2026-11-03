// The battlefield in the HD art: the ground and everything that marks it, drawn at the same texel
// density as the figures (one map pixel = m texels, m = 1, 2, 4 or 8 by zoom), never upscaled.
//
//   - The ground is painted by a shader straight into the scene buffer, texel by texel, from the
//     same value noise as the classic ground (ground.ts), so the field keeps its zones of grass,
//     dry grass, bare earth and mud, and its road. At each texel it adds what a level-m painter
//     would: tufts of blades lit on one side, stones lit upper left with a contact shadow, pebbles,
//     flowers, cracks, short grass strokes. That pass is cached and only redrawn when the view moves.
//   - The marks: a map-pixel field on the CPU (uploaded by dirty tiles) of blood soaked into the
//     soil (R), how trodden and churned the ground is (G), and when blood last fell there (A). A
//     second pass, every frame, thresholds that smooth field per texel against a jitter noise, so
//     a pool has a crisp, clotted, ragged edge at any level: soaked soil darkens, a pool forms, its
//     rim clots dark, fresh blood is red and wet (a glint on the lit lip) and darkens to maroon and
//     brown over a minute; trodden grass flattens and pales, heavy fighting churns it into lumpy mud.
//   - Decals that need their shape (blood splatter, stuck arrows, craters, hoofprints) are kept in
//     a list and drawn each frame from the HD effects sheet (fx-hd.ts), blood tinted by its age.
//
// All of it lives on the CPU too, so a lost WebGL context is rebuilt from it.

import { FIELD_H, FIELD_W } from '../../game/battle.ts';
import { buildFxHd, fxId, type HdSheet } from './fx-hd.ts';
import { compile, dropTarget, target, texturePixels, type Batch, type Target } from './gl.ts';
import type { Ground } from './ground.ts';
import { PX, SQUASH } from './iso.ts';
import { buildStandardsHd, type StdArmy } from './standards-hd.ts';

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_cam;   // map px at the buffer's top-left (a whole number of texels)
uniform float u_m;    // texels (buffer px) per map px
uniform uint u_seed;
out vec4 o;

const float BAY[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer(vec2 t) {
  uvec2 u = uvec2(ivec2(t)) & 3u;
  return (BAY[u.y * 4u + u.x] + 0.5) / 16.0;
}
uint hash3(uint a, uint b, uint c) {
  uint h = (a * 0x9e3779b1u) ^ (b * 0x85ebca77u) ^ (c * 0xc2b2ae3du) ^ u_seed;
  h ^= h >> 16; h *= 0x7feb352du; h ^= h >> 15; h *= 0x846ca68bu; h ^= h >> 16;
  return h;
}
float h01(uint h) { return float(h >> 8) / 16777216.0; }
float hT(vec2 t, uint k) { uvec2 u = uvec2(ivec2(t)); return h01(hash3(u.x, u.y, k)); }
// Smooth noise on the texel lattice scaled to 'cell' map px (for ragged edges that don't swim).
float vn(vec2 p, float cell, uint k) {
  vec2 f = p / cell;
  vec2 i = floor(f);
  vec2 t = f - i;
  t = t * t * (3.0 - 2.0 * t);
  float a = hT(i, k), b = hT(i + vec2(1, 0), k), c = hT(i + vec2(0, 1), k), d = hT(i + vec2(1, 1), k);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
vec3 hex(int v) { return vec3(float((v >> 16) & 255), float((v >> 8) & 255), float(v & 255)) / 255.0; }
`;

// Pass A: the ground itself, cached per view. Alpha carries what the texel is (0 soil, 0.25 a
// blade or flower, 0.5 a stone), so the marks pass knows what trampling flattens.
const BASE_FS = `${COMMON}
uniform vec2 u_org;   // projected px of map px (0, 0)
uniform uvec4 u_salt; // the classic ground's four noise layers
uniform vec3 u_road;  // y0, bend, phase

const float PXW = ${PX.toFixed(6)};
const float SQ = ${SQUASH.toFixed(6)};
const float CO = 0.8660254037844387;
const float SI = 0.5;
const float FW = ${FIELD_W.toFixed(1)};
const float FH = ${FIELD_H.toFixed(1)};

vec2 world(vec2 m) {
  float u = (m.x + u_org.x) / PXW;
  float v = (m.y + u_org.y) / (PXW * SQ);
  return vec2(u * CO + v * SI, -u * SI + v * CO);
}
// The classic ground's value noise (ground.ts valueNoise), bit for bit in its lattice.
float lat(float x, float y, uint salt) {
  uint h = (uint(int(x)) * 0x27d4eb2du) ^ (uint(int(y)) * 0x165667b1u) ^ salt;
  h = (h ^ (h >> 15)) * 0x85ebca6bu;
  h = (h ^ (h >> 13)) * 0xc2b2ae35u;
  return float(h ^ (h >> 16)) / 4294967296.0;
}
float gnoise(vec2 w, float cell, uint salt) {
  vec2 f = w / cell;
  vec2 i = floor(f);
  vec2 t = f - i;
  t = t * t * (3.0 - 2.0 * t);
  float a = lat(i.x, i.y, salt), b = lat(i.x + 1.0, i.y, salt), c = lat(i.x, i.y + 1.0, salt), d = lat(i.x + 1.0, i.y + 1.0, salt);
  return a + (b - a) * t.x + (c - a) * t.y + (a - b - c + d) * t.x * t.y;
}
float road(float x) { return u_road.x + u_road.y * sin((x / FW) * 3.14159265 * 1.3 + u_road.z); }

float segDist(vec2 p, vec2 a, vec2 b, out float t) {
  vec2 pa = p - a, ba = b - a;
  t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t);
}

void main() {
  vec2 T = floor(u_cam * u_m + 0.5) + floor(gl_FragCoord.xy);
  vec2 p = (T + 0.5) / u_m;
  vec2 w = world(p);
  // Zone edges: the classic ordered dither at level 1; above it, a blotchy noise at about half a
  // map px, so the edges break into clusters instead of a screen-door checker.
  float d = u_m < 2.0 ? bayer(T) : vn(p, 0.55, 12u) * 0.75 + hT(T, 13u) * 0.25;
  bool inside = w.x > -20.0 && w.x < FW + 20.0 && w.y > -10.0 && w.y < FH + 10.0;
  float fine = gnoise(w, 6.0, u_salt.z);
  float n = gnoise(w, 110.0, u_salt.x) * 0.5 + gnoise(w, 30.0, u_salt.y) * 0.32 + fine * 0.18;
  // A little organic wobble on the zone edges at texel scale.
  float wob = (vn(p, 0.9, 11u) - 0.5) * 0.05;
  float v = clamp(n + (d - 0.5) * 0.11 + wob, 0.0, 0.999);
  vec3 DARK = hex(0x54502e), GRASS = hex(0x605c34), GRASS2 = hex(0x72683c), DRY = hex(0x927e50), PALE = hex(0xa69264);
  vec3 c = v < 0.3 ? DARK : v < 0.44 ? GRASS : v < 0.56 ? GRASS2 : v < 0.68 ? mix(GRASS2, DRY, 0.5) : v < 0.8 ? DRY : PALE;
  float zone = v; // grassiness falls as v rises
  // Bare earth and mud in the hollows.
  float mm = gnoise(w, 45.0, u_salt.w) * 0.8 + gnoise(w * 1.7, 6.0, u_salt.z) * 0.2 + (d - 0.5) * 0.1 + wob;
  bool bare = false;
  if (mm > 0.68) {
    bare = true;
    c = mm > 0.75 ? (mm > 0.8 ? hex(0x4a3c2c) : hex(0x5c4832)) : mix(hex(0x7c6040), c, 0.4);
  }
  // The road, its ruts with a shadowed wall and a lit lip.
  float ry = road(w.x);
  float off = abs(w.y - ry);
  float edge = off / 8.0 + (gnoise(w * 2.0, 6.0, u_salt.z) - 0.5) * 0.5 + (d - 0.5) * 0.25;
  bool onRoad = edge < 1.0;
  if (onRoad) {
    c = mix(hex(0x9e8660), c, max(0.0, edge - 0.5));
    float rut = off - 3.2;
    if (abs(rut) < 0.75 && edge < 0.9) c = rut < 0.0 ? hex(0x5e4c36) : hex(0x6c583e);
    else if (rut > 0.75 && rut < 0.75 + 1.4 / u_m && edge < 0.9) c = hex(0xb09a72);
  }
  // Short grass strokes in the grassy zones (level 2 up): upright 1-texel dashes, light and dark.
  float cls = 0.0;
  if (u_m >= 2.0 && !onRoad && !bare && zone < 0.72) {
    float sl = max(1.0, floor(u_m * 0.45));
    float col = T.x;
    float h = hT(vec2(col, floor((T.y + hT(vec2(col, 7.0), 3u) * 13.0) / sl)), 5u);
    float dens = (0.72 - zone) * 0.55;
    if (h < dens * 0.45) c = mix(c, hex(0x2e3418), 0.45);
    else if (h > 1.0 - dens * 0.4) c = mix(c, hex(0x9a9a5a), 0.3);
  }
  // Grit: a sprinkle of single dark and pale texels, as many per map px at every level.
  float s = hT(T, 9u);
  float sp = 1.0 / (u_m * u_m);
  if (s < 0.035 * sp) c = mix(c, hex(0x181610), 0.35);
  else if (s > 1.0 - 0.025 * sp) c = mix(c, hex(0xaaa078), 0.22);
  if (!inside) c = mix(c, DARK, 0.12);

  // Scattered things, one candidate per cell of 4 x 2.5 map px: tufts, stones, pebbles, flowers,
  // cracks. The frontmost (lowest on screen) wins where two overlap.
  const float CW = 4.0;
  const float CH = 2.5;
  vec2 cell = floor(p / vec2(CW, CH));
  float bestY = -1e9;
  vec3 fc = c;
  float shadow = 1.0;
  for (int dy = -1; dy <= 2; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      vec2 ci = cell + vec2(float(dx), float(dy));
      uvec2 cu = uvec2(ivec2(ci));
      uint h0 = hash3(cu.x, cu.y, 101u);
      vec2 b = (ci + vec2(h01(h0), h01(h0 * 747796405u + 1u))) * vec2(CW, CH);
      vec2 bw = world(b);
      float br = abs(bw.y - road(bw.x));
      float clump = gnoise(bw, 26.0, u_salt.y ^ 0x5bd1e995u);
      float dens = 0.1 + smoothstep(0.3, 0.75, clump) * 0.85;
      float pick = h01(hash3(cu.x, cu.y, 102u));
      if (pick > dens) continue;
      float k = h01(hash3(cu.x, cu.y, 103u));
      uint hk = hash3(cu.x, cu.y, 104u);
      if (br < 7.0) {
        // Pale pebbles on the road.
        if (k > 0.5) continue;
        k = 0.7;
      }
      vec2 q = p - b;
      if (abs(q.x) > 2.6 || q.y < -3.6 || q.y > 1.2) continue;
      if (k < 0.58) {
        // A tuft: three to five tapering blades fanning up from one root, the left edge of each
        // blade lit, dry or green with the zone.
        bool dry = h01(hk) < 0.25 + zone * 0.5;
        vec3 cBase = dry ? hex(0x5a5032) : hex(0x36401f);
        vec3 cMid = dry ? hex(0x7e7244) : hex(0x55602e);
        vec3 cTip = dry ? hex(0xa49464) : hex(0x7e8a44);
        vec3 cLit = dry ? hex(0xbcae7a) : hex(0x96a256);
        int nb = 3 + int(hk % 3u);
        float fn = float(nb);
        float sc = 0.7 + h01(hk * 3u + 1u) * 0.6;
        for (int i = 0; i < 5; i++) {
          if (i >= nb) break;
          uint hb = hash3(cu.x, cu.y, 200u + uint(i));
          float o2 = (float(i) - (fn - 1.0) * 0.5);
          vec2 root = b + vec2(o2 * 0.42, 0.0);
          vec2 tip = b + vec2(o2 * (0.9 + h01(hb) * 0.6) + (h01(hb * 5u) - 0.5) * 0.6, -(1.2 + h01(hb * 9u) * 1.5) * sc);
          float t;
          float dd = segDist(p, root, tip, t);
          float hw = max(mix(0.26, 0.04, t), 0.5 / u_m);
          if (dd < hw && b.y >= bestY) {
            bestY = b.y;
            vec2 ba = tip - root;
            float side = (p.x - root.x) * ba.y - (p.y - root.y) * ba.x; // > 0: left of the blade
            fc = t < 0.3 ? cBase : t < 0.7 ? cMid : cTip;
            if (side < 0.0 && t > 0.2 && u_m >= 2.0) fc = t < 0.6 ? cTip : cLit;
            cls = 0.25;
          }
        }
        // A dark contact shadow at the root.
        vec2 e = (p - b - vec2(0.15, 0.05)) / vec2(1.25, 0.32);
        if (dot(e, e) < 1.0) shadow = min(shadow, 0.72);
      } else if (k < 0.67) {
        // A stone: lit upper left, a hard dark underside, a cast shadow down right.
        float rx = 0.55 + h01(hk) * 0.9;
        float ryy = rx * 0.6;
        vec2 cc = b + vec2(0.0, -ryy * 0.55);
        vec2 nn = (p - cc) / vec2(rx, ryy);
        float qq = dot(nn, nn) + (h01(hk * 7u) - 0.5) * 0.1 * sin(atan(nn.y, nn.x) * 3.0);
        if (qq < 1.0 && b.y >= bestY) {
          bestY = b.y;
          float l = -nn.x * 0.62 - nn.y * 0.78 + sqrt(max(0.0, 1.0 - qq)) * 0.4 + (bayer(T) - 0.5) * 0.2;
          fc = l > 0.75 ? hex(0xaaa28e) : l > 0.3 ? hex(0x7f7868) : l > -0.15 ? hex(0x5c574c) : hex(0x3b3832);
          if (qq > 0.8 && l < 0.0) fc = hex(0x2a2822);
          cls = 0.5;
        }
        vec2 e = (p - cc - vec2(rx * 0.35, ryy * 0.5)) / vec2(rx * 1.15, ryy * 0.9);
        if (dot(e, e) < 1.0) shadow = min(shadow, 0.62);
      } else if (k < 0.71) {
        // Pebbles: two or three small stones.
        for (int i = 0; i < 3; i++) {
          uint hb = hash3(cu.x, cu.y, 300u + uint(i));
          vec2 cc = b + vec2((h01(hb) - 0.5) * 2.2, (h01(hb * 3u) - 0.5) * 0.9);
          float r = max(0.18 + h01(hb * 5u) * 0.25, 0.5 / u_m);
          vec2 nn = (p - cc) / vec2(r, r * 0.7);
          float qq = dot(nn, nn);
          if (qq < 1.0 && cc.y >= bestY) {
            bestY = cc.y;
            float l = -nn.x * 0.62 - nn.y * 0.78;
            fc = br < 7.0 ? (l > 0.1 ? hex(0xc4b898) : hex(0x9a8c6c)) : (l > 0.1 ? hex(0x9a9380) : hex(0x5e594e));
            cls = 0.5;
          }
        }
      } else if (k < 0.9) {
        // Flowers: a few heads on short stems; poppies, daisies, yellow and blue.
        if (onRoad || bare) continue;
        int kind = int(hk % 5u);
        vec3 petal = kind == 0 ? hex(0xb8322a) : kind == 1 ? hex(0xe6e0cc) : kind == 2 ? hex(0xd8b040) : kind == 3 ? hex(0x6a76b8) : hex(0x9a6aa6);
        vec3 eye = kind == 0 ? hex(0x2a1a14) : hex(0xd89a30);
        for (int i = 0; i < 3; i++) {
          uint hb = hash3(cu.x, cu.y, 400u + uint(i));
          vec2 hc = b + vec2((h01(hb) - 0.5) * 1.8, -0.5 - h01(hb * 3u) * 0.9);
          float t;
          if (segDist(p, hc, hc + vec2(0.1, 0.8), t) < max(0.05, 0.5 / u_m) && hc.y + 0.8 >= bestY) {
            bestY = hc.y + 0.8;
            fc = hex(0x3a4a22);
            cls = 0.25;
          }
          float r = max(0.2 + h01(hb * 7u) * 0.1, 0.5 / u_m);
          vec2 nn = (p - hc) / vec2(r, r * 0.8);
          float qq = dot(nn, nn);
          if (qq < 1.0 && hc.y + 0.9 >= bestY) {
            bestY = hc.y + 0.9;
            fc = (nn.x + nn.y < -0.4 && u_m >= 4.0) ? mix(petal, vec3(1.0), 0.3) : petal;
            if (qq < 0.18 && u_m >= 4.0) fc = eye;
            cls = 0.25;
          }
        }
      } else {
        // A crack in the dry earth, its lower lip catching the light.
        float len = 1.2 + h01(hk) * 2.0;
        vec2 a = b - vec2(len * 0.5, 0.0);
        vec2 e2 = b + vec2(len * 0.5, (h01(hk * 3u) - 0.5) * 0.8);
        vec2 mid = (a + e2) * 0.5 + vec2(0.0, (h01(hk * 5u) - 0.5) * 0.5);
        float t;
        float dd = min(segDist(p, a, mid, t), segDist(p, mid, e2, t));
        float wd = max(0.08, 0.5 / u_m);
        if (dd < wd) fc = mix(c, hex(0x2a2016), 0.7);
        else if (dd < wd + 1.0 / u_m && u_m >= 4.0 && p.y > mid.y) fc = mix(c, hex(0xc0aa80), 0.3);
      }
    }
  if (bestY > -1e8) c = fc;
  else c *= shadow;
  o = vec4(c, cls);
}`;

// Pass B: every frame, the cached ground with the marks laid over it.
const MARKS_FS = `${COMMON}
uniform sampler2D u_base;
uniform sampler2D u_marks;
uniform vec2 u_msize;
uniform float u_now;  // battle seconds

void main() {
  ivec2 fcI = ivec2(gl_FragCoord.xy);
  vec4 b = texelFetch(u_base, fcI, 0);
  vec3 c = b.rgb;
  vec2 T = floor(u_cam * u_m + 0.5) + floor(gl_FragCoord.xy);
  vec2 p = (T + 0.5) / u_m;
  vec4 mk = texture(u_marks, p / u_msize);
  if (mk.r + mk.g < 0.004) { o = vec4(c, 1.0); return; }
  float hj = hT(T, 21u);
  float sj = vn(p, 0.75, 22u) * 0.7 + vn(p, 2.3, 23u) * 0.3;
  float d = bayer(u_m >= 8.0 ? floor(T / 2.0) : T);

  // Trodden, then churned ground.
  float wear = mk.g + (sj - 0.5) * 0.3 + (d - 0.5) * 0.06;
  if (wear > 0.2) {
    float tone = sj + (d - 0.5) * 0.2;
    vec3 trod = tone > 0.62 ? hex(0x9c8664) : tone > 0.4 ? hex(0x86704e) : hex(0x6e5a3e);
    if (b.a > 0.2 && b.a < 0.3) c = mix(trod, hex(0x5a5434), 0.55); // a blade trodden flat
    else if (b.a < 0.2) c = mix(c, trod, wear > 0.32 ? 0.85 : 0.5);
  }
  if (wear > 0.5 && b.a < 0.4) {
    // Churned mud: lumps lit on their upper left, wet hollows between.
    float r0 = vn(p, 0.5, 31u);
    float r1 = vn(p + vec2(0.18, 0.18), 0.5, 31u);
    float lit = r0 - r1;
    vec3 mud = lit > 0.07 ? hex(0x7a6246) : lit < -0.07 ? hex(0x3a2c1e) : hex(0x5a4632);
    if (wear > 0.85 && r0 < 0.32) mud = r0 < 0.22 && hj < 0.3 && lit > 0.0 ? hex(0x8e8a7e) : hex(0x2c241a);
    c = mud;
  }

  // Blood: soaked into the soil first, then pooled, a clotted rim, darkening with age.
  float bl = mk.r + (sj - 0.5) * 0.32 + (hj - 0.5) * 0.05;
  float age = clamp((u_now - mk.a * 510.0) / 50.0, 0.0, 1.0);
  if (bl > 0.14) c *= mix(vec3(0.66, 0.42, 0.38), vec3(0.56, 0.44, 0.4), age);
  if (bl > 0.3) {
    vec3 pool = bl > 0.62 ? mix(hex(0x520f0c), hex(0x2c1610), age) : mix(hex(0x6c1612), hex(0x3c1a12), age);
    if (bl < 0.37) pool = mix(hex(0x420c0a), hex(0x261410), age);
    // A wet glint on the lit lip of fresh blood: where the field falls off toward the upper left.
    if (age < 0.45 && bl > 0.4 && bl < 0.6 && hj < 0.55) {
      float up = texture(u_marks, (p - vec2(0.7, 0.45)) / u_msize).r;
      if (up < mk.r - 0.06) pool = hex(0xa23a2c);
    }
    c = pool;
  }
  o = vec4(c, 1.0);
}`;

/** A ground decal: a sprite of the HD sheet stamped flat on the ground. */
interface Decal {
  id: number;
  x: number;
  y: number;
  /** Battle seconds when it fell; blood darkens from it. */
  t: number;
  blood: boolean;
}

interface FieldGl {
  gl: WebGL2RenderingContext;
  base: WebGLProgram;
  comp: WebGLProgram;
  ub: Record<string, WebGLUniformLocation | null>;
  uc: Record<string, WebGLUniformLocation | null>;
  vao: WebGLVertexArrayObject;
  marks: WebGLTexture;
  baseT: Target | null;
  /** The ground with its marks, as last composed; blitted into the scene each frame. */
  compT: Target | null;
  key: string;
  compKey: string;
  /** Wall-clock ms and battle second of the last composition; whether marks changed since. */
  compAt: number;
  compNow: number;
  marksChanged: boolean;
  sheets: Map<number, WebGLTexture>;
  standards: Map<number, WebGLTexture>;
}

const TILE = 64;
/** Decals are kept in buckets of the map (so a frame looks only at those in view), each holding
 * at most so many, the oldest overwritten: a trampled spot keeps its newest hoofprints. */
const BUCKET_W = 96;
const BUCKET_H = 48;
const MAX_DECALS = 700;
const MAX_HOOVES = 120;

interface Bucket {
  decals: Decal[];
  decalAt: number;
  hooves: Decal[];
  hoofAt: number;
}

export class HdField {
  readonly W: number;
  readonly H: number;
  /** RGBA per map px: blood, wear, unused, time of the last blood (seconds / 2). */
  readonly marks: Uint8Array;
  private readonly tilesX: number;
  private readonly dirty: Uint8Array;
  private anyDirty = true;
  /** Decals added since the batch was last filled (appended without a rebuild). */
  private fresh: Decal[] = [];
  private decalKey = '';
  private decalBatch: Batch | null = null;
  private readonly bucketsX: number;
  private readonly buckets: (Bucket | undefined)[];
  private readonly sheets = new Map<number, HdSheet>();
  private readonly stdSheets = new Map<number, ReturnType<typeof buildStandardsHd>>();
  private g: FieldGl | null = null;

  constructor(
    private readonly ground: Ground,
    private readonly armies: readonly [StdArmy, StdArmy] = [
      { hue: 0, faction: 'templar' },
      { hue: 200, faction: 'templar' },
    ],
  ) {
    this.W = ground.w;
    this.H = ground.h;
    this.marks = new Uint8Array(this.W * this.H * 4);
    this.tilesX = Math.ceil(this.W / TILE);
    this.dirty = new Uint8Array(this.tilesX * Math.ceil(this.H / TILE)).fill(1);
    this.bucketsX = Math.ceil(this.W / BUCKET_W);
    this.buckets = new Array(this.bucketsX * Math.ceil(this.H / BUCKET_H));
  }

  // ------------------------------------------------------------------ marks (map px)

  /**
   * Adds to the marks in a soft ellipse rx × rx/2 map px (flat on the iso ground) around (x, y):
   * `blood` and `wear` 0..1 at the centre; `t` the battle second (blood darkens from it).
   */
  mark(x: number, y: number, rx: number, blood: number, wear: number, t: number): void {
    const ry = rx * 0.5;
    const x0 = Math.max(0, Math.floor(x - rx));
    const x1 = Math.min(this.W - 1, Math.ceil(x + rx));
    const y0 = Math.max(0, Math.floor(y - ry));
    const y1 = Math.min(this.H - 1, Math.ceil(y + ry));
    if (x0 > x1 || y0 > y1) return;
    const m = this.marks;
    const tb = Math.min(255, Math.max(1, Math.round(t / 2)));
    const ab = blood * 255;
    const aw = wear * 255;
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5 - x) / rx;
        const dy = (py + 0.5 - y) / ry;
        const q = dx * dx + dy * dy;
        if (q >= 1) continue;
        const f = (1 - q) * (1 - q) * 0.6 + (1 - q) * 0.4;
        const i = (py * this.W + px) * 4;
        if (ab > 0) {
          m[i] = Math.min(255, m[i]! + ab * f);
          if (m[i + 3]! < tb) m[i + 3] = tb;
        }
        if (aw > 0) m[i + 1] = Math.min(255, m[i + 1]! + aw * f);
      }
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) this.dirty[ty * this.tilesX + tx] = 1;
    this.anyDirty = true;
  }

  /** New decals in view: compose the ground again (at most five times a second). */
  decalsChanged(): void {
    if (this.g) this.g.marksChanged = true;
  }

  /** How bloody the ground is at a map point, 0..1 (for placing pools). */
  bloodAt(x: number, y: number): number {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.W || py >= this.H) return 0;
    return this.marks[(py * this.W + px) * 4]! / 255;
  }

  // ------------------------------------------------------------------ decals

  decal(name: string, x: number, y: number, t: number, blood = false): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const d: Decal = { id: fxId(name), x, y, t, blood };
    this.fresh.push(d);
    const i = Math.floor(y / BUCKET_H) * this.bucketsX + Math.floor(x / BUCKET_W);
    const b = (this.buckets[i] ??= { decals: [], decalAt: 0, hooves: [], hoofAt: 0 });
    if (name.startsWith('hoof')) {
      if (b.hooves.length < MAX_HOOVES) b.hooves.push(d);
      else b.hooves[b.hoofAt++ % MAX_HOOVES] = d;
    } else if (b.decals.length < MAX_DECALS) b.decals.push(d);
    else b.decals[b.decalAt++ % MAX_DECALS] = d;
  }

  /** Decals on the ground, for tests and tools. */
  get decalCount(): number {
    let n = 0;
    for (const b of this.buckets) if (b) n += b.decals.length + b.hooves.length;
    return n;
  }

  /**
   * Fills `batch` with the decals in view (map px window), from the level-L sheet. With the same
   * view and less than two seconds of ageing since the last fill, only the decals added since are
   * appended. Returns false (the batch as it was) when nothing changed.
   */
  buildDecals(batch: Batch, L: number, x0: number, x1: number, y0: number, y1: number, now: number): boolean {
    const key = `${L}:${Math.floor(x0)}:${Math.floor(y0)}:${Math.floor(x1)}:${Math.floor(y1)}:${Math.floor(now / 2)}`;
    const regions = this.sheet(L).regions;
    const put = (list: Decal[]) => {
      for (const d of list) {
        if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
        const r = regions[d.id]!;
        // Blood darkens from red to maroon-brown over about a minute.
        const age = d.blood ? Math.min(1, Math.max(0, (now - d.t) / 50)) : 0;
        const k = 1 - age * 0.45;
        batch.sprite(Math.round(d.x * L) / L, Math.round(d.y * L) / L, r.u, r.v, r.w / L, r.h / L, r.ax / L, r.ay / L, -1e6, k, k * (1 - age * 0.25), k * (1 - age * 0.15), 1, 0, 1);
      }
    };
    if (key === this.decalKey && batch === this.decalBatch) {
      if (this.fresh.length === 0) return false;
      put(this.fresh);
      this.fresh.length = 0;
      return true;
    }
    this.decalKey = key;
    this.decalBatch = batch;
    this.fresh.length = 0;
    batch.clear();
    const bx0 = Math.max(0, Math.floor(x0 / BUCKET_W));
    const bx1 = Math.min(this.bucketsX - 1, Math.floor(x1 / BUCKET_W));
    const by0 = Math.max(0, Math.floor(y0 / BUCKET_H));
    const by1 = Math.min(Math.floor((this.H - 1) / BUCKET_H), Math.floor(y1 / BUCKET_H));
    // Hoofprints first, under the blood and arrows.
    for (const pass of [0, 1])
      for (let by = by0; by <= by1; by++)
        for (let bx = bx0; bx <= bx1; bx++) {
          const b = this.buckets[by * this.bucketsX + bx];
          if (b) put(pass === 0 ? b.hooves : b.decals);
        }
    return true;
  }

  // ------------------------------------------------------------------ sheets

  /** The HD effects sheet at level L, painted on first use. */
  sheet(L: number): HdSheet {
    let s = this.sheets.get(L);
    if (!s) {
      s = buildFxHd(L);
      this.sheets.set(L, s);
    }
    return s;
  }

  /** The sheet's texture on the GPU. */
  sheetTexture(gl: WebGL2RenderingContext, L: number): WebGLTexture {
    const g = this.attach(gl);
    let t = g.sheets.get(L);
    if (!t) {
      const s = this.sheet(L);
      t = texturePixels(gl, s.w, s.h, s.pixels);
      g.sheets.set(L, t);
    }
    return t;
  }

  /** The two armies' standards at level L (the same names as the classic fx sheet). */
  standards(L: number): ReturnType<typeof buildStandardsHd> {
    let s = this.stdSheets.get(L);
    if (!s) {
      s = buildStandardsHd(this.armies, L);
      this.stdSheets.set(L, s);
    }
    return s;
  }

  standardsTexture(gl: WebGL2RenderingContext, L: number): WebGLTexture {
    const g = this.attach(gl);
    let t = g.standards.get(L);
    if (!t) {
      const s = this.standards(L);
      t = texturePixels(gl, s.w, s.h, s.pixels);
      g.standards.set(L, t);
    }
    return t;
  }

  // ------------------------------------------------------------------ GL

  private attach(gl: WebGL2RenderingContext): FieldGl {
    if (this.g && this.g.gl === gl) return this.g;
    const base = compile(gl, VS, BASE_FS);
    const comp = compile(gl, VS, MARKS_FS);
    const ub: Record<string, WebGLUniformLocation | null> = {};
    const uc: Record<string, WebGLUniformLocation | null> = {};
    for (const k of ['u_cam', 'u_m', 'u_seed', 'u_org', 'u_salt', 'u_road']) ub[k] = gl.getUniformLocation(base, k);
    for (const k of ['u_cam', 'u_m', 'u_seed', 'u_base', 'u_marks', 'u_msize', 'u_now']) uc[k] = gl.getUniformLocation(comp, k);
    const marks = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, marks);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.W, this.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.marks);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.dirty.fill(0);
    this.anyDirty = false;
    this.g = { gl, base, comp, ub, uc, vao: gl.createVertexArray()!, marks, baseT: null, compT: null, key: '', compKey: '', compAt: -1e9, compNow: -1e9, marksChanged: true, sheets: new Map(), standards: new Map() };
    return this.g;
  }

  /** The context was lost: every GL object is gone (the CPU copies remain). */
  lost(): void {
    this.g = null;
  }

  dispose(): void {
    const g = this.g;
    this.g = null;
    if (!g || g.gl.isContextLost()) return;
    const gl = g.gl;
    gl.deleteProgram(g.base);
    gl.deleteProgram(g.comp);
    gl.deleteVertexArray(g.vao);
    gl.deleteTexture(g.marks);
    if (g.baseT) dropTarget(gl, g.baseT);
    if (g.compT) dropTarget(gl, g.compT);
    for (const t of [...g.sheets.values(), ...g.standards.values()]) gl.deleteTexture(t);
  }

  private upload(g: FieldGl): void {
    if (!this.anyDirty) return;
    const gl = g.gl;
    gl.bindTexture(gl.TEXTURE_2D, g.marks);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.W);
    for (let i = 0; i < this.dirty.length; i++) {
      if (!this.dirty[i]) continue;
      this.dirty[i] = 0;
      const tx = (i % this.tilesX) * TILE;
      const ty = Math.floor(i / this.tilesX) * TILE;
      const w = Math.min(TILE, this.W - tx);
      const h = Math.min(TILE, this.H - ty);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, tx);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, ty);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, tx, ty, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.marks);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    this.anyDirty = false;
    g.marksChanged = true;
  }

  /**
   * Draws the ground with its marks into `scene` (bw × bh buffer px whose top-left is map px
   * (camX, camY), m buffer px per map px). Leaves `scene` bound.
   *
   * Both passes are cached: the ground is painted when the view moves, the marks laid over it
   * when the view moves or, at most five times a second, when they changed (and every couple of
   * seconds as blood ages); every other frame the composition is only copied into the scene.
   */
  drawGround(gl: WebGL2RenderingContext, scene: Target, camX: number, camY: number, bw: number, bh: number, m: number, now: number, decals: () => void): void {
    const g = this.attach(gl);
    this.upload(g);
    const gr = this.ground;
    const nz = gr.noise;
    const seed = (nz.seed * 2654435761) >>> 0;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(g.vao);
    const key = `${camX}:${camY}:${bw}:${bh}:${m}`;
    const sized = (t: Target | null) => {
      if (t && (t.w !== bw || t.h !== bh)) {
        dropTarget(gl, t);
        t = null;
      }
      return t ?? target(gl, bw, bh, false);
    };
    // The ground itself, redrawn only when the view moved or resized.
    if (!g.baseT || g.key !== key) {
      g.baseT = sized(g.baseT);
      g.key = key;
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.baseT.fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(g.base);
      gl.uniform2f(g.ub.u_cam!, camX, camY);
      gl.uniform1f(g.ub.u_m!, m);
      gl.uniform1ui(g.ub.u_seed!, seed);
      gl.uniform2f(g.ub.u_org!, gr.ox, gr.oy);
      gl.uniform4ui(g.ub.u_salt!, nz.salts[0], nz.salts[1], nz.salts[2], nz.salts[3]);
      gl.uniform3f(g.ub.u_road!, nz.roadY0, nz.roadBend, nz.roadPhase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const wall = typeof performance !== 'undefined' ? performance.now() : 0;
    // Throttled by both clocks: at most every 0.3 s of wall time and 0.6 battle
    // seconds (a slow frame rate should not recompose every frame).
    const stale = g.compKey !== key || !g.compT || (g.marksChanged && wall - g.compAt > 300 && Math.abs(now - g.compNow) >= 0.6) || Math.abs(now - g.compNow) > 2;
    if (stale) {
      g.compT = sized(g.compT);
      g.compKey = key;
      g.compAt = wall;
      g.compNow = now;
      g.marksChanged = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.compT.fbo);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(g.comp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, g.baseT.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, g.marks);
      gl.uniform1i(g.uc.u_base!, 0);
      gl.uniform1i(g.uc.u_marks!, 1);
      gl.uniform2f(g.uc.u_cam!, camX, camY);
      gl.uniform1f(g.uc.u_m!, m);
      gl.uniform1ui(g.uc.u_seed!, seed);
      gl.uniform2f(g.uc.u_msize!, this.W, this.H);
      gl.uniform1f(g.uc.u_now!, now);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
      // The decals, baked in flat (thousands of them late in a battle: not redrawn each frame).
      decals();
    }
    gl.bindVertexArray(null);
    // Copy the composition into the scene buffer.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, g.compT!.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.fbo);
    gl.blitFramebuffer(0, 0, bw, bh, 0, 0, bw, bh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, bw, bh);
  }
}
