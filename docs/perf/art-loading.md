# Art loading and art-mode switching

How long the battle takes to show its figures, and to go sharp, in each art mode (Classic 48,
HD 128, HD 64); what an art switch costs; what the /demo Units tab costs; and what was done about
it. Scope: painting, caching and handing over sprite sheets (`sprites128.ts`, `sprite-worker.ts`,
`sheet-cache.ts`, `paper/core.ts`, `sprites.ts`). The per-frame battle render (`scene.ts`) is
measured separately.

## How it is measured

- `scripts/art-loading.cjs` drives headless Chromium (Playwright, software GL: SwiftShader) over
  **production builds** of two trees (`scripts/art-loading.vite.config.mjs` builds the app plus
  `battle-perf.html`; `scripts/art-loading-serve.cjs` serves them), running every scenario on the
  baseline and then on the change, so both see the same machine load.
- The page is `battle-perf.html` (20 000 men, paused at tick 0, 1280×720, camera on side 0:
  `aim=0`), zoom 1 for Classic (1 map px per screen px) and zoom 4 for HD (the 8x sheets: a man
  about 100 px tall) and HD 64 (its finest, the 4x halving).
- **First frame**: page time of the first battle frame. **Sharp**: page time at which every kind
  in view is drawn at the finest level the view shows and every kind's level-1 grid has landed
  (`__sharp()` in the harness). Times are ms since navigation.
- **Second visit**: the first page is left until no sheet has landed for 8 s (it has painted what
  it queued), closed, and the same URL opened in a new page of the same browser profile.
- **Switch**: the battle's art button, in place (`__switch`, as `BattleView` does): HD sharp at 8x,
  then HD 64, Classic, HD, HD 64; the time from the switch to sharp again.
- **Units**: `/demo?tab=units` in HD until all 11 kinds' level-4 sheets (the tab's size) landed.
- Sheets are checked byte for byte with `scripts/sheet-hashes.ts` (every faction, kind and level
  1, 2, 4, 8 and the HD 64 halvings, hue 215: 165 sheets).
- The machine: 4 cores, shared with other jobs (load average 9-16 throughout), so absolute times
  are inflated and noisy (±30% between runs); compare columns within a row. On 4 cores the pool
  has 2 painting workers.

## Results

Before: the tree at 6ff7b32. After: this work. Where a scenario ran twice (in opposite orders),
both runs are given. On this machine, first-visit times swing by 2-3x between runs (the same
build measured 50 s and 156 s to sharp at 8x), so read the first-visit rows as "about the same";
the second-visit, switch and Units rows differ far beyond the noise.

| | Before | After |
|---|---|---|
| Classic 48, first visit: first frame (= sharp) | 3.1 s | 3.4 s |
| Classic 48, second visit: first frame | 3.3 s | 2.9 s |
| HD 128 at 8x, first visit: first frame | 4.4 s, 3.5 s | 3.3 s, 4.0 s |
| HD 128 at 8x, first visit: sharp | 156 s, 50 s | 46 s, 56 s |
| **HD 128 at 8x, second visit: sharp** | **52 s, 132 s** | **8.2 s, 9.4 s** |
| HD 128 at 8x, second visit: first frame | 4.1 s, 4.1 s | 3.3 s, 3.4 s |
| HD 64 at 4x, first visit: first frame | 3.3 s, 5.7 s | 3.4 s, 4.2 s |
| HD 64 at 4x, first visit: sharp | 45 s, 74 s | 53 s, 64 s |
| **HD 64 at 4x, second visit: sharp** | **43 s, 83 s** | **4.8 s, 10.7 s** |
| **Switch HD 128 → HD 64 (8x sheets in memory): to sharp** | **42 s** | **19 s** |
| Switch HD 64 → Classic 48 | 2.3 s | 1.5 s |
| **Switch Classic 48 → HD 128 (back): to sharp** | **217 s** | **12.6 s** |
| **Switch HD 128 → HD 64 (back): to sharp** | **82 s** | **5.7 s** |
| Units tab (HD), first visit: all 11 level-4 sheets | 22.5 s | 18.8 s |
| **Units tab (HD), second visit** | **16.7 s** | **1.8 s** |

Paint cost per sheet (Node, A/B of the two painters alternated in one process under the same
load, 4 kinds at level 4 and 2 at level 8, twice each): **−10% at level 4, −23% at level 8**.

Memory: the JS heap at sharp is the same before and after (HD at 8x: 408 MB; HD 64: 132 MB), and
so are the GPU textures (258 MB / 127 MB). The HD painter now holds up to 392 MB of sheets at 8x
in this test (before: 318-392 MB): its 320 MB cap is soft (sheets the view uses are never
dropped), and the old LRU kept to it here only by dropping sheets between slow frames that the
next frame asked for again (item 9). After an art switch the previous mode's sheets stay until
the cap needs the room, which is what makes switching back cheap. On disk, one army's full HD set
(grids, levels 2, 4, 8, HD 64 halvings) packs to about 15 MB; the cache is capped at 192 MB.

What is left in the "after" numbers:

- A second-visit HD 8x view is sharp in ~8 s, of which reading the sheets takes well under a
  second; most of the rest is one frame that uploads every 8x texture at once (~300 MB, 8 s in
  software GL). See "Left for others".
- HD → HD 64 the first time (19 s) is mostly a worker still finishing an HD paint it had started
  (a paint cannot be interrupted), then halving seven 8x sheets.
- First visits are still bound by painting: 2.5-13 s per kind at 8x per worker, two workers on
  this machine. Only a hue-independent pre-bake or faster figure drawing would move that.

## What was done (one commit each)

1. **Clusters pass without allocations** (`paper/core.ts`). The small-cluster cleanup runs on every
   painted frame; it allocated a seen map per call, an array per pixel and a Map per small
   cluster. Typed scratch buffers with a generation mark, neighbours counted in the same order.
   A/B under the same load: paint time **−10% at level 4, −23% at level 8**; all 165 sheets hash
   the same.
2. **One sheet store for every atlas, grids kept per army** (`sprites128.ts`). Each atlas kept its
   own sheets and its own level-1 grid canvas, so a new scene, an art switch (HD and HD 64 share
   the grids and level-2 sheets) and switching back painted everything again. Sheets now live in
   one store keyed by army, kind and level (under the same LRU); the grid image is shared per army
   (last four kept); an HD 64 sheet whose level-8 source HD already holds is only halved.
3. **Classic atlases kept** (`sprites.ts`): the last four armies' atlases are reused.
4. **Paint queue: what the view wants now first.** After a switch or zoom, the previous view's
   queued sheets waited behind the new view's. Jobs remember their last ask; the queue serves
   grids, then what was asked for in the last second, then the rest.
5. **Persistent cache in IndexedDB** (`sheet-cache.ts`, `sprite-worker.ts`). The art is
   deterministic, so a sheet is fully named by the painter version and army, kind and level. The
   workers look a sheet up before painting it, and store what they paint after sending it back,
   palette-indexed (the art has a few dozen colours: one byte a pixel) and gzipped: a 53 MB
   level-8 sheet packs to 0.8 MB in about 0.5 s of worker time (5% of its 9.5 s paint) and
   unpacks in about 0.2 s. The version is a hash of every source file that decides the pixels
   (`vite.config.ts`): baked in by a build, answered fresh by the dev server at `/__art-version`,
   so editing the art paints afresh. Other versions and the least recently used sheets over
   192 MB are deleted. `?sheetcache=0` turns it off.
6. **The worker loads the painter on the first miss only.** Evaluating the painter (the paper
   figures build their rigs and mocap clips at start-up) takes each worker ~2-2.5 s before its
   first answer; the worker entry is now 3 KB and reads cache hits at once.
7. **Paint queue: level 2, then the finest level wanted, then those between.** Zoomed to 8x on a
   cold start, each kind was painted at 2, 4, then 8 before it was sharp; level 4 now waits.
8. **Sheet cache: read-only lookups** (the workers' reads had queued behind each other).
9. **Memory and queue idleness by frames, not by a fixed second.** The LRU dropped every sheet not
   asked for in the last second once over its cap; with frames over a second apart (a slow
   machine, software GL, the frame that uploads a pile of 8x sheets) everything looked idle and
   was read or painted again on the next frame. Idleness is now measured up to the renderer's
   latest ask with three frame gaps of slack.
10. **No cache lookups for sheets the cache lacks; warm the painter on the first miss.** A lookup
   waits behind any write in flight (another worker storing what it just painted): on a first
   visit misses took 0.3-2.8 s each before painting began (instrumented worker), which made the
   Units tab and a first HD 64 visit slower than before the cache. The main thread reads the
   cached keys once and tells each job whether to look; the first sheet to paint tells every
   worker to load the painter at once.

Correctness: after all of it, every one of the 165 sheets (factions × kinds × levels 1, 2, 4, 8,
and the HD 64 halvings) hashes the same as before, and `pnpm pixel-lint --only=sprites --quick`
gives the identical report on both trees (99 sprites, 129 failed checks, every value equal). Sheets
read back from the cache are byte-identical by test (`sheet-cache.test.ts`).

Probes: `battle-perf.html` gained `__switch`, `__sharp`, `aim=`; sheets and grids landing are
marked on the performance timeline (`codeclash:sheet`, `codeclash:grid`, with the sheet's key).

## Considered and not done

- **Pre-baked sheets shipped as assets.** Every army has its own heraldic hue (0-359, per
  player), and the hue changes which colours the palette reduction merges, so sheets are per hue:
  packed, one army's HD set is ~15 MB, times 3 factions and 360 hues. Shipping hue-independent
  "code" images and colouring at load would work but means restructuring the painter's last pass;
  the persistent cache gets the same effect from the second visit on.
- **HD 64 painted directly at level 4.** Not the same pixels as the 128 art halved; the mode is
  defined as the halving.
- **Deduplicating identical frames.** About 18% of templar's level-2 frames are exact duplicates
  of another frame of the same kind (60% for one kind), but which ones is only known after
  painting (the anti-flicker pass follows on from the previous frame), and packing them once
  would change the sheets' bytes. Left for a later pass with its own visual check.
- **More workers.** The pool already sizes itself from `navigator.hardwareConcurrency` (cores − 2,
  1 to 6); on 4 cores that is 2. More would compete with the battle's own thread; not measured
  as a win here.

## Left for others

- **Main-thread start-up**: every page that imports the battle scene or the city evaluates the
  whole paper painter (rigs, mocap clips: ~2 s in Node under this load), Classic included. The
  rigs could be built on first use (`skeletonKind` taking a rig factory and the blow count); that
  touches every faction file.
- **Texture uploads** (`scene.ts`): when several 8x sheets land together (a second visit reads
  them in a few hundred ms) the frame that uploads them all is long (8 s in software GL; ~300 MB
  of texels). Uploading at most a few per frame, or `texStorage2D` + `texSubImage2D` in bands,
  would spread it. The level-1 grid canvas is re-uploaded whole each time a kind's strip lands.
