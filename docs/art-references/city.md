# The commandery (city renderer)

References studied for `src/client/render/city.ts` and `src/client/render/city/*`. None of
these images are in the repository. Every pixel of the city is painted by our own code.

## Isometric pixel-art towns and city builders

| Reference | Licence | What we took |
| --- | --- | --- |
| [Isometric pixel church and peasant home](https://opengameart.org/content/isometric-pixel-church-peasantly-home) (OpenGameArt) | CC0 (with CC-BY/BY-SA options) | 2:1 stone courses with a lighter top edge on each block, tall arched windows with mullions, a dark slate roof in rows, and a single dark outline around the silhouette. Our `Painter.wall('stone')` courses (3 px, staggered joints, per-block tone jitter) follow it. |
| [Isometric barn / farmhouse](https://opengameart.org/content/isometric-barn-farmhouse) (OpenGameArt) | CC0 (with CC-BY/BY-SA options) | Scale of props around a building (fence, hay, animals 3 to 6 px), and a fenced paddock with rails and posts in two depths. This became the paddock fence drawn as back and front rails, so horses stand between them. |
| [Medieval stable, isometric 2.5D](https://opengameart.org/content/medieval-stable-isometric-25d), [barracks](https://opengameart.org/content/medieval-barracks-isometric-25d), [archery range](https://opengameart.org/content/medieval-archery-range-isometric-25d) (OpenGameArt) | CC0 | Building programme: stables as a long low range with stall doors on the yard side, a trough and hay; the archery range as a shed, a fenced lane and round targets with red and white rings. |
| [Isometric medieval buildings](https://opengameart.org/content/isometric-medieval-buildings) (OpenGameArt) | CC0 | Half-timbering on a stone plinth, eave overhangs that shade the wall below, and a deep roof that carries most of a building's mass. This led to the 2-unit plinth under timber halls, the darker band under the eaves, and steep thatch. |
| [Kenney RTS medieval preview](https://kenney.nl/assets) (shared scratchpad `kenney-rts-1.png`) | CC0 | Readability at small scale: generous space between buildings, roads that join doors, and one colour per role. This shaped the road graph and how the lots are spaced. |
| [8×8 character pack](https://opengameart.org/content/8x8-character-pack) (OpenGameArt) | CC0 | A walk cycle that reads at 8 to 15 px from alternating legs and a 1 px body bob, nothing more. Our villagers use 4 frames: contact, pass with a 1 px bob, the other contact, and pass. |

## Templar commanderies and castles

| Reference | Licence | What we took |
| --- | --- | --- |
| [Convento de Cristo, Tomar](https://commons.wikimedia.org/wiki/File:Convento_de_Cristo,_safe_inside_Tomar_castle_(54199027283).jpg) (Wikimedia Commons, also `tomar-2`, `tomar-3`) | CC BY-SA 2.0 / 4.0 | Warm, pale limestone (the `stone` and `fine` ramps), buttressed walls, a crenellated drum, and a square bell tower with arched openings. The grand Chapter House (tier 4) becomes the Templar **rotunda**: a buttressed polygonal drum with a raised central tower and a conical roof. |
| [Temple Bruer Preceptory tower](https://commons.wikimedia.org/wiki/File:Temple_Bruer_Preceptory.jpg) | CC BY-SA 4.0 | The surviving tower of a Lincolnshire preceptory: square, with pilaster buttresses up the corners, string courses, small round-arched windows, a low hipped roof and an outside stair up to the door. These are the stone keep's corner pilasters, the forebuilding stair and the narrow windows (tiers 2 to 4). |
| [Montsaunès, église Saint-Christophe des Templiers](https://commons.wikimedia.org/wiki/File:Montsaun%C3%A8s_-_Eglise_Saint-Christophe_des_Templiers_-_Fa%C3%A7ade.jpg) | CC BY-SA 4.0 | The *clocher-mur*: a bell gable carrying two bells in round-arched openings over the west front, a rose window and a round-arched door. The stone Chapter House (tier 2) has this bell gable, with bells that swing when they ring. |
| [Cartulary of the Templar commandery of Roaix](https://commons.wikimedia.org/wiki/File:Cartulaire_de_la_commanderie_des_Templiers_de_Roaiz_(Roaix,_dioc._de_Vaison)._-_btv1b9077709j_(03_of_37).jpg) | Public domain | A commandery was a working farm: grants of fields, mills and barns, more than a fortress. So the fields, the mill and the granary are part of the plan from the first level. |
| [Pilton tithe barn](https://commons.wikimedia.org/wiki/File:Tithe_Barn_Pilton.jpg) | CC BY-SA 2.0 | The stone granary: a long, low, buttressed barn under a steep tiled roof, with a tall porch door and slit vents. The granary at tiers 2 to 4 follows it, and so does the timber granary on staddle stones at tier 1. |

## Work, crafts and people (manuscripts)

| Reference | Licence | What we took |
| --- | --- | --- |
| [Luttrell Psalter: longbowmen at the butts](https://commons.wikimedia.org/wiki/File:Geoffrey_luttrell_psalter_1325_longbowmen.jpg) | Public domain | Butts are turf banks with a small white roundel, and arrows stay stuck in them. Archers stand in a loose line with a master. In the city, arrows fly from the mark and stay in the targets until the boys clear them. |
| [Luttrell Psalter, Geoffrey Luttrell mounted](https://commons.wikimedia.org/wiki/File:LuttrellPsalterFol202vGeoffLutrellMounted.jpg) | Public domain | A destrier's caparison reaches the knees and carries the arms. The knights' horses in the paddock wear white cloth with the cross and a hem in the army's hue. |
| [Maciejowski (Morgan) Bible, fol. 23v](https://www.themorgan.org/collection/crusader-bible) (shared scratchpad `maciej-23v-small.jpg`) | Public domain | The siege engine of the period is a **traction trebuchet**: a beam on a post, a sling with a stone, and a crew hauling on ropes. The workshop's engine is a trebuchet that throws now and then while its crew pulls. |
| [Early 13th-century infirmary (Wellcome M0008014)](https://commons.wikimedia.org/wiki/File:Early_13th_century_manuscript._Mediaval_Infirmary_Wellcome_M0008014.jpg) | CC BY 4.0 | Infirmarers in plain habits and white coifs, sick men carried in, and herbs. From it come the hospital brothers, with an apron and a coif, carrying litters from the gate. |

## Light

- The night grade multiplies the scene toward a cool blue, and windows and torches are drawn on top in additive light afterwards. Window glass painted into each building becomes a mask for its own lit windows. The Tomar and Montsaunès photographs set the warm stone colour for day. The pixel church reference has lit glass against dark stone.

## Critique rounds (screenshots in the session scratchpad)

1. **Round 1:** all eight scenes rendered. The walls were too tall and too bright and hid the yard. Wall chunks showed outline seams. The archery butts read as a cart. People bunched on the road nodes. The sails were thin. The rotunda's roof was missing. Art was not sorted by depth at all, because the arts had no `d` key.
2. **Round 2:** depth sorting fixed. Back walls lowered (10 to 13 px) and front walls lowered to 70% of that. The wall-walk was darkened. The seams were removed. Targets now stand on trestles before a turf bank (Luttrell). Waiting spots are jittered. The cart has sacks.
3. **Round 3:** ground noise clumped into fewer tones (it read as TV static next to the CC0 references). Dusk was toned down. The rotunda now has a lead drum roof, a raised central tower and a cone. The engine was changed to a traction trebuchet (Maciejowski) drawn with 2 px outlined beams, on clear ground. The drill stands at ease at night.

## HD mode (settings.ts: classic | hd)

The classic commandery above stays as it was. HD paints the same plan at twice the pixel density
(1280×720 buffer, shown at exactly 2× on a 2560×1440 screen, whole-number zoom steps, the camera
snapped to art pixels). Each faction has its own town: the Templar commandery is redrawn at the
new density with 1-pixel joints and course highlights, and the Samurai and Undead towns are new.
Their references and critique rounds are in [samurai-city.md](samurai-city.md) and
[undead-city.md](undead-city.md). The townsfolk are repainted at 24×34 (`people-hd.ts`) under
the pixel-art rules of the research guide: clean clusters, hue-shifted ramps, coloured outlines,
and one accent per element. The beasts are the classic sprites doubled with Scale2x.

Templar HD keeps the classic shapes but gains HD-native detail, so it doesn't look upscaled next
to the other two towns:
- **Stone:** a lit top edge on each course, a lit left bevel on each block, and the odd
  weathered chip.
- **Tops:** flat merlon tops and wall-walks without joint noise.
- **Windows:** sills, plus a transom bar and leading in the arched glass.
- **Doors:** planks with two iron straps and nail studs.
- **Roofs:** tiles that vary one at a time, each lit at its left edge, with a brighter eave line.

The classic ditch also had a bug: it ran on past the wall corners. That is fixed in both modes;
classic is otherwise untouched.
