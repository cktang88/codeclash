# Templar weapons to scale, and blows that differ

Date: 2026-11-05. The user: "lots of attack animations seem too similar" and "a lot of units'
weapons are too small or short". Scope: the eleven Templar kinds (`paper/templar-static.ts` gear,
`templar-parts.ts` weapon drawings, `templar-clips.ts` foot blows, `templar-horse.ts` rider blows).
Background: `weapon-attacks.md` (T1-T9), `guards.md`, `templar-animation.md`.

## References studied (study copies in `references/templar-blows/`, not committed)

| Source | Licence | Taken from it |
|---|---|---|
| Fiore dei Liberi, *Fior di Battaglia* (Getty MS Ludwig XV 13), the spear page: [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/34994236466_ecb25262af_o.jpg) ([page](https://publicdomainreview.org/collections/italian-fighting-manual-ca-1410)) | Public domain; Getty Open Content | <ul><li>The spear is about 1.5 man-heights: held at the balance, it reaches a man's height ahead of the fist.</li><li>Its guards are overhand at the head (finestra) and low at the hip (porta di ferro), so the two thrusts start from different heights and should look different.</li><li>The bottom pair shows the shaft crossed and turned, the butt in play.</li></ul> |
| Fiore, the sword page: [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/35034234575_5c11b49802_o.jpg) | Public domain; Getty Open Content | <ul><li>The blade held upright from the fist reaches from the hip to above the head (≈ 0.5 H).</li><li>The thrust is laid level at the face; the cut is chambered high over the shoulder.</li></ul> |
| Fiore, the mounted page: [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/34870299302_6bb92b7a49_o.jpg) | Public domain; Getty Open Content | Riders' swords are held high or upright; the point is stabbed down at the face across the horse's neck. |
| Bayeux Tapestry scene 52 (infantry and cavalry): [image](https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Bayeux_Tapestry_Scene_52_%28infantry_and_cavalry_styles%29.png/960px-Bayeux_Tapestry_Scene_52_%28infantry_and_cavalry_styles%29.png) ([page](https://commons.wikimedia.org/wiki/File:Bayeux_Tapestry_Scene_52_(infantry_and_cavalry_styles).png)) | Public domain | <ul><li>Riders stab overarm, the fist above the helm and the spear sloping steeply down at the men on foot. Others hold the spear low and level. These are the two Turcopole blows.</li><li>Kite shields run from the chin to the knee.</li><li>The Dane axe is swung two-handed. Its haft is about the length of a man's torso and legs to the knee (≈ 0.75 H).</li><li>The spears stand well over the riders' heads.</li></ul> |
| Met 23367, *Sword*, c. 1400: [image](https://images.metmuseum.org/CRDImages/aa/web-large/DT759.jpg) ([page](https://www.metmuseum.org/art/collection/search/23367)) | CC0 | 102 cm overall, an 81 cm blade, a cross about 1/4 of the blade. At 12.5 cm a unit: blade 6.5 units, overall 8. |
| Met 23336, *Crossbow*: [image](https://images.metmuseum.org/CRDImages/aa/web-large/DP282473.jpg) ([page](https://www.metmuseum.org/art/collection/search/23336)) | CC0 | 90 cm long, a prod 75 cm across: the crossbow is a big thing, half a man long, with a prod as wide. Ours was a third of that. |
| Met 32832, *Initial A with the Battle of the Maccabees*: [image](https://images.metmuseum.org/CRDImages/md/web-large/DP164982.jpg) | CC0 | The mounted swords are raised high, and the blades are as long as the riders' arms and more. |

## Scale

A man is 14 units (about 1.75 m), so 1 unit ≈ 12.5 cm. Sizes before → after, in units from the
fist unless said otherwise (real sizes in brackets):

| Kind | Weapon | Before | After |
|---|---|---|---|
| Sergeant-Brothers | arming sword (grip to tip) | 5.4 (0.62 m blade) | **7.0** (0.82 m blade, Met 23367) |
| | kite shield height | 6.8, top at the chest | **7.6**, collar to knee |
| Spear Levy | spear (ahead + behind + head) | 12.5 + 6.4 + 1.9 = 20.8 (2.6 m) | **14.2 + 6.6 + 2.0 = 22.8** (2.85 m); upright, the point stands 8 units over the helm |
| Javelin Men | javelin | 5.6 + 2.4 + 1.15 = 9.2 (1.15 m) | **7.4 + 3.2 + 1.3 = 11.9** (1.5 m); spares 9.4 → 12.6 |
| Pilgrim Archers | self bow | 13.4 (1.68 m) | unchanged: right for a self bow, and longer would stand in the ground at rest |
| Genoese Crossbows | stock / prod across | 3.6 / 3.0 (0.45 / 0.38 m) | **5.9 / 5.4** (0.74 / 0.68 m, Met 23336); 0.8 of that at level 1, where the full size lined its pixel runs up with the pavise's (lint `aligned` 0.31, a fail) |
| Iron Brethren | Dane axe haft | 6.4 + 3.0 = 9.4 (1.18 m) | **7.8 + 3.6 = 11.4** (1.43 m) |
| Turcopoles | light lance | 13 + 4.5 + 1.5 = 19 (2.4 m) | **16 + 5 + 1.6 = 22.6** (2.8 m) |
| Turcopole Archers | composite bow | 8.6 (1.07 m) | **9.6** (1.2 m) |
| Knight-Brothers | lance | 12.5 + 3.5 + 1.3 = 17.3 (2.2 m) | **23 + 5 + 1.5 = 29.5** (3.7 m); level 1 keeps 22 ahead (the 48-px cell) |
| | kite | 5.9 | **6.5** |
| Knights, Marshal | sword | 5.4 | **7.0** |

At rest the Sergeant's longer sword can no longer hang point-down: the fist is 6 units up, so the
point would stand in the ground. It is held low and trails back at 36° behind his near leg, clear
of the shield, like the Blue Knight sheet's idle in `guards.md`. The smears, the pennons' hoists
(`FLY.at`) and the bridle-hand lance in the knight's sword blow follow the new lengths
(`SWORD_LEN`, `LANCE_FWD`, `HORSE_BOW_LEN` in `templar-static.ts`).

## Blows: each kind's are told apart by height, line and beat

| Kind | Blow 0 | Blow 1 | Blow 2 |
|---|---|---|---|
| Sergeant | **cut**: over the shoulder, a high diagonal, strike at 6-7 | **sword thrust**: laid level over the kite rim at the face, a straight lunge, strike at 5 | **bash + stab** (new): the sword drawn back low at the hip, the kite punched out with the whole weight at 3-4, then the point in under the rim at 7. Two early, low beats (was: the sword cocked overhead like the cut) |
| Spear Levy | **overhand thrust** from the ear at the face, strike at 5 (the recovery no longer swings the spear upright and back) | **underhand** (reworked): a slow chamber drawn far back at the hip with the point dipped, a deep low lunge, the point rising into the belly at 6 | **butt strike** (new, was the shove): the spear swung up and over until the point trails low behind, the butt rammed up at the face along the shaft with the shield shoved out beside it, strike at 5. The only blow whose shaft slopes the other way |
| Iron Brethren | **chop**: rise and fall from overhead | **rising stroke** (new, was a second overhead diagonal): the bit let fall forward, swung back low behind the hip with the haft level, then whipped under and up through the knee, finishing high in front | **spike thrust**: straight out along the haft |
| Turcopoles | **overarm stab** (Bayeux): the fist above the helm, the point driven steeply down at the men on foot | **underarm thrust**: drawn back under the arm, driven long and level from the hip, the trunk lunging over the neck, strike at 6 | |
| Knight-Brothers | **couch** (reworked): the tip lifts as he gathers (2-3), he drives in with the fist pushed forward and the point dropped onto the target (5), then the impact throws him back and kicks the tip up | **overarm stab** (as the Turcopoles) | **sword** (unchanged) |
| Javelin Men, Archers, Crossbows, Marshal | unchanged | | |

The kinds differ from each other too: a sword's chamber is over the shoulder; the spear's two
thrusts start at the ear or at the hip; the butt strike reverses the slope; the axe works from
overhead, low behind or straight; the riders strike overarm-down or level-under.

Invariants: every blow is wrapped by `fromGuard`, so it starts and ends on the guard's frame 0
(`guard.test.ts`). The guard (`GUARD_SWAY`) and Advance (`guardWalk`) are unchanged.

## Critique rounds

Screenshots for each round were rendered with `paintPaper` (level 4 ×1-2, level 8), on the field
green, blows in rows.

1. **Sizes.** The new lengths were checked against Fiore, Bayeux and the Met pieces.
   - The Levy's spear was already about right (2.6 m), so it got only a little longer. The
     knight's lance was short: it barely passed the horse's head at the charge, and now reaches
     well ahead of it, as on Bayeux.
   - The crossbow had been invisible on the dark gambeson. At its real size it reads as a cross
     over the belly.
   - The pennon on the knight's bridle-hand lance hung halfway down the shaft (a hard-coded
     12.5). It now sits at the tip.
2. **Blows side by side.**
   - The Sergeant's bash had raised the sword overhead in frames 3-8, exactly like the cut. It is
     now low (sword at the hip, kite out).
   - The Levy's underhand looked like his guard with a little push, and both spear thrusts swung
     the spear up toward vertical in frames 9-10. The recoveries are now level, and the underhand
     dips and rises.
   - The Brethren's diagonal and chop both rose overhead. The diagonal is now the low rising
     stroke.
   - The Turcopoles' two blows were the same level push. They are now overarm-steep and
     underarm-level.
3. **Mounted and close-up.**
   - The knight's couch hardly moved, so it gained a lift, a dip and a recoil.
   - At level 8 the Sergeant's stab under the rim shows over the shield's lower half.
   - The Levy's butt strike reaches 19 units behind him at most, inside the 23-unit canvas.

## Lint

`pixel-lint --only=sprites --arts=hd --factions=templar`: no FAIL at levels 1, 2, 4 and 8 once the
level-1 crossbow was trimmed. The closest level-1 silhouette pair is Turcopole Archers vs
Knight-Brothers at 0.84 (gate < 0.85; Sergeant vs Brethren went from 0.8456 to 0.78). The
warnings are the ones `templar-animation.md` already lists.
