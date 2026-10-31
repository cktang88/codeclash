# Fight playground (3D)

A standalone three.js sandbox for trying free animated 3D packs as Code Clash soldiers. It is **not
part of the game**: it has its own Vite config, imports nothing from `src/`, and builds to
`dist/playground` only when asked.

```sh
pnpm install
pnpm 3d                # fetches the Kevin Iglesias pack if missing, then serves http://localhost:5174
```

`pnpm playground` serves it without the fetch. `pnpm setup:3d` only fetches (`--force` to fetch
again, `--zip <file>` for a zip downloaded by hand). Without that pack, every CC0 unit still works.

- **Muster** (left): add any unit to blue or red, 1 to 100 at a time.
- **Battles** (right): men vs monsters, mirror match, and dragon raid, drawn up in formation, plus
  a **parade** of every unit standing side by side.
- **Inspect:** click a soldier to see its pack and health, with a full-detail model viewer that
  plays any of its clips.
- **Look:** turn the ink line on or off, set its width and the toon bands, and pick day, dusk or
  night light. The camera can be orbited with the mouse, with presets for the game's angle, low and
  top.
- **Army size:** 40 to 1000 per side.
- **URL flags:** `?preset=<name>`, `?size=<per side>`, `?cam=low&dist=&x=`, `?paused`, `?tod=dusk`,
  `?ink=0`, `?lod=0`, `?seed=`.

## How it runs

**The simulation (`src/sim/sim.ts`) is deterministic, and it is separate from the drawing.** It
uses fixed 20 Hz ticks and a seeded random stream (mulberry32). Its maths is only `+ − × ÷` and
`√`, which IEEE 754 makes exact on every engine, so the same inputs give the same battle bit for
bit anywhere. It has no three.js and no clips: an attack's length (`swing`) is game data, and the
renderer fits the clip to it.

- **Behaviour:** soldiers muster in formation blocks, melee in front and missiles behind. They
  advance in their lanes until a foe comes within reach, then close and fight. They strike on the
  beat of the swing, or loose arrows, fireballs and bolts that fly for a set number of ticks. They
  are knocked back by heavy blows, flinch, fall, and lie as corpses for 7 s. A spatial grid keeps
  targeting and crowding cheap, and ties always go to the lower id.
- **In the browser** it runs in a **Web Worker** (`src/sim/sim.worker.ts`), which posts a snapshot
  after each tick. Inputs (musters and clears) are stamped with the tick they apply on and echoed
  back as a log.
- **In Node** it runs as is: `pnpm tsx playground/scripts/simcheck.ts` runs it there and checks
  that two runs of the same inputs stay identical tick by tick.

**Collisions.** Each soldier is a circle on the ground: the usual crowd-game shape, stable and
cheap to resolve. Boxes on soldiers that keep turning would snag. The radii are measured from the
models (`/footprint.html` poses each through its idle, walk and attack clips and takes half the
narrower side of its body's ground-plane bounding box, leaving out weapons so a spear can still
cross a shield). They are stored as plain data (`src/sim/footprints.ts`), so the simulation still
needs no models.

Each tick, three relaxation passes push every overlapping pair fully apart. The grid is rebuilt
from where soldiers now stand, and searched wide enough to reach the biggest circle. Walkers and
flyers collide within their own layer, and the heavier soldier gives less ground. `simcheck`
reports the overlap. Against the measured radii, the old single half-correcting pass left 25–31%
of touching pairs more than 10% inside each other (worst 75–78%); now it's 0.2–1.1% (worst
13–34%).

**Multiplayer.** The playground itself is single-player: the worker is the only simulator, and
there's no server or network yet. It is built so that adding one is plumbing, not a rewrite, the
same way Code Clash's own war sim works (`src/sim`, the hub's lockstep inputs and checksums):

- the server runs `sim.ts` and relays stamped inputs;
- every client runs the same inputs in its worker, and the checksums prove they agree;
- or the server simply streams snapshots.

**Drawing (`src/crowd.ts`).** At load, each unit type's pose clips are sampled at 30 fps into a
float texture of bone matrices. The model's meshes, both skinned parts and rigid kit hung on
bones, are merged and welded into one skinned geometry per material. Every soldier of that type is
then one instance: one draw call for the body and one for its ink hull, however many soldiers
there are. The vertex shader skins each instance from the texture and cross-fades between two
frames for 160 ms when its pose changes.

- **Level of detail:** beyond 28 m a soldier draws through a meshoptimizer-simplified index
  (about 20% of its triangles) over the same vertices, so skinning, UVs and team marks carry over.
- **Missiles, base rings with blob shadows, and health bars** are one instanced draw each.
- **Main thread:** interpolates the worker's snapshots, picks frames and writes the instance
  buffers.

**Measured** in this container (headless Chromium with software GL, so frame rates here say
nothing about a real GPU):

| Per side | Sim tick, Node (median / p95) | Main-thread update | Draw calls | Triangles drawn |
| --- | --- | --- | --- | --- |
| 40 | 0.10 / 0.35 ms | 0.5 ms | ~40–70 | 1.0 M (close camera) |
| 150 | n/a | 1.1 ms | ~70 | 3.9 M (before LOD) |
| 300 | 1.5 / 2.1 ms | n/a | n/a | n/a |
| 500 | 2.3 / 4.6 ms | 1.2–2.0 ms | ~70 | 12.9 M without LOD, **3.0 M with LOD** (game camera) |
| 1000 | 5.6 / 10.5 ms | n/a | n/a | n/a |

A tick has a 50 ms budget, so the simulation keeps about 5× headroom at 1000 a side (collisions
are most of its cost). Draw calls stay
flat as armies grow. The open question is GPU time on real hardware: at 500 a side and the game
camera that is ~3 M toon-shaded triangles with texture skinning. A mid-range discrete GPU should
hold 60 fps; an integrated laptop GPU is the one to try.

**Not yet:**

- shadow maps for crowds (a skinned depth pass per type; blob shadows stand in);
- impostor sprites for the farthest soldiers, which is what `/anim-lab.html` bakes;
- frustum culling per instance;
- a server.

## Units and where they come from

| Pack | License | Units |
| --- | --- | --- |
| [KayKit Adventurers 2.0](https://kaylousberg.itch.io/kaykit-adventurers), [Skeletons 1.1](https://kaylousberg.itch.io/kaykit-skeletons), [Character Animations 1.1](https://kaylousberg.itch.io/kaykit-character-animations) by Kay Lousberg | CC0 | Knight, Champion (Knight + greatsword, larger), Berserker (Barbarian), Archer (Ranger), Wizard (Mage), Rogue, Skeleton, Skeleton Mage, Skeleton Minion |
| **Our own**, built on KayKit's large mannequin | CC0 base | **Troll** (moss-green, tusks, brow, gnarled club) and **Bone Golem** (ivory, eye sockets, horn, back spines, bone fists), both on the `Rig_Large` clips |
| [Quaternius Animated Monsters](https://opengameart.org/content/lowpoly-animated-monsters) | CC0 | Dragon, Giant Bat, Skeleton (Q) |
| [Quaternius RPG Characters](https://opengameart.org/content/lowpoly-rpg-characters) | CC0 | Warrior, Ranger, Cleric, Wizard (Q), Rogue (Q) |
| [Kevin Iglesias Human Melee Animations FREE](https://kevdev.itch.io/human-melee-animatons-free) | free, **not redistributable** | Footman, Warden, Mercenary, Sapper, Berserker, Champion (painted mannequin). Shown only when unpacked locally |

The CC0 files are committed under `assets/` with their license texts. The Kevin Iglesias pack
is ignored by git: `pnpm setup:3d` (`scripts/setup-3d.ts`) fetches it from itch.io's free download
and unpacks it into `assets/kevin/` and the anim lab's folder, on your machine only.

All KayKit characters share one rig (`Rig_Medium`). The animation library's ~150 clips play on
any of them, including melee 1H, 2H and dual-wield, block, bow draw and release, spell casting,
skeleton rise and walk, hit and death. Weapons are separate glTFs hung on the `handslot` bones.

## Adding a unit

Add a `UnitDef` to one of the files in `src/packs/` (or a new file listed in `src/main.ts`):

- the model file, plus any further files carrying clips for the same skeleton;
- the height to scale it to, in metres;
- regexes picking its `idle`, `walk`, `attack` (one is chosen at random among the matches), `hit`
  and `die` clips;
- its stats;
- optionally a `prep` that fixes or kits the model before styling (weapons, primitives,
  recolouring), and a `team` that puts the army colour on it (capes, cloaks, livery). Without
  `team`, the coloured ring at its feet shows its side.

Every model gets the same look (`src/style.ts`): toon bands lit warm from the upper left, a cool
ink-blue fill, and an inverted-hull ink line.

## Depth, normals and facing

Checked with `/diag.html`, which loads every model and logs mirrored transforms, missing, zero or
inward normals, winding that disagrees with the normals, and open edges. Conventions follow
autobattler-2's `proto3d`.

- **Axes:** Y up, units face +Z, metres. Z-up FBXs (the Kevin pack) are turned back by -90° about
  X. No pack has mirrored meshes or flipped winding.
- **Sides:** KayKit marks every mesh double-sided because its heads and bodies are open where
  parts meet, so the style pass keeps each pack's sidedness. Open sheets (capes, cloaks, laces;
  over 10% of edges open) always draw both faces and get **no** ink hull. A hull a hair in front
  of a one-sided sheet flickers against it.
- **Ink hull:** pushed along normals averaged per position (`inkNormal`), so hard-edged models
  don't tear the outline at creases. It is drawn with a positive `polygonOffset`, so where it lies a
  hair from a surface (layered hair, a pauldron) the surface always wins the depth test.
- **Coplanar faces:** `src/zfix.ts` ports autobattler-2's fix. Overlapping same-plane triangles of
  different meshes have the smaller one lifted 2.5 mm along its normal, and it works on skinned and
  indexed meshes. Every current unit scans clean. The one hit was a duplicated helmet dome of
  ours, now fixed at the source.
- **Ground overlays:** base rings sit 1 cm up with a negative `polygonOffset`, `depthWrite: false`
  and `renderOrder` after the ground.
- **Depth range:** near 0.5 and far 300, with the orbit limited to 3–90 m.
- **Shadows:** `bias -0.0004` and `normalBias 0.03` against acne.
- **Flicker check:** render a frozen frame twice with the camera nudged 1 mm and count pixels
  that change sharply. What remains is one-pixel antialiasing ticks along ink edges, with no speckle
  inside surfaces.

## Notes so far

- **KayKit is the backbone.** Its rig and CC0 animation library cover infantry, archers, casters
  and undead with consistent proportions, and the chunky miniature style reads well from the
  game's camera angle. Its large rig is a cheap base for our own brutes.
- **Gaps:** there is no free CC0 horse or rider (Knight and Outrider cavalry), no griffin, and no
  siege engines. The Dragon only flies (no ground clips) and has no breath clip, so its fire uses
  the attack clip.
- **Quaternius RPG** characters use darker hand-painted textures (lifted 1.35× here) and a
  different rig, so KayKit clips don't play on them.
