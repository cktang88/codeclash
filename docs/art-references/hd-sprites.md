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

## Round 3 (de-cartooning, anatomy, pixel stylisation, anti-flicker)

Local copies live in `references/<subject>/` in the repo. That folder is git-ignored and kept for
study only; none of these images are committed.

### Undead (`references/undead/`)

| Image (direct URL) | Page | Licence | Taken from it |
|---|---|---|---|
| https://darkestdungeon.wiki.gg/images/Bone_Militia.png | https://darkestdungeon.wiki.gg/wiki/Bone_Soldier | (c) Red Hook Studios (study only) | A **small skull, about 1/7 of the height**, and long thin limb bones with gaps. The dirty bone is brown-grey, not cream. Rusty pauldrons and red-brown rags hang in strips, and the figure lunges with weight on the front foot. |
| https://darkestdungeon.wiki.gg/images/Skeleton_defender.sprite.defend.png | https://darkestdungeon.wiki.gg/wiki/Bone_Defender | (c) Red Hook (study only) | **Heavy grey armour pieces** with dark seams over the ribs, a battered round shield with arrows in it, and a chipped axe. Armour is the darkest value and bone the lightest, which gives the contrast at part boundaries. |
| https://darkestdungeon.wiki.gg/images/Bone_Courtier.png | https://darkestdungeon.wiki.gg/wiki/Bone_Courtier | (c) Red Hook (study only) | The robed caster is a **dark coat with the skull small at the top**. That is the read for the lich, kept gaunt with a crown. |
| https://darkestdungeon.wiki.gg/images/Bone_Arbalist.png | https://darkestdungeon.wiki.gg/wiki/Bone_Arbalist | (c) Red Hook (study only) | A kettle hat and a crossbow held level: the Revenant Arbalest's read. |
| https://static0.fextralifeimages.com/file/eldenring/b/b7/Skeleton_enemies_elden_ring_wiki_600px.png | https://eldenring.wiki.fextralife.com/Skeletal+Militiaman | (c) FromSoftware (study only) | Brown, stained bone with **rags hanging from the pelvis in strips**, a hunched advance and a long spear. The cold green and purple light is the only saturated colour. |
| https://static0.fextralifeimages.com/file/darksouls/b/be/Skeleton_enemy_dark_soul.png | https://darksouls.wiki.fextralife.com/Skeleton | (c) FromSoftware (study only) | Very thin limbs, a curved blade and **low-key light**, so the figure is mostly dark with a few bright edges. |
| https://static.wikia.nocookie.net/diablo/images/5/5d/Skeleton_Variations.png | https://diablo.fandom.com/wiki/Skeleton | (c) Blizzard (study only) | Diablo II pre-rendered skeletons: **yellowed bone and stick-thin bones**, a small skull, rusty pauldrons on some, round shields. It shows how thin an undead limb can be and still read at sprite size. |
| https://static.wikia.nocookie.net/diablo/images/b/be/Skeletal_Warrior.jpg | https://diablo.fandom.com/wiki/Skeletal_Warrior | (c) Blizzard (study only) | Cold blue-grey light on an armoured skeleton with a long sword. |
| https://static.wikia.nocookie.net/totalwarhammer_gamepedia/images/b/b7/Wh_main_vmp_grave_guard.png | https://totalwarwarhammer.fandom.com/wiki/Grave_Guard | (c) Creative Assembly / Games Workshop (study only) | Grave Guard wear **heavy dark, rusted plate over bone**, a ragged cloak and a great shield. That is the model for the Grave Legionaries (rusted mail, tabard, skull shield). |
| https://static.wikia.nocookie.net/totalwarhammer_gamepedia/images/8/85/Wh_main_vmp_black_knights.png | https://totalwarwarhammer.fandom.com/wiki/Black_Knights | (c) CA / GW (study only) | Black Knights: a dark rider on a barded skeletal horse. Our Death Knights have black plate and bone barding. |
| https://static.wikia.nocookie.net/totalwarhammer_gamepedia/images/6/61/Wh_main_vmp_hexwraiths.png | https://totalwarwarhammer.fandom.com/wiki/Hexwraiths | (c) CA / GW (study only) | Spectral riders on skeletal horses whose ribs show. Green-cyan soul-fire is the accent. |
| https://static.wikia.nocookie.net/totalwarhammer_gamepedia/images/e/e2/Wh_dlc04_vmp_mortis_engine.png | https://totalwarwarhammer.fandom.com/wiki/Mortis_Engine | (c) CA / GW (study only) | A necromantic engine wreathed in green witchfire. This is the light on the corpse trebuchet and the lich's staff. |
| https://static.wikia.nocookie.net/totalwarhammer_gamepedia/images/b/b7/Wh_main_vmp_varghulf.png | https://totalwarwarhammer.fandom.com/wiki/Varghulf | (c) CA / GW (study only) | A hulking hunched monster that reads by its mass and hunch. The Bone Colossus became a hunched heap. |

### Templar and Samurai (games, `references/templar/`, `references/samurai/`)

| Image (direct URL) | Page | Licence | Taken from it |
|---|---|---|---|
| https://static.wikia.nocookie.net/totalwar/images/3/33/Eng_dismounted_feudal_knights_info.png | https://totalwar.fandom.com/wiki/Dismounted_Feudal_Knights | (c) Creative Assembly (study only) | **Realistic adult proportions**: the great helm is small against the body, mail is dull grey and the surcoat cloth is worn. Heater shields carry bold two-colour heraldry. |
| https://static.wikia.nocookie.net/totalwar/images/b/b1/STW_spear_ashigaru.png | https://totalwar.fandom.com/wiki/Yari_Ashigaru | (c) CA (study only) | Ashigaru: a jingasa, a dark dō over dark sleeves, and a **long yari held diagonally**. |
| https://static.wikia.nocookie.net/totalwar/images/b/b0/Bow_Ashigaru_S2TW.png | https://totalwar.fandom.com/wiki/Bow_Ashigaru | (c) CA (study only) | The **yumi is half again a man's height**, gripped low with the long upper limb over the head. Our archers now carry it standing tall, with a hachimaki and no flag. |
| https://static.wikia.nocookie.net/totalwar/images/f/f2/Matchlock_Ashigaru_S2TW.png | https://totalwar.fandom.com/wiki/Matchlock_Ashigaru | (c) CA (study only) | The teppō is **held level at the cheek**, under a jingasa. Our gunners carry it level at the chest, with a sashimono. |
| https://static.wikia.nocookie.net/totalwar/images/e/e3/Katana_Samurai_S2TW.png | https://totalwar.fandom.com/wiki/Katana_Samurai | (c) CA (study only) | Laced red-and-black dō, kabuto with kuwagata. |
| https://static.wikia.nocookie.net/ghostoftsushima/images/9/94/Jin_Sakai_key_art_cropped.png | https://ghostoftsushima.fandom.com/wiki/Jin_Sakai | (c) Sucker Punch / Sony (study only) | **Scuffed, dark lacquer with small sharp highlights**, in a low-key, moody value range. That is the lacquer ramp. |
| https://static0.fextralifeimages.com/file/sekiroshadowsdietwice/2/27/Ashina-elite-jinsuke-saze-gallery-1-sekiro-wiki-guide-300px.png | https://sekiroshadowsdietwice.wiki.fextralife.com/Ashina+Elite+-+Jinsuke+Saze | (c) FromSoftware (study only) | Weathered, desaturated cloth and armour in a dark scene. |
| Met Open Access images (listed above) and the Nagashino screen | see above | Public domain | Unchanged from rounds 1 and 2; copies are in `references/templar` and `references/samurai`. |

### What changed, and the critique

- **Proportions.** From level 2 up the head is 0.66 of its former size, about a seventh of the height. Signature parts are drawn true to size up close (they are only exaggerated in the zoomed-out cell).
- **Anatomy.**
  - Arms: rounded shoulders, an upper arm, a forearm swelling below the elbow, and a fist with a thumb.
  - Legs: thigh, knee and calf, booted to mid-shin with a cuff.
  - Head and torso: a jaw under open faces, and a chest broader than the waist.
  - Skeletons: thin bones with knob joints and a spine, the ribcage behind rotted coats, foot bones, and skirts torn into strips.
  - Horses: neck, deep chest, haunch, cheek, eyes, and a draped caparison that is flat over the back.
- **Materials, low-key.** Every ramp is a step darker and duller apart from the army colour, glow, fire and blood. Steel is grimy, with highlights only on hard materials. Bone is dark, yellowed and brown-stained. Eye sockets are deep shadow with a 1-2 px cold green point.
- **Stylisation pass.**
  - Clusters of one colour smaller than 3, 4 or 6 px (at levels 2, 4 and 8) take their neighbours' tone.
  - One-pixel spurs are trimmed and notches filled on the silhouette (thin props are exempt).
  - Inner lines are drawn at shallow depth steps where the material changes.
  - Outlines stay coloured and lighter on the lit side.
- **Anti-flicker.** Frames of an animation are painted in sequence. A pixel whose tone flips alone (its neighbours now agree with last frame's tone) keeps last frame's tone. This happens before trimming and packing, on the full work canvas.
- **Samurai archers vs gunners.** The archers wear a hachimaki, carry no flag, and the yumi (9 units above the grip) stands over the head. The gunners carry a sashimono and hold the teppō level, with smoke on the shot. Yari ashigaru now wear indigo hakama instead of bare legs.

Rounds (8x renders, each beside the xave_pixel 128 figure at the same pixel scale and the game references):
1. **Bodies.** Heads were 1/4 of the height (chibi), skeleton limbs were sausages, and the Bone Colossus was a cream mannequin. Fixes: small heads, a darker grimy palette, thin skeleton bones, and a hunch for the undead.
2. **Colossus.** It still read as smooth tubes, because the fused bones touched and merged. Fixes: three thin bones per limb with clear gaps, finger bones, extra ribcages with spines, six skulls caught in the heap, and a giant femur club with an iron band.
3. **Templar and Samurai beside Medieval II and Shogun 2.** The caparison was an egg, the yumi was no taller than the man, and the ashigaru legs were bare. Fixes: a draped caparison, the long yumi, and hakama. At minimum zoom the Samurai archer (tall stave, no flag) and gunner (flag, level gun) now differ in silhouette.

Still short of the target:
- The colossus is a pale mass at a distance.
- Horse bodies are smooth.
- The xave figure's hand-placed cloth folds and hair strands have no equivalent in a ray-cast. The stylisation pass gets clean flat clusters, not authored ones.

## The 2D paper-doll painter (paper.ts): first unit, the Grave Legionary

The user's direction is to go as far as we can in 2D, with no 3D primitives. `src/client/render/paper.ts` draws the Grave Legionary
(south-east facing; Idle, Walk, Attack and Die; level 4 ≈ 64 px and level 8 ≈ 128 px) the way a pixel artist would, without ray-casting:
- **Parts.** Each part is an outline polygon or tapered stroke in sprite space, filled pixel-perfectly (a pixel is in when its centre is).
- **Shading is painted into the parts.** Rods get a 1 px lit edge toward the top-left, a shadow third and a dark far edge. Round shapes get an offset light cluster and a shadow crescent. The details are drawn by hand: eye sockets with a cold point, teeth, rib gaps over a dark chest cavity, mail rings, rust patches, rivets, blade chips and pitting, a painted skull on the shield, and tabard folds and torn tongues.
- **Ramps.** Five steps per material, hue-shifted. Bone is yellowed and brown-stained; iron, rust, mail and team cloth are low-key.
- **Rig.** A 2D bone rig with authored key poses, eased between, and angles snapped to 7.5°. Every rotated part is redrawn from its outline, never rotated as an image.
  - Attack has an anticipation key, a fast strike with a solid smear, and a follow-through overshoot.
  - In Die he buckles, falls and comes apart into a heap.
- **Passes.** Contact lines where a part lies in front of another, small-cluster merge, anti-flicker against the previous frame, and a coloured outline that is lighter on the lit side.

References for this unit (in `references/undead/`, study only): the Diablo II skeleton sheet and Darkest Dungeon's Bone Soldier (URLs above), with xave_pixel's 128 figure as the target. The side-by-side with them is in `references/comparisons/` and is not committed.

Critique rounds (`docs/screenshots/hd-sprites/paper-*`, our art only):
1. A flat slab of tabard and mail hid the skeleton.
2. The ribs were a tangle, the pauldron read as a second head, and the helm hid the face. Fixes: a short mail cape and a narrow tabard on a belt, a dark chest cavity behind fewer and lighter ribs, and a small rusty pauldron.
3. The legs overlapped into one, the sword pointed back, and the skull had no face. Fixes: legs set apart, authored blade angles per key, the helm raised, and a visible glow point.

Against the old ray-cast Legionary (blobby limbs, a cream mannequin), the new one reads as a thin, grim skeleton warrior at both levels.

Still short of the references:
- The pose is close to profile rather than a true three-quarter view.
- The skull is small and dark, and the face reads mainly as teeth.
- Not yet wired into the game: only this unit, in one facing.

Round 4 changes, from the coordinator's critique:
- **Ribcage:** the striped slab is gone. Behind is a vertebra column, in front a sternum, and four thin curved ribs on each side (the near side lit, the far side darker) with empty gaps between them.
- **Head:** an open-faced, dented kettle hat (low rusty crown, wide chewed brim). The skull face shows eye sockets with the glow point, a nasal cavity, a cheekbone highlight, a stain and the jaw.
- **Tabard:** two folds with lit ridges, a darker underside at the hem, and torn strips. It swings a frame and a half behind the stride and the strike.
- **Three-quarter view:** the shoulders spread across the screen, so the chest faces the viewer.
- **Bone:** darker knobbed joints with a seam, brown stains along the shafts, a lit edge.
- **Plates:** a two-lame pauldron with rivets, a pale lit top rim and rust spreading from the lower edge. The mail cape has a shaped, scalloped hem.

Remaining for this unit: the ribs still read busy at level 4; the back facings are not drawn yet.

## The paper painter as a module (`src/client/render/paper/`), wired into HD mode

`paper.ts` is now a module folder:
- `core.ts`: the canvas, primitives, materials, passes and palette.
- `rig.ts`: bodies, poses and keys.
- `facing.ts`
- `registry.ts`
- `index.ts`
- `undead.ts` (`templar.ts` and `samurai.ts` are empty and owned by their faction agents).

The authoring guide is `src/client/render/paper/README.md`. HD mode routes a registered
(faction, kind) to it and falls back to the ray-cast painter for everything else. The split was
checked against the proof before any art changed: 352 SE frames at levels 1, 2, 4 and 8, in two
hues, were pixel-identical. The pixel-lint rules were then built into the core, which changed the
pixels on purpose (see the README, "No-boil rules" and "Passes"):
- whole-pixel anchors and part-local texture (no boil);
- an OKLab master palette per faction and level, under a colour cap;
- OKLab outlines with a lightness floor and the side taken from the edge normal;
- base tones kept 0.12 from the ground;
- cleanup at level 1;
- contact lines on the shadow side only;
- per-part band offsets;
- no baked ground shadow.

### Back view references (`references/legionary-back/`, study only, not committed)

| Image (direct URL) | Page | Licence | Taken from it |
|---|---|---|---|
| https://upload.wikimedia.org/wikipedia/commons/1/1e/Standing_skeleton%2C_posterior_view_Wellcome_L0018904.jpg (960 px thumb) | https://commons.wikimedia.org/wiki/File:Standing_skeleton,_posterior_view_Wellcome_L0018904.jpg | CC BY 4.0 (Wellcome Collection) | The Encyclopédie plate of a **three-quarter back view**. The shoulder blades are big pale triangles over the ribs. The spine is a knobbed column lying *over* the ribs, and the ribs arch out and down from it. The iliac wings flare either side of the sacrum. The back of the cranium is a smooth dome with a suture and the jaw just showing. |
| https://upload.wikimedia.org/wikipedia/commons/0/0e/Human_Skeleton_Upper_Body_Posterior_View.jpg (960 px thumb) | https://commons.wikimedia.org/wiki/File:Human_Skeleton_Upper_Body_Posterior_View.jpg | CC BY-SA 3.0 | The lambdoid suture across the back of the skull, the occipital knob above the neck, and the scapular spine as a ridge across each blade. |
| https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets/body/bodies/skeleton/walk.png and `.../slash.png` | https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator | CC-BY-SA 3.0 / GPL 3.0 (LPC) | How a 64 px pixel skeleton reads from behind: the spine as one light column with dark rib bands either side, the blades as the lightest plates, and the near arm overlapping the back. In the slash row, the weapon arm stays visible from behind. |
| Diablo II skeleton sheet and Darkest Dungeon Bone Soldier (above) | | (c), study only | Kept for the front. Its low-key yellowed bone carries over to the back. |

I tried to find a medieval shield back (enarmes) on Commons, but the API rate-limited me. The
shield back is drawn from general knowledge: dark planks, two leather straps and a buckle.

### Critique rounds (`docs/screenshots/hd-sprites/paper-legionary-*`, `paper-battle-hd-*`)

1. **Back view, first pass.** The mail cape covered the whole upper back, which hid the spine and shoulder blades: exactly what makes the Encyclopédie plate and the LPC back row read as a back. Fix: from behind, the cape is a short mantle over the shoulders, and the ribs, spine and blades show beneath it.
2. **Attack at level 8.** The smear, drawn as a rod every 7.5°, read as a fan of separate blades. Fix: `Paper.smear` is now one solid annular sector, lit at the leading edge and thinning to the tail.
3. **Level 1 and values.** Under the ground-value rule, the first level-1 tone map made the bone brown and the limbs chunky, so the skeleton read was lost. Fix: tones (0, 1, 2, 2, 3) at level 1 and thinner minimum rods. The bone reads pale again, and the figure's mean value still clears the lint's fail line.

Checked in a real HD battle (battle-perf, seed 3, undead against templar, 2000 men):
- At zoom 5, level-8 sheets land after about 20 s in software GL. The Legionary block reads as kettle hats, raised blades and skull kite shields in the army's purple. It sits consistently with the ray-cast kinds around it.
- At zoom 1 the field renders cleanly.

Still short of the references:
- The back of the shield is mostly hidden, so the straps barely show.
- The mail is very dark under the ground-value rule.
- At level 1 the figure is a pale stick with a hat and a shield: readable, but no skeleton detail survives at 13 px.

## Templar paper figures (`paper/templar.ts`, `templar-parts.ts`, `templar-static.ts`)

All eleven Templar kinds are drawn on paper. The animated figures (`templar.ts`) are live in HD
mode. The bulked-up key art (`templar-static.ts`, one idle SE image per kind at level 8) is waiting
for approval, after which the animated figures will be rebuilt from it.

### References (`references/templar/`, `references/user-targets/`; study only, none committed)

| Image (direct URL) | Page | Licence | Taken from it |
|---|---|---|---|
| https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a3/Maciejowski_Bible_-_Morgan_Library_%26_Museum_MS_M.638%2C_fol._23v.jpg/1280px-Maciejowski_Bible_-_Morgan_Library_%26_Museum_MS_M.638%2C_fol._23v.jpg | https://commons.wikimedia.org/wiki/File:Maciejowski_Bible_-_Morgan_Library_%26_Museum_MS_M.638,_fol._23v.jpg | Public domain | <ul><li>Mail from head to toe under plain surcoats.</li><li>Kettle hats beside flat-topped great helms.</li><li>Long-necked horses with long heads.</li><li>The traction trebuchet: a beam lashed from poles, a man hauling a rope, and the sling with its stone.</li></ul> |
| https://upload.wikimedia.org/wikipedia/commons/2/22/Morgan_Bible_28r_detail.jpg | https://commons.wikimedia.org/wiki/File:Morgan_Bible_28r_detail.jpg | Public domain | The hauberk is drawn as rows of rings that follow the body, under a short coloured surcoat. These are the ring rows of `mailTex`. |
| https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Old_Testament_miniatures_with_Latin%2C_Persian%2C_and_Judeo-Persian_inscriptions_-_Google_Art_Project_%28cropped_trebuchet%29.jpg/960px-Old_Testament_miniatures_with_Latin%2C_Persian%2C_and_Judeo-Persian_inscriptions_-_Google_Art_Project_%28cropped_trebuchet%29.jpg | https://commons.wikimedia.org/wiki/File:Old_Testament_miniatures_with_Latin,_Persian,_and_Judeo-Persian_inscriptions_-_Google_Art_Project_(cropped_trebuchet).jpg | Public domain | The engine's proportions: the beam is twice a man's height and sits on an A-trestle. The short arm carries the pulling ropes and the long arm the sling. |
| https://upload.wikimedia.org/wikipedia/commons/9/98/Templari_MatthewParis.jpg | https://commons.wikimedia.org/wiki/File:Templari_MatthewParis.jpg | Public domain | Matthew Paris's two brothers on one horse:<ul><li>The **Beauséant is a third sable over argent**, with no cross. The marshal's banner follows it.</li><li>The brothers' **shields are argent, a chief sable**. The knights' shields follow it.</li><li>A slender, long-headed horse with a rope bridle.</li></ul> |
| https://upload.wikimedia.org/wikipedia/commons/0/03/Seal_of_Templars.jpg | https://commons.wikimedia.org/wiki/File:Seal_of_Templars.jpg | Public domain | Two riders with lances on the seal: rider and horse make one compact mass, and the lance is the silhouette. |
| https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Topfhelm_DHM_transparent.png/960px-Topfhelm_DHM_transparent.png | https://commons.wikimedia.org/wiki/File:Topfhelm_DHM_transparent.png | CC BY-SA 3.0 | The great helm is a tall, flat-topped barrel, wider than the head. It has:<ul><li>a cross-shaped brow and nasal reinforcement;</li><li>eye slits either side of the bar;</li><li>breaths on the cheek;</li><li>rivets round the rim.</li></ul> |
| https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/European_riveted_mail_hauberk%2C_close_up_view.jpg/960px-European_riveted_mail_hauberk%2C_close_up_view.jpg | https://commons.wikimedia.org/wiki/File:European_riveted_mail_hauberk,_close_up_view.jpg | CC BY-SA 3.0 | Mail is dark and grimy, with small hard highlights on the ring edges. So the mail gets a dull ramp, with highlights on the lit side only. |
| https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Chapel_de_fer%2C_kettle_helmet_or_war_hat_-_Snowshill_Manor_-_NT_1328878_-_DSC_0538.jpg/960px-Chapel_de_fer%2C_kettle_helmet_or_war_hat_-_Snowshill_Manor_-_NT_1328878_-_DSC_0538.jpg | https://commons.wikimedia.org/wiki/File:Chapel_de_fer,_kettle_helmet_or_war_hat_-_Snowshill_Manor_-_NT_1328878_-_DSC_0538.jpg | CC BY-SA 4.0 | A low crown and a wide, dished brim. The brim's upper face is lit and its underside is in shadow. |
| https://upload.wikimedia.org/wikipedia/commons/a/a6/Dane_Axe.JPG | https://commons.wikimedia.org/wiki/File:Dane_Axe.JPG | Public domain | A long haft and a thin, broad crescent bit. This is the Iron Brethren's signature. |
| https://upload.wikimedia.org/wikipedia/commons/2/29/Turcopole%2C_12th_century.jpg | https://commons.wikimedia.org/wiki/File:Turcopole,_12th_century.jpg | CC BY-SA 3.0 | A light horseman with a head-wrap over a spiked cap, a round shield and a light lance. |
| https://upload.wikimedia.org/wikipedia/commons/a/a2/Balestriere1.jpg | https://commons.wikimedia.org/wiki/File:Balestriere1.jpg | CC BY-SA 3.0 | The crossbowman wears a padded jack and a kettle hat, and holds the bow across his body. |
| https://static.wikia.nocookie.net/totalwar/images/1/11/Fra_dismounted_feudal_knights_info.png | https://totalwar.fandom.com/wiki/Dismounted_Feudal_Knights | (c) Creative Assembly (study only) | Medieval II proportions: the great helm is small against a broad body, the mail is grimy and the cloth is heavy. |
| https://static.wikia.nocookie.net/totalwar/images/a/a2/Knights_of_Santiago.JPG | https://totalwar.fandom.com/wiki/Knights_of_Santiago | (c) Creative Assembly (study only) | Knights of a military order: a white surcoat with a red cross, a great helm, and a caparisoned horse whose cloth hangs to the knees. |
| https://static.wikia.nocookie.net/totalwar/images/8/8b/French_Mounted_Sergeants.JPG | https://totalwar.fandom.com/wiki/Mounted_Sergeants | (c) Creative Assembly (study only) | A light rider in padded armour on a horse with no caparison, so the saddle and girth show. This is the turcopoles' look. |
| https://i.redd.it/fxx9828pdq3d1.png | (xave_pixel, Reddit) | All rights reserved (study only) | The quality target:<ul><li>large flat clusters;</li><li>3-5-step hue-shifted ramps;</li><li>one saturated accent;</li><li>no black outline.</li></ul> |
| https://i.redd.it/fsroum98hki61.png | (Diablo II: Resurrected class renders, Reddit) | (c) Blizzard (study only) | The user's target is the Paladin:<ul><li>broad shoulders with pauldrons;</li><li>a solid, layered torso;</li><li>a **great kite shield held tight across the body**;</li><li>the sword hanging point-down at his side.</li></ul>His bulk comes from volumes. |
| https://img.craftpix.net/2023/04/Fantasy-Knight-Sprite-Sheets-Pixel-Art.webp | https://craftpix.net | CraftPix commercial licence (study only) | Pixel knights whose limbs are shaped masses: a thick upper arm, knee armour, a calf, a boot. Their shields sit against the body. |

### Value classes and the palette (animated figures)

The lint's ground rules decided the palette: a figure's mean value must be at least 0.06 OKLab L
from the field, and its outline ring at least 0.1. Every figure is therefore one value class:
- **Dark:** sergeants, levies, javelin men, archers, crossbowmen, turcopoles and the engine crew.
  The dark materials share an umber deep pair.
- **Light:** knights, Iron Brethren and the marshal. The light materials share a pale deep tone,
  which is also their dark outline. A white brother reads by the value of his whole mass rather than
  by a black ring.

`paintAs` repaints each part in its figure's class. On a dark figure, pale steel keeps a dark deep
tone; on a light figure, the lance is pale ash. At level 1 the faction has only 12 colours, so dark
figures paint their browns as one neutral dark, and light figures paint their metal and wood as one
pale grey.

### Critique rounds

Animated figures:
1. **First pass** (all kinds, level 8). The mail came out brown and the faces were dark masks,
   because the materials sat in the field's value band and were shifted, then merged. Fix: ramps set
   clear of the field, a smaller eye and a lighter beard.
2. **Level 1** (13 px). The contact pass blacked out the 1-2 px head and arms, so the light seemed to
   come from below, and the ramps collapsed into straight runs. Fixes:
   - the head is drawn before the body;
   - a diagonal light at level 1;
   - one dark material per dark figure;
   - hue-stepped umbers and army colour.
3. **Silhouettes and heraldry.** The brothers bear Matthew Paris's arms (a chief sable) and the
   Beauséant is a third sable. The archer's bow leans at rest, and lances and swords are held at 45°,
   which gives clean steps.

Key art (`templar-static-*.png`):
1. **Bulk**, after the user's critique "stick figures". The rods became shaped volumes:
   - shoulders span about 5.2 of 14 units (0.37 H), with a mail cape over them;
   - thigh 1.6, upper arm 1.5, forearm 1.2;
   - the kite shield is 6.8 × 4.3 units, held against the body with its inner edge over the centre
     line.

   The sword crossed the shield, unlike the Paladin's, so it now hangs point-down at the side.
2. **Horses.**
   - The head read as a wedge pointing up. It is now drawn in its own frame: forehead, nose bridge,
     a darker soft muzzle, jowl, ears and bridle, on a deep arched neck.
   - The horse is drawn 1.15× against the man, so the riders no longer sit on ponies.
   - The pavise is larger and slung higher, and the javelin shafts are pale.
3. **Trapper and finish.** The caparison now rounds over the croup instead of ending in a box.
   Still short of the Paladin:
   - the faces are small dark masses;
   - the knight's white surcoat and white trapper sit at nearly the same value;
   - the engine crew are the plain foot figure.

Screenshots:
- `templar-static-L8.png`: the lineup.
- `templar-static-k<kind>-x3.png`: each kind at ×3.
- `templar-static-sergeant-before-after-x3.png`: the old rod figure on the left, the bulked key art
  on the right.
