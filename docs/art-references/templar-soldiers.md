# Templar soldiers: sprites and animation (sprites.ts)

References gathered for the isometric soldier sprites in `src/client/render/sprites.ts`. All were studied only; none of their pixels is in the repo.

## Isometric / 3/4-view pixel soldiers

| Source | Licence | Taken from it |
|---|---|---|
| [lrq isometric heavy armour (OpenGameArt)](https://opengameart.org/node/74830): `lrq-iso-armor-heavy-colors.png` | CC0 | ~20 px figures with oversized helms read best at 1x. Coloured (navy) outline instead of pure black. Hard top-left highlights on helms. |
| [PixVoxel Colorful Isometric Wargame Sprites (OpenGameArt)](https://opengameart.org/content/pixvoxel-colorful-isometric-wargame-sprites) | CC0 | Small figures rendered from 3D into pixels: the approach behind our ray-cast mini-models. Team colour goes on large flat parts so it reads at 1x. |
| [Isometric Mini Crusader (OpenGameArt)](https://opengameart.org/content/isometric-mini-crusader) | CC-BY 4.0 (reference only) | Anim set Idle/Walk/Run/Attack/Hit/Death; front views show the face and shield front, back views show the shield back. The death falls backward with the sword dropped beside the body. |
| [Kenney Medieval RTS](https://kenney.nl/assets/medieval-rts) | CC0 | Readability over detail: one or two strong colour masses per unit plus a team colour patch. |

## Templars, arms and armour (period sources)

| Source | Licence | Taken from it |
|---|---|---|
| [Morgan Crusader (Maciejowski) Bible, M.638 fol. 23v](https://themorgan.org/node/1109401) (image via [st-takla.org mirror](https://st-takla.org/Gallery/Bible/Illustrations/mb/morgan-bible-23v-s1.html)) | Public domain (13th c.) | Mail head to toe (coif, mittens, chausses) under solid-colour surcoats. Flat-topped great helms beside kettle hats. Overhead sword cuts. Horses with long necks, and dead horses on their sides with legs folded. Corpses heaped with blood at the head. A traction trebuchet pulled by a man on a rope, which is why our "mangonel" is a traction trebuchet. |
| [Templar seal, Sello-Templario.jpg (Wikimedia Commons)](https://commons.wikimedia.org/wiki/File:Sello-Templario.jpg) | Public domain | Two brothers on one horse with shields and lances: a compact rider-on-horse silhouette. |
| [San Bevignate battle fresco (Commons, from the Baucent article)](https://commons.wikimedia.org/wiki/File:San_Bevignate_battle_fresco_baucent.jpg) | Public domain | The Templar banner is black-and-white blocks, and white horse cloth carries a red cross. That sets the marshal's Beauséant (black over white) and the knights' white caparison with a red flank cross. |
| [Met: Hauberk of Mail, 32781](https://www.metmuseum.org/art/collection/search/32781) | CC0 | Mail is a flat mid-grey mass at this scale, so a dull ramp with little highlight. |
| [Met: Helm for Foot Combat, 21989](https://www.metmuseum.org/art/collection/search/21989) | CC0 | A single dark eye slit across a bright helm face: the one detail a great helm needs at 3-4 px. |
| [Met: Armor for Man and Horse, 35952](https://www.metmuseum.org/art/collection/search/35952) and [35773](https://www.metmuseum.org/art/collection/search/35773) | CC0 | The chanfron covers the front of the face, the head is held high and the neck arched, and the bard covers the body to above the knee. |
| [Met: Initial A with the Battle of the Maccabees, 32832](https://www.metmuseum.org/art/collection/search/32832) | CC0 | A tight block of men reads as rows of grey helmet tops with raised blades; white and colourful horse cloths. |

## Formations

| Source | Licence | Taken from it |
|---|---|---|
| [Bayeux Tapestry, shield wall (Commons, Bayeux_Tapestry_4.jpg)](https://commons.wikimedia.org/wiki/File:Bayeux_Tapestry_4.jpg) | see file page (reference only) | The shield wall is overlapping kite shields facing out, helmets and spears showing over the rims. So Brace for heavy infantry raises the shield forward, the sword levelled over the rim, and spearmen hold spears overhand so the tips clear the front rank. |
| [Met: Shield (Pavise), 22877](https://www.metmuseum.org/art/collection/search/22877), [23332](https://www.metmuseum.org/art/collection/search/23332), [23334](https://www.metmuseum.org/art/collection/search/23334) | CC0 | A tall rectangle with a central keel, about two-thirds of a man's height, a painted border and an emblem. We paint it in the team colour with a cream cross; planted, it hides the crouching crossbowman. |
| [Met: Crossbow, 23336](https://www.metmuseum.org/art/collection/search/23336) | CC0 | A pale long stock with a short dark steel prod across the front, so a light stock and steel prod that read against the gambeson. |

## Engines

| Source | Licence | Taken from it |
|---|---|---|
| [Traction trebuchet diagram (Commons, SiJiao_Pao-t1.jpg)](https://commons.wikimedia.org/wiki/File:SiJiao_Pao-t1.jpg) | Public domain | A trestle frame with a long pole on an axle, the sling on the long end and the pulling ropes on the short end. |
| [Five whirlwind trebuchets (Commons)](https://commons.wikimedia.org/wiki/File:Five_whirlwind_trebuchets_wjzy.jpg) | Public domain | Many ropes and a crew in front; the beam is the dominant silhouette. |
| Maciejowski fol. 23v (above) | Public domain | The beam stands above the walls, roughly twice a man's height, so the engine is drawn at 1.7x. |

## Horses and the gallop

| Source | Licence | Taken from it |
|---|---|---|
| [Muybridge, The Horse in Motion (LoC 2007678037)](https://www.loc.gov/pictures/item/2007678037/) | Public domain | Gallop phases: legs gathered under the belly in suspension, then extended fore and hind. The fore pair and hind pair are each slightly offset (transverse gallop). The neck stretches forward and lower; the body stays nearly level. |
| [Muybridge, Attitudes of animals in motion (LoC 2018694812)](https://www.loc.gov/pictures/item/2018694812/) | Public domain | The trot moves diagonal pairs together, which gives the 2-frame Brace for lance-armed cavalry ("couched at the trot"). |
