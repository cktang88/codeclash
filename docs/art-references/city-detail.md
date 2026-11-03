# City detail: a dense, lived-in, golden-hour town (HD)

The brief for the city-detail pass on the HD city (`src/client/render/city.ts`, `city/props.ts`,
`city/prop-art.ts`, `city/templar-hd.ts`, `city/ground-hd.ts`, `city/buildings.ts`). The user's
complaint was "they look super simplistic and polygonal. Real towns have a ton of details". The
targets are listed in [user-targets.md](user-targets.md): `town-gstatic`, `town-redbubble` and
later `town-displate`, which the user loves and which set the light. Study copies are in
`references/city-detail/` and `references/user-targets/`, both git-ignored. No third-party image is
committed. Every pixel of the city is painted by our code.

## References studied

| image | direct URL | page | licence | what I took from it |
|---|---|---|---|---|
| User target: town street (gstatic) | see user-targets.md | — | study only | Clutter everywhere: barrels, crates, flower pots, market stalls with striped awnings, hanging signs. Half-timbering with braces over plaster, jettied storeys, ivy curtains, warm sun pools on cobbles against cool shade. |
| User target: town (Redbubble print) | see user-targets.md | — | study only | Materials. Rubble stone with individual stones and mortar, roofs of single tiles with ragged edges, plank doors with iron straps under stone arches. Cobbles with grass at the edges, barrels and pots at every wall foot. |
| User target: town-displate | see user-targets.md | — | study only | **The look.** A golden-hour sun: cream-to-ochre lit faces and warm pools on the ground, against deep blue-violet shade. Dappled light through the canopy. Ivy and vines hang in yellow-green clusters with lit tops and dark undersides. Windows and lanterns glow warm even in daylight. Heavy dark timber. Chunky clusters, no noise. |
| `oga-medieval_props_128x64_shaded.png` | https://opengameart.org/sites/default/files/medieval_props_128x64_shaded.png | https://opengameart.org/content/isometric-medieval-props | CC0 | Prop scale and kit at iso 2:1: barrels in twos and threes, stacked crates, sacks and jars, buckets. Each one reads from a lit top, a mid left side and a dark right side, plus a contact shadow. Barrels have two or three dark hoops and visible staves. |
| `oga-medieval_props_2x2_128x64_shaded.png` | https://opengameart.org/sites/default/files/medieval_props_2x2_128x64_shaded.png | same | CC0 | The two-wheeled handcart with shafts, the well with a little gabled roof and a bucket, and market stalls: a counter of goods under an awning on four posts, with crates beneath. Our `cart`, `well` and `marketStall` follow these. |
| `oga-building2_prev.png`, `oga-building1_prev.png` | https://opengameart.org/sites/default/files/building2_prev.png | https://opengameart.org/content/isometric-medieval-buildings | CC0 | Half-timbering at iso scale: posts, a mid rail, diagonal braces, plaster infill, all over a rubble plinth. Shingle roofs with dormers. An outside stair and barrels at the foot. The roof carries most of the mass. |
| `oga-bp3_prev_b1.png` | https://opengameart.org/sites/default/files/bp3_prev_b1.png | https://opengameart.org/content/isometric-medieval-buildings-2 | CC0 | A timber upper storey over a stone ground floor, a tall dormer gable with a round window, a small arched door, and barrels by the corner. This became the jettied upper storey on every hall. |
| `oga-demo_1/2/3.jpg` | https://opengameart.org/sites/default/files/demo_2.jpg | https://opengameart.org/content/400-isometric-town-tiles | CC0 | Roofs that read tile by tile at small scale: each course shades the one below. A lit side, a darker hue-shifted side, edges carried by value change. |
| `sly-51-buildings1.png` | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/d25beaa3-791b-4744-80ef-04b8a8006957/144-Top-Down_Buildings_1.png | https://www.slynyrd.com/blog/2024/7/25/pixelblog-51-city-builder | © Raymond Schlitter, study only | Build a building in stages: mass, roof, openings, then dressing (doors, steps, plants). Dressing is what makes it lived-in. Short hue-shifted ramps, warm lit, cool shade. |
| `sly-iso-tiles.png` | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/2d03d5bf-b096-41bd-87a5-507d3b85d470/114-Iso_Tiles.png | https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art | © Raymond Schlitter, study only | Cobbles and flags on the 2:1 grid as rounded clusters with a lit upper-left rim. Texture density kept even. |
| `gk-farm.png` (Graveyard Keeper) | https://slava.lazybeargames.com/content/images/2024/11/k2fz1wmhn9yw-rcgvticox4_bh4-1-.png | https://slava.lazybeargames.com/graveyard-keeper-how-the-graphics-effects-are-made | © Lazy Bear Games, study only | Clutter round a house (a wood pile, a chopping block, flowers, a bush), a path of loose stones fading into grass, and warm windows at dusk that light only the nearby ground. |
| `photo-ploenlein-1900.jpg` (Rothenburg, Plönlein, Photochrom c. 1900) | https://upload.wikimedia.org/wikipedia/commons/0/09/Ploenlein%2C_Rothenburg_%28i.e._ob_der_Tauber%29%2C_Bavaria%2C_Germany-LCCN2002696185.jpg | https://commons.wikimedia.org/wiki/File:Ploenlein,_Rothenburg_(i.e._ob_der_Tauber),_Bavaria,_Germany-LCCN2002696185.jpg | Public domain | A real medieval street. Cobbles in rows with a smoother worn track, a jettied half-timbered gable with its braces, hanging signs on iron brackets, shutters, and a tower gate with a round arch. |

## What was built

- **Props (`city/props.ts`, `city/prop-art.ts`).** A shared library of isometric props painted at
  the frame's density from the style's ramps, lit from the upper left, with a coloured outline.
  The list: barrels (staves, hoops, a lid, apples or rainwater), crates (deal battens over dark
  boards with a brace), sacks, a hay cart and a handcart, wood piles with cut ends, benches,
  flower pots, potted trees, market stalls (striped awning with a scalloped hem, goods, crates),
  lamp posts with lanterns, a well, troughs, haystacks and bales, hurdles, washing lines, bushes
  and rose bushes. The library also exports wall dressings: ivy and vine curtains, window boxes
  and hanging signs.
- **The placement pass.** The pass is deterministic from the city seed and the levels. It places
  props along the faces the viewer sees, by the road ends that lead to doors, along road edges,
  inside the walls and at a fair outside the gate. Density follows each building's tier (0, 4, 8,
  13, 20 groups). Props stay clear of everything the buildings recorded on the ground
  (`pixels.ts recordFootprints`, so it works for every faction's kit), of the roads (`roads.ts`
  `roadDistance` ≥ 6.2, beyond where people walk), and of the drill yard, the butts, the engine's
  ground, the fields, the paddock, the garden and the trees. The API (`registerProp`,
  `registerTheme`, `PropDef.glass`, `PropDef.anim`, `PropDef.flicker`, `sunFor`) is documented at
  the top of `props.ts`, and the Samurai and Undead towns use it.
- **Ground (`ground-hd.ts`).** Cobbled lanes of rounded stones in four warm tones, lit at the
  upper left, with mortar joints. Grass and moss grow in the less trodden joints, a worn pale
  path runs down the middle, and stones go missing at the verge. Outside the gate the road is a
  dirt track with two wheel ruts, a grass crown and puddles that reflect the sky. The flagstones
  are big slabs. The meadow has clover and drifts of wild flowers. Trees cast swept shadows
  broken by sun flecks. Everything is cell clusters and stamps on a world lattice, with no
  per-pixel noise.
- **Templar HD buildings (`templar-hd.ts`).**
  - Walls: half-timbering with posts, rails, braces and plaster (some panels fallen to the
    brick); rubble and ashlar courses with blocks of varied width, bevelled and mortared; moss
    at the foot, rain streaks, and warm sun dapples on the lit face.
  - Roofs: single tiles, slates or shingles, each course shading the one below. The eave is
    ragged, a tile has slipped here and there, and moss grows in clumps.
  - Openings: round and lancet heads, mullions and leaded quarries, sills, painted shutters,
    and plank doors with straps under voussoirs.
  - Every hall but the church has a jettied half-timbered upper storey on joists, dormers, a
    balcony with trailing vines, window boxes, ivy, climbing roses by the doors, flowering
    bushes, a lantern and a sign by the door, and a sooty chimney with a cap and a pot.
  - The church has a traceried rose whose coloured panes light at night, lancets round the
    rotunda, and a chevroned portal.
  - Only the HD Templar painter (`Painter.rich`) uses these. Classic is pixel-identical (checked
    by screenshot diff at levels 3, 8, 13 and 20, day and night).
- **Light.**
  - The golden-hour palette (`style.ts templarHd`): warm, bright lit steps and blue-violet
    shade.
  - A per-faction low sun (`sunFor`) that throws long cast shadows from every recorded
    footprint, every prop and every tree.
  - A golden day grade, with lamps and windows still glowing warm by day.
  - At night, light pools (`CityScene.lightPools`) instead of halo discs: occluded, ragged,
    three flat bands on the ground and on the walls behind each light, plus a 1-2 px bloom at
    the source.

## Critique rounds (screenshots in the session scratchpad, before/after in `docs/screenshots/city-detail/`)

1. **Props and cobbles.** The props read, but the lamp posts looked like black flags and the
   wood pile like a slab. A lone bush on the lanes looked like a ball, and the yard scatter put
   barrels in open fields. Fixes: a timber post with a bigger caged lantern, logs with cut ends,
   no bushes on the lanes, scatter only inside the walls.
2. **Night.** The first pools were too big and mottled (3×2 wobble cells) and lit the
   gatehouse walls in blotches. The reach is now smaller and the bands dimmer, the clusters are
   6×4, and wall patches are capped at the middle band. Also as requested, the
   necropolis halos became a bloom only.
3. **Buildings.** The tiled roofs and dormers read, but the stone tiers were still big pale
   boxes. Every hall but the church now gets a jettied half-timbered upper storey over its
   stone ground floor, the stone contrast went up, and the dormers grew.
4. **Golden hour.** The light was still even. The lit steps are now cream to ochre and the
   shade blue-violet, the sun is lower with longer shadows, tree shadows are swept from the
   trunk so they stay attached, and the dapples are stronger.
5. **Soldiers.** The drill read as a murky blob. That was the level-1 fallback drawn at world
   scale while the HD sheets were still painting. It is now drawn at one texel per buffer pixel,
   the sheets are requested up front, and the drill is spaced wider on a paler yard.
6. **Props close up (×8).** Crates looked like loaves and bales were blotchy. Crates now have
   pale battens over dark boards and a brace, barrels have dark stave joints, and bales have
   straw lines and twine.

## Checks

- `pnpm pixel-lint --only=city`: the baseline before this pass had 2 failed checks, both Undead
  HD. After it, Templar had 0 fails over its 20 scenes (classic and HD, tiers 0-4, day and night).
  Building orphans in HD Templar measure 17-18% (warn above 12%, fail above 20%), after the
  single-pixel tile crowns and stone pits were dropped. The other failed checks in the full city
  lint are the Undead town's (its silhouette edge ΔL and iso runs), whose agent is working on them.
- Classic is pixel-identical: screenshot diffs at levels 3, 8, 13 and 20, day and night, show no
  differing pixel.
- Frame time (headless Chromium, SwiftShader, 1280×720, scene 0, with the soldier sheets
  painted; best of 3 interleaved runs against master at 7028ffa). Level 20, day, zoom 1:
  4.7 → 6.7 ms. Level 20, night: 5.3 → 7.4 ms. Level 20, day, zoom 4: 5.1 → 4.3 ms. Level 5,
  day: 3.3 → 5.2 ms. A rebuild (a level change) takes about 0.9-1.8 s, up from 0.4-1.6 s; that
  covers painting the props and the cast shadows. The night's light pools are painted once, on
  the first night frame after a rebuild.

## Rebuild performance (level changes without the stall)

A level change used to rebuild the HD city in one go inside `draw()`: the changed building, then
all the props placed and painted again, then the night's light pools on the next night frame,
while the ground followed a band at a time (and for those frames the new buildings stood on the
old ground). Profiled with Playwright in `city-preview.html?art=hd&faction=…` (mid town, levels
5-10), per piece: a building 4-25 ms, the keep 13-82 ms, the walls 66-118 ms, placing the props
2-5 ms, painting them 28-50 ms, the ground 158-177 ms in 10-13 steps with single steps of
43-58 ms, the light pools 69-95 ms. Most of it is per-pixel shading in the kits' painters, so it
cannot be cut into 6 ms slices without making every kit resumable.

What changed:

- **The build is a job** (`src/client/render/city/build.ts`, `CityBuild.steps`): a generator, like
  `groundSteps`, that yields after each piece of real work and returns a whole `Built` (arts,
  ground, props, mill, pools, anchors). Each piece is cached by what it depends on, so only what
  changed is repainted: a building by key, level and scaffolding (with its night and lights
  canvases; the last two levels per building are kept), the props by the footprints and every
  building's tier, the ground by its key and the shadows, the mill by the granary's level, the
  pools by the arts and the lights. The light pools moved to `city/pools.ts` as a generator too.
- **HD builds run in a worker** (`build-worker.ts`, OffscreenCanvas through a tiny
  `document.createElement` shim in `worker-dom.ts`; `build-remote.ts` on the scene's side). The
  worker keeps one `CityBuild` per scene, coalesces a burst of changes to the latest, and sends
  each canvas once as an ImageBitmap; later builds name canvases by id. Without a worker (or if it
  fails) the scene runs the same job on the main thread under a 6 ms budget per frame.
- **The swap is atomic**: the old city stays on screen until the new `Built` is complete, then
  `adopt()` swaps everything at once (new people only when the levels changed). The first paint
  and classic stay synchronous; right after the first paint the worker builds the same city once,
  which warms its caches and brings the night's pools, so no pools are made on the main thread
  after that.
- Two small hooks outside `city.ts`: props anims carry their `kind`/`flick` so a worker build can
  name the function again (`propAnimFn`, props.ts), and `Px.clear()` now also clears the light
  classes. That was a real bug: the Undead `sunlit` reads the class of the pixel above, which kept
  whatever the previous building left there, so a building's art depended on what was painted
  before it and an incremental rebuild could not match a full one.

Correctness: `pnpm tsx scripts/city-rebuild-check.ts` builds six level sequences per faction
(level-ups, tier changes, walls, a burst of changes landing before the last build is in,
scaffolding, a drop and a rise) through the worker and through the main-thread job, and compares
every art, lights and night canvas, the ground and crops, the pools, anims and anchors with a
fresh synchronous build of the final levels: all 36 HD sequences are pixel-identical, and the
classic ones too. Fresh synchronous builds are pixel-identical to the code before this change
(HD and classic, six level sets per faction, the layers and the full day and night frames).

Numbers (headless Chromium, 1280×720, mid town, day and night for each faction, frame by frame;
the machine was shared, load average 7-11 on 4 cores, so single frames are noisy and idle frames
alone spike to 40-100 ms). "Build work" is the main-thread time spent on the rebuild in one frame
(the old `rebuild`/`stepGround`/pools, the new `schedule`/`pump`/pools and the worker reply).

| change | worst frame before | median before | worst frame after | median after | until the new city is shown, after |
|---|---|---|---|---|---|
| level-up (same tier) | 203 ms | 14 ms (night 58-203) | 16 ms | 3 ms | median ~200 ms |
| tier change (building, keep) | 340 ms | 182 ms | 8 ms | 3 ms | 300-1750 ms, avg 900 |
| walls level | 377 ms | 202 ms | 4 ms | 1 ms | 190-670 ms |
| five buildings at once | 567 ms | 214 ms | 4 ms | 3 ms | 300-1560 ms |

Before, a level-up by day was shown in one frame (5-28 ms) but cost 58-203 ms at night (the pools);
a tier change showed the new building at once on the old ground and finished 0.3-1.6 s later.
After, the remaining main-thread cost is the worker reply (3-8 ms: wrapping the new bitmaps in
canvases) and the swap (0.2 ms, populate 0.1 ms). The first change after opening can wait 1-3 s,
while the worker is still on its warm-up build. The first paint stays synchronous: 470-1090 ms
(510-790 ms before; the same work, plus noise).
`pnpm tsx scripts/city-rebuild-check.ts --bench` prints these numbers.
