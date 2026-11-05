# Undead weapons to scale, and blows that differ

Date: 2026-11-05. Scope: the Hollow Host's weapons measured against the figure, and the melee
blows of every hand-to-hand kind made distinct in silhouette and in beat. Code:
`src/client/render/paper/undead-static.ts` (weapon sizes, `scutum`, `gladius`),
`undead-blows.ts` (the blows), `undead-bones.ts` (which blows each kind has, `shieldLive`),
`undead-parts.ts` (`lance`), `undead.ts` (`COLOSSUS_CLUB`). Earlier notes: `undead-animation.md`
("Weapons and runs"), `weapon-attacks.md` U1-U9, `guards.md`.

## The user

"Lots of attack animations seem too similar" and "a lot of units' weapons are too small or short".

## References

| Source | Licence | Taken from it |
|---|---|---|
| Trajan's Column cast, battle scene: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Traj_col_battle_1.jpg?width=900) ([page](https://commons.wikimedia.org/wiki/File:Traj_col_battle_1.jpg)) | see the Commons page; study only, not committed | The soldier's shield held upright before him, chin to knee, the sword fist low at the hip beside its edge, the blade short and broad, point out: the thrust comes from behind the shield's edge at the belly, it does not swing. The shield stays upright whatever the arm does. |
| Trajan's Column cast, legionaries: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Traj_col_battle_3.jpg?width=900) ([page](https://commons.wikimedia.org/wiki/File:Traj_col_battle_3.jpg)) | see the Commons page; study only | The fist raised high by the head with the weapon held overhand, the other fist clenched forward at the waist: the overhand blow's chamber, the elbow up and out. |
| Albion "Trajan" gladius replica: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Albion_Trajan_Roman_Gladius_1_(6092245739).jpg?width=900) ([page](https://commons.wikimedia.org/wiki/File:Albion_Trajan_Roman_Gladius_1_(6092245739).jpg)) | see the Commons page (Flickr upload); study only | Proportions: a parallel-edged blade with a short triangular point, the hilt (round guard, ribbed grip, ball pommel) about a third of the blade; ~50 cm blade, ~70 cm in all. Our gladius: blade 4.0 units, guard to pommel 1.45, broad (1 unit) so it reads at level 2. |
| Bayeux Tapestry, scene 51: [image](https://commons.wikimedia.org/wiki/Special:FilePath/Bayeux_Tapestry_scene51_Battle_of_Hastings_Norman_knights_and_archers.jpg?width=900) ([page](https://commons.wikimedia.org/wiki/File:Bayeux_Tapestry_scene51_Battle_of_Hastings_Norman_knights_and_archers.jpg)) | Public domain | Riders' lances and spears are long, one and a half times a mounted man's height and more, reaching well past the horse's head when levelled; they are carried overhand and raised to strike down as well as couched. Our Black Riders' spear went from 1.5 m to 2.5 m and gained a beat swung down past the horse's head; the Death Knights' lance from 1.7 m to 3.6 m. |
| *Skeleton* by Jesse M., OpenGameArt: [sheet](https://opengameart.org/sites/default/files/skeleton_attack_sheet.png) ([page](https://opengameart.org/content/skeleton-4)) | CC0 | A skeleton spearman's attack strip: the spear (longer than the skeleton) drawn back low, then swung round in a big arc with a solid smear, then driven out level, then raised. The ghoul's third blow is that sweep: the shaft turns, where the lunge and the overhead stab keep it on a line. |
| *16-bit skeleton*, OpenGameArt: [strip](https://opengameart.org/sites/default/files/skeleton_17.png) ([page](https://opengameart.org/content/16-bit-skeleton)) | CC0 | The undead beat: the arm comes out in one-pixel steps and stops, held stiff at full reach for several frames, then withdraws: no ease, a dead stop. Our chambers hold for a frame or three (the overhand stab holds three) and the strikes jerk out (`holdAt` warps). |
| Fiore, *Fior di Battaglia*, the spear page (in `guards.md`) | Public domain | Posta di finestra: the spear held overhand at the head, point down at the face. The ghoul's overhead stab now raises the shaft over the skull. |
| `weapon-attacks.md` U1, U2, U6, U8, U9 | Our notes | The scutum punch before the stab (U1), the uneven lunge (U2), the lance and sword phase (U6, U8), the colossus's slam and sweep (U9). |

Wikimedia's API rate-limited this round (HTTP 429), so a museum scutum photo (Dura-Europos) could
not be fetched; its size (about 1.0 m by 0.8 m flat, curved round the body) is from the Yale
museum's description as known, and the column's shields stand in for its look.

## Weapons: measured before and after

A man stands 14 units (1.75 m), so a unit is about 12.5 cm. Lengths are from the drawing calls
(units from the fist forward / behind).

| Kind | Weapon | Before | After | Real |
|---|---|---|---|---|
| Grave Legionaries | sword | thin arming blade 7.4 + 1.7 hilt = 9.1 (1.1 m), 0.8 → 0.3 wide | gladius: blade 4.0 + hilt 1.45 = 5.45 (68 cm), 1.0 wide, short point | 60-70 cm |
| | shield | kite 6.9 × 4.3 | scutum 8.4 × 4.6 (chin to knee), umbo, spina, held upright as the arm moves | ~1.05 × 0.65 m as seen |
| Ghoul Spears | spear | 9.5 / 5.6 = 15.1 (1.9 m), blade 2.0 | 13.5 / 7.5 = 21 (2.6 m), blade 2.3 | 2.5-3 m |
| Bone-Throwers | javelin | 6.4 (80 cm), carried at 100° | 10.5 (1.3 m), 30% behind the fist, carried level at the shoulder (90°) | 1.2-1.5 m |
| Revenant Arbalests | crossbow | scale 1.45: stock 5.4, prod 4.6 | scale 1.7: stock 6.3 (80 cm), prod 5.4 (70 cm); 1.45 kept at level 1 | stock 80-90 cm |
| Black Riders | spear | 8.2 (11 at level 1) / 3.6 = 11.8 (1.5 m) | 15 / 5 = 20 (2.5 m) | 2.5-3 m |
| Death Knights | lance | 10.5 (14 at level 1) / 3.0 = 13.5 (1.7 m) | 23 (19 at level 1) / 5.5 = 28.5 (3.6 m), a longer point | 3.5-4 m |
| | war sword (sword blows) | 6.8 (7.6 at level 1) | 8.2 (8.6 at level 1), about 1 m | 0.9-1.1 m |
| Bone Colossus | femur club | 8.5, 0.85 wide | 10.5, 1.05 wide | (a giant's) |

The crossbow stops at 1.7: at 1.85 the faction's colour budget pulled the arbalest's brown
gambeson into the team blue. The lance is 19 forward at level 1 so the couched point stays in
the 48-pixel grid cell (measured: right edge 23 of 23). The Wraith-Wardens' and horse archers'
bows were already man-high and saddle-sized, and were left alone.

## Blows

| Kind | Blow 0 | Blow 1 | Blow 2 |
|---|---|---|---|
| Grave Legionaries | **Thrust** from behind the scutum: fist back to the hip, a dead stop (2-3), the gladius driven out level at the belly past the shield's edge with a step (strike 4), the shield still. | **Umbo punch**: the shield drawn in and the weight rocked back, the skull snapping back (1-3); the whole body thrown behind the boss, a two-unit step, the shield at arm's length (strike 5), held with a shudder; the blade kept cocked. | **Overhand stab** over the rim: the fist heaved above the shoulder, point down at the face, held three frames (2-4); driven down over the shield's top at the neck (strike 6). |
| Ghoul Spears | **Rising lunge** (kept, longer chamber): drawn back with a twitch, driven up at the belly with a long step (strike 5). | **Overhead stab**: the shaft heaved over the skull (posta di finestra), driven down along its line (strike 6). | **Two-handed sweep** (new): the spear swung up until it stands over the ghoul, a dead stop, then round and down in one arc with a smear onto a man's head (strike 6), dragged low. |
| Black Riders | Overhand stab down at a man on foot (kept). | Couched level thrust (kept). | **Beat** (new, was a third thrust): the spear swung up over the rider and brought down past the horse's head with a smear (strike 6). |
| Death Knights | Couched lance (kept). | Overhead cut with the apex pause (kept). | **Thrust** over the shield's rim along the horse's neck (new, was a second big cut arc): the blade keeps its angle and travels on its line (strike 6). |
| Bone Colossus | Slam, sweep, stomp (kept; the longer, thicker club makes each read). | | |

Across kinds the beats differ too: the legionary's thrust lands on 4, the ghoul's lunge on 5, the
sweeps and overhand blows on 6; the legionary's overhand and the ghoul's sweep hold their chamber
(the dead stop from the 16-bit skeleton strip) where the thrusts snap.

Every blow still starts and ends on the guard's frame 0 (`fromGuard`, `paper/guard.test.ts`); the
legionary's guard now holds the gladius level at the hip (weapon 100°, was 112° raised over the
rim, which read wrong with a short blade). The scutum is drawn turned back by 85% of the forearm's
turn from rest (`shieldLive`), so it stays upright through the guard, the punch, the run and the
block instead of tipping with the arm.

## Critique rounds

1. **Sizes.** Before: the legionary's sword read as a needle, the knight's lance did not reach the
   horse's head, the riders' and ghouls' spears were shorter than a man. After: the ghoul's spear
   is about twice the hunched ghoul, the lance reaches far past the horse's head as on the
   tapestry. The scutum at first tipped flat with the forearm (the bone angle wraps at 360°, so
   the turn from rest has to be wrapped); now upright. The crossbow at 1.85 recoloured the
   gambeson (budget), so 1.7.
2. **Silhouettes.** The legionary's thrust and old low stab were the same picture; now the three
   are a blade at the belly, a shield a stride out, a fist above the head. At level 2 the thrust's
   blade was lost against the blue shield because the shield went forward with it; the shield now
   holds still and the blade reaches 3.8 out. The Death Knight's new thrust first ran behind his
   kite shield (the near arm is short in the saddle); it now runs over the rim, near level, along
   the horse's neck. The ghoul's and riders' sweep smears were too broad and hid the shaft; they are
   now a band at the point only (10-13.5 and 11.5-15 units).
3. **Against the references.** The thrust behind the upright shield matches the column's soldier;
   the overhand chamber matches the raised fist of scene 3; the ghoul sweep matches the OGA
   skeleton's arc. Held chambers match the 16-bit skeleton's stops.

4. **Lint.** The first full run (`pixel-lint --only=sprites --factions=undead --arts=hd,hd64`)
   had six new HD fails, each traced and fixed without giving back the sizes: the scutum's
   resting tilt of -4° (snapped to -7.5°) gave its long edges uneven steps (jaggies 2.09 at level
   2, aligned ends 0.43 at level 1): it now rests upright; the ghoul's team rag, at level 2 merged
   with the body's (already team-blue) ramp, pulled the light vector to the right (148°): the rag
   is left off at level 2; the longer javelin carried at 100° banded with the forearm (0.33): it is
   carried level (90°); the bigger crossbow banded at level 1 (0.31): the old size there; the
   thicker lance shaft stepped (jaggies 1.50 at level 4): the old width with the new length.

Contact sheets (not committed): `scratch-undead/r1`, `r2`, `r3`, `final` in the worktree.

## Lint status

`pixel-lint --only=sprites --factions=undead --arts=hd,hd64`: 0 HD fails for every undead kind
at levels 1, 2, 4 and 8 (before this change: 0). HD 64: 13 failed checks, all of kinds and checks
that failed before (aligned ends 5, was 6; colours 6, as before; idle head boil 1, was 2; idle
silhouette change 1, as before). Level-1 silhouettes all under 0.85 (closest pair 0.82).

## Still short

- At level 2 the ghoul's body and the Death Knight's hindquarters take the team blue in the
  faction's colour budget (as before this change); the ghoul's rag is left off there.
- The Death Knight's scabbard is still drawn for the old, shorter sword.
- The NE views of the punch show the shield mostly behind the body (the far arm), as before.
