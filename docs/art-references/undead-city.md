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

## Palette and light

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
