# The fallen against the living (QA battle-realism #15)

At zoom 3-4 in classic art the undead's fallen (bleached bone lying in heaps) had the palette and
size of the skeletons still standing, so a player couldn't see where the undead line held
(`docs/qa/battle-realism/shots/s3-2800-general.jpg`). References, study only:

| Image | Licence | What was taken |
|---|---|---|
| Medieval II: Total War, Steam store screenshot `0000000842` (see `total-war-battles.md`), https://store.steampowered.com/app/4700/ | (c) SEGA, reference only | From high up the fallen are scattered dark specks; the living are the bright, coloured masses. The dead never out-shine the line. |
| [Morgan Picture Bible, battle detail](https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg/960px-Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg) ([page](https://commons.wikimedia.org/wiki/File:Leaf_from_the_Morgan_Picture_Bible_-_Battle_detail.jpg)) | Public domain | The dead lie low under the hooves, in the shadow of the fighting, their colours dulled; the eye goes to the standing men. |
| [Morgan Bible, crusaders (Crusaders-middle-ages.jpg)](https://upload.wikimedia.org/wikipedia/commons/0/08/Crusaders-middle-ages.jpg) ([page](https://commons.wikimedia.org/wiki/File:Crusaders-middle-ages.jpg)) | Public domain | The fallen along the bottom are flat grey shapes against the ground: value, not detail, separates them from the living. |

What was done (`src/client/render/scene.ts`, `CORPSE_SHADE`): a corpse's shade is per faction.
Men in cloth stay at 0.78 (their pose and the blood already mark them); the undead go to 0.5 in
classic art (about the ground's value) and 0.62 in HD (whose painted dead are already dark). A
falling man darkens over his fall, and a corpse the Lich may still raise (drawn as a figure)
lies at the corpse shade too, instead of at full brightness.

Rounds: (1) 0.5 everywhere: classic reads at once (`fixes/15-undead-corpses-classic-before-after.jpg`),
but in HD the purple robes of fallen riders turned to mud; (2) HD at 0.62
(`fixes/15-undead-corpses-hd-before-after.jpg`): the dead stay below the living without losing
their colours; (3) checked a later moment (seed 3, 2,800 men, t1400, HD): bone heaps lie under
the standing skeleton blocks, which stay the brightest bone on the field.

## The fallen fall every way (cc/art3)

Battle screenshots (HD, seed 1, 1,200 men, t700, zoom 2) showed a rank of dead as one stamp
repeated: men who die side by side in a block faced the same way, so every corpse was the same body
lying the same way round (the undead horses most of all: a row of identical black slugs). References,
study only (in `references/dead/`):

| Image | Licence | What was taken |
|---|---|---|
| [Met 447301, "Gav and Talhand in Battle", Shahnama folio, c. 1430-40](https://images.metmuseum.org/CRDImages/is/web-large/DP215841.jpg) ([page](https://www.metmuseum.org/art/collection/search/447301)) | CC0 | The fallen horse lies on its back, legs up, under the living ones; riders down at every angle. No two dead lie alike. |
| [Met 338534, Battle Scene (drawing), 1590-1646](https://images.metmuseum.org/CRDImages/dp/web-large/DP809193.jpg) ([page](https://www.metmuseum.org/art/collection/search/338534)) | CC0 | Along the bottom the dead lie head left, head right, face down, face up: the variety of direction is what reads as a heap of men rather than a pattern. |
| [Met 201860, The Battle of Pavia (carved box), c. 1700](https://images.metmuseum.org/CRDImages/es/web-large/SF55_79_1ab_img1.jpg) ([page](https://www.metmuseum.org/art/collection/search/201860)) | CC0 | Two fallen under the hooves lie crossing each other, heads at opposite ends. |
| Rome: Total War Remastered, Steam store screenshot ([store](https://store.steampowered.com/app/885970/)) | (c) SEGA, reference only | Downed horses and men behind the charging line lie in all directions, each its own shape. |

What was done (`src/client/render/scene.ts`, `fallDir`): the way a man falls is chosen once as he
goes down, his facing at the blow turned by one of the four directions from a hash of who he is,
and the corpse keeps it. Cleared when he rises, so a second death falls afresh. No sheet changes:
the Die and Dead frames already exist for all four facings.
