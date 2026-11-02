# City night rig, texture stamps, halos and the post finish: references

The brief for the pixel-audit fixes in the city renderer (`src/client/render/city.ts`, `city/**`) and the post finish (`src/client/render/post.ts`): audit items 8 (night goes flat), 9 (dither and noise in city textures), 10 (grain at screen resolution), 11 (non-integer HD city scale), 15 (HD ground at 2 px next to 1-px buildings) and techniques §1.6 / §5.1 (glows as palette halos). The images are study copies in `references/` (git-ignored); none is committed.

## References studied

| image | direct URL | page | licence | what I took from it |
|---|---|---|---|---|
| Graveyard Keeper, the farm at four times of day | https://slava.lazybeargames.com/content/images/2024/11/k2fz1wmhn9yw-rcgvticox4_bh4-1-.png | https://slava.lazybeargames.com/graveyard-keeper-how-the-graphics-effects-are-made | © Lazy Bear Games, study only | Night is a teal/navy palette change, not a black multiply: the stone of the house stays several steps lighter than the grass, so the building still reads. The windows are untouched by the grade (emissive) and become the focal points. No light pool on the roof. |
| Slynyrd, "Texture principles" | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1536967806715-S61SGT14YITG5XHQ7O6H/1-Texture_Principles.gif | https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture | © Raymond Schlitter, study only | Texture is a few cluster shapes (a tuft, a pebble) repeated with variation, balanced, with negative space between them; no orphan pixels; shadow laid over the texture afterwards. This is the model for `stamps()` (ground) and `stampAt()` (daub cracks, board knots). |
| Slynyrd, "Cyberpunk buildings" | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/42c80774-3496-461f-a92e-5f548641511d/118-Cyberpunk_Buildings_6.gif | https://www.slynyrd.com/blog/2023/1/30/pixelblog-42-cyberpunk-pixel-art | © Raymond Schlitter, study only | Night buildings are two-tone (lit face warm, shadow face violet) with emissive 1-px window rows; build order structure, then signage, then light. The shade face is hue-shifted toward violet, not just darker. |
| Slynyrd, "Lighting tips" | https://images.squarespace-cdn.com/content/v1/551a19f8e4b0e8322a93850a/1536968454258-0VM5SR0OH046HOGV3GJC/11-Lighting_Tips.gif | https://www.slynyrd.com/blog/2018/6/15/pixelblog-6-light-and-shadow | © Raymond Schlitter, study only | Avoid even shading bands; a secondary light gives a thin rim on the edge facing it. The moonlit rim on the top-left edges comes from here and from techniques §2.5. |
| "Pixel night city" (OpenGameArt) | https://opengameart.org/sites/default/files/fondo.png | https://opengameart.org/content/pixel-night-city | page lists several licences (CC-BY / CC-BY-SA among them); study only | The moon's glow is two flat rings of decreasing alpha, not a gradient: the stepped halo. A navy night with lighter blue building masses against a darker ground. |
| 400+ Isometric Town Tiles, Screaming Brain Studios | https://opengameart.org/sites/default/files/demo_2.jpg | https://opengameart.org/content/400-isometric-town-tiles | CC0 | Iso buildings lit from one side: lit wall, a darker hue-shifted wall, roof as the lightest plane, edges marked by value change instead of inner lines. Confirms the light classes (lit / half / shade) taken from each face's normal. |

## What was applied

- **Night as a rig, not a multiply.** Each painted pixel now carries a light class from its face's normal against the upper-left key (`lightClass()` in `city/pixels.ts`). `nightCanvas()` repaints each building, tree and fence in a night palette: lit planes keep their value with a cool shift, half-lit planes one step down, shade planes two steps toward an ambient violet, the outline navy, and every edge facing the moon a 1-px moonlit rim in its face's colour. The scene lays it over the day art as night falls (in the depth-sorted pass, so people in front are not touched), dims the ground further than the buildings, and grades with a lighter cool multiply than before. The necropolis has its own violet moon (`UNDEAD_RIG`) and keeps its violet-to-teal sky and green/violet light.
- **Emissive.** Window glass, torches, braziers, forges and the necropolis's witchfire are drawn after the grade. The per-building window "pool" that landed on roofs is gone outside the necropolis (Graveyard Keeper keeps the windows alone).
- **Stepped halos.** `radial()` gradients drawn at art resolution are replaced by `stepped()` halos: 2-3 flat rings in the light's ramp (dim outer band, mid band, hot core), rasterised at a whole buffer size and drawn at a whole buffer pixel. The mist banks and cloud shadows use two flat bands.
- **Stamps, not noise.** Classic ground: one value per 2-px dash, each row offset by one (no 2×2 checker can form), plus tufts and pebbles on a jittered world-space lattice. HD ground: 3×2 cells with odd columns dropped a row (1-px art grid, no 2×2 blocks), furrows 1 art px thick. Buildings: daub cracks and board knots as stamps on the lit face; thatch as staggered 2-px straw dashes; mortar one colour per face; lot stones plain ashlar; the lot's rope laid after the outline (an outlined 1-px diagonal was a checkerboard).
- **Post finish on the art grid.** `GlPost` evaluates grade, haze, vignette, chromatic split (whole art pixels, half strength) and grain at the art pixel's centre, so every art pixel is one flat block; the grain is static and hashed per art pixel. The classic `Post` lays one fixed grain tile anchored to the buffer instead of a random tile at a random offset every frame.
- **Integer scale.** `CityScene.scale()` is a whole number in both arts at every page width (the largest that fits, one step up when that crops under 8%, never below 1×: narrow pages crop and pan).

## Results (`pnpm pixel-lint --only=city,screens`)

| check | before | after |
|---|---|---|
| failed checks (city + screens) | 59 | 2 (the necropolis's tier-1 palisade, ragged by design) |
| night silhouette edge ΔL, classic | 0.076-0.109 (12/30 fail) | 0.132-0.181 (0 fail) |
| night silhouette edge ΔL, HD | 0.062-0.153 (9/30 fail, all Undead) | 0.121-0.196 (0 fail; Undead 0.121-0.156) |
| classic ground checkers /1000, orphans | 28-30, 22-23% | 2.0-2.7, 8.6-9.1% |
| building checkers /1000 at tier 0, classic / HD | 62 / 44-54 | 15 / 3.6-4.7 |
| building orphans, classic | 10-28% (18 fail) | 7-13% (0 fail) |
| HD mixed pixel sizes | up to 17% | under 1.5% |
| classic iso runs at tier 2 | 79% (fail) | 100% on the walls (pass) |
| HD city scale on a 1024 px page | 0.8 | 1 (whole numbers at every width from 360 to 2560, both arts) |
| battle through the post shader, zoom 2: impure art blocks, deviation (classic) | 100%, 6.1/255 | 0%, 0.0 |

Screenshots (our art only) are in `docs/screenshots/city-finish/` (before-/after- pairs).
