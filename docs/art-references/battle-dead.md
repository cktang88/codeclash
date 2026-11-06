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
