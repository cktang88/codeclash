# Skeletal ("bone") animation for the HD paper-doll units: research and recommendation

Question from the user: "first imagine your characters have bones and then animate the bones. Maybe there's some lib or OSS GitHub thing for bone sprite animation."

Our situation: the HD figures are about 100 to 128 px tall. They are drawn procedurally in `src/client/render/paper/`. Each part is an outline polygon or stroke, filled pixel-perfectly and posed by a small 2D rig (`rig.ts`: `poseAt`, `snap` to 7.5°, `swing`/`settle`/`chain`). The new static key art (`*-static.ts`) is also code: volumes along bones, placed by hand. A worker bakes frames into atlases, and the WebGL2 battle only draws atlas frames. **We never need a skeletal runtime per frame in the game.** What we need is a way to evaluate a skeleton deterministically at bake time and to rasterize the parts without smearing or boiling.

Researched 2026-11-02. Package data comes from the npm registry and bundlephobia (min+gzip), checked the same day.

## 1. Runtimes and formats

| Option | Licence (runtime / editor) | Status | Size (min+gz) | Fit for us |
|---|---|---|---|---|
| **Spine** (Esoteric). Runtime `@esotericsoftware/spine-core` 4.3.13, plus `spine-canvas`, `spine-pixi-v8` | The runtimes are source-available under the Spine Runtimes License. Using them is allowed only if *each user has their own Spine Editor licence* ([licence page](https://en.esotericsoftware.com/spine-runtimes-license)). Editor is paid (Essential/Professional). | Very active (release 2026-07-24) | spine-core ≈ 53 kB | **No.** The licence ties every developer to a paid editor. However, the JSON format is [publicly documented](https://en.esotericsoftware.com/spine-json-format), and Esoteric staff say exported data belongs to the user and that a *clean-room* runtime may carry its own licence ([forum](https://ar.esotericsoftware.com/forum/d/4984-runtimes-ampamp-licensing)). We can borrow its data model safely, but no code. |
| `pixi-spine` 4.0.6 / `@pixi/spine-pixi` 2.1.1 | Spine licence (see above) / MIT wrapper | Superseded by spine-pixi-v8 | — | No (same licence, and it is a Pixi runtime) |
| **DragonBones**. [DragonBonesJS](https://github.com/DragonBones/DragonBonesJS) (Pixi, Phaser, Egret, Hilo, Three folders), npm `pixi-dragonbones` 5.7.0-1 | Runtime **MIT**. Editor *DragonBones Pro* 5.6.x is free but **closed source**, and it used to need an online Egret login ([issue #139](https://github.com/DragonBones/DragonBonesJS/issues/139)). | Effectively unmaintained. Last npm build 2019-09. `dragonbones.com` returned HTTP 503 today. Editor binaries survive only on mirrors. | pixi-dragonbones ≈ 46 kB | Partly. The **5.5 JSON format** is plain, readable JSON ([format doc mirror](https://unpkg.com/dragonbones-tools@0.1.2/doc/dragonbones_json_format_5.5.md)): bones with `transform {x,y,skX,skY,scX,scY}`, slots, skins/displays with `pivot`, `ik {bone,target,bendPositive,weight}`, and animations with `translateFrame`/`rotateFrame` (`duration`, `tweenEasing`, `curve`) plus `zOrder`. It is a reasonable **import** format. The runtime is tied to old Pixi versions, so it is not worth adding. |
| **Spriter** (BrashMonkey). SCML (XML) / SCON (JSON). JS: [flyover/spriter.js](https://github.com/flyover/spriter.js) (plus spriter.ts), `pixi-spriter` 0.6.0 (MIT, 2021) | spriter.js has **no licence file**, so we can't use it. Editor: Spriter Pro is paid. | Spriter 2 was pre-ordered in 2018 ([GameDev.net](https://gamedev.net/forums/topic/697916-spriter-2-the-2d-animation-tool-now-available-for-pre-order/)), and we found no shipped release. The JS runtimes are dormant. | — | No |
| **Rive**. `@rive-app/canvas` / `webgl2` 2.49.1 | Runtimes **MIT**. Editor is SaaS: the free plan exports `.riv` with a splash screen, and paid plans start at $9/seat/month ([pricing](https://rive.app/pricing)). | Very active (release today) | ≈ 85 kB JS **plus a WASM renderer** | No. It is a vector state-machine runtime that renders antialiased vectors, and the authoring tool is cloud-based and paid. |
| **Creature** (Kestrel Moon) | Runtimes are Apache-2.0 for non-owners ([GameFromScratch](https://gamefromscratch.com/creature-runtime-licenses-changed-to-apache-open-source/)). Editor is paid (about $99). | Unity/UE runtimes. The web runtime is old. | — | No (mesh deformation, painted art, paid editor) |
| **Lottie** (`lottie-web` 5.13.0, `@lottiefiles/dotlottie-web`) | MIT | Active | lottie-web ≈ 77 kB | No. It has layer parenting but no bones or IK, and it renders antialiased After Effects vectors. Useful only for UI motion. |
| IK helpers: `three-ik` 0.1.0 (MIT, 2018, 3D FABRIK for three.js), `fabrik` 1.0.0-rc2 (MIT, 2021, 16 kB unpacked), [@aminere/fullik](https://www.npmjs.com/package/@aminere/fullik) (3D Caliko port) | MIT | Dormant | 4–16 kB | Not needed. Two-bone analytic IK (law of cosines) is about 25 lines. FABRIK for tails or chains is about 30 more. |
| Easing: `bezier-easing` 3.2.0 | MIT | Active (2026-10) | 0.5 kB | Optional. It is the same cubic-bezier evaluator that Spine and DragonBones curves use. |

Conclusion for part 1: no library does what we need, which is bake-time evaluation, pixel-perfect rasterization, determinism, and a free, permissive licence. The libraries are **display runtimes** built around a texture-quad renderer. We already have the rasterizer. The useful things to take are a **data model** (Spine/DragonBones semantics) and two small algorithms (two-bone IK and cubic-bezier easing).

## 2. Bones and pixel art: how others avoid smearing

### What shipped games actually do

| Game | Technique | Source |
|---|---|---|
| **Dead Cells** | 3D models and skeletons in 3ds Max are rendered at the final tiny size **with no antialiasing**. Each frame is exported with a normal map and given a toon shader. The character is about 50 px tall. The team admits that "we still haven't found any solution for flickering pixels". | [Thomas Vasseur, Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-) |
| **Hollow Knight / Silksong** | **Not Spine.** Team Cherry describes "traditional 2D frame-by-frame animation". | [Team Cherry blog](https://www.teamcherry.com.au/blog/introducing-hollow-knight), [ACMI](https://www.acmi.net.au/works/125388--hollow-knight-silksong-game-worlds-acmi/) |
| **Darkest Dungeon** | Spine (the game ships Spine skeleton, atlas and PNG files, and modders rig heroes in Spine). The art is **high-resolution painted, not pixel art**, which is why rotating parts looks fine. | [DD workshop thread](https://steamcommunity.com/groups/dd-workshop/discussions/0/135511757698227150) |
| **Children of Morta** | Pixel "puppets" hand-animated as sprite frames, lit by real-time lights ("the puppets are pixelated but we shine them with real lights"). | [TechRaptor](https://techraptor.net/content/how-dead-mage-created-the-art-for-children-of-morta), [postmortem](https://www.gamedeveloper.com/design/postmortem-children-of-morta) |
| **Blasphemous, Owlboy** | Frame-by-frame pixel animation. Owlboy deliberately avoided 3D or reuse shortcuts. | [Blasphemous animation time-lapse](https://www.gameanim.com/?p=67403), [D-Pad interview](https://alternativemagazineonline.co.uk/2017/12/05/interview-in-conversation-with-d-pad-studio-creators-of-owlboy/) |
| **Eastward, Moonlighter** | We found no primary source on their character pipeline (Eastward is a custom engine on MOAI). Treat them as hand-drawn sprite sheets. | [Game Developer IGF piece](https://www.gamedeveloper.com/disciplines/road-to-the-igf-pixpil-s-i-eastward-i-) |

The pattern is that **pixel-art games do not rotate bitmaps at runtime**. They either draw frames by hand, render a 3D or skeletal source at final resolution with no antialiasing and then clean it up (Dead Cells), or keep Spine for high-resolution painted art (Darkest Dungeon). Of these, our painter is closest to Dead Cells. The difference is that our "model" is 2D outlines, which are re-rasterized pixel-perfectly at every pose. That is the strongest option available for clean rotation, because nothing is resampled.

### Rotating pixel *bitmaps* when we must

- **RotSprite** (Xenowhirl). The image is upscaled 8× with Scale2x three times (a "similar-colour" variant also exists), rotated and nearest-downsampled in one pass, and lost single-pixel details are optionally restored ([Wikipedia](https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms)). Aseprite's implementation, [`src/doc/algorithm/rotsprite.cpp`](https://github.com/aseprite/aseprite/blob/main/src/doc/algorithm/rotsprite.cpp), sits in the "Aseprite Document Library" and is **MIT** (the file header says so), so it can be ported with attribution. *Fast RotSprite* (Pixel Studio) uses a single 3× pass. We found no maintained JS or npm package. The other implementations are the Rust crate [`rotsprite`](https://docs.rs/crate/rotsprite/latest), the [MakeCode extension](https://forum.makecode.com/t/having-a-blast-with-makecode-arcade/59/5), the [spriterot CLI](https://github.com/samdze/spriterot), and a CC0 [Godot shader](https://godotshaders.com/shader/rotsprite-like-algorithm-for-cleaner-pixel-art-rotation).
- **cleanEdge** (torcado, 2022), **MIT** ([site](https://torcado.com/cleanEdge/), [GLSL gist](https://gist.github.com/torcado194/e2794f5a4b22049ac0a41f972d14c329)). It is a shader-based edge-aware upscale that handles 45° and 2:1 slopes, with `lineWidth`, `similarThreshold` and a priority colour. It looks cleaner than RotSprite on line art but "struggles with dithering" ([Playdate forum](https://devforum.play.date/t/cleanedge-tool-to-create-clean-rotation/9903)). Astropulse's [Clean Rotate](https://astropulse.itch.io/clean-rotate-for-aseprite) Aseprite extension builds on it.
- Research: *Feature-Aware Pixel Art Animation* (Kuo et al., CGF 2016, [Bath](https://researchportal.bath.ac.uk/en/publications/feature-aware-pixel-art-animation/)) deforms pixel art by bones while preserving features. It is interesting, but it is overkill for us.

**Our own test** (`references/skeletal/test-*.png`, made with a 60-line Python script: Scale2x×3, then rotate and nearest-downsample). On torcado's `ferret.png` at 30° and `lines.png` at 22.5°, plain nearest rotation breaks 1 px lines into dotted gaps and doubled pixels. RotSprite keeps the lines continuous and the outlines closed, which matches the Godot comparison image. Diagonal lines at odd angles still come out with uneven steps. That is why angle snapping matters even with RotSprite.

## 3. Editors that export an open format

| Editor | Cost / licence | Output | Notes |
|---|---|---|---|
| DragonBones Pro 5.6 | Free, closed source | DragonBones 5.5 JSON (plain) | Free, but the site is down and the tool is unmaintained. Fine if someone already has it. |
| Spine | Paid | Spine JSON/binary | The best editor. The format is documented, but the licence makes it a dependency we excluded. |
| Spriter Pro | Paid | SCML/SCON | Dormant |
| **Blender** (armatures with an orthographic camera) | Free, GPL tool (output is ours) | **glTF 2.0** node animation (translation, rotation, scale with keyframes and cubic splines) | An open ISO-track standard, and a parser is short. [COA Tools 2](https://github.com/Aodaruma/coa_tools2) (GPL-3.0 add-on, Blender 3.4 to 5.1) adds 2D cut-out rigging. |
| Godot 4 (`Skeleton2D`/`Bone2D`, IK modifications) | MIT | `.tscn` text resources | Free and scriptable, but the format is engine-specific. |
| OpenToonz (BSD-3), Synfig (GPL) | Free | Their own formats | Skeleton tools exist. Export would be rendered frames, not rigs. |
| [PixelOver](https://pixelover.io/) | $19.99, closed source | Sprite sheets, GIF | Pixel-art-specific bones with IK and "pixel-perfect rotation". Good for prototyping poses, but it doesn't export a rig. |
| Aseprite | Paid / source-available | — | No bones. Its rotation tool offers RotSprite. |

**Authoring by hand or programmatically is entirely practical.** Spine JSON and DragonBones JSON are both just bones, slots and keyframe arrays. For a code-first project, a typed TypeScript module is a better "file" than JSON. It gets type checking, shared constants, and the ability to compute keys (for example, generating a walk cycle from a stride length). JSON import can be added later.

## 4. Recommendation

**Option (a): keep our own rig, upgraded into an explicit bone hierarchy, and add no runtime library.** Model it on Spine/DragonBones semantics so that poses could later be imported from DragonBones JSON or glTF. Parts stay vector outlines and are re-rasterized per pose. RotSprite is only a fallback for genuinely bitmap parts. Option (b), adopting a library, fails on every count. Spine and Spriter fail on licence. DragonBones is dead and Pixi-bound. Rive and Lottie are antialiased vector renderers. None of them rasterizes pixel art.

### Data model (additive, in `rig.ts` or a new `paper/skeleton.ts`, coordinator-owned)

```ts
type BoneId = string; type SlotId = string;
interface Bone   { id: BoneId; parent?: BoneId; x: number; y: number; rot: number; len: number } // setup pose, px, deg
interface Slot   { id: SlotId; bone: BoneId; z: number;                        // setup draw order
                   att: Partial<Record<FacingClass, AttachmentId | null>> }    // front / back / side views of a part
interface Attachment {                                                          // what we draw in a slot
  kind: 'outline' | 'bitmap';
  paint?: (p: Paper, m: Mat) => void;      // outline: reuse the static key-art volume code, in bone-local units
  pixels?: ImageData; pivot: [number, number];  // bitmap: pre-drawn part with an integer pivot
}
interface Ik     { id: string; bones: [BoneId, BoneId]; target: BoneId | 'world'; bendPositive: boolean; mix: number }
type Curve = 'linear' | 'stepped' | [cx1: number, cy1: number, cx2: number, cy2: number]; // Spine/DB semantics
interface Key    { f: number; curve?: Curve;
                   bones?: Record<BoneId, { rot?: number; x?: number; y?: number }>;
                   ik?: Record<string, { x: number; y: number; mix?: number }>;     // e.g. foot plant points
                   slots?: Record<SlotId, AttachmentId | null>;                     // swaps: open hand to fist, smear
                   z?: Record<SlotId, number> }                                     // draw-order offsets
interface Clip   { anim: Anim; frames: number; loop: boolean; keys: Key[];
                   secondary?: (bones: PoseOut, fr: number) => void }               // swing / settle / chain
interface Skeleton { bones: Bone[]; slots: Slot[]; ik: Ik[]; clips: Partial<Record<Anim, Clip>> }
```

The existing `FootPose` fields (`torso`, `head`, `nu`, `nl`, `fu`, `fl`, `nt`, `ns`, ...) map one-to-one to bone rotations. A shim can therefore build a `Skeleton` from today's `KeySet`, and nothing breaks while factions migrate. Facing stays as it is. Each facing class has its own attachments and z table, and mirrored facings flip in X *before* rasterization, never after.

### Bake pipeline per frame (in the sprite worker)

1. **Sample keys.** Interpolate each channel between keys with its curve: a cubic bezier, solved by Newton iteration followed by bisection with a fixed iteration count. Rotation takes the shortest arc.
2. **Run IK** after FK, in order:
   - *Foot planting.* During contact keys, the foot target is a world point held fixed across frames. Two-bone IK uses the law of cosines with `bendPositive` choosing the knee side, and the target is clamped to 0.999 of the reach so the leg never snaps straight. The root bob is then corrected in whole pixels so that the sole sits on the foot point.
   - *Two-handed weapons.* The off-hand target is a point bone on the weapon (`grip2`), so the off arm follows the spear or pike.
   - *Chains* (banners, tails, sashes) use FABRIK or the existing `chain` helper.
3. **Snap and quantize.** Snap every *world* angle to the 7.5° grid (48 steps, `SNAP_DEG`) with **hysteresis**: a bone keeps its previous snapped angle unless the new raw angle is more than about 0.6 steps away. This stops a slowly turning arm from flickering between two angles. Joint positions are rounded to integer pixels **hierarchically**, so each child pivot is computed from its parent's *rounded* pivot. Bone lengths are integers.
4. **Deterministic trig.** Don't call `Math.sin` or `Math.cos` on snapped angles. Use a 48-entry table built from exact values (sin 7.5° and its multiples have closed forms from half-angle formulas, which need only `Math.sqrt`, and `Math.sqrt` is correctly rounded in IEEE 754), or from hard-coded constants. Bakes in Chrome, Firefox and Node then produce identical pixels. The game rule against trig applies to `src/game`, but identical atlases are worth this small cost.
5. **Rasterize each slot** in draw order:
   - *Outline attachments* (the default, and every key-art part). Transform the outline by the snapped bone matrix around the **pixel-centre of its integer pivot**, then fill with the existing pixel-centre rule. Cache the result by (attachment, angle step, mirror, level). The same angle then always gives the same pixels, whatever the translation, and that removes boil.
   - *Bitmap attachments* (rare: a hand-pixelled emblem or crest). Pre-rotate once per angle step with **RotSprite** (Scale2x×3, then rotate with nearest-downsample, ported from Aseprite's MIT `rotsprite.cpp` with credit in README.md), or the cleanEdge algorithm (MIT) run on the CPU. For angles of 0/90/180/270, and for small parts, prefer **pre-drawn variants per angle class** instead (the Children of Morta / Blasphemous approach). A shield seen at 0°, 45° and 90° is better drawn three times than rotated.
   - *Textures* (mail rows, cloth dither). Sample in bone-local space only for large parts. For small or fast-moving parts, sample in sprite space so the pattern does not crawl.
6. **Finish once on the composite.** Run the current core passes (selective outline, orphan cleanup, palette mapping) over the assembled figure, not per part. The outer silhouette outline is then never broken or doubled by a rotated part. Per-part interior lines stay where parts overlap.

### Anti-boil checks (tests in `paper.test.ts`)

- Bake twice and compare hashes. Run the bake in Node and in the browser worker and compare again.
- For consecutive frames where a bone's snapped angle is unchanged, the part's pixels must match its cached image exactly. Report any rigid part whose pixels change without an angle change.
- During contact keys the foot point may drift at most 0 px. Over idle loops the root may bob at most 1 px.
- Count how often each bone's snapped angle flips back and forth (A→B→A) inside a clip. A flip is a defect unless a key asks for it.

### Packages to add

**None are required.** Optionally add `bezier-easing` (MIT, 0.5 kB gz) for curves, or inline its ~40 lines. Port RotSprite from Aseprite `src/doc/algorithm/rotsprite.cpp` (MIT, © Igara Studio / David Capello) or from the cleanEdge gist (MIT, © 2022 torcado) into `paper/rotsprite.ts`, with credit in README.md. Do **not** add `@esotericsoftware/spine-*` (the editor licence would apply to every developer), `pixi-dragonbones` (unmaintained, Pixi-bound), `@rive-app/*` or `lottie-web` (antialiased vector renderers, and WASM in Rive's case). If someone wants to pose in a GUI later, write a dev-only importer for **DragonBones 5.5 JSON** (free editor) or **glTF** from Blender into the TS `Skeleton` model. Both formats are open and plain.

### Order of work

1. Write `skeleton.ts` (types, FK, two-bone IK, curves, snap table with hysteresis) and its tests, plus a shim from `KeySet`.
2. Have the static key art expose its volumes as per-bone outline attachments. The static figure must become the rig's setup pose, pixel-identical to today's key art.
3. Animate one kind (Templar sergeant: idle, walk with planted feet, attack with a two-handed grip). Take screenshots and run three critique rounds against the references, as `CLAUDE.md` requires.
4. Add a RotSprite port only once a real bitmap part needs it.

## References studied (downloaded to `references/skeletal/`, git-ignored, never committed)

| File | Source / licence | Taken from it |
|---|---|---|
| `godot-rotsprite-like.png` | [godotshaders.com RotSprite-like shader](https://godotshaders.com/shader/rotsprite-like-algorithm-for-cleaner-pixel-art-rotation) (shader code CC0; screenshot is study only) | With nearest rotation, outlines break into dotted segments and thin antenna lines lose pixels. Fast RotSprite keeps the lines continuous and the silhouette closed. |
| `cleanedge-ferret.png`, `cleanedge-lines.png`, `cleanedge-zip/` | [torcado.com/cleanEdge](https://torcado.com/cleanEdge/) (tool is MIT; example art is study only) | Test inputs. Edge-priority upscaling exists to protect 1 px lines and 2:1 slopes, which are exactly the features our outlines are made of. |
| `test-ferret-nearest-vs-rotsprite-30.png`, `test-lines-nearest-vs-rotsprite-22.png` | Our experiment (nearest on the left, RotSprite on the right, 4× zoom) | RotSprite fixes gaps and doubled pixels but leaves uneven steps at odd angles. That is why we snap angles and re-rasterize vector outlines instead of rotating bitmaps whenever we can. |

## Implementation (2026-11-02)

`src/client/render/paper/skeleton.ts` implements option (a) above, and `paper/rotsprite.ts` the RotSprite port. The usage guide is `paper/README.md`, "Animating with bones". The demo is `sprites-preview.html?mode=bones`.

Critique rounds on the demo's placeholder figure (`docs/screenshots/hd-sprites/bones-demo-*.png`), compared with the walk and gallop references above and with the Legionary's hand keys:
1. The bones, joints, IK targets and the smear event all read. The off-hand grip target was marked even while its IK was off, which was misleading, so now only active IK targets are marked.
2. Walk and run at level 8: the planted foot holds the ground line in every frame (the tests check this to within 0.5 px at levels 1-8). The horse walk is four-beat and the gallop has a suspension phase.
3. The run, the strike and the brace leaned *back*, and the die toppled forward with the arms through the ground. The cause: on an upright bone, a positive rotation tips it backward in the rig convention. All leans were flipped, and the dead lie on their backs with their arms along the ground. The convention is now spelled out in the README for the faction and mocap agents.
