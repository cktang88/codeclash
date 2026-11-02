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
Shoot falls back to Attack for kinds that don't shoot (`slotOf` in `sprites128.ts`).

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

## Drawing API (`Paper`, in `core.ts`)

All points are in figure units, with `(0, 0)` at the feet.

| Call | Draws |
|---|---|
| `c.rod(a, b, wa, wb, mat, { tone, shine, detail })` | A tapered stroke: limbs, hafts, blades, straps. Rods 3 px or wider get a 1 px lit edge (top-left), a shadow third, and a 1 px dark edge on the shadow side. Thin rods are one tone. |
| `c.blob(centre, rx, ry, mat, { tone, shine, detail })` | An ellipse with a light cluster offset to the top-left and a shadow crescent at the bottom-right: skulls, joints, pommels, plates. |
| `c.shape(pts, shade)` / `c.poly(canvasPts, shade, axis?)` | Any polygon with your own shading rule. `shape` takes units, `poly` takes canvas px. |
| `c.line(a, b, code)` | A 1 px line: bowstrings, cracks, seams. |
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

1. **mirror**: SW and NW only.
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
with the ray-cast painter from level 4 up. Keep `poly` counts sane: a part per bone or plate, not
per pixel.
