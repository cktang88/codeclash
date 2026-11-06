# Battle rendering: per-frame cost

What a frame of the battle view costs (CPU to build it, GL calls, uploads, draw calls, GPU work),
what was found, what was changed, and what is left. Scope: `src/client/render/scene.ts` and the
GL code it drives (`gl.ts`, `field-hd.ts`, `fx-hd.ts`, `standards-hd.ts`, `post.ts`) and
`src/client/ui/BattleView.tsx`. Sprite painting, sheet caching and art switching are covered in
[art-loading.md](art-loading.md).

## How it was measured

`scripts/battle-render-bench.mjs` drives `battle-perf.html` in headless Chromium (software
WebGL: SwiftShader) on two Vite servers at once, the base commit and this branch, and alternates
them run by run (the machine is shared and loaded, so single numbers drift; compare pairs).
Each run loads the battle, fast-forwards to the tick, waits until every grid and every sheet the
view wants is on the GPU (`__sharp`), then draws 240 frames as the game does at 1×: a tick every
6 frames, `alpha` stepping between ticks, `dt` = 1/60. It reports per frame:

- `draw`: CPU ms in `BattleScene.draw` (JS plus issuing GL commands; on software GL the GPU work
  runs in Chrome's GPU process and shows up here only when the command buffer fills);
- `build`: the part of it filling the instance buffers;
- `afterStep`: ms per tick in `BattleScene.afterStep` (blood, dust, marks, decals);
- every WebGL call counted by name, bytes sent by `bufferData`/`bufferSubData`/`tex(Sub)Image2D`,
  draw calls per frame (min..max: ground recompose frames have more);
- 30 paused frames (`dt` = 0): ms and GL calls;
- with `alloc=1`, KB allocated per frame under `draw()` and per tick under `afterStep()` (V8's
  sampling heap profiler, counting objects already collected), by function;
- with `cpu=1`, a CPU profile by function.

The scene: `men=4000 seed=3 t=600` (a minute in, the lines locked, ~2,000 dead), 1600×900,
zoom 1 unless said.

Screenshots: `shot` mode runs both builds on a fake clock (`performance.now` stepped 1/60 s a
frame) so the throttles are deterministic, reads the canvas back, and compares byte for byte.

## Findings (base: master c6212d7)

Per frame, HD, zoom 1 (classic in brackets where it differs):

| | base |
|---|---|
| draw calls | 12-14 (9-12): every batch drawn twice (shadow, solid) with its own texture, plus soft, ground, post |
| `bufferSubData` | 6.2 calls, 1.07 MB a frame, of which 0.52 MB was the HD decal batch: all of it (~3 MB late in a battle) sent again on every tick that added a decal |
| `bindBuffer` | 29: every per-kind HD batch (22 of them) uploaded every frame, empty or not |
| `texSubImage2D` | 20 calls, 333 KB a frame: the marks texture sent tile by tile every frame (blood drops land every frame), though only the throttled compose reads it |
| `pixelStorei` | 44 (the tile uploads) |
| `uniform*` | 66 |
| allocation | 580 KB a frame under `draw()`: `Atlas.at` returns a fresh `[u, v]` per figure per frame (and `gridColOf` another), names built per prop, stake and standard; 1.36 MB per tick under `afterStep()` (a new object per particle, a name string per decal) |
| paused | every frame redrawn in full: ~1.5 ms CPU and 191 GL calls a frame for an unchanging picture |
| stalls | 5-7 s frames: `bufferSubData` of the 3 MB decal batch blocking while software GL worked through the recompose of every decal in view (CPU profile: 9.5 s of 12.7 s drawing 240 frames was in `bufferSubData`, 2.7 s in `texSubImage2D`) |

And outside the steady state:

- **Ground recompose.** Every 0.6 battle seconds (and every 2 s for blood ageing) the whole view's
  marks pass ran again over the full buffer, and every decal in view (tens of thousands late in a
  battle) was redrawn into it. The decal batch was also refilled from scratch every 2 battle
  seconds, only to recolour ageing blood.
- **Grid uploads.** The level-1 grid canvas of an army (5088×2112, 43 MB) was uploaded whole with
  `texImage2D` each time one kind's strip landed from a worker: ~20 full uploads in the first
  seconds of a battle.
- **HD sheet uploads.** Each sheet went up in one `texSubImage2D` the frame it was first wanted:
  when several 8x sheets landed together one frame sent ~300 MB (8 s on software GL).
- **WebGL contexts.** `BattleScene.dispose()` freed GL objects but kept the context, and
  `BattleScene.supported()` made a probe context per mount. Over 12 route changes between `/` and
  `/demo` 16 contexts stayed alive and Chrome began dropping the oldest ("Too many active WebGL
  contexts").
- **React and the loop.** One `requestAnimationFrame` loop per mounted view (cancelled on
  cleanup), no duplicate. But the HUD state was set every 200 ms even while paused (a React
  re-render of the whole view for the same numbers), and the `ResizeObserver` reassigned the
  canvas size even when unchanged (which clears the canvas and reallocates its buffers).

## What changed

1. **One draw per pass** (`gl.ts`: `SpriteStream`). All alpha-tested batches (both armies' grids,
   each HD kind's sheet, effects, HD missiles and stakes, standards) go to one GPU buffer and are
   drawn in one instanced call per 4 textures (`PARTS`); the vertex shader finds an instance's part from
   `gl_InstanceID` and the part ranges, and the fragment shader samples that part's unit. The
   instances keep their order, so depth ties and blending are exactly as before: classic is
   pixel-identical. Shadows, solid and soft are one call each; the classic ground stamps one.
   Batches make their GL buffer lazily and skip empty uploads.
2. **No per-figure allocation** (`scene.ts`). Atlas cells and HD slots are cached in typed tables
   per (kind, anim, frame, dir); prop regions and positions, stake regions and particle damping are
   computed once; particles are reused from a pool; decals are added by sprite id.
3. **Decals** (`field-hd.ts`). Each decal remembers its instance in the batch. A new decal that
   overwrites one in its bucket's ring takes that instance; others are appended. Only the new
   tail and the rewritten runs go to the GPU. Blood decals carry the second they fell and are
   darkened in the shader (mode 2), so the batch is never refilled for colour; it is rebuilt only
   when the view moves.
4. **Incremental ground compose** (`field-hd.ts`). Marks and decals flag the 64-px map tiles they
   touch. A compose redraws only those tiles' runs (scissored), and the decals over their bounding
   box; it falls back to one full pass when most of the view changed. The marks texture is sent
   only right before a compose, a run of tiles per call. Blood is coloured at a clock that moves in
   2 s steps (it was the compose time); at each step the tiles whose blood is still darkening are
   composed again, all at the same clock, so tiles never disagree.
5. **Texture uploads** (`scene.ts`, a small hook in `sprites128.ts`/`contract.ts`). The atlas lists
   the kinds whose strips landed (`Atlas.landed`); the scene uploads just those strips. HD sheets go
   up in bands of rows, at most 8 MB a frame; until a sheet is all there its kind is drawn from the
   finest level already up, else the grid.
6. **Paused frames** (`scene.ts`). `draw()` with `dt` = 0 does nothing when the canvas size,
   camera, tick, alpha, scanlines and atlas versions are as last drawn, no compose is pending and
   nothing is still painting or uploading. The page keeps showing the last frame.
7. **BattleView**. The HUD is set only when the tick moved; the resize observer only assigns a size
   that changed; the canvas is made by the effect inside a holder (which takes the pointer and wheel
   events) and dropped with its context on cleanup (`dispose(true)` loses the context), so a remount,
   including React's development double-mount, starts on a fresh canvas. `supported()` gives its
   probe context back.

## Results

Base master c6212d7 against this branch, two runs each, alternated (the two numbers are the two
runs; per frame unless said). 4,000 men, a minute in, 1600×900.

| | HD zoom 1 | HD zoom 3 (melee) | classic zoom 1 |
|---|---|---|---|
| draw calls | 12-14 → **6** (39 on a compose frame with many changed tile runs, each a cheap scissored pass) | 48-50 → **14-16** | 9-12 → **5-6** |
| GL calls | 256 → **123** | 556 → **217** | 160 → **98** |
| `bufferSubData` | 6.2 calls, 1.01 MB → 6.7 calls, **0.50 MB** | 24 calls, 593 KB → **4.9 calls, 385 KB** | 4.8 → 2.6 calls (same 416 KB: the figures) |
| marks `texSubImage2D` | 20 calls, 324 KB → **1.2 calls, 63 KB** | same | - |
| CPU `draw()` mean | 40.8 / 28.3 ms → **2.8 / 2.7 ms** | 2.6 / 2.4 → 2.4 / 2.3 | 2.0 / 1.9 → 2.0 / 2.0 |
| CPU `draw()` median | 1.9 / 1.8 → 2.3 / 2.3 | 1.9 / 1.8 → 2.0 / 2.0 | 1.5 / 1.4 → 1.5 / 1.5 |
| CPU `draw()` worst | **7.4 s / 5.5 s → 14 / 15 ms** | 20 / 18 → 15 / 11 | 13 / 12 → 10 / 16 |
| instance build median | 1.6 / 1.6 → 1.7 / 1.7 | 1.6 / 1.5 → 1.5 / 1.5 | 1.3 / 1.2 → 1.1 / 1.1 |
| `afterStep` per tick | 2.5 / 3.4 → 3.0 / 3.8 ms | 3.3 / 2.8 → 2.8 / 3.2 | 1.5 / 1.3 → 1.3 / 1.3 |
| allocated per frame | 580 → **254 KB** | | 418 → **268 KB** |
| allocated per tick | 1,360 → 1,269 KB | | 662 → 620 KB |
| paused frame | 1.5 ms, 191 GL calls → **0.08 ms, 0** (29 of 30 skipped) | 1.8 ms, 491 → **0.07 ms, 0** | 1.4 ms, 144 → **0.08 ms, 0** |

With the GPU waited for after each frame (`sync=1`, HD zoom 1, software GL: this is mostly
SwiftShader shading 1.44 M pixels): mean **644 → 432 ms**, worst **30 s → 3.5 s**, median 336 →
351 ms. The median is 4% worse: the fragment shader's pick of the part's texture (with 8 textures
a call it was 10%: hence `PARTS` = 4, see gl.ts). On a real GPU that pick is a uniform branch and
the draw-call and upload savings are what count.

What the numbers say:

- The sluggishness on HD was the stalls: on frames that recomposed the ground the renderer
  blocked for seconds behind the GPU (software GL) uploading the decal batch. They are gone
  (worst frame 14 ms), because only new decals are uploaded and a compose redraws only the tiles
  that changed.
- The steady frame was already cheap on the CPU (~2 ms) and stays there: the median does not move
  outside the noise of this loaded machine. What dropped is the work around it: GL calls halved,
  draw calls a third to a half, bytes uploaded halved, marks uploads a fifth, allocation per frame
  by 40-55 %.
- Paused, nothing is drawn.
- The texture uploads (grid strips, sheets in 8 MB bands) and the WebGL context release are not in
  this steady-state table: see the findings above and the commit messages (the grid strip upload is
  1/11 of the grid; a frame uploads at most 8 MB of sheets instead of up to ~300 MB; 1 live context
  after 12 route changes instead of 16).

## Proof that the picture is the same

Both builds were run through `shot` mode: 11 views against master cfd7e98 before the last merge, and 5 again on the final tree against master c6212d7 (the same results).

- **Classic: pixel-identical.** 0 differing bytes in every view: zoom 1, zoom 3 on the melee,
  samurai at zoom 4, stills and after 120 running frames (2 s of battle with ticks, particles,
  stamps).
- **HD stills** (straight after the fast-forward, so both builds compose the ground at the same
  moment): at most 2 levels of difference, in 0.35-0.85 % of the pixels: the blood splatter decals,
  now tinted by age on the GPU in float32 (was float64 on the CPU) and at the 2 s blood clock. HD
  zoom 1, zoom 3, samurai zoom 4, HD 64 zoom 3. See
  [still, base | after](../screenshots/battle-render-perf/hd-z3-still-base-vs-cur.png) and
  [every pixel that differs](../screenshots/battle-render-perf/hd-z3-still-diff.png).
- **HD running** (120 frames): the figures, effects and standards are identical; the ground
  differs where blood and splatter fell in the last half second, because the base still showed
  its last throttled composition and the new build caught up (the bench composes what changed
  before the final still). See [running, base | after](../screenshots/battle-render-perf/hd-z3-running-base-vs-cur.png)
  and [the diff](../screenshots/battle-render-perf/hd-z3-running-diff.png) (red: differs).
- **Incremental compose = full compose.** In every HD shot the bench also composed the ground
  from scratch at the same moment and compared: 0 differing bytes in all of them.

## What is left

- **The per-figure loop** is now the steady-state cost (~1.5 ms for 4,000 men). V8 boxes the
  doubles passed to `Batch.sprite` (15 arguments, not inlined in a function this size): ~200 KB of
  heap numbers a frame. Writing the instance floats straight into the batch's array in the loop, or
  a packed instance format (16-bit positions, 8-bit colours) halving the 64 bytes an instance,
  would cut both the CPU and the upload.
- **The dead are drawn every frame in HD** (thousands of instances late in a battle, in both
  passes). They never move: they could be baked into the ground composition like the decals (with
  the HD sheet of their kind at the view's level), as the classic art stamps them.
- **Shadows draw every sprite a second time.** A cheaper shadow (a blob per figure, or the
  silhouette at half resolution) would halve the vertex and fragment work of the solid pass.
- **A compose still runs every decal in view through the vertex shader**, scissored to the changed
  tiles. Keeping the decal batch in bucket order with each bucket's range would let it draw only
  the buckets over the changed tiles.
- **`afterStep` in HD** (~3 ms a tick at this size; 1× runs 10 ticks a second, so about 0.5 ms a
  frame): every moving or fighting man adds a trampling mark every other tick. Coarser marks for
  the walking, or the marks in a worker, would cut it. It did not get faster here (the dirty-tile
  bookkeeping costs about what pooling saved).
- **The 8 MB a frame sheet budget is a constant.** It could follow the measured upload time. The
  texture of a big sheet is still allocated in one call (no pixels sent, but the GPU clears it).
- **Software GL.** On SwiftShader the post pass and the shading of the 1.44 M-pixel canvas are
  most of a frame (~330 ms). Rendering the post pass at the buffer's resolution and letting the
  browser upscale would help software GL a lot, but changes the grain and scanlines, so it is left.

## Round 2: the 2400 × 2400 field (cc/frame-perf)

The field grew from 1600 × 1200 to 2400 × 2400 (the ground canvas from ~3.6 to ~9 Mpx) and
battles reach 2,800 figures a side. The complaint: sluggish, above all when scrolling.

### Measured (before)

`scripts/battle-render-bench.mjs` now also takes `pan=` (the camera sweeps east and back and drifts
south, so many world units a frame), `zoomEvery=`, `frame=1` (the game's opening view) and prints
`BattleScene.lastPasses`: CPU ms per part of a frame (uploads, build, ground, shadows, sprites,
post); with `sync=1` the scene waits for the GPU after each part (`syncPasses`), so the parts
include the GPU's work. Software GL (SwiftShader) on a shared, heavily loaded 4-core box: the GPU
numbers are a proxy for fill and shader cost, not what a real GPU takes.

- **The opening view is zoomed out below 1.** On a 1600 × 900 canvas the armies on the new field
  are framed at zoom 0.4-0.7 device px per map px, and the scene buffer was drawn at map
  resolution, 2.1-7× the canvas's pixels (3200 × 1800 at zoom 0.5, 3414 × 1920 at 1280 × 720),
  only for the post pass to keep one pixel in so many. GPU: ~1.0-1.5 s a frame on SwiftShader,
  ground, shadows and sprites all scaling with the buffer.
- **HD scrolling repainted the whole ground every frame.** The ground shader (the heaviest in the
  game: noise zones, tufts, stones, flowers) and the marks composition were cached for exactly
  the view: any pan of a pixel painted the whole view again, every frame of a scroll, and refilled
  and re-uploaded the decal batch (`buildDecals` keyed on the view's box).
- **A zoom in HD** (to 4x) paints the ground at the new level over the whole view: ~6-8 s of
  software GL for that one frame, 90 % of it the tuft/stone loop of the ground shader (measured by
  cutting the loop out: 6 s → 0.4 s). Sheets and uploads are not the cost of that frame.
- **CPU**: `draw()` ~2-5 ms median at 450-5,600 figures, of which the instance build is most
  (per-figure animation state for the figures in view: soldiers are already box-culled, and the
  cull is a few flops for the ones out of view, so a spatial index would not pay). Stake lines
  were drawn whole wherever they were. The sim's step is ~6.5 ms a tick at 5,143 figures
  (`pnpm bench 2800 3`), outside the renderer.

### What changed

1. **Zoomed out, the scene is drawn at the canvas's size** (`gl.ts` `useDirect`, `post.ts`
   `direct`, `scene.ts` `view.direct`). Each device pixel is shaded as the buffer pixel the post
   pass would have picked: the fragment shader computes that pick with post's own sum
   (`floor((dev - off) / u)`, clamped to the virtual buffer) and evaluates the quad (or the sheared
   shadow) at that pixel's centre; quads grow a map px (3 at the far edges, where post clamps) so
   every pixel that picks a px inside them is reached. The HD ground is copied out with the same
   pick (`COPY_FS`).
2. **HD ground: a tiled cache with a margin ring** (`field-hd.ts` `plan()` / `drawGround()`). The
   ground and its composition live in 64-texel tiles over a window about half a screen wider than
   the view on each side; while scrolling the window leans ahead (up to all of its slack on the
   side the view moves to). Each world tile has a fixed slot (tile coordinates modulo the cache's
   size), so the window slides like a ring and nothing is copied. Tiles in view are painted at
   once; the margin a sixteenth of the view's area a frame (or twice what the scroll brings into
   view a frame, if more), nearest and ahead first, none on a frame that paints over a quarter of
   the view (a zoom). The view is copied out with up to four blits. Changed marks recompose only
   the cache tiles under them (same throttle, same 2 s blood clock); tiles leaving the window are
   dropped if they change meanwhile. The decal batch covers the window plus a quarter and is
   refilled only when the view leaves that. A static view paints nothing; the cache is at most
   16 Mpx a target.
3. **Ground shader**: a tuft/stone cell is tested for reach before its noise and hashes (same
   result).
4. **Stake lines** off screen are skipped.
5. **HD sheets near the view**: kinds within a screen of the view (`seenNear`) have their sheets up
   to 4x asked as `prefetch` (SheetAsk), so a scroll meets them sharp. This is the only piece
   that touches sheet priorities (cc/hd-load owns them): one mask and one line in `pickLevels`.

### How the margins prevent pop-in

- Ground: the cache always holds the view plus a ring around it; scrolling moves the view into
  tiles already painted (the ring is refilled ahead of the scroll), and a tile that is not there
  yet is painted in the same frame before the view is copied, so the ground is never missing,
  only, at worst, paid for in that frame.
- Figures: HD sheets for kinds within a screen are prefetched; classic sprites and the classic
  ground are whole textures (nothing to pop).
- Everything culled (figures, corpses, props, standards, missiles, particles, stakes) is culled
  with a margin past the view's edge (40-100 map px), as before.

### Results

See the table in the frame-perf report (commit messages and below).
