# HD battle sprites (sprites128.ts): references

The HD painter (`src/client/render/sprites128.ts`, setting `codeclash.art = 'hd'`) paints the same
posed 3D figures as the classic 48 px painter (`sprites.ts`, unchanged), at detail levels 1, 2, 4
and 8. At level 8 a man stands about 100 px tall, a "128" figure in the sense of the size
comparison below. Every image here was studied only; none of its pixels are in the repo. The
earlier subject files still apply: `templar-soldiers.md`, `samurai.md`, `undead.md` and
`total-war-battles.md`.

## Target quality and pixel craft

| Source | Licence | Taken from it |
|---|---|---|
| xave_pixel, *128×128 vs 64×64 vs 32×32* (https://i.redd.it/fxx9828pdq3d1.png), the user's target | All rights reserved (study only) | The size label is the figure's **height**: a 128 figure is ~130 px tall and ~70 px wide. Detail comes from **large flat clusters** in 3-5-step **hue-shifted** ramps, not from texture noise. There is **no black outline**: edges use the darkest step of the local material. What survives at 32 px is the masses and **one saturated accent**. Our rules follow from this: banded planar shading, a coloured outline lightened on the lit side, inner lines at part boundaries, and exaggerated signature parts. |
| Coordinator's craft guide (`pixel-art-craft.md`, from Slynyrd *Pixelblog* 1/47/57, Saint11 *Metals*/*Outlines*/*Fabric*, the Dead Cells 3D-to-2D pipeline, the Guilty Gear Xrd GDC talk) | Study notes; the sources are copyrighted | One ray per pixel and binary alpha. Ramps shift toward red-purple in shadow and yellow in light. Metal gets **warm darks and cold lights**, and only hard materials get a specular band. Mail is a **row line every third pixel row plus a checker of light only in the lit plane**, with shadow kept flat. Orphan pixels are merged. In-betweens come from key poses. Below ~40 px on screen, a dedicated small sheet is better than a downscaled 128 (our level-1 cell is that LOD). |

## Period sources (new for HD)

| Source | Licence | Taken from it |
|---|---|---|
| Met 23346, *Ornamental Plaque of a Knight on Horseback*, ca. 1300 (https://www.metmuseum.org/art/collection/search/23346) | Public domain (Met Open Access) | The knight's **heater/kite shield carries a bold two-colour charge** that reads at a glance. That is why our sergeants' kite shields bear a pale cross on the team field, and the levy's round shields are quartered. The trapper hangs to the horse's knees with a scalloped edge. |
| Met 468633, *Aquamanile in the Form of a Mounted Knight*, ca. 1250 (https://www.metmuseum.org/art/collection/search/468633) | Public domain | A **flat-topped great helm with a cross-shaped reinforcement** around the eye slits. The HD great helm gets a dark vertical bar between the slits, breaths on the right cheek and a brow band, and the marshal gets a gilded brow and crown. The horse's long neck carries a clear mane line, which we model as a ridge of mane on the neck. |
| Met 34027, *Capital with an Armored Knight on Each Side*, ca. 1100 (https://www.metmuseum.org/art/collection/search/34027) | Public domain | Mail from head to knee and long kite shields on foot. Mail is the dominant texture of a Templar line, so it gets a pixel-grid ring pattern at levels 4 and 8. |
| Met 26470, *Spear-head*, dated 1270 (https://www.metmuseum.org/art/collection/search/26470) | Public domain | A **broad leaf blade with a midrib and a long socket**. The HD spear blade is a flat leaf with a dark midrib, one lit half and one shaded half, and a dark socket, and it is drawn oversized so it reads. |
| Met 22877, *Shield (Pavise)*, ca. 1475–1500 (https://www.metmuseum.org/art/collection/search/22877) | Public domain | A painted border and a central charge (kept from the classic pavise). |
| Met 21989, *Helm for Foot Combat* (https://www.metmuseum.org/art/collection/search/21989) | Public domain | Metal at large size is high contrast: a cold pale light, a warm dark and little in between. That is the metal ramp. |
| Met 24975, *Gusoku* armour (https://www.metmuseum.org/art/collection/search/24975), and Met 24014, *Zukinnari Kabuto* (https://www.metmuseum.org/art/collection/search/24014) | Public domain | The lacing reads as **regular horizontal bands**, so odoshi rows keep a constant period. The kabuto bowl has radiating ridges (suji), which we draw as alternating lacquer tones at levels 4 and 8. The **kuwagata horns in a gilt V** are the samurai's silhouette at every size, so the katana samurai, mounted samurai and horse archers get them, and the daimyō gets his crescent. |
| Met 27593, *Jingasa* (https://www.metmuseum.org/art/collection/search/27593) | Public domain | The ashigaru hat is a wide shallow cone with a gold mon. We kept it, since it separates ashigaru from samurai at level 1. |
| *Battle of Nagashino* folding screen (Commons, `Battle-of-Nagashino-Map-Folding-Screen-1575.png`) | Public domain | The **yari are far longer than the men** (nagae-yari, 4-6 m), so ours are half again as long as a Templar spear. Teppō men stand in lines behind palisades. **Sashimono differ by troop**: samurai carry tall personal banners and ashigaru uniform flags. Our samurai carry the tall banner, the yari and teppō ashigaru the sashimono, and the archers a small one, while the skirmishers have none (team-coloured jackets instead). |
| Met 361663, Hollar after Holbein, *The Knight* (Dance of Death) (https://www.metmuseum.org/art/collection/search/361663) | Public domain | Re-studied for HD. Ribs are bars with gaps, and a skull needs only sockets and teeth. The undead read is unchanged, and their green glow is the faction accent. |

## Critique rounds (screenshots in `docs/screenshots/hd-sprites/`)

1. **First HD pass** (level 8, idle). Compared with xave, the forms were smooth blobs: no material identity, faces were blank, the spearheads were white blobs and the shields were plain team fields. Fixes: hue-shifted ramps (metal cold and warm), planar bands with specular only on hard materials, a mail ring pattern and gambeson quilting on the pixel grid, faces (brow, eyes with a catch-light, a nose shadow, a mouth), heraldic shields with a steel rim, a leaf spearhead, an arming sword with a cross-guard and pommel, and a Dane axe. The anachronistic sallet-and-plate "Iron Brethren" became dismounted brothers (great helm, white surcoat with the cross, Dane axe).
2. **Second pass.** Samurai hands showed checkerboard speckle where the shaft passed through the fist (two surfaces fighting), the kabuto read as a black box, and the yari were no longer than Templar spears. Fixes: a material-orphan cleanup pass (8-neighbour majority), a ridged kabuto with kuwagata horns, long lacquered nagae-yari with a narrow blade, a larger curved naginata blade, and straighter legs in idle.
3. **Third pass, the zoomed-out read** (level 1 at 1× and 3×). The samurai foot kinds all read as "dark man with a blue flag". Fixes: a different flag per troop (tall banner, sashimono, small, none), team-coloured jackets for the skirmishers, and signature parts drawn 1.3× at level 1 (bows, shields, the javelin fan, crossbow prods). Still weak at 13 px: the Templar crossbowman from the front (the pavise only shows from behind) and the horses' tube legs at level 8.

## Round 2 (undead redesign, zoomed-out read, joints, smears, effects)

| Source | Licence | Taken from it |
|---|---|---|
| Hollar after Holbein, *The Knight* (Met 361663) and the Met's Dance of Death prints, re-studied | Public domain | The dead keep the soldier's kit: **mail hanging in rags off a ribcage**, a tabard, a helmet over the skull, and a shield. The Grave Legionaries wear rusted mail with holes rotted through it, so the ribs and spine show inside. They also wear a team-coloured tabard with a tattered hem, a rusted helm and a skull-painted kite shield. The Revenant Arbalests wear a rotted gambeson and carry a skull pavise. |
| antumdeluge, *Skeletons rework*, and the *Gate Keeper* (OpenGameArt, CC0) | CC0 | Joints read as **knobs** (knees and elbows) and the pelvis as a bowl, with the spine visible. One green light per figure: the eyes for all ranks now, the chest of the colossus, the lich's staff, the glowing shot of the corpse trebuchet, and the skull on the bone barding. |
| Kuniyoshi, *Ghosts of the Taira* (Met 55743) | Public domain | Unchanged for the wraiths: a dark hood with green points. The lich gets a high fan of bone spines behind the crown and a ragged team-coloured mantle. |
| Met 35952 and 35773, armour for man and horse | CC0 | The bard is made of **overlapping plates in rows**. The Death Knights' horses are barded in plates of bone, row on row with dark seams, under a skull chanfron. |
| Muybridge, *The Horse in Motion* (LoC) | Public domain | Each leg is a forearm, a **knee**, a slim cannon, the **fetlock** knob, a pastern and a hoof that widens to its base. Level 2 and up now models these joints instead of two tubes. |
| Slynyrd, *Pixelblog 9: Melee Attacks*, and *smear frames* (prolificstudio.co/blog/smear-frames) | Study only | **Smears are solid shapes** in the weapon's light colour, drawn on the downswing in-betweens. Ours is a fan of pale steel (pale bone for the dead) between the blade's start and current angle. |
| Scale2x / EPX (Johnston, Mazzoleni), from the craft guide's scaling notes | Algorithm | Effects (standards, missiles and puffs) are Scale2x'd to 2x and 4x when zoomed in, so they keep crisp edges and lose the 8x8 blocks. |

Critique, round 2:
1. **Undead (level 8).** The first redesign pass looked thin. The Grave Legionaries were dark smudges, so the rotted mail now uses its own rusted-mail ramp with ring texture, under a team tabard. The colossus was a smooth blob, so its limbs got fused-bone seams, knee knobs and shoulder spurs. The barrow horse archers' rusted kettle read as a cowboy hat, so it went back to the bare skull.
2. **Zoomed-out read (level 1, 1440p minimum zoom).** The Templar crossbowman read as a plain levyman from the front. The pavise is now slung high and drawn 1.3x in the zoomed-out cell, so its painted top stands over his head from every facing. Kite shields are drawn 1.3x too. The weakest pair left is the Samurai yumi and teppo ashigaru: at 13 px both are a dark figure under a sashimono, told apart mainly by the bow and the gun.
3. **Battle at 8x.** The standards were 8x8 blocks next to 100 px figures. After Scale2x they are smoother but still coarser than the figures. A hand-drawn hi-res standard sheet would be the real fix.
