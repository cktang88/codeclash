# Pixel-art mistakes: what they are and how to catch them in our generated sprites

This guide follows on from `pixel-art-craft.md`, which covers the principles, ramps, cleanup passes and scaling. This page is the **failure catalogue**. For each mistake it gives what it is, why it looks wrong, how to detect it automatically on a ray-cast sprite or a city screenshot, and the fix. The table is meant to be the order of a lint script (`scripts/pixel-lint`, not written yet) that runs over every generated sheet.

Study images are in `references/pixel-mistakes/` (git-ignored, not CC0, never commit). The list is at the end.

## Checklist

| # | Mistake | Automated check (native-res RGBA, 1 art px = 1 px) | Fail threshold (starting point; tune on hand-approved sprites) |
|---|---|---|---|
| 1 | Pillow shading | Per material region: corr(luminance, distance-to-edge) vs corr(luminance, key-light axis) | corr_edge > 0.5 **and** corr_light < 0.3 |
| 2 | Banding (incl. AA banding, outline "hugging") | For each band boundary, measure run-length of steps that coincide with the parallel boundary one step out | > 3 aligned steps in a row |
| 3 | Jaggies | Edge-run sequences of silhouette and line masks: count runs where \|r_i − r_{i±1}\| > 1 and not monotone | > 1 per 32 px of edge |
| 4 | Doubles / L-corners | 1-px line mask: pixels with two orthogonal neighbours that are diagonal to each other | 0 allowed on outlines |
| 5 | Orphans / noise | Same-colour 4-connected clusters of size 1 (and 2) not tagged eye/spec/emissive | > 2% of opaque px (128) / > 1% (48) |
| 6 | Dither misuse | 2x2 checker-pattern detector on figure pixels; temporal flip count | any checker on units; any A-B-A flicker |
| 7 | Too many colours | Unique opaque colours; colours used ≤ 2 times | > 48 @128, > 24 @48; near-duplicates (ΔE_ok < 0.03) > 0 |
| 8 | Muddy / straight ramps | Per ramp: OKLCH chroma of the darkest step vs mid; hue drift between steps | dark chroma < 0.5 × mid chroma; hue drift < 5° across the ramp |
| 9 | Pure black outline / grey shadow | Count `#000000`; count shadow pixels with chroma < 0.02 where the lit step has chroma > 0.06 | any pure black on units; > 0 grey shadows on coloured materials |
| 10 | Mixels / non-integer scale / blurry upscale | Grid detector on screenshots (run-length GCD per row/col); count colours not in the source palette | grid width varies; > 0 off-palette colours |
| 11 | Inconsistent light direction | Luminance-weighted centroid of each sprite vs its mask centroid; angle vs key light | angle off by > 45°, or differs between units and buildings |
| 12 | Low value contrast | Histogram of luminance; contrast of sprite edge vs terrain | < 3 distinct value bands; edge ΔL < 0.15 vs ground |
| 13 | Silhouette / readability failure | Fill mask with one colour, downscale to 32 px, IoU between unit classes | IoU between two classes > 0.85 |
| 14 | Over-detail at small sizes | Mean cluster size; edge density (colour changes per opaque px) | mean cluster < 4 px @48; edge density > 0.45 |
| 15 | AA mistakes | Count partially-transparent pixels; count outer-edge pixels lighter than both sides | any alpha ∉ {0,255}; AA colours on the outer edge |
| 16 | Animation: no anticipation / stiff / uneven / wobble | Per-frame: centroid path, mask IoU of static parts, per-frame pixel churn | static-part churn > 3% (boil); spacing ratio jumps > 3x |
| 17 | Iso: non-2:1 lines, bad tile edges | Hough/run-length on building edges: step pattern must be (2,1) repeating; tile seam diff | any run ≠ 2 on iso edges; tile edge pixels mismatch |

---

## 1. Shading mistakes

### 1.1 Pillow shading
**What:** Shading in concentric rings that follow the outline: dark at the edges, light in the middle. **Why it's bad:** it shows no light source, so the form reads as a flat cushion. PixelJoint's tutorial says "Pillow-shading is bad because it pays no attention to the light source". Pixnote calls it "the most common beginner mistake". **Studied:** `pj_SMDVCsx.png` (red skull). On the left, every edge gets the same dark rim and a white blob sits in the middle of the cranium. On the right, the light comes from the upper left: the right-hand side of the skull falls into one big dark-red plane and the highlight moves to the upper-left brow.

**Detection (tested):** I ran `references/pixel-mistakes/pillow_metric.py` on the skull pair. It computes the correlation of luminance with distance-to-silhouette and with the upper-left axis:

| | corr(L, distance to edge) | corr(L, light axis) |
|---|---|---|
| pillow (left) | **0.74** | 0.04 |
| fixed (right) | 0.22 | **0.65** |

The separation is clean, so this is a cheap per-sprite lint. Run it per material region using our ID buffer. **Fix:** this shouldn't happen in our pipeline because shading comes from N·L. It *does* creep in when an AO/rim term is too strong, or when an "edge pixels drop one ramp step" outline is applied on every side. Apply the edge-darkening only on the shadow side.

### 1.2 Banding
**What:** "Banding, most simply, is when pixels line up" (PixelJoint). Adjacent colour strips run parallel and their steps end at the same points, so the eye sees a staircase of stripes instead of a gradient. Variants shown in the tutorial:
- **Hugging:** the dark rim follows the outline at constant width (`pj_W2ULcuu.png`). The fix breaks the rim so it thickens toward the shadow side and vanishes on the lit side.
- **Column banding:** two colour areas end on the same column (`pj_WeEL1Kg.png`, where purple columns sit flush against the green). Fix: "shift the pixels so that they don't align".
- **AA banding:** AA pixels are stacked in a row beside the step they soften (`pj_NLQGKlc.png`). Three grey pixels form a vertical column next to a vertical run, which turns into a visible secondary line.

**Why it's bad:** it exposes the pixel grid and makes the shapes look like contour maps. Our 3D ray-caster creates banding naturally: quantised N·L on a sphere or cylinder gives exactly concentric, outline-parallel bands.

**Detection:** for each pair of adjacent ramp bands, trace the boundary step sequence and compare it with the next boundary out. Long runs of identical step positions (> 3) are banding. A cheaper proxy is to check whether two consecutive boundaries are at constant distance (a distance-transform of band k+1 along the boundary of band k has variance ≈ 0). **Fix:** use non-uniform thresholds per material (already in craft §3.2), add a small deterministic noise or position-based offset to the threshold (seeded, still deterministic) so band edges don't run parallel, and widen the mid band.

### 1.3 Inconsistent light direction
**What:** units lit from the upper left, buildings from the upper right, props from the front. Pixnote says that "Mismatched light sources on characters, backgrounds, and items create visual dissonance." **Detection:** for each sprite, find the vector from the mask centroid to the luminance-weighted centroid. Its angle should match the global key light (upper-left-front) within ±45° for every unit, building and prop. Compare per faction and per building generator. **Fix:** one `keyDir` constant shared by `src/client/render` units and the city painter. Slynyrd's iso tiles (`sly_iso_tiles.png`) show it: every cube has a lit top, a mid left face and a dark right face, with no exceptions across 9 tile types.

### 1.4 Low value contrast
**What:** everything sits in the middle of the value range. The PixelJoint pug pair (`pj_OBewEc2.gif` vs `pj_EnwVHM2.gif`) shows the low-contrast version as a flat brown, while the fixed one has darker darks in the face and lighter tan highlights, and reads at thumbnail size. **Detection:** convert to greyscale, count distinct value bands (k-means k=5). Fail if fewer than 3 bands each cover more than 5% of the area, or if the lightest and darkest bands are less than 0.5 apart in OKLab L. For crowds, measure ΔL between the sprite's outer ring and the terrain behind it. **Fix:** a wider ramp spread, a darker outline step, and figure mid values pushed away from the terrain mid values (craft §4).

---

## 2. Line and cluster mistakes

### 2.1 Jaggies
**What:** "a pixel or group of pixels are out of place, interrupting the flow of a line" (PixelJoint). Run lengths go like 3,1,3 or 2,3,1,2 instead of a steady 2,2,2 or a monotone 3,2,1 for curves. `pj_S2dbRxm.gif` shows the same curve, diagonal and V-shape before and after. The fixes only re-lengthen runs and never add pixels. **Detection:** extract the outline mask and the line mask, walk each 8-connected chain, and record horizontal and vertical run lengths. A run is a jaggy if it differs from both neighbours by more than 1, or if a curve's run sequence is not monotone over a quadrant. **Fix:** the run-evening pass from craft §3.5. For straight props (spear shafts), rasterise them as a 2D line with a clean ratio *after* projection instead of ray-casting a thin cylinder.

### 2.2 Doubles and orphans
**What:** *doubles* are extra pixels that make a 1-px line 2 px thick at corners (L-shapes). *Orphans* are lone pixels that belong to no shape (Wayline lesson: "Delete it or reattach it so every pixel belongs to a shape"). **Detection:** doubles are a 3x3 pattern match on the line mask (a pixel with N and E neighbours set where N and E are themselves diagonal neighbours). Orphans are 4-connected same-colour clusters of size 1 that are not tagged as eye, specular or emissive. **Fix:** the pixel-perfect filter and the majority-merge pass (craft §3.5).

### 2.3 Noise
**What:** many tiny clusters of different colours. Small textures, mail rings and grass detail read as dirt and blur at a distance. The PixelJoint "Things to avoid" list puts noise alongside jaggies and banding. **Detection:** mean same-colour cluster size and the fraction of pixels in clusters smaller than 3. Healthy hand-made sprites in our size study have mean clusters of about 8-20 px at 128 and about 4-8 px at 48. **Fix:** merge small clusters, and texture only the lit plane (craft §2).

### 2.4 Dithering misuse
**What:** dithering is used as a texture or blur instead of a transition. `pj_lf2GOkz.png` shows that "excess dithering becomes its own texture field instead of a buffer": a 2-px checker blend is fine, but an 8-px wide checker field looks like a grey screen-door. Random dithering (`pj_5Nb6rRz.png`) "adds single-pixel noise". On animated units, a dither pattern that is not locked to the world grid crawls every frame. **Detection:** count 2x2 checker windows (a,b / b,a). Fail on any unit sprite. On terrain, fail if the checker field is wider than 3 px. Temporal check: the same world-pixel flips between A and B on alternate frames. **Fix:** no dithering on figures. On terrain, use Bayer 2x2 aligned to world coordinates, only between adjacent ramp steps.

### 2.5 Over-detailing at small sizes
**What:** carrying 128-px features (fingers, ring mail, belt buckles) into a 48-px sprite. They shrink into 1-px noise and the silhouette suffers. **Detection:** edge density (the fraction of pixel pairs with differing colours) plus the cluster-size check, run per LOD. Also compare the 48-px sprite with a box-downscale of the 128 sprite: if they're nearly identical, the 48 wasn't designed. **Fix:** a separate 48-px render with simplified materials (3 bands, no texture) and exaggerated signature parts (craft §0 and §4).

### 2.6 Silhouette failure
**What:** two classes have the same blob shape, or the weapon merges with the body. **Detection:** fill each class's idle frame with one colour, scale to 32 px, then compute IoU between classes and the area of the weapon outside the body mask. Fail if IoU > 0.85, or if the weapon has fewer than about 10% of its pixels outside the body hull. **Fix:** splay the pose so the weapon leaves the body, enlarge signature props, and add banner or flag shapes.

---

## 3. Colour mistakes

### 3.1 Too many colours / near-duplicates
**What:** hundreds of colours from lighting or AA, many of them indistinguishable. PixelJoint: "The smaller the palette, the easier it is to manage." Saint11's *<1 px movement* card has a matching warning: "too many colors makes everything look blurry." **Detection:** count unique opaque colours. Count pairs closer than ΔE_OK 0.03, and colours used fewer than 3 times. Budget: about 24-40 colours for a 128 unit (craft §1.5), and 16-24 at 48. **Fix:** ramp-based quantisation with no global post-quantise blur.

### 3.2 Straight, muddy or desaturated ramps; grey shadows
**What:** shadows made by darkening toward grey or black ("Lowering saturation looks muddy", Pixnote). The PixelJoint hue-shift strip (`pj_9iGrBo9.png`) shows a straight ramp next to a shifted one. **Detection:** convert each material ramp to OKLCH. Fail if the hue drifts less than 5° across the ramp, if the darkest step's chroma is less than 50% of the mid step's, or if any shadow pixel has chroma below 0.02 on a coloured material (a "grey shadow"). **Fix:** use the OKLCH ramp generator (craft §3.2).

### 3.3 Pure black outlines (and when they're fine)
**What:** `#000` lines around every shape flatten the sprite and turn crowds into black mush. **But don't over-correct.** PixelJoint's crocodile pair (`pj_Wy2dNeD.png`, `pj_6MaPN1I.png`) argues *against* careless sel-out: the broken outline version has more jaggies and loses the silhouette against a mid-brown background. Their verdict is that a full outline "with light variation creates fewer jaggies" than a broken one. So the mistake is a *pure-black* line with *no variation*, not a dark outline. **Detection:** count `#000000` pixels, and measure how many distinct outline colours there are (it should be at least 2: a shadow side and a lit side). **Fix:** use a hue-matched dark outline, one step lighter on the lit side, and keep it continuous.

### 3.4 Eye-burn saturation
**What:** fully saturated hues next to each other (PixelJoint `CpIN0gs`, `mqpPiG7`). **Detection:** OKLCH chroma > 0.25 over more than 5% of the area, or adjacent complementary hues with both chroma > 0.2. **Fix:** keep accents to a single saturated colour on a muted body.

---

## 4. Scaling and resolution mistakes

### 4.1 Mixels (mixed pixel sizes)
**What:** sprites rendered at different art-pixel scales in one scene (a 2x unit beside a 3x building), or sprites rotated or scaled in engine so that their pixels no longer match the grid. Devs report it is "very jarring on the eyes" (Guard Duty retrospective), and the community advice is "pick one resolution and stick with it". **Detection:** in a screenshot, find the colour-change positions per row and column; the GCD of run lengths gives the art-pixel size. Run it per sprite bounding box. All sprites must report the same pixel size, and any rotated sprite shows non-axis-aligned runs. **Fix:** one world-pixel scale for units, buildings, effects and UI art. Our HD (128) and classic (48) must never share the same screen without a whole-scene scale change. Rotate in 3D before the ray-cast, never in 2D afterwards.

### 4.2 Non-integer scaling and blurry upscales
**What:** scaling by 1.5x means some source pixels become 1 px wide and others 2 px ("some pixels get duplicated once, others twice", Divoom). Bilinear smoothing "averages the colors of pixels" (MDN) into blur. JPG does the same: "Never, ever save as JPG" (PixelJoint `pj_V3vLiKV.gif`, where the compressed image has blocky smearing and shifted colours). **Detection:** (a) the run-length GCD differs across the screen → non-integer. (b) Count screenshot colours not in the union of sprite palettes → smoothing or JPG. Any > 0 is a fail. (c) Check `imageSmoothingEnabled === false` and `image-rendering: pixelated` in a Playwright test. **Fix:** integer zoom, or sharp-bilinear (craft §5). PNG only.

---

## 5. Anti-aliasing mistakes

- **Too much AA** (`pj_SQu3W0U.png`): 2-3 grey pixels per step blur the edge. "Excess AA makes edges look blurry." **Too little AA** (`pj_6aPFZZp.png`): a single AA pixel per step barely blunts the jag.
- **AA on the outer edge against unknown backgrounds:** an AA pixel blended against white turns into a light halo on dark grass. Saint11 and PixelJoint both treat outer AA as bad unless the background is known. Partial alpha is worse: it composites unpredictably and breaks palette swaps (team-colour masks).
- **Detection:** any alpha value ∉ {0,255}; any outer-ring pixel lighter than both its inside neighbour and the median terrain; AA-banding uses the same detector as §1.2.
- **Fix:** hard alpha (craft §3.1). AA is allowed only on *interior* edges between known colours, and it must use existing ramp steps, never new blend colours.

---

## 6. Animation mistakes

- **No anticipation, or anticipation in the wrong place.** Lack of anticipation and follow-through is a "telltale sign of amateur work". Saint11's *Attack anim* card (`s11_AttackSheet.gif`) is the counterpoint: for a *player-controlled* attack, "it's important that there's no anticipation frame or players will feel input lag". The attack is 3 frames (strike + smear on frame 2) and 4 to recover, and frame 8 overshoots ("a bounce, so it goes more to the left than frame 1"). We are an autobattler with no input lag concern, so use a 1-2 frame anticipation for readability, plus a recovery overshoot like Saint11's.
- **Stiff, evenly tweened motion.** Equal spacing between every frame (linear interpolation of the 3D pose) looks robotic. Detection: track the weapon-tip or torso centroid per frame. If the spacing ratio (max step / min step) is below 1.5 in an attack, there's no easing. If one step is more than 3x the median outside the strike frame, there's a hitch.
- **Wobble / boil.** Static parts (helmet, torso in a walk) re-rasterise differently each frame, so pixels crawl. This is the main risk in ray-cast pipelines (craft §3.1). Detection: mask IoU of a part between consecutive frames after removing its integer translation. More than 3% churn on a static part is boil.
- **Sub-pixel misuse.** Saint11's *<1 px movement* card (`s11_Subpixel.gif`) says to "move light, avoid moving shapes", "note that the silhouette barely changes", and warns that "too many steps cause the object to look bent". Detection: in idle loops, silhouette changes should be ≤ 1 px and confined to the chest and shoulders, with colour shifts doing the rest.
- **Uneven timing.** Frames are held for random durations. Use 12 fps on twos with deliberate holds on impact (craft §3.6). Detection: list frame durations per clip; durations outside {1,2,3} ticks are suspicious.

---

## 7. Isometric mistakes

- **Wrong angle.** A true 30° line has an irregular step rhythm (2,1,2,2,1…), so it looks jagged. Use the 2:1 "2-step" line (26.57°). Slynyrd's *Iso Basics* (`sly_iso_basics.gif`) builds everything on a 2:1 grid and warns against trusting your eyes instead of counting pixels.
- **Odd or misaligned tile sizes.** "Even dimensions are your friend" (Slynyrd 41). Tile edges must match exactly. OpenGameArt threads trace visible seams to a single missing 1x2 transition, and to dithering at tile edges.
- **Corner treatment.** Slynyrd's cube grid shows styles A-D. Style D1 follows 2:1 and tiles perfectly. A1 (wide corners) looks nicer but needs overlap. Pick one per tileset and never mix them.
- **Flat next to detailed.** Mixing flat tiles with highly textured ones (Slynyrd's tile sheet keeps texture density consistent per row).
- **Detection:** on the city canvas, extract edge pixels of building faces and roof lines and check run lengths: horizontal runs must equal 2 (or a constant multiple), and vertical runs 1. To check seams, render two adjacent tiles and diff the shared edge. Light: top face lightest, left face mid, right face darkest, on every cube.

---

## Studied images (`references/pixel-mistakes/`, study only, do not commit)

| File | Direct URL | Page | Licence | Shows |
|---|---|---|---|---|
| pj_SMDVCsx.png | https://i.imgur.com/SMDVCsx.png | PixelJoint "The Pixel Art Tutorial" http://pixeljoint.com/forum/forum_posts.asp?TID=11299 | © tutorial authors / PixelJoint; study only | Pillow vs light-sourced skull |
| pj_W2ULcuu.png | https://i.imgur.com/W2ULcuu.png | same | same | Outline hugging, fixed |
| pj_WeEL1Kg.png | https://i.imgur.com/WeEL1Kg.png | same | same | Column banding, fixed |
| pj_S2dbRxm.gif | https://i.imgur.com/S2dbRxm.gif | same | same | Jaggies vs even runs |
| pj_SQu3W0U.png | https://i.imgur.com/SQu3W0U.png | same | same | Good vs too much AA |
| pj_6aPFZZp.png | https://i.imgur.com/6aPFZZp.png | same | same | Too little AA |
| pj_NLQGKlc.png | https://i.imgur.com/NLQGKlc.png | same | same | AA banding |
| pj_lf2GOkz.png | https://i.imgur.com/lf2GOkz.png | same | same | Buffer dither vs too much dither |
| pj_5Nb6rRz.png | https://i.imgur.com/5Nb6rRz.png | same | same | Random dither = noise |
| pj_Wy2dNeD.png, pj_6MaPN1I.png | https://i.imgur.com/Wy2dNeD.png , https://i.imgur.com/6MaPN1I.png | same | same | Solid outline vs broken sel-out |
| pj_OBewEc2.gif, pj_EnwVHM2.gif | https://i.imgur.com/OBewEc2.gif , https://i.imgur.com/EnwVHM2.gif | same | same | Low vs improved value contrast |
| pj_9iGrBo9.png | https://i.imgur.com/9iGrBo9.png | same | same | Straight vs hue-shifted ramp |
| pj_V3vLiKV.gif | https://i.imgur.com/V3vLiKV.gif | same | same | JPG compression damage |
| pj_aNNXk7S.png | https://i.imgur.com/aNNXk7S.png | same | same | Automatic blur tool |
| sly_iso_basics.gif | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1cff055a-bd12-4c48-9aa4-5d398c8839a9/113_Iso_Basics_3.gif | https://slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art | © Raymond Schlitter; study only | 2:1 grid, cube corner styles |
| sly_iso_tiles.png | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/2d03d5bf-b096-41bd-87a5-507d3b85d470/114-Iso_Tiles.png | same | same | Consistent face lighting and texture density |
| s11_AttackSheet.gif | https://saint11.art/img/pixel-tutorials/AttackSheet.gif | https://saint11.art/blog/pixel-art-tutorials/ | © Pedro Medeiros; free to view | Attack timing, no-anticipation rule, overshoot |
| s11_Subpixel.gif | https://saint11.art/img/pixel-tutorials/Subpixel.gif | same | same | Sub-pixel do's and don'ts |

## Other sources
- Wayline pixel-art lesson (jaggies, doubles, orphans): https://www.wayline.io/learn/pixel-art/1
- Pixnote shading mistakes (pillow, inconsistent light, muddy shadows, hue shift): https://pixnote.net/en/learn/shading
- Mixels and in-engine scaling: https://www.moddb.com/features/guard-duty-a-development-retrospective-dev-diary-4 ; https://squeakypig.itch.io/unicopia/devlog/787703/a-tale-about-chasing-a-pixel-perfect-tail
- Non-integer scaling and smoothing: https://divoom.com/blogs/setup-ideas/scale-pixel-art-without-blur ; https://developer.mozilla.org/docs/Games/Techniques/Crisp_pixel_art_look ; https://tanalin.com/en/articles/integer-scaling/
- Iso seams: https://opengameart.org/comment/111537 ; https://opengameart.org/content/iso-spritesheet ; iso line counting https://www.sprite-ai.art/guides/isometric-pixel-art
- Animation anticipation and amateur tells: https://mtrx.poff.ee/post/7-deadly-sins-bad-animation

**Gaps:** derekyu.com (both the tutorial and "Common Mistakes") returned an empty page again. Pixelation forum and Wayback copies, and the r/PixelArt wiki, weren't reachable. AdamCYounis, MortMort and Brandon James Greer are video-only, and I found no "mistakes" transcript from them. The Celeste and Shovel Knight artist write-ups were not found. The thresholds in the table are first guesses. Calibrate them by running the lint over a few hand-approved sprites before enforcing it.
