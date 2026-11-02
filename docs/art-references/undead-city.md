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
