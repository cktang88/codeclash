# Battlefield in HD: ground, blood, dust, smoke, missiles

Studied for the HD battlefield: `src/client/render/field-hd.ts` (ground shader, blood and wear marks,
decals) and `src/client/render/fx-hd.ts` (the HD effects sheet), wired in `scene.ts`. In the HD art
the ground and every effect are drawn at the figures' texel density (one map pixel = m texels, m = 1,
2, 4 or 8 by zoom), painted per level, never upscaled. The classic art is untouched (screenshot diff
identical).

Study copies were downloaded to `references/battlefield-hd/` (git-ignored) and opened enlarged.
Reference only: no pixels were copied and no third-party image is committed. The earlier briefs
`battle-effects.md` and `battle-terrain.md` still apply; the pixel-art guides
(`pixel-art-craft.md`, `pixel-art-techniques.md`, `pixel-art-mistakes.md`) were followed.

| # | Image (direct) | Page | Licence | Taken from it |
|---|---|---|---|---|
| 1 | [blood_red.png](https://opengameart.org/sites/default/files/blood_red.png) | [Blood Splatters](https://opengameart.org/content/blood-splatters) (AntumDeluge) | CC0 | A pool is a flat blob with a ragged, lobed outline and a darker clotted rim; two or three reds, the light one only on top. The HD pool: a smooth blood field thresholded per texel against a jitter noise (ragged edge), a darker band where it is thin (rim). |
| 2 | [blood2_burst_refsheet.png](https://opengameart.org/sites/default/files/blood2_burst_refsheet.png) | [Gore Blood Gibs Meat Chunks](https://opengameart.org/content/gore-blood-gibs-meat-chunks) (Reactorcore) | CC0 | A hit is a ring of single drops thrown outward that thins as it spreads. Kept as the spurt; in HD the drops are 1-3 texels and soak a little where they land. |
| 3 | [blood1_splat_refsheet.png](https://opengameart.org/sites/default/files/blood1_splat_refsheet.png) | same | CC0 | A splat: compact centre plus satellite drops. The HD `splat` decal: clotted lumps in the centre, droplets with a streak back toward the hit. |
| 4 | [previewww.png](https://opengameart.org/sites/default/files/previewww.png) | [Bloodsplatter and Bloodsplash Animation](https://opengameart.org/node/51056) (overcrafted) | CC0 | Splash streaks are tapered and point away from the impact; a lit edge on the bigger drops. Used for the splatter decals' streaks and the one lit texel on the upper left of larger drops. |
| 5 | [all_fires_smokes_preview_sheet.png](https://opengameart.org/sites/default/files/all_fires_smokes_preview_sheet.png) | [Fire Smoke Animations](https://opengameart.org/node/179589) (Reactorcore) | CC0 | Dusty smoke at this size is a lumpy ball whose edge breaks into clusters of a few pixels (never a fine checker), darker underneath; it thins by losing clusters. The HD puffs: lumps shaded as balls lit from the upper left in four greys, a ragged rim from clustered noise. (Round 1 used an ordered-dither rim; it read as a screen door and was replaced.) |
| 6 | [smoke_6.png](https://opengameart.org/sites/default/files/smoke_6.png) | [Smoke Puff](https://opengameart.org/content/smoke-puff) (Aidan_Walker) | CC0 | A puff is built from four overlapping round lobes; as it fades it breaks into separate pieces. Used for the lobe layout of the puff painter. |
| 7 | [preview_200.png](https://opengameart.org/sites/default/files/preview_200.png) | [Smoke particle assets](https://opengameart.org/content/smoke-particle-assets) (Kenney) | CC0 | Gun smoke is a pale billow lit on top with a soft darker base; black smoke for impacts. Teppō and ōzutsu shots throw white-grey billows; stone impacts a brown-grey plume. (Kenney's are soft-edged; ours stay hard-edged pixel clusters.) |
| 8 | [dusty.gif](https://opengameart.org/sites/default/files/dusty.gif), [jump_effect.png](https://opengameart.org/sites/default/files/jump_effect.png) | [Dust Animation](https://opengameart.org/content/dust-animation) | CC0 | Footfall dust is a few pale pixels kicked back and down, gone in a few frames. Marching dust is small and faint; cavalry dust bigger and denser. |
| 9 | [grass-V2_1.png](https://opengameart.org/sites/default/files/grass-V2_1.png), [grass_43.png](https://opengameart.org/sites/default/files/grass_43.png) | [Grass Tiles 32x32](https://opengameart.org/node/110524) | CC0 | Ground detail at high density: short upright blade strokes in two tones over a flat base, tufts as fans of 3-5 tapering blades lit on one side, stones lit upper left with a dark underside, little flower heads (white, yellow, red, blue) in clumps. Directly informs the ground shader's tufts, stones, pebbles, flowers and grass strokes. |
| 10 | [Tiles_6.png](https://opengameart.org/sites/default/files/Tiles_6.png) | [Grass / Seasons + Rocks + Gravel](https://opengameart.org/content/tileset32x32-grass-seasons-rocks-gravel) | CC-BY 3.0 (study only) | Flowers as a 1-px cross with a centre; dry grass as tiny "v" strokes; a few colours per material. |
| 11 | [cover-iso-ground-pack-1.png](https://opengameart.org/sites/default/files/cover-iso-ground-pack-1.png) | [Isometric Ground Set](https://opengameart.org/content/isometric-ground-set) (hernandack) | CC0 | Iso earth: warm ochre with fine speckle, holes with a dark upper wall and a lit lower lip. Used for craters (upper-left inner wall in shadow) and for ruts on the road (shadowed wall, lit lip). |
| 12 | [Dirt 1.png](https://opengameart.org/sites/default/files/Dirt%201%20.png) | [Simple seamless dirt](https://opengameart.org/node/69941) | CC0 | The counter-example: a smooth painted dirt upscaled reads as blur. The old HD ground did exactly this (the low-res ground drawn with LINEAR filtering); replaced by per-texel painting. |
| 13 | [Arrow_2.png](https://opengameart.org/sites/default/files/Arrow_2.png) | [Rotating Arrow Projectile](https://opengameart.org/content/rotating-arrow-projectile) | CC0 | What reads on an arrow: a dark iron head wider than the shaft, a thin brown shaft, fletching wider than the shaft with a coloured band. HD arrows: leaf head with a lit edge and socket, two-tone shaft, raked vanes with barbs and a dyed band, a pale nock. |
| 14 | [ranged-dcss_1.png](https://opengameart.org/sites/default/files/ranged-dcss_1.png) | [CC0 Ranged Icons](https://opengameart.org/content/cc0-ranged-icons) (Dungeon Crawl Stone Soup set) | CC0 | Diagonal arrows and bolts with a 1-px dark outline stay crisp on any ground; bolts are short with stubby vanes; javelins are long, no fletching. Missiles get a dark outline from level 2 up. |

## What was built

- **Ground** (shader, cached per view): the classic ground's four value-noise layers and road, bit
  for bit, painted per texel; zone edges break into clusters (value noise) rather than the classic
  4x4 Bayer above level 1; per texel tufts (3-5 blades, lit left edge, dry or green with the zone,
  a contact shadow), stones (four tones lit upper left, dark rim below, cast shadow down right),
  pebbles (pale on the road), flowers (poppy, daisy, yellow, blue, thistle, with an eye at level 4
  up), cracks with a lit lip, short grass strokes, grit; ruts with a shadowed wall and lit lip.
- **Marks** (a map-pixel field on the CPU, uploaded by dirty 64-px tiles): blood soaks the soil
  dark, then pools; the rim clots darker; fresh blood is red with a wet glint on its upper-left lip
  and goes maroon-brown over about 50 s; trampling flattens and pales the grass (blades drawn flat)
  and heavy fighting or horse churns it into lumpy mud lit on the upper left, with wet hollows.
- **Decals** (kept in map buckets, drawn each frame): blood splatter darkening with age, stuck
  arrows/bolts/javelins with their fletching and a crumb of thrown dirt, craters, hoofprints.
- **Effects**: missiles at 32 angles, a ground shadow ellipse, dust (pale, sunlit, cavalry heavy),
  impact dust where arrows land, stone impact plumes and clods, sparks off armour, teppō and ōzutsu
  powder smoke and muzzle flash (Samurai), stakes. Blood drops and debris are 1-3 texel clusters.
- **Standards** (`standards-hd.ts`): regimental and command standards, torn (wavering) and dropped
  (broken) standards, stance glyphs and morale pips, painted at the view's density with the same
  shapes, anchors and frames as the classic ones: folds in four ramp steps, a crisp emblem, a lit
  pole and gilt finial, a fringe on the commander's cloth, ragged tears rather than missing squares.
- **HD 64** gets all of it, capped at 4 texels per map px like its figures (`hdDensity`).
- **Cost**: the ground is painted when the view moves; the marks and decals are composed into a
  cached buffer at most every 0.6 battle seconds while they change (and every 2 s as blood ages);
  other frames copy that buffer. Decals are bucketed by map area and appended, not rebuilt.

## Critique rounds (screenshots in `docs/screenshots/battlefield-hd/`)

1. First pass vs refs 1, 5, 9, 13: ground detail and pools read like the grass and blood refs, but
   corpses of kinds with no living man in view stayed at the 1x grid (huge mixels), blood covered
   too much of the field, the zone edges showed a fine checker (ref 12's lesson in reverse: noise
   is not texture), stuck arrows read as lollipops (black dirt foot, round paddle fletching).
2. Corpses use the 2x/4x sheets; blood amounts cut and colours browner; zone edges from clustered
   noise; vanes raked straight with a dyed band like ref 13; dirt crumb small and brown; puff rims
   from clustered noise like ref 5 instead of an ordered checker; fewer stones.
3. Trampling was invisible (wear too weak): doubled rate and strength so fought-over ground
   churns; dust was the ground's colour at 30% (invisible): now pale sunlit dust like refs 7-8,
   faint under marching feet, heavy under horse; marching dust filled the particle cap and starved
   gun smoke, so dust is capped and smoke and sparks have a reserve.
4. Standards: the classic flags Scale2x'd beside 8x figures read as blocky stickers; repainted
   per level (standards-hd.ts). Dust from fast-forwarded or hidden-tab steps piled up as fields of
   identical cotton balls: particles now expire on battle time too, and cavalry dust is bigger and
   fainter. Remaining: dust puffs still read a little like round balls (refs 5-7 have flatter,
   wind-torn edges); glyphs are the classic 5x6 icons drawn in L-texel tiles.
