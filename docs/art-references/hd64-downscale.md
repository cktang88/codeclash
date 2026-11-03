# HD 64: halving the 128 battle art without losing it

The user asked for a third art mode, for battles only: the HD 128 figures reduced to 64 "with a
good pixel-combining algorithm". This file records the references studied, the candidates
compared, the numbers and the choice. Code: `src/client/render/downscale.ts`; comparison tool:
`scripts/hd64-compare.ts`; contact sheets and battle screenshots: `docs/screenshots/hd64/`.

## Where HD 64 applies

- **Setting**: `ArtMode` is `'classic' | 'hd' | 'hd64'` (`src/client/settings.ts`, label "HD 64"),
  stored in `codeclash.art` as before (old `classic`/`hd` values keep working, anything unknown
  reads as classic). The account menu and showcase "Art" selects list all three; the battle's art
  button cycles classic → HD → HD 64 → classic and swaps the scene in place.
- **Battles only.** The city (and the units showcase) draw the HD art in HD 64 mode
  (`cityArt()`/`isHdArt()`): the reduction is about crowds of small figures, and the city's HD
  art is painted natively at its own scale.
- **Scene**: `buildAtlas64` (sprites128.ts) has levels 2 and 4; level 2 is the native HD paint,
  level 4 is the level-8 art halved. `BattleScene.hdDensity` caps the scene buffer at 4 px per
  map px in HD 64 (8 in HD), so at zooms 4-5 the 64 sheet, the ground and the effects are all
  magnified together by the post pass instead of being drawn into an 8× buffer. Same world size
  as HD, half the texels. Zooms 1-2 look the same as HD (level-1 grid, native level 2).

Our own pixel-art guide warned against exactly this ("never downscale a 128 sprite: thin parts
vanish and colours mush", `pixel-art-craft.md` §4). The algorithm below is built around those two
failure modes, and every rule answers one of them.

## References studied (downloaded to `references/hd64-downscale/`, study only, not committed)

| reference | licence | what we took |
|---|---|---|
| xave_pixel, 128 / 64 / 32 size comparison, https://i.redd.it/fxx9828pdq3d1.png (measured in `pixel-art-craft.md` §0) | artist's copyright, study only | A hand-made 64 keeps **every mass and colour zone** and the **closed dark silhouette**; 1-px high-contrast lines (the brute's cyan axe lines, the chain) survive as 1-px lines or dotted runs; the colour count barely drops (≈ 60 → 30). Detail inside a mass is what goes. So: keep outline and thin high-contrast lines, drop low-contrast interior steps. |
| PixelOE (KohakuBlueleaf), README and demo grid comparing nearest / bicubic / k-centroid / contrast, with and without outline expansion: https://github.com/KohakuBlueleaf/PixelOE (`demo/house-grid.webp`) | Apache-2.0 code; images study only | Nearest drops outlines at random; bicubic blurs (new colours); k-centroid keeps flat areas clean but erodes thin dark lines; their **contrast** picker (take the patch's darkest pixel when its values skew dark, the lightest when they skew light, else the centre) and **outline expansion before the reduction** are what keep outlines. We adopted the idea (protect the outline first) but not the dilation: our sprites already have a 1-px outline we can identify exactly, so we keep it directly instead of thickening it. |
| Kopf, Shamir, Peers, *Content-Adaptive Image Downscaling*, SIGGRAPH Asia 2013, https://johanneskopf.de/publications/downscaling/ (paper PDF, figures 1 and 12) | paper, study only | Kernels that follow edges keep **lines connected and sharp**, and pixel art benefits, but (fig. 12) it still loses symmetric details, and a **hand-hinted** reduction beats it. It is also an iterative optimisation per image and ignores animation. Lesson: connectivity of thin lines is the property to protect; heavy optimisation is not needed for a ×2 reduction, and frame-to-frame stability must be handled separately. |
| Astropulse k-centroid downscaling (via PixelOE's mode list) | - | For a 2×2 block, k-centroid reduces to "the dominant colour cluster": our `mode` and `meanSnap` candidates. |
| Our own HD 128 frames (every kind, every faction) and the native level-4 paint | ours | The source. Its outline is a selective outline (the lit side takes the neighbour's darkest tone), so "the outline colour" is not one colour: we identify outline pixels by position (solid pixel with a transparent side neighbour), not by colour. |

## Candidates

All candidates share: 2×2 blocks laid from the figure's foot pixel (so a still figure keeps its
blocks), alpha by coverage (≥ 2 of 4 solid pixels; a translucent ground shadow fills where the
figure does not), and **no new colours** (every output pixel is one of its block's source
pixels, so the faction palette is untouched, which the unit test checks on a real sheet).

| name | rule |
|---|---|
| `nearest` | the block's top-left pixel (what a 50% nearest-neighbour resize does) |
| `meanSnap` | the block colour nearest the block's RGB mean (k-centroid, k = 1) |
| `mode` | the most frequent colour, ties to the darker |
| `contrast` | PixelOE's rule on lightness: median below mean → darkest, above → lightest, else mode |
| `feature` | **chosen.** (1) coverage alpha plus *bridges*: a 1-of-4 block is kept where dropping it would split the silhouette around it (spear shafts, bow staves, strings, banner poles); (2) on the reduced silhouette's edge the block's **source outline pixel wins** (darkest first), so the 1-px outline survives; (3) inside, the mode, with ties to the colour **rarer in the 12 source pixels around the block** (a 1-px line crossing a field beats the field), and an even tie to the darker (both sides of a plain edge are equally common, and always picking the darker keeps the edge straight instead of ragged); (4) a **lone specular** (one pixel ≥ 40/255 lighter than the rest of its block and its surroundings, with at most one other such pixel in the 4×4 around it) keeps its block, so helm and blade glints survive |
| `featureClean` | `feature`, then an orphan pass (an inside pixel matching none of its 8 neighbours, with 3 of 4 side neighbours sharing a colour within ΔL 28, takes that colour) |

### Temporal phase (applies to all)

The first round showed an idle "head boil" of 11-27% on every candidate (the level-8 source has
2-5%, the native level-4 paint under 1%): a 1-px breath at level 8 is half a pixel at 64, so a
fixed 2×2 grid re-samples the whole head every time the figure breathes. Fix: for every frame,
try the four grid phases (shift the grid by 0/1 source px in x and y) and keep the one whose
cheap nearest reduction best matches the previous frame's (feet aligned, best of ±1 px shifts);
then run the real reduction once at that phase. This brought the head boil down to
2-7% (≈ the source's own) for 1/8 map px of foot drift at most. Choosing the phase on the full
`feature` output instead was no better and 4× slower.

## Numbers

`pnpm exec tsx scripts/hd64-compare.ts` (final round, after the master merge with the multi-blow
kinds): all three factions, all eleven kinds, three poses each (idle SE, idle NE, a strike frame),
plus the idle and walk loops for flicker and boil. Averages per frame:

| reduction | orphans | edge density | mean cluster | colours | outline closed | off-palette px | extra parts | idle/walk flicker | idle head boil | ms per kind (3 frames + halving) |
|---|---|---|---|---|---|---|---|---|---|---|
| native L4 | 0.7% | 0.361 | 14.41 | 19.3 | 92% | 103 | 0.00 | 0.11% | 0.78% | - |
| nearest | 5.1% | 0.407 | 7.57 | 25.9 | 62% | 27 | 0.01 | 0.17% | 5.17% | 4236 |
| meanSnap | 5.4% | 0.411 | 7.62 | 25.9 | 74% | 34 | 0.00 | 0.17% | 5.02% | 746 |
| mode | 4.9% | 0.404 | 8.03 | 25.8 | 78% | 50 | 0.00 | 0.17% | 4.56% | 747 |
| contrast | 5.0% | 0.405 | 7.98 | 25.9 | 78% | 50 | 0.00 | 0.18% | 4.61% | 801 |
| feature | 6.5% | 0.461 | 6.48 | 26.1 | 89% | 52 | 0.00 | 0.17% | 5.05% | 896 |
| featureClean | 6.2% | 0.456 | 6.66 | 26.1 | 89% | 52 | 0.00 | 0.17% | 5.06% | 916 |

The ms column is the time to halve a whole sheet (≈ 600-900 frames) in Node, plus three frames of
analysis; `nearest` also includes repainting the level-8 sheet, which the tool had just evicted.

Read with care: the lint's palette tables come from the level-8 palette, so "off-palette" counts
the same handful of level-8 colours for every candidate (none are new: the unit test checks every
output colour exists in the source sheet). Higher edge density and lower mean cluster for
`feature` are the cost of keeping the outline and thin lines: those are exactly the 1-px
features the other candidates drop.

## What we saw (contact sheets, `docs/screenshots/hd64/compare-<faction>-<pose>.png`)

Columns: the 128 source at 1×, the native level-4 paint, then each candidate, all shown at 2× so
they are the same size.

- **nearest** breaks the outline wherever the grid lands on the inside of it (62% closed), drops
  spear and bow pixels in runs and keeps the mail checker as noise. It is what the old craft-guide
  warning was about.
- **meanSnap** and **mode** are clean on flat cloth and keep the masses, but the outline opens on
  every left and top edge (the lit side's selective outline is a lighter colour that loses the
  vote) and 1-px features crossing a field (a belt edge, a skull's eye sockets, the samurai mon)
  go or merge.
- **contrast** looks like `mode` almost everywhere: in 2×2 blocks the skew test rarely fires.
- **feature**, first round, broke the Templar knight's caparison cross into a ragged edge (its tie
  rule picked whichever colour differed most from the surroundings, so along a straight red/white
  edge it flipped from block to block). Round two changed the tie to "rarer in the ring, else the
  darker": the cross is clean again and lines still win. The closed outline, the skull faces, the
  shield crosses and the blades are the visible gains over `mode`; the price is a busier texture
  (edge density 0.46 vs 0.40).
- **Every blow** (`blows-<faction>.png`: wind-up, strike, follow-through of each blow, source
  beside HD 64): swords, maces and spear shafts stay one connected 1-px line through the swing,
  smears keep their light front.
- **In battle** (`battle-*-zoom*.png`, `side-by-side-hd-vs-hd64-zoom*.png`): at zoom 3 HD 64 and
  HD differ only in where the level-4 sheet comes from; at zooms 4-5 HD 64 is visibly 64 art (each
  texel 2 or 4 device pixels), with darker, continuous outlines between overlapping men; lances,
  pennons and the red crosses read as well as in HD. At default zoom (zoom 1, the level-1 grid) the
  three HD/HD 64/classic shots differ only by HD vs classic: the field is too small for either sheet.

## Choice

`feature` (with the temporal phase). It is the only candidate that keeps the closed dark outline
(outline closed ≈ 90% vs 62% nearest, 75-78% for mean/mode/contrast, 92% for the hand-tuned
native level 4) and that keeps thin shafts and strings connected, at the same colour budget and
with the same boil as `mode`. The orphan pass (`featureClean`) changed little (orphans 5.9% →
5.6%) and risks eating 1-px eyes, so it is not used.

## Cost

Measured in Node on this 4-core container (`paintSheet` then `halveSheet`):

| kind | paint level 8 | halve to 64 | native level-4 paint | sheet bytes 128 → 64 |
|---|---|---|---|---|
| templar k0 (sergeant) | 2.5 s | 0.78 s | 1.0 s | 15.3 MB → 3.9 MB |
| templar k7 (knight, horse) | 5.6 s | 1.36 s | 1.6 s | 53.4 MB → 13.6 MB |
| samurai k0 | 3.0 s | 0.43 s | 0.9 s | 15.5 MB → 4.0 MB |
| samurai k7 | 3.4 s | 1.06 s | 1.1 s | 32.3 MB → 8.2 MB |
| undead k0 | 5.6 s | 0.95 s | 1.6 s | 19.3 MB → 5.0 MB |
| undead k7 | 13.3 s | 1.48 s | 4.4 s | 45.9 MB → 11.7 MB |

So the halving adds 15-30% to the level-8 paint it follows; the HD 64 sheet costs about the
level-8 paint plus a second, and the same bytes as the native level-4 sheet.
(The first version's halve times of 2-6 s were before two speed-ups: precomputed rim masks with a
fast path for flat blocks, and choosing the grid phase on the nearest reduction instead of the
full one.) The halving runs once per (army, kind) in the sprite worker, right after the level-8
paint, and the result is cached in the HD painter's LRU like any sheet; the level-8 page is
dropped as soon as it is halved. A frame costs the renderer nothing extra.

In the battle harness (1,500 men, zoom 4): HD holds 329 MB of sheets in JS and 266 MB on the GPU;
HD 64 holds 156 MB and 104 MB (the 64 sheets are a quarter of the 128 ones, and HD 64 never asks
for level 8 to stay resident). The first close zoom takes longer to sharpen in HD 64 than HD's
level 4 (it waits for the level-8 paint plus the halving), but no longer than HD's level 8.

## Known limits

- **Not hand-made.** The reduction keeps outline, lines and glints, but it does not redraw: a
  face loses features the way the xave 64 does not (xave re-places the eye pixel; we keep or drop
  it). Mean cluster size is about half the native level-4 paint's, i.e. busier.
- **Boil is about 5%,** the same order as the level-8 source but above the native level-4 paint
  (under 1%), because a 1-px move at 128 can still flip a block. The phase search bounds it.
- **Outline closure 89%** vs 92-99% for painted levels: inside-neighbour darker parts (a dark
  cloak next to the rim) make some ring pixels lighter than what is inside them.
- **Lint warnings on HD 64** (`pnpm pixel-lint --only=sprites --arts=hd64`, 33 sprites): the
  most frequent are "aligned band ends" (halving lines up band ends that were 1 px apart),
  idle-head boil on a few kinds (undead k5 12%), and colours above the level-4 budget on the
  big mounted kinds (34, from the level-8 palette). No off-palette colours are introduced.
- **Ground and effects**: HD 64 caps the scene buffer at 4 px per map px, so ground and effects
  use HD's level-4 versions and are magnified at zooms 4-5, as the figures are. The ground/fx
  agents' HD work picks its level from the same buffer density, so it follows automatically.
