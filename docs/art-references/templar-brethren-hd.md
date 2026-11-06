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
- New material `templar.k.iron` for the Brethren's mail (body, camail, sleeves, legs, boots): mid grey,
  two steps under the surcoat's shadow, so the palette never merges it into the white.

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
