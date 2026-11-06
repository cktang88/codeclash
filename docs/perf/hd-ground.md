# The HD ground shader (cc/ground-shader)

Follows [battle-render.md](battle-render.md), round 2: a zoom in HD cost one frame of 6-9 s on
software GL and then 1-2 s frames for a few seconds, nearly all of it pass A of the HD ground
(`field-hd.ts`), and 90 % of that its loop over the scattered things (tufts, stones, pebbles,
flowers, cracks).

## What the cost was

SwiftShader (software GL) shades 2 x 2 texels at a time and **runs both sides of every branch**;
the only thing it skips is further turns of a loop no lane is still in (a loop body still runs once,
masked, even when no lane enters it). Measured here: a heavy block behind an `if` that is never
taken costs as if it ran; behind a loop that never runs, too; the same block removed at compile
time costs nothing. So the old loop's early outs ("out of reach: continue", "not picked: continue")
saved nothing: every texel paid for the noise and hashes of all 12 cells around it and for every
kind's code (5 blades with hashes, a stone's atan/sin/sqrt, 3 pebbles, 3 flowers, a crack) in each.

## What changed (all in `field-hd.ts`)

1. **The cells are baked once per field** (`CELL_FS` / `cellInfo`, an RG32UI texture, one texel per
   4 x 2.5 map px cell, ~1,200 x 980, 9 MB, ~20-80 ms of software GL when the field is first drawn
   or the context comes back): whether the cell holds a thing (the clump noise, the road, the pick),
   which kind, its hash, and a conservative box it can paint in (within the old reach test, at any
   level). Pass A no longer computes noise or the kind per cell.
2. **Pass A lists, then walks.** A cheap first loop fetches the cells whose spot can reach the texel
   (2-3 x 2-3 instead of 12) and keeps, in the old order, those whose box holds it (usually 0-2).
   A second loop walks only those, and within each one code path walks its *parts* (a blade, a
   pebble, a flower's stem and head, a crack's two strokes) with the same arithmetic for every
   kind: one hash, one stroke, one ellipse, the kind picking which result counts. A tuft's blades
   are first filtered by the columns and rows a blade of it can reach (no hash needed), so a texel
   tests the one or two blades near it. The loop counts are what a software rasteriser pays for.
3. **Pass B, clean tiles**: cache tiles with no marks within the few px pass B samples are composed
   by a one-fetch copy (the marks shader's early out for clean ground saved nothing on software GL).
   Marks only grow, so a per-map-tile flag set by `mark()` is exact.

The margin ring, its budget (`PREFETCH_SHARE`) and the tile cache are unchanged.

## Same picture

- Pass A's cache read back and compared texel by texel (RGBA, the class alpha included), base vs
  this branch, same view, m = 1, 2, 4, 8: **0 differing texels** of 1.6 M each. Pass B (t = 600,
  4,000 men) at m = 1 and 4: 0.
- Full frames (`battle-render-bench.mjs shot`, 4,000 men, a minute in, 1600 x 900): zoom 1, 2, 3,
  4 and zoom 2 after 60 frames of panning: **0 differing bytes** each; incremental vs full compose
  0 in every one. Pictures: [zoom 1](../screenshots/hd-ground/z1.jpg),
  [zoom 4](../screenshots/hd-ground/z4.jpg), [zoom 2 panned](../screenshots/hd-ground/pan.jpg).
- One deliberate difference: cells more than 64 cells (256 x 160 map px) past the painted ground
  are not baked and hold nothing; the camera keeps the view on the ground unless the view is wider
  than the whole field.

## Timings

Software GL (SwiftShader) in headless Chromium, 1600 x 900, on a shared 4-core box under load 8-10
(numbers move ±30 % between runs; base and branch were run back to back, twice each, or alternated
in one browser). GPU waited for after each ground pass (`HdField.syncParts`).

| | base | after | |
|---|---|---|---|
| pass A over a whole view (1.6 Mtexels), m 1 / 2 / 4 / 8, median of 5 alternated | 4.5 / 4.4 / 4.8 / 4.6 s | 1.05 / 0.97 / 0.93 / 0.84 s | 4.2-5.5x |
| zoom 1 → 3 (m 4), 4,000 men: the zoom frame | 6.8 / 6.9 s (pass A 5.7 / 5.9) | 2.4 / 2.8 s (pass A 1.2 / 1.8) | 2.5-2.8x frame, 3-5x pass A |
| the 15 frames after it (margin ring filling), sum | 9.7 / 9.5 s | 5.9 / 5.4 s | |
| pass A in those frames | 0.26-0.55 s each | 0.04-0.13 s each | ~5x |
| panning at m 2, median frame | 0.80 / 0.64 s | 0.61 / 0.63 s | |
| pass A while panning, median | 288 / 180 ms | 59 / 67 ms | 3-5x |
| bake, once per field | - | 20-80 ms | |

What is left of a zoom frame on software GL is mostly not the ground (sprites, shadows, post for
4,000 men), plus pass B over marked ground (~0.1-0.25 s at m 4). On a real GPU all of this was a
few ms already; there the branches did skip, so the gain is smaller in proportion (the bake removes
the per-cell noise, the list removes the cells out of reach), but the shader does strictly less work.
