# The paper-doll HD painter: authoring guide

HD battle figures drawn the way a pixel artist would. There is no 3D and no ray-casting. Each
part (skull, rib, blade, shield, cloth strip) is an outline polygon or a stroke in sprite space,
filled pixel-perfectly (a pixel is in when its centre is) and shaded by rules you write into the
part. A 2D bone rig poses the parts. The core then runs the finishing passes and turns the result
into the faction's palette.

The template is the undead **Grave Legionary** in `undead.ts`. Read it before you start.

## Files and ownership

| File | What it holds | Who edits |
|---|---|---|
| `core.ts` | `Paper` (the canvas, primitives, passes), colour maths, `oklchRamp`, the material table, the colour budget and `figurePalette` | coordinator (core owner) only |
| `rig.ts` | body types and pose types, `poseAt` (key poses → frames), `limb`/`along`/`snapDeg`, `swing`/`settle`/`chain` | coordinator only |
| `facing.ts` | the four facings and mirroring | coordinator only |
| `registry.ts` | `registerPaperKind`, `paperKindFor`, `paperSupports` | coordinator only |
| `index.ts` | `paintPaper`, the faction master palettes, the lint palette export | coordinator only |
| `skeleton.ts` | bone animation: skeleton and animation data, deterministic FK/IK evaluation, the per-angle part cache, standard skeletons and clips, the mocap loader (see "Animating with bones") | coordinator only |
| `rotsprite.ts` | RotSprite (Aseprite port, MIT) for rare hand-pixelled bitmap parts | coordinator only |
| `<faction>.ts` (`templar.ts`, `samurai.ts`, `undead.ts`) | that faction's materials, keys and figures, registered at load | **that faction's agent only** |
| `<faction>-parts.ts` (new) | additive helpers shared by that faction's figures (helmets, horses, banners) | that faction's agent only |

Rules for faction agents:
- Edit only `paper/<faction>.ts`, and create `paper/<faction>-parts.ts` if you need it.
- Never change an existing export of `core.ts`, `rig.ts`, `facing.ts`, `registry.ts` or `index.ts`. If you need something there, such as a new primitive, a body-type field or a pass option, ask the coordinator. Changes there are **additive only** (new exports or new optional fields), because three agents build on them at once.
- `index.ts` already imports all three faction files, so you don't need to touch it.
- `sprites128.ts`, `sprite-worker.ts`, `contract.ts` and the classic `sprites.ts` are not yours.
- Name your materials `<faction>.<name>` (for example `templar.surcoat`). Call `defineMaterial` only at module top level, so every worker registers materials in the same order.

## How it reaches the screen

`sprites128.ts` paints a kind's sheet (in a worker) frame by frame. For each slot (facing,
animation, frame, level) it asks `paintPaper(faction, kind, level, anim, frame, dir, hue)`:
- If the kind is registered here and supports that slot, the paper frame is trimmed and packed into the same sheet as before. Level 1 frames are drawn **natively** at one unit per pixel and placed in the 48×48 grid cell, foot on the cell's foot point.
- Otherwise the old ray-cast painter draws that slot.

The LRU cap, the worker pool and the trimming and packing are unchanged. Frame counts are shared
(`render/frames.ts`): Idle 8, Walk 12, Run 12, Attack 12, Shoot 12, Hit 5, Die 12, Dead 1, Brace 8.
Shoot falls back to Attack for kinds that don't shoot (`slotOf` in `sprites128.ts`). A kind may
register several attacks (see "Several blows" below).

The HD 64 battle mode (`buildAtlas64`) has no level-8 sheet of its own: the worker paints your
level-8 sheet and halves it with `downscale.ts` (every frame, every blow) into its level 4. What
helps it: a closed 1-px outline, thin parts at least 2 px wide at level 8 or connected 1-px lines,
glints as single bright pixels. See `docs/art-references/hd64-downscale.md`.

## Adding a kind

```ts
// paper/templar.ts
import { U } from '../../../game/units.ts';
import { Anim } from '../contract.ts';
import { code, defineMaterial, oklchRamp, M, type P2, type Paper } from './core.ts';
import { isBack, type Facing } from './facing.ts';
import { registerPaperKind } from './registry.ts';
import { along, FOOT0, limb, poser, settle, swing, type FootPose, type KeySet } from './rig.ts';

const TM = {
  surcoat: defineMaterial('templar.surcoat', oklchRamp({ l: 0.74, c: 0.02, h: 90 })),
};
const pose = poser(FOOT0);
const KEYS: KeySet<FootPose> = {
  poses: {
    [Anim.Idle]: [pose({}), pose({ py: 0.12 })],
    [Anim.Walk]: [/* 4 keys: contact, passing, contact, passing */],
    // Run, Attack, Hit, Die, Dead, Brace (and Shoot for missile kinds) ...
  },
  secondary(out, anim, fr, n) {
    out.sway = anim === Anim.Walk ? swing(fr, n, 0.35, 1.5, 2) : 0;
  },
};
registerPaperKind<FootPose>('templar', U.HeavyInfantry, {
  body: 'foot',
  keys: KEYS,
  draw: (c: Paper, p: FootPose, facing: Facing) => sergeant(c, p, facing),
});
```

The kind takes over in HD mode as soon as it is registered. Every animation with keys is painted
by paper. An animation without keys falls back as follows: Dead takes the last Die key; Shoot on a
melee kind becomes Attack (`slotOf`). Give every animation in `contract.ts` its keys, so that
`paperSupports` covers the whole sheet (the unit test in `paper.test.ts` checks the Legionary does).

### Several blows (attack variety)

A melee kind can have 2-3 different attacks ("blows"): an overhead cut, a thrust, a backhand. In
battle each man picks one per swing (a hash of the man and the swing's tick), so a regiment does
not strike in lockstep. Each blow is a whole Attack (12 frames, `FRAMES[Attack]`), authored like
the single attack: anticipation, strike, overshoot, recover. Blow 0 comes first and is the one the
city and the previews show.

Bone rigs (`*-clips.ts` / `*-rig.ts`): list the clips in `attacks` on the `SkeletonRig`. It replaces
`clips[Anim.Attack]` (keep that set too, or leave it out).

```ts
const rig: SkeletonRig = {
  skel, atts,
  clips: { ...clips, [Anim.Attack]: overhead },   // the classic single attack (= blow 0)
  attacks: [overhead, thrust, backhand],          // every blow, blow 0 first
};
registerPaperKind('templar', U.HeavyInfantry, skeletonKind(rig));   // paperBlows(...) === 3
```

Key sets (`KeySet`): `attacks: [keysA, keysB, keysC]`, one key list per blow, replacing
`poses[Anim.Attack]`:

```ts
const KEYS: KeySet<FootPose> = { poses: { [Anim.Idle]: [...], /* ... */ }, attacks: [cutKeys, thrustKeys, backhandKeys] };
```

A rig that is built lazily (undead `registerLazy` / `registerFoot`) cannot be asked how many
clips it has at registration: pass the count (`registerFoot(kind, spec, false, 3)`, or `blows: 3`
on any `PaperKindDef`), and give the rig the same number of `attacks`.

What else follows:
- `draw(c, pose, facing, anim, frame, blow)` gets the blow as a 6th argument (`frame` counts within the blow). A wrapper around another kind's `draw` must pass it on (see `samuraiKind`).
- `secondary(out, anim, frame, ...)` runs per blow as usual; `paintSkeleton(rig, Anim.Attack, f, { blow })` paints one blow.
- The atlas lays the blows out blow after blow: Attack frame `b * 12 + f` is frame f of blow b (`Atlas.blows` in `contract.ts`). Blow 0 keeps its old slots and grid cells; the others are added after them, so a one-blow kind paints exactly what it did.
- The pixel lint audits every blow (`blowFlicker`, `blowOffPalette`; `kind-report` says how many blows a kind has). Every blow adds 4 × 12 frames to every sheet level, so keep it to 2-3.

#### Blows start from the guard

A man in a fight does not stand at rest between blows: he stands in his **guard** (the Brace clip:
shield up and blade cocked, spear levelled, katana in chūdan, lance couched; see
`docs/art-references/guards.md`), and the renderer plays it between blows when his foe is in reach
(`scene.ts`). So every blow starts and ends on the guard's frame 0, and the blow's own
anticipation grows out of it: wrap each blow clip with `fromGuard(skel, blow, brace)` (`guard.ts`).
It samples the blow per frame and moves it toward the guard by `FROM_GUARD` (all of it at frames 0
and 11, none from the chamber at 3 to the impact's hold at 8), blending *world* angles so an arm
never whirls the long way round; slots, draw order and events stay the blow's. Riders pass
`{ only: riderOnly }`, so the gallop under a lancer's blow is left alone. Author the blow from rest
as before; author the guard as the Brace clip (held, breathing laid over).

### Body types and pose fields (`rig.ts`)

| `body` | canvas (units) | use for | pose type and rest pose |
|---|---|---|---|
| `foot` | 46 × 50, feet at 86% | infantry, archers, the commander on foot | `FootPose`, `FOOT0` |
| `horse` | 64 × 56 | cavalry: horse plus rider | `HorsePose`, `HORSE0`. Rider fields as `FootPose`, plus `pitch`, `neck`, `nod`, legs `fnu/fnl/ffu/ffl/hnu/hnl/hfu/hfl`, `tail` |
| `beast` | 64 × 64 | colossi and monsters | `BeastPose`, `BEAST0`: `FootPose` plus `hunch` and `jaw` |
| `engine` | 72 × 60 | trebuchet, bombard and their crew | `EnginePose`, `ENGINE0`: `arm`, `sling`, `load`, `recoil`, `crew`, `lean` |

Pose conventions:
- **Angles** are degrees in the figure's own frame, drawn facing SE: 0 = hanging straight down, positive = swung forward (screen right), 180 = straight up.
- **Blades** use absolute angles (`bl`: 90 = forward, 180 = up).
- **Positions** are in units (1 unit is 1 map pixel at level 1, L pixels at level L), measured from the foot point, with y down. A man stands about 14 units tall.
- `limb(deg)` gives a snapped direction and `along(p, deg, len)` steps along it. Angles snap to 7.5°, so a part redraws from a small set of drawings and never rotates as an image.

Key poses:
- `poseAt` spreads looping animations (Idle, Walk, Run, Brace) evenly around the loop. The others run from the first key to the last.
- Easing is a smoothstep, but the first segment of Attack accelerates: a slow wind-up and a fast strike.
- Author **anticipation, strike, overshoot and recover** for attacks (see the Legionary's keys).
- `secondary(out, anim, frame, n, k0, raw)` sets `sway` (cloth lag) and `smear` (the weapon's sweep), or anything else that follows the keys.
- Helpers: `swing` (cyclic, lagged), `settle` (one-off, lagged) and `chain` (a hanging strip of lagged points for pennons, tails and hair).

### Facings (`facing.ts`)

You draw **SE** (front three-quarter) and **NE** (back three-quarter). SW and NW are those two
mirrored about the foot point. `draw(c, pose, facing)` is called with `'se'` or `'ne'`, so branch
on `isBack(facing)`. In both views screen-right is forward and the weapon (right) side is toward
the viewer: it is screen-left in SE and screen-right in NE. In NE:
- Lateral offsets flip in x (shoulders and hips swap sides).
- Draw order changes. Whatever the body is holding in front (the shield) is now drawn first, behind everything.
- Draw back details: the back of the head, the spine and shoulder blades, cloak and tabard back panels, and the back of the shield.

To hand-draw SW or NW instead of mirroring, list them in `facings`.

#### The light in the mirrored facings

A mirrored facing mirrors the geometry, **not the light**: SW and NW are drawn with the light
reversed (`c.lightX === -1`, key light top-right) and then mirrored, so all four facings are lit
from the top-left. `drawFacing` (and `paintSkeleton`) set it; your `draw` is called the same way
as before. What follows the light by itself:
- `poly` axes, so `rod`, every volume built on an axis (templar-static `vol`, samurai `vol`) and the `u` handed to a `detail`;
- `blob`'s lit cluster and shadow crescent;
- the outline and contact passes (they run after the mirror);
- `planeLight` (undead), through `drawLightX()`.

What you must do in hand-written shading: wrap the **x of every lighting term** in `c.litX(...)`.
It returns `dx` as is in a facing drawn as seen and `-dx` in one drawn for a mirror. Geometry stays in
plain x (where the cross, the eye, the visor bar or a fold is). Examples:

```ts
const lit = c.litX(ux) < -0.55 ? 1 : c.litX(ux) > 0.75 ? -1 : 0;   // helm: lit band, shaded flank
code(SM.lacquer, lit(c, 2, c.litX(fx) * 0.8 + fy * 0.4));           // samurai plane light
if (ny < -0.45 && c.litX(nx) < 0.3) return code(TM.steel, 4);       // a blob detail's highlight
const dd = c.litX(fx - f0);                                          // a fold's lit ridge beside its channel
```

Measure from the part's own origin (`c.litX(fx - 5)`, not `c.litX(fx) - 5`): the mirrored part's
origin is mirrored too. A tone picked from a table by position (samurai kusazuri) takes the entry at
the mirrored position. Pixel passes inside a draw step toward the light with `i - c.lightX` and
away with `i + c.lightX`, not `i - 1` (undead `shadeLower`, `keyLight`). Leave depth alone: the far
arm or leg in shade is geometry, not light. A part cache that keys on the drawing must key on
`c.lightX` too (`skeleton.ts` part images, `templar-rig.ts` `memoSkin`), and a scratch Paper takes
the caller's `lightX`.

`paper.test.ts` checks that a part drawn for a mirror and then mirrored equals the same part drawn
where the mirror puts it. Before/after: `docs/screenshots/hd-sprites/mirror-light-before-after.png`;
notes and references: `docs/art-references/mirror-light.md`.

## Animating with bones (`skeleton.ts`)

The pose rig above moves anchors you compute by hand. `skeleton.ts` gives a figure real bones
instead: a bone hierarchy with a rest pose, parts attached to bones, two-bone IK for planted feet
and two-handed grips, and keyed animations. It follows Spine and DragonBones semantics, but it is our
own small bake-time evaluator; see `docs/art-references/skeletal-animation.md` for why. Everything is
plain JSON-serialisable data apart from the part draw functions.

| Piece | What it is |
|---|---|
| `SkeletonData` | `bones` (name, parent, `len`, rest `x`/`y`/`rot` in the parent's frame, `inherit`, per-facing overrides), `slots` (a bone and the attachment shown per facing), `drawOrder` per facing, `ik` |
| `IkData` | `bones: [upper, lower]`, `target` (a bone), `bend` (+1 knees forward, -1 elbows back), `mix`, and `ground` for feet |
| `AnimationData` | `frames`, `loop`, per-bone timelines (`rotate`, `translate`, `scaleY`) of keys `{ f, v, c }` with `c` = `'linear'`, `'stepped'` or a bezier `[cx1, cy1, cx2, cy2]` (`EASE`, `EASE_IN`, `EASE_OUT`); IK `mix`/`bend` keys, slot swaps, draw-order keys, `events` (`smear`, `release`, `step`, `hit`, `land`) |
| `Clip` | an animation, or layered `Track`s (`mode: 'add'` for a breathing overlay, `'replace'` for a rider's attack over a horse's walk), or `{ byFacing: { se, ne } }` |
| `AttachmentSet` | slot attachment name → a draw function `(c, x, ctx)`, or `{ draw, cache: false }` for parts that read the frame (smears) |

How a frame is made (`bakeClip`, `drawSkeleton`, `paintSkeleton`):
1. **FK**, parents first. The angles are world angles snapped to 7.5° **with hysteresis**: a bone keeps last frame's step until its raw angle is 0.6 steps away. Joints are rounded to whole pixels parent-first.
2. **IK**, in the skeleton's order. The law of cosines gives the raw solution, and the snapped pair whose pixel end lands nearest the target is chosen. Then the **ground** step moves the figure (never the targets) by whole pixels so that the lowest planted foot stands exactly on its target.
3. **Parts**. Each attachment draws at its bone's snapped transform. Cached parts are rasterised once per (part, angle step, scale-y, level) and blitted at whole-pixel origins, so **an unchanged angle gives identical pixels**. Then the usual passes run on the composite (contact, clusters, steady, colours), and the outline goes round the whole figure once.
4. **Determinism**. Snapped angles use a fixed sine table built from square roots, and atan2/acos are series. `Math.sin` is never called while posing, and bakes are byte-identical in Node and every browser (tested with Math trig sabotaged).

The conventions are the rig's. On a **hanging** bone (limbs), + swings forward. On an **upright**
bone (spine, chest, neck, head, a horse's neck), + tips it **backward**, so a forward lean is
negative. The standard skeletons use one naming scheme: `pelvis`, `spine`, `chest`, `neck`, `head`,
`upperArm`/`forearm`/`hand`, `thigh`/`shin`/`foot`, with sides `N` (near: the weapon side, toward
the viewer in SE and NE) and `F` (far), plus `weapon`, `grip2` and `footTargetN/F`. Horses add
`horseBody` (pivoting at the hindquarters, + rears), `horseNeck`, `horseHead`, `tail`,
`foreNUpper`…`hindFLower` and `saddle`. The rider uses the man's names.

Helpers:
- `footSkeleton`, `beastSkeleton`, `horseSkeleton`, `engineSkeleton` (or `skeletonFor(body)`) build standard skeletons with the bulk brief's proportions.
- `footAnimations`, `horseAnimations`, `beastAnimations`, `engineAnimations` (or `animationsFor(body)`) build the standard clips:
  - idle (breathing only);
  - walk and run (contact, down, passing, up, with the feet planted by IK);
  - attack (anticipation, strike with a `smear` event, follow-through, recover);
  - shoot (a `release` event), hit, die, dead and brace;
  - for horses, a four-beat walk and a gallop with the rider's bob a frame behind.
- `bonesFromJoints` builds bones from world-space rest joints. `animationFromPoses` builds an animation from whole poses, the way `KeySet`s are written. `restJoints(skel)` gives the rest positions to line key art up with.
- `mixLocals`, `pickBones`, `scaleSkeleton` and `scaleAnimation` combine and resize skeletons and clips. `localsFromWorld` drives the bones from world angles (for example from an old `FootPose`).
- `loadMotion(json, skel)` loads the mocap key JSON in `motion/*.json`:
  - it resolves BVH and L/R names (`resolveBone`; right = N);
  - it retargets by leg length or `restHeight`;
  - it plants the feet by IK on top, using the `contact` flags or the ankle's height.
- `skeletonKind(rig)` plugs a rig into `registerPaperKind`. `smearPart` draws a weapon's sweep during a `smear` event. `stickParts` gives placeholder rods for every slot. `bitmapPart` (in `rotsprite.ts`) turns a hand-pixelled bitmap with its bone, using RotSprite at snapped angles only.

### Worked example: from key art to a walking, striking figure

Take a static key-art figure (here the Grave Legionary's legs and skull from `undead-static.ts`).
Split it into parts per bone, attach the parts, and play the clips. Each part makes the **same
drawing calls as the key art**, with its key-art points passed through `x.r(...)`. That maps a
point of the rest pose onto the bone as it moves now. Angles drawn in the key art go through
`x.turn(...)`. The example is also a test in `skeleton.test.ts`.

```ts
import { Anim } from '../contract.ts';
import { M, Paper, type P2 } from './core.ts';
import { registerPaperKind } from './registry.ts';
import { footAnimations, footSkeleton, paintSkeleton, skeletonKind, stickParts, type AttachmentSet, type SkeletonRig } from './skeleton.ts';
import { skull, UM } from './undead-parts.ts';
import { plate, vol } from './undead-static.ts';

// 1. The skeleton. Its rest pose is the key art's stance (restJoints(skel) lists the joints).
const skel = footSkeleton({ name: 'legionary-bones' });

// 2. The key art's own points, from the static drawing (undead-static.ts `B`).
const B = { head: [0.75, -13.15], hipN: [-0.75, -6.5], kneeN: [-1.05, -3.65], ankN: [-1.15, -0.75] } satisfies Record<string, P2>;
const sabaton = (a: P2): P2[] => [[a[0] - 0.7, a[1] - 0.35], [a[0] + 0.5, a[1] - 0.45], [a[0] + 1.35, a[1] + 0.35], [a[0] + 1.3, a[1] + 0.75], [a[0] - 0.75, a[1] + 0.75]];

// 3. One part per bone: the key art's drawing calls, with the points through x.r and the angles through x.turn.
const parts: AttachmentSet = {
  ...stickParts(skel, { body: UM.bone, cloth: UM.rag, metal: UM.steel, team: M.team, hide: UM.leather }), // the bones not split yet
  thighN: (c, x) => vol(c, x.r(B.hipN), x.r(B.kneeN), 1.55, 1.25, UM.mail),
  shinN: (c, x) => vol(c, x.r(B.kneeN), x.r(B.ankN), 0.95, 1.0, UM.rust, { tone: 3, caps: false }),
  footN: (c, x) => plate(c, sabaton(B.ankN).map(x.r), UM.rust),
  head: (c, x) => skull(c, x.r(B.head), x.turn(0), true),
};

// 4. Play it: walk (feet planted by IK) and attack (a smear on frames 4 and 5).
const rig: SkeletonRig = { skel, atts: parts, clips: footAnimations() };
const paper = new Paper();
for (let f = 0; f < 12; f++) paintSkeleton(rig, Anim.Walk, f, { level: 8, facing: 'se', paper });
for (let f = 0; f < 12; f++) paintSkeleton(rig, Anim.Attack, f, { level: 8, facing: 'ne', paper });

// 5. Or hand it to the live painter: index.ts then paints it like any paper kind.
registerPaperKind('undead', 0, skeletonKind(rig));
```

Notes:
- **At rest the split parts rasterise exactly as the static drawing does**, pixel for pixel; the test checks it. Only the shading band offset is reseeded per slot, so that a part's bands do not depend on what was drawn before it.
- **Back views.** Give a slot a different attachment per facing (`attachment: { se: 'thighN', ne: 'thighN.back' }`). Rest positions that differ by facing are bone `facing` overrides (`bonesFromJoints` with `facing: { ne: … }`).
- **Tweaking keys.** Keys are relative to the rest pose. Take a standard clip and edit its timelines, or build your own with `animationFromPoses`. Add a clip per Anim; a missing Dead uses the last frame of Die.
- **Parts that read the frame** (cloth spanning two bones, smears) set `cache: false`. A cached part must draw only through `x.at`, `x.r`, `x.tip` and `x.turn`.
- **Demo:** `sprites-preview.html?mode=bones&faction=undead&kind=0` (`level=`, `z=`, `anims=`, `body=`, `bones=0`) draws the standard skeleton of a kind's body type with placeholder parts, in every animation, with the bones over it. The screenshots are `docs/screenshots/hd-sprites/bones-demo-foot.png` and `bones-demo-horse.png`.

## Drawing API (`Paper`, in `core.ts`)

All points are in figure units, with `(0, 0)` at the feet.

| Call | Draws |
|---|---|
| `c.rod(a, b, wa, wb, mat, { tone, shine, detail })` | A tapered stroke: limbs, hafts, blades, straps. Rods 3 px or wider get a 1 px lit edge (top-left), a shadow third, and a 1 px dark edge on the shadow side. Thin rods are one tone. |
| `c.blob(centre, rx, ry, mat, { tone, shine, detail })` | An ellipse with a light cluster offset to the top-left and a shadow crescent at the bottom-right: skulls, joints, pommels, plates. |
| `c.shape(pts, shade)` / `c.poly(canvasPts, shade, axis?)` | Any polygon with your own shading rule. `shape` takes units, `poly` takes canvas px. |
| `c.line(a, b, code)` | A 1 px line: bowstrings, cracks, seams. |
| `c.litX(dx)`, `c.lightX`, `drawLightX()` | The light side (see "The light in the mirrored facings"): `litX` turns a horizontal offset in a lighting term so it is negative toward the light in every facing. |
| `c.smear(pivot, from, to, r0, r1, mat)` | A solid motion arc for a weapon sweep: one shape, no blending. |
| `code(mat, tone)` | A pixel code. Tones run 0 (deep) to 4 (light). A shade callback returns a code, or `-1` to leave the pixel. |

**No-boil rules.** Follow these and frames don't crawl:
1. **Snap anchors** with `c.q(p)` (whole pixels), and snap cloth offsets with `c.qn(v)`. Snap the pelvis, the neck, and any point a rigid part hangs from. Points derived from a snapped anchor by fixed vectors or snapped angles are then consistent from frame to frame.
2. **Key texture to the part, never to the canvas.** Inside a shade callback, use `c.tex(x, y, seed, cell)` (diagonal noise cells), or `c.lx(x)` and `c.ly(y)` for patterns (mail rows, teeth, planks). Never hash raw `x, y`, because the pattern would stay still while the part moves.
3. **Snap any angle you rotate by** with `snapDeg` (skull and shield tilts too, not only limbs).
4. **Keep idle loops to breathing**: hold every angle within its 7.5° step, and let only `py` move by a pixel. Hold the weapon arm steady in Walk (the lint measures churn in the top quarter, where blades and helmets are).
5. Band thresholds already get a per-part offset (`c.band`), so parallel parts don't band in step. Rods stop the lit edge short of their ends. Don't add full-length stripes that all end on the same row.

## Materials and colour (`core.ts`)

Shared base materials (`M`): `bone`, `rust`, `mail`, `iron`, `steel`, `gold`, `team`, `teamDk`,
`linen`, `rag`, `wood`, `leather` and `flesh`, plus `ink` and `glow`. `ink` and `glow` are exempt
from cleanup (eye sockets, mouths, witchfire). `team` and `teamDk` follow the army's heraldic hue.

New materials use `oklchRamp({ l, c, h, spread?, rig?, chroma? })`. It gives five steps, darkest
first, built per the techniques guide §1.1-1.3:
- Lightness steps are unequal (the darks fall faster).
- Chroma peaks at the shade step and drains toward the light.
- Shadows lean toward the rig's ambient hue (cool violet); lights lean toward the key (warm).
- Nothing is pure black or white.

Keep non-accent materials at C ≤ 0.07. Only the faction accent (team colour, emissive) goes to
C ≥ 0.14. A ramp can follow the hue: `defineMaterial(name, (hue) => oklchRamp({ ..., h: okHue(hue) }))`.

What the core does with your colours, so you don't have to:
- **Ground value.** Each material's base tone is kept ΔL ≥ 0.12 (OKLab) from the battlefield green (`GROUND`, the lint's `FIELD`). A material that sits in the green's range is shifted darker as a whole, or lighter if it is clearly light already. Figures read dark-on-ground; the lint also wants the figure's mean value 0.12 from the ground.
- **Colour budget and master palette.** Each faction gets one master palette per level, built in OKLab from the codes its registered figures actually paint, weighted by pixel count. The rarely used colours merge first, and inks, glows and the team colour are protected. Every pixel maps to its nearest master colour.
- **Caps** (`budget(level)`), per figure:

  | Level | Fill colours | Dark-outline colours | Tones used |
  |---|---|---|---|
  | 1 | 12 | 2 | 3 tones (0, 1, 2) |
  | 2 | 16 | 3 | 4 |
  | 4 | 21 | 4 | 5 |
  | 8 | 33 | 6 | 5 |

  When a faction has several kinds, they share the master palette, so a new kind can move a colour of an old one slightly. Re-run the lint for the whole faction.

## Passes (run by `index.ts` on every frame)

1. **mirror**: SW and NW only (drawn with `lightX = -1`, so the mirror keeps the light top-left).
2. **contact**: an inner line on the **shadow side only**. A part's own rim darkens two tones where its right or lower neighbour is a part behind it. There is never a dark line all the way round a part (pillow shading).
3. **clusters**: specks of one tone smaller than 3 px (4 at level 8) take their most common same-material neighbour.
4. **steady**: anti-flicker with hysteresis against the previous frame of the same animation. A lone flip, or a one-step band flip with two neighbours agreeing, keeps last frame's tone. Paint an animation's frames in order on one `Paper`.
5. **colours**: codes become master-palette colours; single-pixel orphans take their neighbour (inks and glows excepted). Then the **outline** is drawn:
   - Its side comes from the edge normal against the key light (top-left).
   - The lit side is a step below the edge pixel, at least tone 1. At levels 1-2 the lit side keeps the part's own colour (sel-out).
   - The dark side is the material's deep tone in OKLab, with lightness ≥ 0.2 and its hue kept. It is never near-black.
   - **No ground shadow is baked in.** The battle draws its own, and the shader discards half-transparent pixels.

## Lint gate

Every new or changed kind must pass, for its faction, before you hand it over:

```sh
pnpm pixel-lint --only=sprites --factions=<faction> --out=/tmp/lint --shots=/tmp/lint/shots
pnpm tsx scripts/pixel-lint/kind-report.ts /tmp/lint/pixel-lint.json <faction> <kind>
```

- **No FAIL** on any check at levels 1, 2, 4 and 8. `kind-report` prints each level's fails and warnings and exits non-zero on a fail. Treat warnings as a to-do list and say in your report which remain.
- **Level-1 silhouette overlap < 0.85** against every other kind of the same faction (IoU, best shift). `kind-report` prints the closest pair. At 13 px a kind must still be told apart by its shape, so change the silhouette (weapon length, shield, hat, mount) rather than the colours.
- Keep `--out`/`--shots` outside the repo, or don't commit the generated report. The `--quick` flag (levels 1-2 only) is fine while iterating.

The Grave Legionary's current status (undead kind 0):
- No fails at any level.
- Silhouette: closest kind is Wraith Bows, at 0.63.
- Remaining warnings:
  - figure-vs-ground ΔL between 0.075 and 0.094 (≥ 0.12 wanted);
  - light-angle error of 77-78° at levels 1-2;
  - aligned band ends of 0.29;
  - grey-shadow pixels of 2-3% at levels 4-8;
  - a base band share under 35%;
  - at level 8, hugging bands at 0.62 and walk head churn at 9%.

  Those are your baseline to beat.

## Verify

1. `pnpm typecheck` and `pnpm test`. `paper.test.ts` checks:
   - every slot paints, with hard alpha and within the colour budget;
   - SW is SE's exact mirror;
   - NE is a real back view;
   - painting is deterministic.

   Add your kinds to it.
2. The lint gate above.
3. **Look at it.** Paint a contact sheet: every facing, every animation, levels 1, 4 and 8, on the field green (`#56603a`), upscaled with nearest-neighbour. Compare it side by side with your references.
4. **In a real battle**: `pnpm dev:client`, then open `/battle-perf.html?art=hd&seed=<s>&men=2000&pause=1&t=150&zoom=5&cx=..&cy=..&hud=0` with a seed whose demo armies include your faction (`demoSetup` in `src/client/demo.ts`; for example seeds 3 and 9 have undead and templar, 10 and 20 have samurai and undead).
   - Use Playwright from `/opt/node-tools/node_modules/playwright` with `chromium.launch()`, and never install another copy.
   - Wait about 25 s for the level-8 sheets to land in software GL. `window.__scene.hdLevel` shows the level in use per kind.
   - Screenshot at zoom 1 and at the max (5). Kill the dev server by PID afterwards.
5. **At least three critique rounds**, each naming what is still off against the references. Put screenshots of our art only in `docs/screenshots/hd-sprites/`, and write the round notes and references in `docs/art-references/<subject>.md`.

## The art bar

- **Target**: xave_pixel's 128 figure (in `docs/art-references/pixel-art-craft.md` §0):
  - large flat clusters;
  - 3-5-step hue-shifted ramps;
  - no black outline;
  - one saturated accent;
  - masses that still read at 32 px.
- **Games we take after**: Diablo II and Darkest Dungeon (undead and grim low-key values), Medieval II Total War (Templar realism and proportions), Shogun 2 Total War (Samurai). Study copies of the references live in the git-ignored `references/` folder (`references/<subject>/`).
- **Licensing**: never commit third-party images. Only CC0 or redistributable pixels may enter the repo, and only with credit in README.md.
- **Process**: follow CLAUDE.md "Art and design" and the `art-reference` skill:
  - gather and look at 3-5+ references per subject before drawing;
  - read `pixel-art-craft.md`, `pixel-art-techniques.md` and `pixel-art-mistakes.md`;
  - record your references.
- **Proportions**: realistic adult proportions, with the head about 1/7 of the height and thin skeleton limbs. Exaggerate the signature parts (weapon, shield, hat) for the level-1 read.

## Performance

A kind's sheet paints in a worker. Passes scan only the drawn bounding box. On the 4-core
container, a paper kind takes about 90 ms at level 1, 140 ms at level 2, 300 ms at level 4 and
700 ms at level 8 (`pnpm tsx scripts/sprite-bench.ts <faction> 1,2,4,8 <kinds>`). That is on a par
with the ray-cast painter from level 4 up. Since the mirrored facings draw their own part images (lit from the
other side), a sheet costs about 5% more CPU than with plain mirroring, after `begin` was changed to clear only the
drawn box. Keep `poly` counts sane: a part per bone or plate, not
per pixel.
