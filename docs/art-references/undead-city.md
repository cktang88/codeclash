# The Undead necropolis (HD city)

References for `src/client/render/city/undead.ts`, the Undead rows of `ground-hd.ts` (grave
fields, dead trees and yews, the black mere) and the Undead looks in `people-hd.ts`. These images
were studied in the session scratchpad and none of them are in the repository. The tone is
mature dark fantasy grounded in real funerary architecture: no cartoon tombstones and no gore.

## Funerary architecture

| Reference | Licence | What we took |
| --- | --- | --- |
| [Sedlec Ossuary](https://commons.wikimedia.org/wiki/File:Ossuary_in_Sedlec.JPG) | CC BY-SA 3.0 | Walls built entirely of skulls in rows, broken by courses of long bones, with dark niches. `boneAt()` makes a 10-px band: a row of 5-px skulls (two sockets, a nose) offset per band, then courses of long bones with knobbed ends every 7 px. It is used for the crypt barracks, friezes and merlons. The bone pyramids at the barracks corners come from Sedlec's heaped bone mounds. |
| [Capela dos Ossos, Évora](https://commons.wikimedia.org/wiki/File:Capela_dos_Ossos_2024-12-22.jpg) | CC BY-SA 2.5 | Bone set as architecture: bands of skulls framing arches, long bones as the coursing between them, and the bone as a warm ochre-cream (`#e4d9bc` → `#574c42`), not white. Openings get a dressed bone frame. |
| [Paris catacombs](https://commons.wikimedia.org/wiki/File:Catacumbas,_Par%C3%ADs,_Francia,_2022-11-01,_DD_117-119_HDR.jpg) | CC BY-SA 4.0 | A barrel-shaped pier of stacked skulls under a rough vault. The bone heaps (`bonePile`) are rounded mounds with dark sockets scattered in clusters. |
| [Hallstatt Beinhaus](https://commons.wikimedia.org/wiki/File:Hallstatt_-_Beinhaus_4a.jpg) | CC BY-SA 4.0 | Skulls laid in rows on shelves under a cross. This is the charnel store's grated windows (iron bars over a dark hole with skulls glimpsed) and the shrouded dead laid by its door. |
| [Charnel house, St Helen's, Cliffe](https://commons.wikimedia.org/wiki/File:Charnel_House_at_St_Helens_Church,_Cliffe,_Kent,_England,_2015-05-06-5136.jpg) | CC BY-SA 4.0 | A real English charnel house is small, flint-walled and steep-roofed, with a plank double door and a louvred cote. It sets the tier-2 charnel store's size and shape. |
| [West Kennet long barrow entrance](https://commons.wikimedia.org/wiki/File:West_Kennet_long_barrow_entrance_-_geograph.org.uk_-_1877235.jpg) | CC BY-SA 2.0 | A long turfed mound with great sarsen uprights at the entrance. The tier-1 keep and barracks are barrows (`mound()` with a 4-tone turf ramp) with a dolmen door of two uprights and a capstone, and a ring of standing stones. |

## Ruined abbeys and the churchyard

| Reference | Licence | What we took |
| --- | --- | --- |
| [Whitby Abbey ruins](https://commons.wikimedia.org/wiki/File:Whitby_Abbey_ruins,_Yorkshire.jpg) | CC BY-SA 3.0 | Tall lancets in tiers, pinnacles at the corners, and one end standing while the rest has fallen. Openings are pointed (`gwall` narrows each opening over its top 1.3 half-widths). At tier 4 the Black Chapel keeps a broken east tower, its top a ragged line. |
| [Tintern Abbey](https://commons.wikimedia.org/wiki/File:Tintern_Abbey_and_Courtyard.jpg) | CC BY-SA 3.0 | A roofless nave whose walls carry the window tracery. The tier-1 chapel is a roofless shell with ragged wall tops and an empty arch in the gable. |
| [Old headstones, Drumragh](https://commons.wikimedia.org/wiki/File:Old_headstones,_Drumragh_old_graveyard_-_geograph.org.uk_-_8270814.jpg) | CC BY-SA 2.0 | Headstones lean, carry moss at the foot and are rounded at the top. The grave fields have rounded stones with a moss band, leaning crosses and low slabs, in rows over mounded plots. |
| [Holbein, Dance of Death 45](https://commons.wikimedia.org/wiki/File:Holbein_Danse_Macabre_45.jpg) | Public domain | The dead walk among the living as labourers, hunched and reaching. Undead villagers shamble with their arms out, at 55% speed, in rags. Some are bare skulls, and the gravediggers wear hats and carry spades. |

## Lighting: how games light their undead cities (round 2, the user's brief)

The user asked for great contrast, real use of light, and purple or bright green highlights. I
studied these screenshots. They are copyrighted, so they are study copies only, kept in
`references/undead-lighting/` (git-ignored):

| Reference | Licence | What we took |
| --- | --- | --- |
| HoMM III Necropolis town screen: [image](https://heroes.thelazy.net/images/b/b1/Necropolis-in.png), [page](https://heroes.thelazy.net/index.php/Necropolis) | © 3DO / Ubisoft, study only | **Value range:** dark grey-blue stone and rock under a cold, lighter cloud sky, so every silhouette reads dark against light. Its few accents are fully saturated and small: a red-lit tower, a gold obelisk tip, violet windows. The ground is charcoal, not mud. |
| Naxxramas over the Carrion Fields (WoW): [image](https://warcraft.wiki.gg/images/thumb/Naxxramas.jpg/800px-Naxxramas.jpg), [page](https://warcraft.wiki.gg/wiki/Naxxramas) | © Blizzard, study only | The whole scene is pushed into one cold hue (teal and green). The stone is blue-violet with green trim, and fog sits in the low ground. This gave the blue-violet stone ramp, the teal-grey turf and the mist banks. |
| Naxxramas, Warcraft III: Reforged cinematic: [image](https://warcraft.wiki.gg/images/thumb/Naxxramas_-_WC3FK_cinematic.png/800px-Naxxramas_-_WC3FK_cinematic.png), [page](https://warcraft.wiki.gg/wiki/Naxxramas) | © Blizzard, study only | The green light comes *from* the necropolis and spills over the ground. Small orange fires are the complementary warm note. So the green pools are additive and actually light the stone and ground, and the forges stay true fire, the one warm light. |
| Darkest Dungeon, the Hamlet: [image](https://darkestdungeon.wiki.gg/images/thumb/Town_upgraded.jpg/800px-Town_upgraded.jpg), [page](https://darkestdungeon.wiki.gg/wiki/Hamlet) | © Red Hook, study only | Near-black silhouettes, heavy dark outlines, and lit windows as small saturated points. A moonlit backdrop separates the planes by value. It became the moonlight rim on every top edge (`Painter.rim`) and the lit windows. |

I also searched for Total War: Warhammer Sylvania, Diablo, Path of Exile, Blasphemous and Age of
Wonders, but couldn't get their images: Fandom answers 402/403 to the fetcher, and the Total War
results had no usable screenshots. The CC0 OpenGameArt graveyard tilesets I found returned 403,
so they weren't studied either.

**How it is lit now** (`CityScene.lightNecropolis` and `gradeHd`):

- **Base:** dark and desaturated. Stone is blue-violet charcoal (`#5c5c78` → `#18172a`), turf
  teal-grey, the yard ash-violet. The outline is a deep violet-black.
- **Sky:** one multiply pass, a gradient from violet above to teal below. It darkens through
  dusk into a moonlit night but keeps a floor, so silhouettes still read. The grade and vignette
  are folded into the same pass.
- **Moonlight rim:** every top edge of every building catches a cool lavender rim, applied before
  the outline.
- **Emissives (green):** green witchfire braziers that burn by day too, grave lanterns in the
  fields, lit lancets, the rose window, the cauldron and the wisps. Each source has a pool (a
  wide, soft additive glow) and a hot core.
- **Emissives (violet):** spire crowns, the mausoleum's lantern and its door.
- **Mist:** banks over the grave fields and the yard. They are grey-violet by day and turn into
  green-lit fog at night.
- **Warm complement:** the forges' orange.
- **Day vs night:** by day it is gloomy and violet, with green points still readable; by night it
  is dark blue with green and violet pools.

## Palette and light (round 1)

- Black basalt shades to violet (`#6a6570` → `#211e27`), and bone is warm cream. Moss-slate
  roofs carry moss at the eaves, and the domes are verdigris lead.
- **One saturated accent:** grave-light green `#86f070`, in the lancets at night, the
  cauldron, the spire's coal and the wisps. Torches stay orange fire as the only warm light.
- The day is overcast: a grey-violet multiply folded into the night pass. The night is bluer and
  greener than the other towns. Will-o'-wisps drift over the grave fields after dark, and crows
  come over three times as often.

## Critique rounds (2560×1440 screenshots, scratchpad `r1`–`r3`)

1. **Round 1:** the town read as a whole at a glance (Sedlec walls, spires, grave fields). The
   grand keep's "needle" was a broad pyramid. The abbey's flying buttresses, repeated every 9
   units, read as organ pipes. The basalt was too light and lavender.
2. **Round 2:** a bone-banded drum carries a true needle spire, 42% of the tower's width and
   40 units high (the lich's spire). Flying buttresses only every other bay, each a curved arch
   to a pinnacled pier. Basalt darkened one step.
3. **Round 3:** night pass checked: green lancets, orange torches, wisps over the plots.
   Compared at zoom 4 against Sedlec and Évora: the skull and long-bone bands read on the crypt
   and merlons.

**Lighting rounds** (`docs/screenshots/city-hd-undead-*-before|after.jpg`):

1. **Round 1:** the first pass was nearly black. The night multiply went to about 40/255, the
   pools were huge soft blobs (bloom, not light), and silhouettes vanished.
2. **Round 2:** gave the night a floor (blue-violet, about 70/255 at the top). Pools cut to half
   the strength and two-thirds the size, each with a crisp hot core. Mist at night 40%. Day and
   night now both read.
3. **Round 3:** a bone mill replaces the post mill, and the broken transept tower was moved to
   the near side so it reads from the default camera. Checked at zoom 4: the ragged break, the
   green lancets and the violet spire crown against the dark.

## Study copies and direct image links

The images above were downloaded as study copies to `references/undead-city/` (git-ignored, never committed).
Each is linked here as a direct image, with its Commons page and licence.

| Local copy | Image | Page | Licence |
| --- | --- | --- | --- |
| `references/undead-city/und-sedlec.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Ossuary_in_Sedlec.JPG?width=640) | [page](https://commons.wikimedia.org/wiki/File:Ossuary_in_Sedlec.JPG) | CC BY-SA 3.0 |
| `references/undead-city/und-evora.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Capela_dos_Ossos_2024-12-22.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Capela_dos_Ossos_2024-12-22.jpg) | CC BY-SA 2.5 ca |
| `references/undead-city/und-catacomb.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Catacumbas%2C_Par%C3%ADs%2C_Francia%2C_2022-11-01%2C_DD_117-119_HDR.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Catacumbas,_Par%C3%ADs,_Francia,_2022-11-01,_DD_117-119_HDR.jpg) | CC BY-SA 4.0 |
| `references/undead-city/und-abbey.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Whitby_Abbey_ruins%2C_Yorkshire.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Whitby_Abbey_ruins,_Yorkshire.jpg) | CC BY-SA 3.0 |
| `references/undead-city/und-charnel.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Charnel_House_at_St_Helens_Church%2C_Cliffe%2C_Kent%2C_England%2C_2015-05-06-5136.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Charnel_House_at_St_Helens_Church,_Cliffe,_Kent,_England,_2015-05-06-5136.jpg) | CC BY-SA 4.0 |
| `references/undead-city/und-graves.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Old_headstones%2C_Drumragh_old_graveyard_-_geograph.org.uk_-_8270814.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Old_headstones,_Drumragh_old_graveyard_-_geograph.org.uk_-_8270814.jpg) | CC BY-SA 2.0 |
| `references/undead-city/und-hallstatt.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Hallstatt_-_Beinhaus_4a.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Hallstatt_-_Beinhaus_4a.jpg) | CC BY-SA 4.0 |
| `references/undead-city/und-danse.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Holbein_Danse_Macabre_45.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Holbein_Danse_Macabre_45.jpg) | Public domain |
| `references/undead-city/und-tintern.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Tintern_Abbey_and_Courtyard.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Tintern_Abbey_and_Courtyard.jpg) | CC BY-SA 3.0 |
| `references/undead-city/und-barrow.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/West_Kennet_long_barrow_entrance_-_geograph.org.uk_-_1877235.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:West_Kennet_long_barrow_entrance_-_geograph.org.uk_-_1877235.jpg) | CC BY-SA 2.0 |

## Detail pass: "real towns have a ton of details" (`undead.ts`, `undead-props.ts`)

The user found the towns simplistic and polygonal. Their targets (`references/user-targets/`,
study only) are `town-gstatic.png` and `town-redbubble.png`, which have every stone and roof tile
its own, timber framing, iron-strapped doors, clutter at every wall and weathering. They later
added `town-displate.jpg`, which has dramatic light pools in deep shade, overgrowth hanging in
curtains, lanterns glowing inside the shade and chunky painterly clusters. New study copies are in
`references/city-undead-detail/` (git-ignored). Wikimedia refused this session's downloads (rate
limit, then robot policy), so the Highgate, Sedlec-chandelier and gargoyle images were searched
but not studied. The earlier Sedlec, Évora, Whitby and Tintern studies above still apply.

| Reference | Licence | What we took |
| --- | --- | --- |
| User target: town-gstatic (`references/user-targets/README.txt` has the URL) | © the artist, study only | Every block of stone its own, with a mortar line and a lit edge; roof tiles row by row, with a few broken; clutter heaped at the foot of every wall. This became `blackAt`: hashed course widths, a bevel lit on each block's top and left, dark joints, cracked and fallen-out blocks, black water streaking from the wall head, moss at the foot and lichen on the lit faces. Slates slip and break, showing the batten and the dark underlay. |
| User target: town-redbubble | © the artist, study only | Iron-strapped plank doors in a dark reveal, and stone that varies block to block in value. This became `doorAt`: planks, two iron straps with studs, a ring and a dark reveal. Window sills drip black water. |
| User target: town-displate | © the artist, study only | Light is a *pool on the surfaces it reaches*, not a disc in the air. Large areas sit in deep shade, and the lit areas read by contrast. Overgrowth hangs in curtains, in chunky clusters. This became `bakePools` (stone lifted up its ramp near a source, occluded, holding at night), `groundPools`, `sunPool` (pale sun on the flags, dappled by branch shadows) and `ivyAt` (dead-ivy strands of varied length that merge into curtains). |
| Glasnevin Cemetery: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Glasnevin_Cemetery_-_More_than_1,000,000_Graves_(4164589746).jpg?width=800), [page](https://commons.wikimedia.org/wiki/File:Glasnevin_Cemetery_-_More_than_1,000,000_Graves_(4164589746).jpg) | CC BY-SA 2.0 | Density and variety: black polished stones next to pale weathered ones, rounded and pointed tops, Celtic crosses, obelisks, all of different heights and crowded together. The grave fields are redrawn row by row with eight marker kinds in black, grey and marble, some leaning or cracked. |
| Père Lachaise, Couture tomb: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Pere_lachaise_detail.jpg?width=800), [page](https://commons.wikimedia.org/wiki/File:Pere_lachaise_detail.jpg) | CC BY-SA 3.0 | Weathered statuary: features eroded, dark streaks in every recess, a withered flower left on the stone. The weeping angel is faceless, with dark streaks down its robe, and wreaths and dead flowers lie on half the graves. |
| SpiderDave, Tombstones: [image](https://opengameart.org/sites/default/files/tombstones_preview_0.png), [page](https://opengameart.org/content/tombstones) | CC0 | A silhouette vocabulary for markers at a small size: rounded, cross, gothic point, spirelet, winged. Each marker kind differs first by silhouette. |
| angrysnail, Pixel Art Graveyard Tileset: [image](https://img.itch.zone/aW1hZ2UvMzA3MjU2LzE1MDgzNzIucG5n/794x1000/SDM5AB.png), [page](https://angrysnail.itch.io/pixel-art-graveyard-tileset) | CC0 | Irregular flagstones with 1-px dark joints and cracks; a small drop shadow on the right of every prop; a dead tree as a few forked strokes; a well with a plank lid. This became `flagAt`, the props' contact shadows (`f`), `deadTree` and `well`. |
| Forest graveyard tileset: [image](https://opengameart.org/sites/default/files/tileset_47.png), [page](https://opengameart.org/content/forest-graveyard-tileset) | CC0 | Tiny clutter that carries at 1–2 px per detail: candle stubs with a lit tip, cobwebs as a few radial threads, skulls as 3×3 clusters. This became `CANDLES`, `cobweb` (laid after the outline so the threads stay one pixel) and `SKULLPILE`. |

**What was made:**

- **Stone:** individual ashlar blocks with mortar; cracked and fallen-out stones; moss, lichen and black water stains. A skull-and-crossbones frieze, skull niches over stacked femurs (Évora), and rubble with mossy joints.
- **Gothic:** lancets with mullions, Y-tracery and an oculus. On the ossuaries a bone chandelier hangs black against the witchfire, its candles burning. The rose window gets a ring of foils. Crockets climb every spire and pinnacle, and gargoyles crouch on the cornices.
- **Roofs:** slipped and broken slates and moss at the eaves. The chapel (and, at tier 2, the charnel house) has a hole fallen in down to the rafters.
- **Doors and gates:** iron-banded doors, wreaths, wall lanterns, iron railings with spear finials, and a railed mausoleum with a gate.
- **Mausoleum:** a pediment with a skull in its tympanum, steps, weeping angels, sarcophagi and candles.
- **Plague house:** shuttered windows, a plague-doctor sign on a bracket and stacked coffins.
- **Grave fields:** eight marker kinds with epitaph cuts and creepers, open graves with spoil and spades, coffins, bone heaps, angels and candles. The unsown fields are a new burial ground of fresh mounds under wooden crosses.
- **Props** through the shared library (`registerProp('undead:*')`, `registerTheme('undead')`): the well with a chained lid, lanterns, braziers, shrines, candles, gibbets, a corpse cart with a shroud, family plots, dead trees with crows, coffins and spades. Flames flicker, the gibbet cage swings and crows hop (`PropDef.anim`).
- **Ground:** cracked flags with weeds, bone-strewn dirt, puddles holding a sliver of sky, ruts, dead grass, and pools of pale sun dappled by branches.
- **Light:**
  - By day, a low pale sun (`sunlit`, on the day canvas only): lit planes lift to a cold gold-grey, shade planes sink into violet and every silhouette top gets a gold rim.
  - By night, the sources bake pools into the stone and the ground, and large areas stay in deep violet shade.

**Critique rounds** (2560×1440, scratchpad `r1`–`r10`; before/after in `docs/screenshots/city-detail/`):

1. **First pass:** the grave fields read Glasnevin-dense at once. Two faults: the headstones were too pale and lavender, and their inscriptions read as faces. The dead trees, outlined, became black lattices. Fix: darker stone, shallow epitaph cuts and trees not outlined.
2. **Library pass:** the library had been placing Templar barrels and flower pots in the necropolis, so I registered an Undead theme. The chapel's ruin read as black confetti; I made it one ragged hole with rafters and a purlin. The ivy was too dark to read, so it now uses drier, lighter olive leaves.
3. **Light pass:** the halos made a field of green bullseyes, so light is now baked into surfaces and the halo discs are gone (a city.ts fix on master). The night pools were too faint at first, so they were strengthened and windows and spire crowns added as sources.
4. **Day pass:** the scene read as one murky violet. I added a warm additive lift on the lit planes; a mix would flatten the masonry, which I tried first. The shade planes went deeper, the day mist was thinned (city.ts) and the sun pools on the flags were brightened.
5. **Close-up pass (×4, ×8):** a mirrored sprite lit its right side, so lit sprites are never flipped now. The markers got five tones, chips, lichen and contact shadows, and the skulls in the heaps now read one by one.
