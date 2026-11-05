// The battlefield in the HD art: the ground and everything that marks it, drawn at the same texel
// density as the figures (one map pixel = m texels, m = 1, 2, 4 or 8 by zoom), never upscaled.
//
//   - The ground is painted by a shader straight into the scene buffer, texel by texel, from the
//     same value noise as the classic ground (ground.ts), so the field keeps its zones of grass,
//     dry grass, bare earth and mud, and its road. At each texel it adds what a level-m painter
//     would: tufts of blades lit on one side, stones lit upper left with a contact shadow, pebbles,
//     flowers, cracks, short grass strokes. That pass is cached and only redrawn when the view moves.
//   - The marks: a map-pixel field on the CPU (uploaded by dirty tiles) of blood soaked into the
//     soil (R), how trodden and churned the ground is (G), the undead's dark ichor (B, drawn as
//     blood is but near black, never red) and when blood or ichor last fell there (A). A
//     second pass, every frame, thresholds that smooth field per texel against a jitter noise, so
//     a pool has a crisp, clotted, ragged edge at any level: soaked soil darkens, a pool forms, its
//     rim clots dark, fresh blood is red and wet (a glint on the lit lip) and darkens to maroon and
//     brown over a minute; trodden grass flattens and pales, heavy fighting churns it into lumpy mud.
//   - Decals that need their shape (blood splatter, stuck arrows, craters, hoofprints) are kept in
//     a list and drawn each frame from the HD effects sheet (fx-hd.ts), blood tinted by its age.
//
// All of it lives on the CPU too, so a lost WebGL context is rebuilt from it.

import { FIELD_H, FIELD_W } from '../../game/battle.ts';
import { buildFxHd, fxId, HOOVES, type HdSheet } from './fx-hd.ts';
import { compile, dropTarget, INST, target, texturePixels, type Batch, type Target } from './gl.ts';
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
  if (mk.r + mk.g + mk.b < 0.004) { o = vec4(c, 1.0); return; }
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
  // Ichor (B) soaks and pools as blood does; its share of the wet sets the colour.
  float wet = mk.r + mk.b;
  float ich = mk.b / max(wet, 0.004);
  float bl = wet + (sj - 0.5) * 0.32 + (hj - 0.5) * 0.05;
  float age = clamp((u_now - mk.a * 510.0) / 50.0, 0.0, 1.0);
  // A thin stain soaks into the earth as it dries: from a red tint to the soil darkened, and the
  // thin rim of a pool sinks into it, so old blood reads as dark ground, not red marks.
  if (bl > 0.14 + age * 0.04) c *= mix(mix(vec3(0.66, 0.42, 0.38), vec3(0.62, 0.53, 0.47), age), mix(vec3(0.5, 0.52, 0.44), vec3(0.62, 0.58, 0.52), age), ich);
  if (bl > 0.3 + age * 0.06) {
    vec3 pool = bl > 0.62 ? mix(hex(0x520f0c), hex(0x2c1610), age) : mix(hex(0x6c1612), hex(0x3c1a12), age);
    if (bl < 0.37) pool = mix(hex(0x420c0a), hex(0x261410), age);
    // A wet glint on the lit lip of fresh blood: where the field falls off toward the upper left.
    if (age < 0.45 && ich < 0.5 && bl > 0.4 && bl < 0.6 && hj < 0.55) {
      float up = texture(u_marks, (p - vec2(0.7, 0.45)) / u_msize).r;
      if (up < mk.r - 0.06) pool = hex(0xa23a2c);
    }
    // Ichor: a black, faintly green slick, going dull as it soaks in.
    vec3 slick = bl > 0.62 ? mix(hex(0x1c2016), hex(0x221e18), age) : mix(hex(0x262a1c), hex(0x2c271e), age);
    c = mix(pool, slick, ich);
  }
  o = vec4(c, 1.0);
}`;

// Zoomed out (scene.ts view.direct): the view copied out of the cache onto a target the canvas's
// size, each device px the cache px the post pass would pick from a buffer (post.ts fetch()).
const COPY_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform vec4 u_dir;   // device px offset of the virtual buffer (x, y), device px per buffer px
uniform vec4 u_dirb;  // the virtual buffer's size, and the cache texel at its top-left
uniform ivec2 u_cs;   // the cache's size
out vec4 o;
void main() {
  vec2 cell = clamp(floor((gl_FragCoord.xy - u_dir.xy) / u_dir.z), vec2(0.0), u_dirb.xy - 1.0);
  // (% of a negative int is undefined: lift it first; the view is within a few caches of 0)
  o = texelFetch(u_src, (ivec2(u_dirb.zw + cell) + u_cs * 64) % u_cs, 0);
}`;

/** A ground decal: a sprite of the HD sheet stamped flat on the ground. */
interface Decal {
  id: number;
  x: number;
  y: number;
  /** Battle seconds when it fell; blood darkens from it. */
  t: number;
  blood: boolean;
  /** Its instance in the decal batch of generation `gen` (-1: not in it). */
  slot: number;
  gen: number;
}

/** The first hoofprint's sprite id (hoofprints have their own, smaller ring per bucket). */
const HOOF0 = fxId('hoof0');
const isHoof = (id: number) => id >= HOOF0 && id < HOOF0 + HOOVES;
/** Blood decals darken over this many battle seconds (and the marks' blood with them). */
const BLOOD_AGE_S = 50;
/** The clock blood is drawn at: battle seconds in steps of this, so all of it ages in step. */
const AGE_STEP_S = 2;

interface FieldGl {
  gl: WebGL2RenderingContext;
  base: WebGLProgram;
  comp: WebGLProgram;
  copy: WebGLProgram;
  ucopy: Record<string, WebGLUniformLocation | null>;
  ub: Record<string, WebGLUniformLocation | null>;
  uc: Record<string, WebGLUniformLocation | null>;
  vao: WebGLVertexArrayObject;
  marks: WebGLTexture;
  /**
   * The ground cache (see plan() and drawGround()): the ground (pass A) and the ground with its
   * marks and decals (pass B) over a window of tiles around the view, in slots that wrap.
   */
  baseT: Target | null;
  compT: Target | null;
  /** Its level (texels per map px) and size in tiles across and down; cm -1: empty. */
  cm: number;
  nx: number;
  ny: number;
  /** Per cache slot, the world tile (tileKey) its ground and its composition hold, or NO_TILE. */
  baseOwn: Int32Array;
  compOwn: Int32Array;
  /**
   * Wall-clock ms and battle second of the last composition, and the blood clock it drew
   * (battle seconds in AGE_STEP_S steps).
   */
  compAt: number;
  compNow: number;
  compAge: number;
  sheets: Map<number, WebGLTexture>;
  standards: Map<number, WebGLTexture>;
}

const TILE = 64;
/** Ground cache tiles, in buffer texels. */
const CT = 128;
/** The most texels a ground cache target holds (two of them: 64 MB each at most). */
const MAX_CACHE_PX = 16 * 1024 * 1024;
const NO_TILE = -1;
/** A world tile (texel tile coordinates, which may be negative) as one int. */
const tileKey = (tx: number, ty: number) => (ty + 4096) * 8192 + (tx + 4096);
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Texels of margin tiles painted a frame, as a share of the view's area (4 tiles at least). */
const PREFETCH_SHARE = 0.25;
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
  private readonly tilesY: number;
  /** Map tiles whose marks changed since the marks texture was last updated. */
  private readonly dirty: Uint8Array;
  private anyDirty = true;
  /** Map tiles whose look (marks or decals) changed since the ground was last composed. */
  private readonly cdirty: Uint8Array;
  private anyCdirty = true;
  /** Per map tile, the battle second blood last fell there (its colour ages for BLOOD_AGE_S). */
  private readonly bloodT: Float32Array;
  /**
   * Decals added since the batch was last filled, each with the decal its ring slot overwrote
   * (or null): they go into the batch without a rebuild, a new one taking the slot of the one it
   * replaced, so the batch holds what a rebuild would.
   */
  private fresh: Decal[] = [];
  private freshOld: (Decal | null)[] = [];
  private decalKey = '';
  private decalBatch: Batch | null = null;
  private decalGen = 0;
  /** Batch instances rewritten in place since the last upload. */
  private rewritten: number[] = [];
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
    this.tilesY = Math.ceil(this.H / TILE);
    this.dirty = new Uint8Array(this.tilesX * this.tilesY).fill(1);
    this.cdirty = new Uint8Array(this.tilesX * this.tilesY).fill(1);
    this.bloodT = new Float32Array(this.tilesX * this.tilesY).fill(-1e9);
    this.bucketsX = Math.ceil(this.W / BUCKET_W);
    this.buckets = new Array(this.bucketsX * Math.ceil(this.H / BUCKET_H));
  }

  // ------------------------------------------------------------------ marks (map px)

  /**
   * Adds to the marks in a soft ellipse rx × rx/2 map px (flat on the iso ground) around (x, y):
   * `blood` and `wear` 0..1 at the centre; `t` the battle second (blood darkens from it);
   * `ichor` 0..1, the undead's dark ichor, soaks and ages as blood does.
   */
  mark(x: number, y: number, rx: number, blood: number, wear: number, t: number, ichor = 0): void {
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
    const ai = ichor * 255;
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
        if (ai > 0) {
          m[i + 2] = Math.min(255, m[i + 2]! + ai * f);
          if (m[i + 3]! < tb) m[i + 3] = tb;
        }
      }
    // The compose pass samples the marks with a linear filter and looks a little up-left (the
    // wet lip): a tile's look can change from a mark up to 2 px past its edge.
    this.touch(x0 - 2, x1 + 2, y0 - 2, y1 + 2, blood > 0 || ichor > 0 ? t : -1, true);
  }

  /** Flags the tiles over map box [x0, x1] × [y0, y1] to compose again (and, `marks`, to upload). */
  private touch(x0: number, x1: number, y0: number, y1: number, bloodT: number, marks: boolean): void {
    const tx0 = Math.max(0, Math.floor(x0 / TILE));
    const tx1 = Math.min(this.tilesX - 1, Math.floor(x1 / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE));
    const ty1 = Math.min(this.tilesY - 1, Math.floor(y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * this.tilesX + tx;
        if (marks) this.dirty[i] = 1;
        this.cdirty[i] = 1;
        if (bloodT > this.bloodT[i]!) this.bloodT[i] = bloodT;
      }
    if (marks) this.anyDirty = true;
    this.anyCdirty = true;
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
    this.decalId(fxId(name), x, y, t, blood);
  }

  /** A decal by sprite id (fxId), so a caller in a loop builds no names. */
  decalId(id: number, x: number, y: number, t: number, blood = false): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const d: Decal = { id, x, y, t, blood, slot: -1, gen: -1 };
    const i = Math.floor(y / BUCKET_H) * this.bucketsX + Math.floor(x / BUCKET_W);
    const b = (this.buckets[i] ??= { decals: [], decalAt: 0, hooves: [], hoofAt: 0 });
    let old: Decal | null = null;
    if (isHoof(id)) {
      if (b.hooves.length < MAX_HOOVES) b.hooves.push(d);
      else {
        const k = b.hoofAt++ % MAX_HOOVES;
        old = b.hooves[k]!;
        b.hooves[k] = d;
      }
    } else if (b.decals.length < MAX_DECALS) b.decals.push(d);
    else {
      const k = b.decalAt++ % MAX_DECALS;
      old = b.decals[k]!;
      b.decals[k] = d;
    }
    this.fresh.push(d);
    this.freshOld.push(old);
    // The ground under it (and under the one it replaced) is composed again.
    const r = this.sheet(1).regions[id]!;
    this.touch(x - r.ax - 1, x - r.ax + r.w + 1, y - r.ay - 1, y - r.ay + r.h + 1, blood ? t : -1, false);
    if (old) this.touch(old.x - 16, old.x + 16, old.y - 16, old.y + 16, -1, false);
  }

  /** Decals on the ground, for tests and tools. */
  get decalCount(): number {
    let n = 0;
    for (const b of this.buckets) if (b) n += b.decals.length + b.hooves.length;
    return n;
  }

  /**
   * Fills `batch` with the decals in view (map px window), from the level-L sheet, and sends it to
   * the GPU. A blood decal carries the second it fell and the sprite shader darkens it with age
   * (mode 2), so ageing needs no refill. With the same view only the decals added since go in: a
   * new one takes the instance of the one it overwrote, else it is appended. Returns false (the
   * batch as it was) when nothing changed.
   */
  buildDecals(batch: Batch, L: number): boolean {
    // The decals over the cache window (plan()), and a quarter of it more each way, so a scroll
    // refills the batch only every quarter window.
    const p = this.pl;
    const need0 = (p.wx0 * CT) / L - 24;
    const need1 = ((p.wx0 + p.nx) * CT) / L + 24;
    const needY0 = (p.wy0 * CT) / L - 12;
    const needY1 = ((p.wy0 + p.ny) * CT) / L + 24;
    const e = this.decalExt;
    if (e.L !== L || need0 < e.x0 || need1 > e.x1 || needY0 < e.y0 || needY1 > e.y1) {
      const padX = (p.nx * CT) / L / 4;
      const padY = (p.ny * CT) / L / 4;
      e.L = L;
      e.x0 = Math.floor(need0 - padX);
      e.x1 = Math.ceil(need1 + padX);
      e.y0 = Math.floor(needY0 - padY);
      e.y1 = Math.ceil(needY1 + padY);
    }
    const { x0, x1, y0, y1 } = e;
    const key = `${L}:${x0}:${y0}:${x1}:${y1}`;
    const regions = this.sheet(L).regions;
    let gen = this.decalGen;
    const put = (d: Decal, slot: number) => {
      const inView = d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1;
      if (slot < 0) {
        if (!inView) return;
        slot = batch.n;
        batch.alloc();
      }
      const o = slot * INST;
      const r = regions[d.id]!;
      const D = batch.data;
      d.slot = slot;
      d.gen = gen;
      D[o] = Math.round(d.x * L) / L;
      D[o + 1] = Math.round(d.y * L) / L;
      // Out of view (it replaced one in view): an empty quad.
      D[o + 2] = inView ? r.w / L : 0;
      D[o + 3] = inView ? r.h / L : 0;
      D[o + 4] = r.u;
      D[o + 5] = r.v;
      D[o + 6] = r.ax / L;
      D[o + 7] = r.ay / L;
      D[o + 8] = D[o + 9] = D[o + 10] = D[o + 11] = 1;
      D[o + 12] = -1e6;
      // Blood: the second it fell, and mode 2 (tinted by age in the shader).
      D[o + 13] = d.blood ? d.t : 0;
      D[o + 14] = d.blood ? 2 : 0;
      D[o + 15] = 1;
    };
    if (key === this.decalKey && batch === this.decalBatch) {
      if (this.fresh.length === 0) return false;
      const n0 = batch.n;
      const rw = this.rewritten;
      rw.length = 0;
      for (let i = 0; i < this.fresh.length; i++) {
        const d = this.fresh[i]!;
        const old = this.freshOld[i];
        if (old && old.gen === gen && old.slot >= 0) {
          put(d, old.slot);
          old.slot = -1;
          rw.push(d.slot);
        } else put(d, -1);
      }
      this.fresh.length = 0;
      this.freshOld.length = 0;
      if (batch.n === n0 && rw.length === 0) return false;
      // The appended tail, and the rewritten instances in runs: a bucket's decals sit together
      // in the batch and its ring is overwritten in order, so they cluster.
      batch.upload(n0);
      rw.sort((p, q) => p - q);
      for (let i = 0; i < rw.length; ) {
        let j = i;
        while (j + 1 < rw.length && rw[j + 1]! - rw[j]! <= 8) j++;
        batch.uploadRange(rw[i]!, rw[j]! + 1);
        i = j + 1;
      }
      return true;
    }
    this.decalKey = key;
    this.decalBatch = batch;
    this.decalGen = ++gen;
    this.fresh.length = 0;
    this.freshOld.length = 0;
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
          if (b) for (const d of pass === 0 ? b.hooves : b.decals) put(d, -1);
        }
    batch.upload();
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
    const copy = compile(gl, VS, COPY_FS);
    const ucopy: Record<string, WebGLUniformLocation | null> = {};
    for (const k of ['u_src', 'u_dir', 'u_dirb', 'u_cs']) ucopy[k] = gl.getUniformLocation(copy, k);
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
    this.g = { gl, base, comp, copy, ucopy, ub, uc, vao: gl.createVertexArray()!, marks, baseT: null, compT: null, cm: -1, nx: 0, ny: 0, baseOwn: new Int32Array(0), compOwn: new Int32Array(0), compAt: -1e9, compNow: -1e9, compAge: -1e9, sheets: new Map(), standards: new Map() };
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
    gl.deleteProgram(g.copy);
    gl.deleteVertexArray(g.vao);
    gl.deleteTexture(g.marks);
    if (g.baseT) dropTarget(gl, g.baseT);
    if (g.compT) dropTarget(gl, g.compT);
    for (const t of [...g.sheets.values(), ...g.standards.values()]) gl.deleteTexture(t);
  }

  /** Sends the changed tiles of the marks to the GPU, a run of tiles along a row at a time. */
  private upload(g: FieldGl): void {
    if (!this.anyDirty) return;
    const gl = g.gl;
    gl.bindTexture(gl.TEXTURE_2D, g.marks);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.W);
    for (let ty = 0; ty < this.tilesY; ty++)
      for (let tx = 0; tx < this.tilesX; tx++) {
        if (!this.dirty[ty * this.tilesX + tx]) continue;
        let tx1 = tx;
        while (tx1 + 1 < this.tilesX && this.dirty[ty * this.tilesX + tx1 + 1]) tx1++;
        for (let k = tx; k <= tx1; k++) this.dirty[ty * this.tilesX + k] = 0;
        const x = tx * TILE;
        const y = ty * TILE;
        const w = Math.min((tx1 + 1) * TILE, this.W) - x;
        const h = Math.min(TILE, this.H - y);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.marks);
        tx = tx1;
      }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    this.anyDirty = false;
  }

  /** Whether a draw at battle second `now` would compose the ground again (marks or decals waiting). */
  composePending(now: number): boolean {
    const g = this.g;
    if (!g) return false;
    if (this.prefetching) return true;
    if (!this.anyCdirty) return false;
    return Math.abs(now - g.compNow) >= 0.6 || Math.floor(now / AGE_STEP_S) * AGE_STEP_S !== g.compAge;
  }

  /**
   * Tools: composes the ground at the next draw, from scratch (`full`), or just what changed since
   * the last composition (no throttle). The two must give the same picture.
   */
  invalidate(full: boolean): void {
    if (!this.g) return;
    if (full) this.g.cm = -1;
    else this.g.compAt = this.g.compNow = -1e9;
  }

  // ------------------------------------------------------------------ the ground cache
  //
  // The ground (pass A) and its composition (pass B, with the decals) are kept over a window of
  // CT × CT texel tiles a little larger than the view: about half a screen beyond each edge, more
  // ahead of the way the view is scrolling. Each world tile has a fixed slot in the cache targets
  // (its tile coordinates modulo the cache's size in tiles), so the window slides over them like a
  // ring: as the view moves only the tiles entering the window are painted, the tiles in view at
  // once and the margin a share of the view's area a frame, nearest first. The view is copied out
  // of the cache (up to four rectangles where it wraps). Scrolling meets painted ground, and a
  // static view repaints nothing.

  /** The cache window for this frame (plan()). */
  private readonly pl = { m: -1, nx: 0, ny: 0, bw: 0, bh: 0, cx: 0, cy: 0, wx0: 0, wy0: 0, vx: 0, vy: 0, pcx: 0, pcy: 0 };
  /** Whether some tile of the window is still to be painted (the margin, a share a frame). */
  private prefetching = false;
  /** The map box the decal batch was filled for (buildDecals), and its level. */
  private readonly decalExt = { L: -1, x0: 0, y0: 0, x1: 0, y1: 0 };
  /** Reused per frame: what each slot needs (1 base and composition, 2 composition), candidates, runs. */
  private todo = new Uint8Array(0);
  private cand = new Float64Array(0);
  private readonly baseRuns: number[] = [];
  private readonly compRuns: number[] = [];

  /**
   * Places the cache window for a view of bw × bh buffer px whose top-left is map px (camX, camY)
   * at m texels per map px. Call once a frame, before buildDecals and drawGround.
   */
  plan(camX: number, camY: number, bw: number, bh: number, m: number): void {
    const p = this.pl;
    const vtx = Math.ceil(bw / CT) + 1;
    const vty = Math.ceil(bh / CT) + 1;
    // The whole ground (plus a tile for misalignment) is the most a window needs.
    const gtx = Math.ceil((this.W * m) / CT) + 1;
    const gty = Math.ceil((this.H * m) / CT) + 1;
    let nx = Math.max(vtx, Math.min(vtx + 2 * Math.ceil(bw / 2 / CT), gtx));
    let ny = Math.max(vty, Math.min(vty + 2 * Math.ceil(bh / 2 / CT), gty));
    while (nx * ny * CT * CT > MAX_CACHE_PX && (nx > vtx || ny > vty)) {
      if (nx - vtx >= ny - vty && nx > vtx) nx--;
      else ny--;
    }
    const cx = Math.round(camX * m);
    const cy = Math.round(camY * m);
    // Scroll velocity in texels a frame, smoothed; a jump (a click on the minimap, a zoom) is not a scroll.
    if (p.m === m && p.bw === bw && p.bh === bh) {
      const dx = cx - p.pcx;
      const dy = cy - p.pcy;
      p.vx = Math.abs(dx) > bw ? 0 : p.vx * 0.6 + dx * 0.4;
      p.vy = Math.abs(dy) > bh ? 0 : p.vy * 0.6 + dy * 0.4;
    } else p.vx = p.vy = 0;
    p.pcx = cx;
    p.pcy = cy;
    const place = (c: number, b: number, n: number, v: number, groundTiles: number) => {
      const v0 = Math.floor(c / CT);
      const v1 = Math.floor((c + b - 1) / CT);
      const slack = n - (v1 - v0 + 1);
      const half = Math.floor(slack / 2);
      // Up to all of the slack ahead when scrolling at CT/16 texels a frame or faster.
      const lead = Math.round(Math.max(-1, Math.min(1, (v * 16) / CT)) * half);
      let w0 = v0 - (half - lead);
      // Not past the ground where the view isn't.
      const lo = Math.min(v0, 0);
      const hi = Math.max(v1 + 1, groundTiles - 1);
      w0 = Math.max(lo, Math.min(hi - n, w0));
      return Math.max(v1 + 1 - n, Math.min(v0, w0));
    };
    p.m = m;
    p.nx = nx;
    p.ny = ny;
    p.bw = bw;
    p.bh = bh;
    p.cx = cx;
    p.cy = cy;
    p.wx0 = place(cx, bw, nx, p.vx, gtx);
    p.wy0 = place(cy, bh, ny, p.vy, gty);
  }

  /**
   * Draws the ground with its marks into `scene` (the view planned by plan(): bw × bh buffer px
   * whose top-left is map px (camX, camY), m buffer px per map px). Leaves `scene` bound.
   * `decals(age, camX, camY, w, h)` draws the decal batch (blood tinted at battle second `age`)
   * into the bound w × h target whose top-left is map px (camX, camY).
   *
   * The ground cache (above) is painted where the window has no ground yet. The composition is
   * redrawn, every 0.6 battle seconds at most, on the cache tiles under map tiles marked or
   * decalled since (the marks texture is sent only then, a row of tiles at a time). Blood is
   * coloured at a clock that moves in AGE_STEP_S steps; at each step the tiles whose blood is
   * still darkening are composed again, all at the same clock, so neighbouring tiles never differ
   * in age. Every other frame the view is only copied out of the cache.
   */
  drawGround(
    gl: WebGL2RenderingContext,
    scene: Target,
    camX: number,
    camY: number,
    bw: number,
    bh: number,
    m: number,
    now: number,
    direct: { W: number; H: number; u: number; offX: number; offY: number } | null,
    decals: (age: number, camX: number, camY: number, w: number, h: number) => void,
  ): void {
    const g = this.attach(gl);
    const p = this.pl;
    if (p.m !== m || p.bw !== bw || p.bh !== bh || p.cx !== Math.round(camX * m) || p.cy !== Math.round(camY * m)) this.plan(camX, camY, bw, bh, m);
    const { nx, ny, wx0, wy0, cx, cy } = p;
    const CW = nx * CT;
    const CH = ny * CT;
    const gr = this.ground;
    const nz = gr.noise;
    const seed = (nz.seed * 2654435761) >>> 0;
    const wall = typeof performance !== 'undefined' ? performance.now() : 0;
    const age = Math.floor(now / AGE_STEP_S) * AGE_STEP_S;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.bindVertexArray(g.vao);
    if (g.cm !== m || g.nx !== nx || g.ny !== ny || !g.baseT || !g.compT) {
      // A new level or size: an empty cache, composed from now on at this clock.
      if (!g.baseT || g.baseT.w !== CW || g.baseT.h !== CH) {
        if (g.baseT) dropTarget(gl, g.baseT);
        if (g.compT) dropTarget(gl, g.compT);
        g.baseT = target(gl, CW, CH, false);
        g.compT = target(gl, CW, CH, false);
      }
      g.cm = m;
      g.nx = nx;
      g.ny = ny;
      if (g.baseOwn.length !== nx * ny) {
        g.baseOwn = new Int32Array(nx * ny);
        g.compOwn = new Int32Array(nx * ny);
        this.todo = new Uint8Array(nx * ny);
        this.cand = new Float64Array(nx * ny);
      }
      g.baseOwn.fill(NO_TILE);
      g.compOwn.fill(NO_TILE);
      g.compAt = wall;
      g.compNow = now;
      g.compAge = age;
      // Every tile is composed afresh from the marks as they are when it is painted.
      this.cdirty.fill(0);
      this.anyCdirty = false;
    }
    const baseT = g.baseT!;
    const compT = g.compT!;
    const todo = this.todo;
    todo.fill(0);
    const inWin = (tx: number, ty: number) => tx >= wx0 && tx < wx0 + nx && ty >= wy0 && ty < wy0 + ny;
    if (age !== g.compAge) {
      // The blood clock stepped: the tiles whose blood was still darkening at the last one.
      for (let i = 0; i < this.bloodT.length; i++)
        if (this.bloodT[i]! + BLOOD_AGE_S + AGE_STEP_S >= g.compAge) {
          this.cdirty[i] = 1;
          this.anyCdirty = true;
        }
    }
    // Throttled by both clocks: at most every 0.3 s of wall time and 0.6 battle seconds (a slow
    // frame rate should not recompose every frame), but at once when the blood clock steps.
    if (this.anyCdirty && ((wall - g.compAt > 300 && Math.abs(now - g.compNow) >= 0.6) || age !== g.compAge)) {
      // The cache tiles under each changed map tile (a few map px wider: the marks are sampled
      // with a linear filter and a look up-left) are composed again; out of the window, dropped.
      for (let ty = 0; ty < this.tilesY; ty++)
        for (let tx = 0; tx < this.tilesX; tx++) {
          const i = ty * this.tilesX + tx;
          if (!this.cdirty[i]) continue;
          this.cdirty[i] = 0;
          const c0 = Math.floor(((tx * TILE - 3) * m) / CT);
          const c1 = Math.floor((((tx + 1) * TILE + 3) * m - 1) / CT);
          const r0 = Math.floor(((ty * TILE - 3) * m) / CT);
          const r1 = Math.floor((((ty + 1) * TILE + 3) * m - 1) / CT);
          for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++) {
              const slot = mod(r, ny) * nx + mod(c, nx);
              if (g.compOwn[slot] !== tileKey(c, r)) continue;
              if (inWin(c, r)) todo[slot] = 2;
              else g.compOwn[slot] = NO_TILE;
            }
        }
      this.anyCdirty = false;
      g.compAt = wall;
      g.compNow = now;
      g.compAge = age;
    }
    // What the window lacks: in view now, the margin nearest first (ahead of a scroll first).
    const vx0 = Math.floor(cx / CT);
    const vx1 = Math.floor((cx + bw - 1) / CT);
    const vy0 = Math.floor(cy / CT);
    const vy1 = Math.floor((cy + bh - 1) / CT);
    const cand = this.cand;
    let nc = 0;
    for (let ty = wy0; ty < wy0 + ny; ty++)
      for (let tx = wx0; tx < wx0 + nx; tx++) {
        const slot = mod(ty, ny) * nx + mod(tx, nx);
        const key = tileKey(tx, ty);
        const need = g.baseOwn[slot] !== key ? 1 : g.compOwn[slot] !== key ? 2 : 0;
        if (!need) continue;
        const dx = tx < vx0 ? vx0 - tx : tx > vx1 ? tx - vx1 : 0;
        const dy = ty < vy0 ? vy0 - ty : ty > vy1 ? ty - vy1 : 0;
        if (dx === 0 && dy === 0) {
          todo[slot] = need;
          continue;
        }
        // Ahead of the scroll counts as half a tile nearer.
        const ahead = (tx > vx1 && p.vx > 0) || (tx < vx0 && p.vx < 0) || (ty > vy1 && p.vy > 0) || (ty < vy0 && p.vy < 0);
        cand[nc++] = (Math.max(dx, dy) * 2 - (ahead ? 1 : 0)) * 1048576 + slot * 4 + need;
      }
    let budget = Math.max(4, Math.floor((PREFETCH_SHARE * bw * bh) / (CT * CT)));
    if (nc > 0) {
      const sorted = cand.subarray(0, nc).sort();
      for (let k = 0; k < nc && budget > 0; k++, budget--) {
        const v = sorted[k]! % 1048576;
        todo[v >> 2] = v & 3;
      }
    }
    this.prefetching = nc > Math.max(4, Math.floor((PREFETCH_SHARE * bw * bh) / (CT * CT)));
    // Runs of slots along a row (not across the wrap), grown down over the same span: x, y, w,
    // h (cache px), and the world texel minus the cache px over them.
    const runs = (out: number[], want: (t: number) => boolean) => {
      out.length = 0;
      for (let ty = wy0; ty < wy0 + ny; ty++) {
        const sy = mod(ty, ny);
        for (let tx = wx0; tx < wx0 + nx; tx++) {
          const sx = mod(tx, nx);
          if (!want(todo[sy * nx + sx]!)) continue;
          let e = tx;
          while (e + 1 < wx0 + nx && mod(e + 1, nx) !== 0 && want(todo[sy * nx + mod(e + 1, nx)]!)) e++;
          const x = sx * CT;
          const w = (e - tx + 1) * CT;
          const y = sy * CT;
          let k = out.length - 6;
          while (k >= 0 && !(out[k] === x && out[k + 2] === w && out[k + 1]! + out[k + 3]! === y)) k -= 6;
          if (k >= 0 && sy !== 0) out[k + 3]! += CT;
          else out.push(x, y, w, CT, tx * CT - x, ty * CT - y);
          tx = e;
        }
      }
    };
    runs(this.baseRuns, (t) => t === 1);
    runs(this.compRuns, (t) => t !== 0);
    const B = this.baseRuns;
    const C = this.compRuns;
    if (C.length > 0) {
      gl.enable(gl.SCISSOR_TEST);
      if (B.length > 0) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, baseT.fbo);
        gl.viewport(0, 0, CW, CH);
        gl.useProgram(g.base);
        gl.uniform1f(g.ub.u_m!, m);
        gl.uniform1ui(g.ub.u_seed!, seed);
        gl.uniform2f(g.ub.u_org!, gr.ox, gr.oy);
        gl.uniform4ui(g.ub.u_salt!, nz.salts[0], nz.salts[1], nz.salts[2], nz.salts[3]);
        gl.uniform3f(g.ub.u_road!, nz.roadY0, nz.roadBend, nz.roadPhase);
        for (let i = 0; i < B.length; i += 6) {
          gl.uniform2f(g.ub.u_cam!, B[i + 4]! / m, B[i + 5]! / m);
          gl.scissor(B[i]!, B[i + 1]!, B[i + 2]!, B[i + 3]!);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        for (let i = 0; i < todo.length; i++) if (todo[i] === 1) g.baseOwn[i] = this.slotKey(i, nx, ny, wx0, wy0);
      }
      this.upload(g);
      gl.bindFramebuffer(gl.FRAMEBUFFER, compT.fbo);
      gl.viewport(0, 0, CW, CH);
      gl.useProgram(g.comp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseT.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, g.marks);
      gl.uniform1i(g.uc.u_base!, 0);
      gl.uniform1i(g.uc.u_marks!, 1);
      gl.uniform1f(g.uc.u_m!, m);
      gl.uniform1ui(g.uc.u_seed!, seed);
      gl.uniform2f(g.uc.u_msize!, this.W, this.H);
      gl.uniform1f(g.uc.u_now!, g.compAge);
      for (let i = 0; i < C.length; i += 6) {
        gl.uniform2f(g.uc.u_cam!, C[i + 4]! / m, C[i + 5]! / m);
        gl.scissor(C[i]!, C[i + 1]!, C[i + 2]!, C[i + 3]!);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
      // The decals, baked in flat (thousands of them late in a battle: not redrawn each frame):
      // one draw per part of the cache the window wraps into, scissored to the runs' box there
      // (a decal is opaque where drawn, so redrawing one over itself changes nothing).
      for (let i = 0; i < C.length; i += 6) {
        const ox = C[i + 4]!;
        const oy = C[i + 5]!;
        let seen = false;
        for (let k = 0; k < i; k += 6) if (C[k + 4] === ox && C[k + 5] === oy) seen = true;
        if (seen) continue;
        let x0 = 1e9;
        let y0 = 1e9;
        let x1 = -1e9;
        let y1 = -1e9;
        for (let k = i; k < C.length; k += 6) {
          if (C[k + 4] !== ox || C[k + 5] !== oy) continue;
          x0 = Math.min(x0, C[k]!);
          y0 = Math.min(y0, C[k + 1]!);
          x1 = Math.max(x1, C[k]! + C[k + 2]!);
          y1 = Math.max(y1, C[k + 1]! + C[k + 3]!);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, compT.fbo);
        gl.viewport(0, 0, CW, CH);
        gl.scissor(x0, y0, x1 - x0, y1 - y0);
        decals(g.compAge, ox / m, oy / m, CW, CH);
      }
      gl.disable(gl.SCISSOR_TEST);
      for (let i = 0; i < todo.length; i++) if (todo[i] !== 0) g.compOwn[i] = this.slotKey(i, nx, ny, wx0, wy0);
    }
    if (direct) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
      gl.viewport(0, 0, direct.W, direct.H);
      gl.useProgram(g.copy);
      gl.bindVertexArray(g.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, compT.tex);
      gl.uniform1i(g.ucopy.u_src!, 0);
      gl.uniform4f(g.ucopy.u_dir!, direct.offX, direct.offY, direct.u, 1);
      gl.uniform4f(g.ucopy.u_dirb!, bw, bh, cx, cy);
      gl.uniform2i(g.ucopy.u_cs!, CW, CH);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      return;
    }
    gl.bindVertexArray(null);
    // Copy the view out of the cache: up to two spans each way where it wraps.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, compT.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.fbo);
    const sx = mod(cx, CW);
    const sy = mod(cy, CH);
    const w1 = Math.min(bw, CW - sx);
    const h1 = Math.min(bh, CH - sy);
    for (let j = 0; j < 2; j++) {
      const ys = j === 0 ? sy : 0;
      const yd = j === 0 ? 0 : h1;
      const hh = j === 0 ? h1 : bh - h1;
      if (hh <= 0) continue;
      for (let i = 0; i < 2; i++) {
        const xs = i === 0 ? sx : 0;
        const xd = i === 0 ? 0 : w1;
        const ww = i === 0 ? w1 : bw - w1;
        if (ww <= 0) continue;
        gl.blitFramebuffer(xs, ys, xs + ww, ys + hh, xd, yd, xd + ww, yd + hh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    gl.viewport(0, 0, bw, bh);
  }

  /** The world tile of the window held by cache slot i. */
  private slotKey(i: number, nx: number, ny: number, wx0: number, wy0: number): number {
    const sx = i % nx;
    const sy = (i - sx) / nx;
    return tileKey(wx0 + mod(sx - wx0, nx), wy0 + mod(sy - wy0, ny));
  }
}


