# Iron Brethren (Templar kind 8) in HD: references and the fix for "white sheets"

QA finding #9 (`docs/qa/battle-realism-review.md`) called the Templar heavy foot in HD "oversized flat
white sheets". A probe of the soldiers on screen in `shots/hd-s1-1200-melee-t804.jpg` showed the white
figures are **kind 8, the Iron Brethren** (class `Shock`), not the Sergeant-Brothers (kind 0, already
in a black surcoat over dark mail, which is right for sergeants).

## What was wrong

- **Size.** The painted sheets are the right height: 14.9 units at level 8 for both the Brethren and
  the Sergeant, the same as the samurai's body (19.8 with the sashimono). What made them read 1.5x was
  the **ankle-length white mantle**, 14.5-15.4 units wide in NE/NW, hanging from the shoulders to the
  ground. From behind (the facing a Templar line shows when it attacks up the screen) it covered the
  whole man: no legs, no arms, no belt, a pale block with a white helm box on top.
- **Values.** At levels 2-4 the per-kind palette merges near neutrals, and the brothers' silver mail
  (`templar.k.silver`, L 0.44-0.9) folded into the white: mail legs, arms and helm all came out the
  surcoat's cream. A white man from helm to heel.
- **Colour.** The kit had a black tabard under the white mantle. The sergeants are the ones in black;
  the brothers (knights, fighting on foot here) wear white.

## References (study only, none committed)

| Image | Licence | What was taken |
|---|---|---|
| [Morgan Picture Bible, battle detail](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg/960px-Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg) ([page](https://commons.wikimedia.org/wiki/File:Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg)) | Public domain | Fighting men wear a sleeveless surcoat to the knee or calf, belted, over mail: the mail arms and legs always show, and they are a **mid grey with a ring texture**, clearly darker than the white cloth. Nobody fights in a mantle. Great helms: flat top, one dark slit. |
| [Morgan Bible, crusaders (Crusaders-middle-ages.jpg)](https://upload.wikimedia.org/wikipedia/commons/0/08/Crusaders-middle-ages.jpg) ([page](https://commons.wikimedia.org/wiki/File:Crusaders-middle-ages.jpg)) | Public domain | The surcoat's folds fall straight from the belt in a few deep channels; the hem is ragged with use. Mail coifs and chausses in a blue-grey with dark ring rows, which is what lets the figure part from his neighbours. |
| [Met 32832, Initial A with the Battle of the Maccabees](https://images.metmuseum.org/CRDImages/md/web-large/DP164982.jpg) ([page](https://www.metmuseum.org/art/collection/search/32832)) | CC0 | A packed block reads as rows of grey helm tops over coloured surcoats, with grey mail limbs between them: the grey is the separator. |
| [Met 32781, Hauberk of Mail](https://images.metmuseum.org/CRDImages/aa/web-large/62436.jpg) ([page](https://www.metmuseum.org/art/collection/search/32781)) | CC0 | Mail as a flat mid grey (L ~0.45-0.6), darker in the folds, not a silver near white. Sets the new `templar.k.iron` ramp (L 0.24-0.76, cool hue 240). |
| Medieval II: Total War, Steam store screenshot [`0000000848`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000848.1920x1080.jpg) ([store](https://store.steampowered.com/app/4700/)) | (c) SEGA, reference only | Dismounted knights in great helms: the surcoat stops at the knee with a few hard folds, the grey mail legs and arms and the shoulder plates break the cloth up, and no one wears a mantle. The model for the Brethren as rebuilt. |
| Medieval II: Total War, Steam store screenshots [`0000000841`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000841.1920x1080.jpg), [`0000000843`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000843.1920x1080.jpg), [`0000000844`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000844.1920x1080.jpg) ([store](https://store.steampowered.com/app/4700/)) | (c) SEGA, reference only | Seen from behind, men in a block still show shoulders, arms and helms; light surcoats stop at the knee and the legs below are dark. Men of both sides are one size. |

## The fix (`src/client/render/paper/templar-static.ts`)

- `BRETHREN`: the white surcoat (`TM.white`) with the red cross, belted, to the knee, over mail; no
  mantle and no fur collar. The red cross shows on the back too, so a line seen from behind still
  reads as Templars. Pauldrons, gauntlets, the great helm, the Dane axe and the wide stance stay.
- New material `templar.k.iron` for the Brethren's mail (body, camail, sleeves, legs, boots): a cool
  blue-grey steel (OKLCH C 0.03-0.042, hue 252 -> 205 into the lights), so the palette never merges it
  into the white, with the light class's pale deep tone (0.66), so its outline stays light.

Width at level 8 (idle): SE 10.9 -> 10.3 units, NE 15.4 -> 14.5 (the axe), the overhead blow 9.9 -> 6.8.

## Critique rounds

1. Mantle removed, silver mail kept (`fixes/09-brethren-L4-round1.png`): good at level 8, but at
   levels 2-4 the mail and the helm still went white, so the figure was a white block with legs.
2. `templar.k.iron` at L 0.2-0.72: mail and cloth part at every level, but at level 4 the legs read
   as black hose rather than mail.
3. Iron raised to L 0.24-0.76 (`fixes/09-brethren-L4-after.png`, `-L8-after.png`, `-L2-after.png`): grey
   mail with rings at level 8, grey limbs at 4 and 2, the cross front and back. In battle
   (`fixes/09-brethren-after.jpg` against `-before.jpg`, seed 1, 1,200 men, t804, zoom 4) the
   Brethren now stand the samurai's size, as men, legs and arms apart.
4. Pixel lint (`--kinds=8`): the dark iron's deep tone made the outline half dark, half pale, so it
   averaged to the field's value (edgeVsGround FAIL at every level), and at level 2 the pale boots
   under dark shins read as light from below (lightDir FAIL). A pale deep tone alone let the mail
   merge into the white again (both near-neutral, one family).
5. The mail given a little blue chroma (its own family), pale deep tone, lights stepped well above
   it so the level-8 palette keeps a hue drift: edge and light FAILs gone; the figure reads white
   surcoat over steel at 2, 4 and 8 (`fixes/09-brethren-L248-final.png`) and in HD 64
   (`fixes/09-brethren-hd64-after.png`).

## Pixel-lint pass (cc/art3): the axe that did not read, banding, the limp

`pnpm pixel-lint --only=sprites --factions=templar --kinds=8` failed the Brethren on aligned band
ends (M2) at levels 1 and 4 and on walk head boil (M16) at level 8; at level 1 the axe was not there
at all in the screenshots (a pale ash haft on a white surcoat, the bit a light-blue blob by the helm).

References studied for this pass (downloaded to `references/brethren/` and `references/battle/`,
study only, none committed):

| Image | Licence | What was taken |
|---|---|---|
| [Met 32832, Initial A with the Battle of the Maccabees](https://images.metmuseum.org/CRDImages/md/web-large/DP164982.jpg) ([page](https://www.metmuseum.org/art/collection/search/32832)) | CC0 | Every weapon is drawn as a dark shaft against the light cloth and sky; the blades are the lightest thing in the picture. A polearm reads by its line, not by its head. |
| [Met 23346, Ornamental plaque of a knight on horseback, c. 1300](https://images.metmuseum.org/CRDImages/aa/web-large/DP281672.jpg) ([page](https://www.metmuseum.org/art/collection/search/23346)) | CC0 | The great helm as a flat-topped box with one dark slit; the arm and weapon break the body's outline in one clear diagonal. |
| [Met 32781, Hauberk of Mail](https://images.metmuseum.org/CRDImages/aa/web-large/62436.jpg) ([page](https://www.metmuseum.org/art/collection/search/32781)) | CC0 | Mail is a mid grey of small rows; at 13-50 px it is a value, not a texture. |
| Medieval II: Total War, Steam store screenshot [`0000000848`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000848.1920x1080.jpg) ([store](https://store.steampowered.com/app/4700/)) | (c) SEGA, reference only | Dismounted knights march with an even stride, feet close to the line of travel; the shoulder lames fan down the arm, each narrower than the last. |
| Wargroove, Steam store screenshot [`ss_e457861c…`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/607050/ss_e457861ccc57d21b4ce6ee7a116bcfdab9b23cb9.1920x1080.jpg) ([store](https://store.steampowered.com/app/607050/)) | (c) Chucklefish, reference only | At ~16-20 px a unit is read by its weapon: a polearm is one chunky dark line with a light head, exaggerated in length. |
| Songs of Conquest, Steam store screenshot [`ss_4363a4c6…`](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/867210/ss_4363a4c6d46e4a86e975538fa53000aa8fdad561.1920x1080.jpg) ([store](https://store.steampowered.com/app/867210/)) | (c) Lavapotion, reference only | Small pixel figures seen from above keep a light top and a darker contour; banners and weapons stand above the head. |

What changed (`templar-static.ts`, `templar-clips.ts`, `templar-foot.ts`):

- **The haft** at levels 1 and 4 is one clean pixel line in a new kept material `templar.k.haft`:
  pale ash (tone 4) where it stands clear of the man over the grass, and, where it crosses his body,
  the contact pass steps it to a dark oiled shaft (tone 2) that reads across the white surcoat. Its
  deep tone is the light class's pale one, so the figure's rim stays light. At level 4 the old 1.6 px
  ash band stepped down the surcoat in 2 px stairs, which was most of the banding. (Level 2's ten
  colours have no room for it; the ash stays there.)
- **Pauldrons**: the three lames fan down and out, each narrower than the one above, instead of
  three equal bars stacked on one column.
- **Skirt folds** (all foot kinds, level 4 up): each fold starts at its own height under the belt
  and opens from a point; ridges are short. The shadow under the breast is a crescent, not a bar.
- **The walk**: the wide guard stance closes up to the usual track when walking. Left at its width
  the legs could not reach the long stride's contacts in the second half-cycle and the hips dropped
  3 px in one frame, a limp that boiled the whole head zone.

Lint, kind 8, before -> after: aligned band ends L1 0.349 -> 0.20, L4 0.329 -> 0.278; walk head
boil L8 0.156 -> 0.147. No other Templar kind changed status.

## Round 2: packed brothers part (cc/art3)

In melee at zoom 4 (seed 2, undead against Templars, t900) a block of Iron Brethren melted into one
cream mass: white surcoats, pale steel and pale ash, every outline the light class's pale deep tone,
so nothing marked where one man ended. The San Bevignate fresco and the Morgan Bible battle leaves
(above) part white-clad men with dark contours, as the Knight-Brothers already do (`litDark`).

What changed: a value class `'knight4'` (`templar-parts.ts` `remapFor`): the knight class (dark
deep tones under the whites) from level 4, the light class below (at level 2 the dark rim and the
iron's dark deep tone turned the whole figure a blue-grey on the field's value: figure vs ground
0.05, FAIL). The Brethren paint in it, with knight-class twins of their iron and haft
(`templar.k.ironK`, `templar.k.haftK`) and `litDark` from level 4. In battle each brother now has a
dark contour, and the axes read against the cloth behind. Lint (kind 8, HD): 0 fails; figure vs
ground warns 1 -> 3 (L4 0.074, L8 0.112, as the Knight-Brothers).
