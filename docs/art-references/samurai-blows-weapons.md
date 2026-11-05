# Samurai: weapons at true length, and blows that read apart

Date: 2026-11-05. The user: "lots of attack animations seem too similar" and "a lot of units'
weapons are too small or short". Scope: the Samurai paper figures (`samurai-parts.ts` weapon
drawings, `samurai-static.ts` lengths, `samurai-rig.ts` foot blows, `samurai-horse.ts` mounted
blows). The man is 14 units tall (~1.65 m), so 1 unit is ~12 cm.

Study copies are in the git-ignored `references/samurai-blows/`; none is committed.

## References

| Image | Source / licence | Taken from it |
|---|---|---|
| *Mōko Shūrai Ekotoba*, Takezaki Suenaga detail ([image](https://commons.wikimedia.org/wiki/Special:FilePath/Samurai_Takezaki_Suenaga_detail_M%C5%8Dko_Sh%C5%ABrai_Ekotoba.jpg?width=1400), [page](https://commons.wikimedia.org/wiki/File:Samurai_Takezaki_Suenaga_detail_M%C5%8Dko_Sh%C5%ABrai_Ekotoba.jpg)) | Public domain (13th-c. scroll, later copy) | The yumi is longer than the mounted man is tall from saddle to helmet-top by half again; gripped well below its centre, the upper limb about twice the lower. Our yumi went from 15.6 to 18.2 units (2.1 m), grip at a third. |
| *Mōko Shūrai Ekotoba*, e19 ([image](https://commons.wikimedia.org/wiki/Special:FilePath/M%C5%8Dko_Sh%C5%ABrai_Ekotoba_e19.jpg?width=1400), [page](https://commons.wikimedia.org/wiki/File:M%C5%8Dko_Sh%C5%ABrai_Ekotoba_e19.jpg)) | Public domain | Men in the boats carry naginata and spears upright: the poles stand one and a half to two men above the gunwale, the blades a small dark mark at the top. A pole weapon that ends at the helmet reads short. |
| Utagawa Yoshitsuna, *The Fourth Battle at Kawanakajima* (Met 893323, [image](https://images.metmuseum.org/CRDImages/as/web-large/DP149164.jpg)) | Public domain (Met Open Access) | Levelled spears are long thin lines two to three figures long, running far ahead of and behind the men; the ranks read as a hatching of shafts. Our nagae-yari is now 31 units (3.6 m, was 25), and the hands slide back from the point as it comes down (below). |
| Torii Kiyonaga, *Ushiwakamaru to Benkei* (LOC jpd 00574, [image](https://tile.loc.gov/storage-services/service/pnp/jpd/00500/00574r.jpg), found via [LOC search](https://www.loc.gov/pictures/search/?q=naginata)) | Public domain (LOC, no known restrictions) | Benkei's naginata: the shaft rises far above his head and the curved blade alone is a quarter of the weapon. The sōhei's blade is now 5.4 units (was 4.6) and the shaft 0.8 m longer above the hand: 19.2 units (2.3 m, was 17.2). |
| Yōshū Chikanobu, *Evacuation of the Ladies* (Met 55859, [image](https://images.metmuseum.org/CRDImages/as/web-large/DP149402.jpg)) | Public domain (Met Open Access) | Naginata carried upright reach well over the head with long curved blades; the katana at the hip is about two-fifths of the bearer's height with its hilt. Our katana blade went from 5.0 to 6.0 units (70 cm nagasa; ~0.95 m with the tsuka), the hatamoto's from 4.3 (it had been drawn as a wakizashi) to the same 6.0. |
| *Two Japanese soldiers in a kendo match* (LOC cph 3b44739, [image](https://tile.loc.gov/storage-services/service/pnp/cph/3b40000/3b44000/3b44700/3b44739r.jpg)) | Public domain (LOC) | A bayonet/spear bout: both men in a long low stance, front knee bent, the rear leg straight, the weapon held level at the belly with the rear hand at the hip. The harai-tsuki's thrust line (low, at the belly) and its deep lunge. |
| *Jap[anese] sailors fencing* (LOC ggbain 19715, [image](https://tile.loc.gov/storage-services/service/pnp/ggbain/19700/19715r.jpg)) | Public domain (LOC, Bain collection) | Kendō on deck: one man in jōdan, the sword raised forward and up, the other in chūdan; at the strike the arms reach forward at shoulder height and the trunk stays upright. Our shōmen ends with the hands at head height and the trunk upright, apart from kesa-giri's low fold. |
| Met 30843, blade for a su-yari ([image](https://images.metmuseum.org/CRDImages/aa/web-large/36.25.1867_001Aug2015.jpg)) | Public domain (Met Open Access) | A straight, narrow, double-edged head ~20 cm with a long tang: the yari head is 2.0 units, a bright line, never a leaf. |
| `weapon-attacks.md` S1, S2, S6, S9; `guards.md`; the mocap clips in `paper/motion/` (`cut-diagonal`, `cut-overhead`, `thrust`, `chop`) | our notes / CMU (see `motion-reference.md`) | The blows' phases, the lunge and the hips-first timing; each blow still rides one of the captures. |

Wikimedia Commons refused all but two downloads this round (robot policy / rate limit), so the
Nagashino screen and the 1922 kendō photograph were not re-read; the LOC and Met images stood in.

## Weapon lengths (units; 1 unit ~12 cm)

| Kind | Weapon | Before | After | Notes |
|---|---|---|---|---|
| Yari Ashigaru (1) | nagae-yari | 25.1 (8 + 15.5 + 1.6) | 31 (8 + 21 + 2.0) = 3.6 m | Upright the butt is at the ground and the point at -32 (it fits the level-1 cell, 38 up). Levelled, the hands slide up the shaft to 17.5 from the butt (`yari(..., levelButt)`, eased on the snapped angle), so 11.5 + blade runs ahead and 17.5 behind, like a pike held toward its butt; this keeps the levelled point inside the 46-unit canvas, where the old shorter spear's thrust was clipped. |
| Yari Cavalry (5) | mounted yari | 20.6 (6 + 13 + 1.6) | 24.8 (7 + 16 + 1.8) = 2.9 m | Levelled: 10.5 behind the hand. |
| Katana Samurai (0) | katana | blade 5.0 | blade 6.0 (70 cm) | Smear reach 6.0 → 7.0. |
| Hatamoto Horse (7) | katana | blade 4.3 | blade 6.0 | Smear reach 5.0 → 6.8. |
| Sōhei (8) | naginata | 17.2 (5.2 + 7.4 + 4.6 blade) | 19.2 (5.2 + 8.6 + 5.4) = 2.3 m | Smear reach 8.6 → 10.5. |
| Yumi Ashigaru (3), Yabusame (6) | yumi | 15.6 (5.2 + 10.4) | 18.2 (6.0 + 12.2) = 2.15 m | Taller than the man; grip at a third. |
| Teppō Ashigaru (4) | teppō | 8.7 (stock 1.6 + muzzle 7.1) | 10.3 (2.1 + 8.2) = 1.2 m | `TEPPO_MUZZLE` is shared by the drawing, the shot's flash/smoke events and the old pose painter. 8.8 clipped the muzzle flash at the canvas edge. |
| Nage-yari (2) | javelin | 7.0 | 8.3 (1 m) | |

## Blows (12 frames each; every blow leaves and returns to the guard's frame 0, `fromGuard`)

What tells them apart is given as *impact frame / silhouette at impact*.

- **Katana Samurai**, 3 blows (the paper rule and `blows.test.ts` cap a kind at 3):
  - *kesa-giri* (7 / blade low across the body past the far knee, trunk folded 30°) — unchanged;
  - *dō-giri* (new, blow 1, see below);
  - *tsuki* (4 / blade level at the throat, the deepest lunge: hips 1.7, front foot 2.4 forward);
  - *dō-giri* (5 / blade level at the waist after a waki-gamae wind-up laid back behind the
    hip; then it carries through and trails low behind him, nuki-dō's zanshin). The blade is
    foreshortened (scale-y on the weapon bone) as it swings round toward and away from the viewer,
    so the horizontal cut reads as horizontal. Never raised over the head.
  - *shōmen* was blow 1. It is out of the rotation: with kesa-giri it was the second overhead cut, the
    pair the user saw as the same. Its author (`SHOMEN`, retimed: a leaping fumikomi, the hit at
    5 with the hands at head height and the trunk upright) stays in `ATTACKS` to swap back in.
- **Yari Ashigaru**, 3 blows:
  - *thrust* (5 / point at chest height, a little above level): the shaft drawn back 2 units through
    the front hand in the chamber and driven 2.2 past rest, so the point travels 4 units;
  - *beat* (7 / the nagae-yari raised upright, then slammed down past level) — unchanged;
  - *harai-tsuki* (new, 6 / point low at the belly): the point swept down and across first (smear on
    3, the enemy's point knocked aside), then a long low thrust on a lunge.
- **Sōhei** (naginata), 3 blows: *sweep* (7: now a low sune-giri, the blade at the shins after the
  overhead wind-up; deeper crouch), *thrust* (5, level), *rising cut* (7, ends high in front) —
  sweep retimed, the others unchanged.
- **Teppō**: muzzle ram and butt-stroke, unchanged (longer gun).
- **Yari Cavalry**, 3 blows: *thrust* (level), *down stab* (point down at a man on foot), and new
  *tsuki-age* (5 / the rising thrust at a rider: the point dropped by the horse's shoulder, then
  driven up 40° above level as he rises in the stirrups) — the only mounted spear blow that ends up.
- **Hatamoto Horse**: cut, kiri-age, tsuki, unchanged (full-length katana).

## Critique rounds

1. **Round 1** (lengths only, level-2 extents of every frame): the new 31-unit yari, held at a fixed
   point, ran its levelled point off the canvas (and the 25-unit one already had: the old thrust
   was clipped by 56 px). The sliding grip fixes it; in NE the near hand sits 4.5 units further
   forward, so the NE thrust slides 1.0 instead of 2.2 and the NE beat's mid-swing is 12° higher.
   Shōmen ended level at chest height, like the guard and tsuki: the arms now end at head height
   (and it was later dropped for the 3-blow cap). Dō's follow-through pointed forward-up, like the guard.
2. **Round 2** (level-4 sheets vs the kendō and Kawanakajima images): the plain thrust's point
   barely travelled against a 31-unit shaft: longer slide (4 units of point travel), line raised to
   102°. Harai's beat-aside was one frame: now 2-4, down to 54°. The dō zanshin now trails the
   blade low behind (round past the body), the one katana end pose with the blade behind him.
3. **Round 3** (riders and missiles; level-1 cell): the mounted yari's thrust reached 24.5 units, 2 px
   outside the 48-px level-1 cell: levelled butt 10.5. The teppō's muzzle flash clipped at 8.8:
   8.2. The yari cavalry had two blows that both end pointing down: added tsuki-age. At level 1 the
   levelled yari's butt touched the canvas edge (the level-1 one-pixel shift for the upright shaft
   applied to the levelled one too): the shift now applies only near upright, and the levelled butt
   is 17.5.
   The longer naginata's round shaft (0.7 px wide at level 1) broke into specks when levelled for
   the thrust: at level 1 it is now one unbroken line with the blade a pale line on from it
   (as the javelin).

Contact sheets (our art only) were made with `scripts/guard-sheets.ts --factions=samurai
--level=4 --scale=2` into a scratch folder; they are not committed.

## Still short

- The naginata sweep's end pose (low, forward) is close to its gedan guard; it is told apart by its
  overhead wind-up and smear, not its last frames.
- At level 1 the katana's three blows differ mainly in the wind-up (over the head or behind the hip)
  and the hands' height; the blades are 6 px.
- The levelled yari is held near its middle third rather than near the butt: the 46-unit foot
  canvas (coordinator-owned `rig.ts BODIES`) caps the reach ahead at ~22 units.
