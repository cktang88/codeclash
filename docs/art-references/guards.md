# Guards: the combat-ready stance blows start from

Date: 2026-11-03. Scope: the guard (Anim.Brace) of every melee-capable kind in the three factions,
and every melee blow starting from and returning to it. Code: `src/client/render/paper/guard.ts`
(the blend), the faction Brace authors (`templar-clips.ts`, `templar-horse.ts`, `samurai-rig.ts`,
`samurai-horse.ts`, `undead-clips.ts`, `undead-horse.ts`, `undead-beast.ts`), `scene.ts` (who
plays it). Weapon mechanics per unit: `weapon-attacks.md`.

## Why

The user: "Shouldn't they be starting from brace position, which is way more normal in battle —
in battle they usually start from brace or some kind of combat-ready formation, poised to
attack." Before this, every blow left the relaxed rest pose (sword hanging at the side) and came
back to it, and a man between blows idled. A fencer, a kendōka or a man in a shield wall is never
at rest within reach of the enemy: he stands in a guard, and every cut and thrust leaves it and
recovers to it (`weapon-attacks.md` T1 "return to guard, shield does not drop", S1 "P4 Recovery:
sword returns to guard", T9 Zornhut).

## References

| Source | Licence | Taken from it |
|---|---|---|
| *Fencing at an agricultural school*, kendō practice photo from J. W. Robertson Scott, *The Foundations of Japan* (1922): [image](https://upload.wikimedia.org/wikipedia/commons/6/61/FENCING_AT_AN_AGRICULTURAL_SCHOOL.jpg) ([page](https://commons.wikimedia.org/wiki/File:FENCING_AT_AN_AGRICULTURAL_SCHOOL.jpg)) | Public domain (PD-Art, 1922) | Right: **chūdan** two-handed, both fists low before the belly, point at the throat, sloped up ~25°; trunk upright, knees soft. Left: **jōdan**, the sword raised over the head. The Katana Samurai keep their chūdan guard (blade forward from the belly), and every kesagiri, shōmen and tsuki now leaves it and comes back to it. |
| Fiore dei Liberi, *Fior di Battaglia* (Getty MS Ludwig XV 13, c. 1410), the sword page: [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/35034234575_5c11b49802_o.jpg) ([page](https://publicdomainreview.org/collections/italian-fighting-manual-ca-1410)) | Public domain; Getty Open Content | The striker's fist at the shoulder, the blade laid level at the opponent's face, the lead foot forward and the weight on it. The Sergeant's guard: the sword fist cocked at the shoulder, blade over the kite's rim at face height, the kite raised to the chin, the trunk 12° forward and the hips 0.1 down. |
| Fiore, the spear page (*posta di finestra destra*, *tutta porta di ferro*): [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/34994236466_ecb25262af_o.jpg) | Public domain; Getty Open Content | The spear held level in a long stance, overhand at the head (finestra) or low at the hip (porta di ferro), the point at the enemy, never upright. The Spear Levy's guard is the low one, underhand at the hip, the point rising a little at a horse's chest; the overhand thrust chambers up out of it. |
| Fiore, the mounted page: [image](https://pdr-assets.b-cdn.net/collections/the-flower-of-battle-italian-fighting-manual-ca-1410/34870299302_6bb92b7a49_o.jpg) | Public domain; Getty Open Content | Riders close with the sword already held forward and up, or the lance levelled; nobody rides into reach with the weapon at rest. The Marshal's and the Hatamoto's guard: the sword raised forward; lancers: the lance couched. |
| *Blue Knight* sprite sheet, OpenGameArt ([page](https://opengameart.org/content/knight-and-knight-animation), [image](https://opengameart.org/sites/default/files/BlueKnightSpriteSheet.png)) | CC0 | A game's own convention: every attack row begins and ends on the same sword-across-the-body pose, so swings chain; the defend row holds the sword raised over the shoulder. Our blows start and end on the Brace frame 0 exactly. |
| `weapon-attacks.md` T1-T9, S1-S8, U1-U10 | Our notes | The guard per weapon (P1 of each blow) and the recoveries "back to guard". |

Wikimedia Commons rate-limited this round (HTTP 429) after the kendō photo, so the I.33 folios and
the hassō photo were read only as search results; Fiore's Getty pages stood in for the sword-and-
buckler manuscript.

## The guards

| Faction | Kind | Guard (Brace) |
|---|---|---|
| Templar | Sergeant-Brothers | High guard behind the kite: kite to the chin, sword fist at the shoulder, blade over the rim at face height (was: blade low at the hip). |
| | Spear Levy | Spear levelled underhand at the hip, point at a horse's chest, shield forward (was: butt at the back foot, spear at 28°). |
| | Javelin Men | A javelin underarm at the hip, point out; the buckler and bundle forward (was: a plain crouch). |
| | Pilgrim Archers | The bow held out before him, the upper limb at the enemy; the free fist up (was: a plain crouch). |
| | Genoese Crossbows | The crossbow levelled at the belly like a club, far hand under the prod (the stirrup jab's chamber). |
| | Iron Brethren | The Dane axe across the body, bit by the near shoulder (unchanged, a lower crouch). |
| | Turcopoles, Knight-Brothers | Lance couched (unchanged). |
| | Turcopole Archers | The bow held out, free fist up (was: the arm hanging). |
| | Marshal | Sword raised forward (unchanged). |
| Samurai | Katana Samurai | Chūdan, deep (unchanged). |
| | Yari Ashigaru | The yari set (unchanged: a pike-wall reading). |
| | Teppō Ashigaru | The volley crouch behind the tate (unchanged: the pavise reading); the butt and stock blows swing out of the aim. |
| | Sōhei | Gedan with the naginata (unchanged). Daimyō: the fan held out (unchanged). |
| | Riders | Yari levelled, katana raised (unchanged). |
| Undead | Grave Legionaries | Shield wall, gladius forward at the hip (unchanged). |
| | Ghoul Spears | Spear levelled (unchanged). |
| | Bone-Throwers | A javelin underarm at the hip, point out (was: a plain crouch). |
| | Revenant Arbalests | Kneeling aim behind the pavise (unchanged). |
| | Lich-Marshal | The staff slanted forward in the near fist, its fire at the enemy (was: planted). |
| | Riders, Bone Colossus | Lance or sword levelled; the club raised over the heap (unchanged). |

## How the blows start from it

`fromGuard` (guard.ts) samples each blow at its 12 painted frames and moves it toward the guard's
frame 0 by `FROM_GUARD` = 1, 0.62, 0.24, 0, ... 0, 0.28, 0.66, 1 (smoothstepped): frame 0 and 11
*are* the guard, the blow's own chamber takes over by frame 3, and the recovery lands back on the
guard. Rotations blend as world angles (each bone the short way round in the figure's frame), so
an arm going from a couched lance to an overhand grip does not whirl the long way. Riders blend
only the rider's bones, so a lancer's gallop is left alone. The authored blows are unchanged.

`scene.ts` plays Brace (facing the foe) for a man in the fight whose target is within melee reach,
between blows, as well as for a regiment in a bracing stance; out of reach he idles. The showcase
Units tab calls the column **Guard** and shows it just before the blows.

## Critique rounds

1. **Wiring.** The first blend lerped local angles: the Knight-Brothers' thrust whirled the lance
   upright at frame 1 (couch → overhand: the upper arm and forearm each took their own short way).
   Rotations now blend in world terms. The rider filter matched `forearmN` as a horse leg (`^fore`),
   so riders' arms were never blended and frame 0 was not the guard; the filter is now
   `fore[FN]`/`hind[FN]`.
2. **Sergeant.** With the fist at the shoulder and the blade at 122°, the hilt sat over the helm in
   SE and read as a spike from the head; at 104° the blade hid behind the kite in SE. At 114° with
   the fist forward of the shoulder the blade shows over the rim in SE and NE.
3. **Crouch.** A 0.35-unit hip drop on top of the brace capture's own crouch read as a squat
   (Spear Levy, Javelin Men); 0.1-0.15 keeps the knees bent and the weight forward without
   sitting. The archer's bow fist was moved forward (1.2 units) so the stave leans at the enemy.
4. **Undead.** The Bone-Throwers' and Lich's guards were the plain crouch and the planted staff:
   the javelin is now underarm at the hip and the staff slanted forward, so their jabs grow out
   of them.

Contact sheets: `docs/screenshots/anim-weapons/guard/<f>-k<kind>-guard-blows.png` (level 4, ×2):
per blow an SE row and an NE row of `Idle 0 (top row only) | Guard 0 | Guard 4 ‖ Attack 0..11 ‖
Guard 0`. Before (Templar, the old rest-pose blows): `t-k0/k4/k7-guard-blows-before.png`. Made by
`pnpm tsx scripts/guard-sheets.ts`.

Lint (`pixel-lint --only=sprites --arts=hd`, all factions, levels 1-8): 0 failed checks; the
largest blow A-B-A flicker 0.19 % (threshold 0.5 %).

## Still short

- The guard is one clip per kind, so a missile kind's Brace is also its volley stance: the Teppō
  Ashigaru and the Revenant Arbalests stand in the aim between melee blows rather than holding the
  gun or crossbow as a club.
- In NE the Pilgrim Archers' bow hand is behind the body, so the bow reads as held behind him.
- The Wraith-Wardens and horse archers whose Attack is a point-blank shot are left as they were.
- A man who has just come into reach plays the guard from the next frame on: the Idle → Guard
  switch is a cut, not a blend (Walk → Guard likewise).
- Angles are by eye against the references above, not measured from video.
