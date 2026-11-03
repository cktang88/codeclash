# Templar HD animation on bones: references, method and critique rounds

All eleven Templar kinds are rebuilt on bones from the approved key art (`paper/templar-static.ts`)
and animated from real motion:
- `templar-rig.ts`: the machinery (part maps, skinned cloth, lagged cloth bones, the mocap adapter, drops);
- `templar-foot.ts` and `templar-clips.ts`: the foot kinds;
- `templar-horse.ts`: the mounted kinds;
- `templar-engine.ts`: the Mangonel.

Contact sheets (level 8 ×2, rows are animations, columns are frames, SE above NE):
- `docs/screenshots/hd-sprites/templar-anim-k<kind>-L8.png` (kinds 0–10);
- the Sergeant's ×4 walk strip, `templar-walk-k0-x4.png`;
- battle shots, `templar-anim-battle-zoom1.png`, `-zoom5-sergeants.png` and `-zoom5-knights.png` (seed 3);
- the clean-up below: `templar-keyart-colours-before-after.png`, `templar-beauseant-ripple.png`,
  `templar-knights-battle-zoom5-before-after.png` and `templar-knights-battle-zoom1-before-after.png`.

## References studied

The motion sources and their licences are listed in `motion-reference.md`, and the key poses in its
§9 brief. The ones these animations were built and checked against:

| Source | Licence | Taken from it |
|---|---|---|
| CMU mocap 35_01 *walk* (`motion/walk.json`) | CMU terms (derived keys; credit mocap.cs.cmu.edu) | <ul><li>The foot gait and the hip bob.</li><li>The trunk turn, at half strength.</li><li>The near arm's swing for sword kinds.</li></ul> The ankles slide back at a steady ~0.9 units a frame while planted, so the feet don't slip against the ground. Its two half-strides are uneven (the subject's), so the second half is the first mirrored. |
| CMU 138_01 *marching* | CMU | Tried for the walk, then dropped: the high knee and the straight arm read as a goose-step at 100 px. |
| CMU 09_02 *run* | CMU | The flight phase and the stride. A 13° forward lean and the head level are added. |
| CMU 02_07 *swordplay* (`cut-diagonal`) | CMU | The timing and the trunk turn of the cut, at 0.4 strength. The arms are authored: the subject held a stick in both hands. |
| CMU 143_23 *punching* (`thrust`) | CMU | The rear-foot drive under the spear thrust and the jab. The chamber, the lunge step, the hold and the retract are keyed from the brief. |
| CMU 79_01 *chopping wood* (`chop`) | CMU | The rise, the drop and the knee bend under the Dane axe. |
| CMU 124_01 *pitch* (`javelin`) | CMU | The withdraw, the block and the follow-through of the javelin throw. |
| CMU 79_86 *bow* (`bow`) | CMU | The raise, draw, hold, loose and follow-through timing. The string runs to the draw hand from the `draw` event to the loose. |
| CMU 77_03 *ready stance* (`brace`) | CMU | The crouch height of every brace. |
| CMU 77_09 *duck* (`hit`) | CMU | Only the hips' drop. The snap-back of the struck shoulder and head, the half-step back and the flash are keyed, from Muybridge's "one hits the other". |
| CMU 90_18 *fall* (`die-back`) | CMU | The backward fall: the feet go out, the seat lands, then the back, with a bounce at frame 8. |
| CMU 90_16 played backwards (`die-forward`) | CMU | The forward collapse. Its first half is re-timed faster (a reversed get-up is too slow for a man losing his legs). |
| Muybridge, *A horse walking* (Plate 574), and *The Horse in Motion* (`horse-walk`, `horse-gallop`) | Public domain | <ul><li>The 4-beat walk with 2–3 hooves down.</li><li>The gathered gallop suspension.</li><li>The hoof contact flags, which plant the hooves.</li><li>The barrel pitch (amplified ×2.2 so it reads in 7.5° steps) and the neck pumping against it.</li></ul> |
| Muybridge, *Two men boxing, one falls* (`src/client/public/motion-ref/fall-back.jpg`) | Public domain (Wellcome) | Checked against the Sergeant's fall: the head snaps back, the knees buckle under an upright trunk, the seat lands, then the back, and the legs swing up before they drop. |
| Muybridge gallop strip (`motion-ref/horse-gallop.jpg`) | Public domain | The jockey stays nearly still while the horse pitches under him. Our rider's hips follow the saddle a frame late at a third of its bob, and his head holds level. |
| HEMA sources in `motion-reference.md` §3 | Study only | <ul><li>The cut is thrown by the body, hand before foot.</li><li>The spear point travels in a straight line.</li><li>Lances are couched under the arm, the point crossing the neck.</li></ul> |
| User targets `references/user-targets/templar-gstatic-1/2`, the D2R Paladin, the CraftPix knight | Study only | Unchanged from the key art. The shield stays tight to the body in every animation, and the mantle and tabard keep their weight. |
| OpenGameArt, Fokko, *Flag animation sheet*: [flag_red.png](https://opengameart.org/sites/default/files/flag_red.png) ([page](https://opengameart.org/content/flag-animation-sheet)) | CC0 (study copy in `references/flag-ripple/`, not committed) | Four frames: the hoist holds, the top and bottom edges carry the same wave, and its crests move out toward the fly. So the banner's panels bend together, and the phase lags toward the tip. |
| OpenGameArt, cptx032, *Stencil animated flag*: [flag.png](https://opengameart.org/sites/default/files/flag.png) ([page](https://opengameart.org/content/stencil-animated-flag)) | CC0 (study only) | Ten frames of a pennon drawn as a 2-3 joint polyline: a kink runs out from the pole and the tip whips widest. That is the fly bones' layout, and the tip panel gets the largest swing. |
| Matthew Paris, two brothers on one horse: [Templari_MatthewParis.jpg](https://upload.wikimedia.org/wikipedia/commons/9/98/Templari_MatthewParis.jpg) | Public domain | The Beauséant is a third sable over argent, a plain cloth on a tall staff. The rippled banner keeps that division on every panel. |
| San Bevignate battle fresco: [Commons](https://commons.wikimedia.org/wiki/File:San_Bevignate_battle_fresco_baucent.jpg) | Public domain | A white horse under a white cross-cloth, parted from it and from its neighbours by **dark contour lines**. That is the knights' dark rim and the shadowed white of the knight class. |
| Medieval II battle screenshots (`total-war-battles.md` 1-2) | (c) SEGA, study only | Cavalry blocks read by their pale horses at the strategy camera, so at zoom 1 the knights stay one pale mass; separation is for the close camera. |

## Method

- **The key art is the rest pose.** Each piece of a figure (a thigh, the helm, the shield, the horse's
  neck) rides one bone. It is drawn by the key art's own code, with its points mapped from the key art
  onto the bone (`withMap`), and re-rasterised at each snapped angle. Idle frame 0 is the key art
  (verified: the refactored key art hashes are byte-identical to the approved images at all levels).
- **Cloth over two bones is skinned:**
  - the tabard over the hips and thighs;
  - the mantle from the shoulders (over the croup when mounted);
  - the caparison over the barrel and up the neck;
  - the mane.

  Each point blends its bones by where it sits, and the shading is done back in key-art coordinates,
  so the folds and the cross ride the cloth.
- **Cloth trails.** The skirt, mantle, caparison hem and mane bones copy their leader's turn 1.5–2
  frames late, with a flutter and, at speed, a stream-back bias.
- **The mocap is the base.** The clip brings the weight, the hips, the trunk and the footwork, as
  turns over the key-art rest. The arms are authored per weapon and timed to the clip's events.
- **Planted feet.** Feet and hooves reach for targets by two-bone IK. While a contact is down, its
  target sits on the ground line, so nothing slides.
- **Drops.** In a death the shield slides off and the weapon falls, on free bones placed exactly
  where they were held at the release frame, then they land and bounce.

## Critique rounds

The Sergeant (kind 0) came first; the others followed the same pattern.
1. **Skirt and sword.** The skirt split into two lumps over the legs, so it is now one sheet blended
   across its width. The sword swung forward through the shield on the wind-up, so it now rises in
   front, then goes over the shoulder. The smear was pale and spread over two frames; it is now one
   solid arc on the fastest frame.
2. **Death and level 1.** The shield arm was flung over the head in the fall, and now folds over the
   body. At level 1 the shield was all rim and cross, so it is now its field, lit from the left.
3. **The mocap.** The march read as a goose-step, so the plain walk is used. Idle frame 0 had drifted
   from the key art, so the idle is now referenced to its first key.
4. **Coordinator review.**
   - The walk got a longer stride, a hip bob, shoulder counter-swing and the sword carried up.
   - The hit got a snap-back, a half-step and a flash.
   - In death the shield and sword fall away, with a bounce.
   - The brace crouches behind the raised shield.
   - The idle breathes visibly.
5. **Coordinator review.**
   - The sword crossed the shield, so it now rides at the hip, angled up and back.
   - The stride was uneven, so the halves are mirrored and the feet track close to the line of travel.
   - The Levy's thrust was frozen; it now has a chamber, a lunge, a hold and a retract.
6. **Mounted review.**
   - The gallop barrel now pitches and bobs, and the neck pumps against it.
   - The caparison hem, mane and tail stream back and flutter.
   - The lancers strike at the gallop: the rider leans in, the tip dips and the horse drives into the impact.
7. **Values against the field (the lint).**
   - The Levy and the archers moved into the dark class (darker dyes with the same hues).
   - The Iron Brethren, the Knights, the Marshal and the Turcopoles are light, with a black tabard dye for the Brethren.
   - Signature items are drawn larger at level 1 (bow, javelin shield, Knight's lance, horse archer's bow, axe haft), so the silhouettes part.

## Clean-up: palette, lint, colours, banner, knights

### The real cause of the "moving" lint fails

The eleven figures shared **one master palette per level** (12 to 33 colours). The reducer merges
by OKLab distance, and in OKLab the dark colours of every hue crowd together near black. So it
spent 5 of the 21 level-4 colours on team blues and 4-5 on near-whites, and folded every dark
earth material (black, wool, leather, wood, hair, and the shadows of ochre, slate and madder) onto
the same 4 browns. At levels 1-2 the levy's ochre and the pilgrims' slate were lost entirely.

The lint can only tell materials apart by colour, and it credits a shared colour to the first
material that lists it. A figure's tunic, hose, boots and belt therefore became one "region", and
the light-direction check read their albedo (light hose under a dark tunic) as light from below.
Because any kind's colours re-decided every other kind's, the fails moved whenever anything
changed.

**Fix (additive core options, opt-in per faction; Samurai and Undead hash byte-identical):**
- **One master palette per kind** (`setFactionPaletteOptions('templar', { perKind: true, ... })`):
  every figure gets the whole per-level budget from its own codes, and nothing couples kinds any more.
- **`minDist`**: near-duplicates of one family (same material, both neutral, or hues within 25°;
  within one material only when the hues are within 8°) merge even under budget. It is 0.1, 0.2,
  0.1 and 0.06 by level; two blacks 0.06 apart were breaking flat masses into stripes.
- **`keepChroma`**: a coloured tone never maps to a grey (no grey shadows on the red cross), and a
  light neutral never maps to a saturated fill (the Marshal's white had gone gilt at level 2).
- **`weightOutlines`**: dark-outline candidates are weighted by their material's pixels. The
  2-colour level-1 outline had been whichever came first (the javelin men got a navy outline).
- **`kinds[k].litDark`**: the dark outline all round, from level 2 (the knights).

### Item 1: the remaining lint fails

These fixes came out of per-pixel overlays (aligned runs, hug pixels, per-region light vectors,
true-material regions from the code buffer):
- `vol` bands stop short of the limb ends, and their terminators wander along the limb; the torso's
  terminators follow its folds. These were column banding and hugging bands.
- Skirt-fold ridges end above the hem at staggered heights.
- Level 2:
  - no 1-px lit stripes on the torso or limbs;
  - the legs are a touch fuller, so they meet instead of leaving a 1-px outline slot between them;
  - no red sliver of the sergeant's chest cross beside his kite;
  - the hood cape's shoulder is eased into the hood curve (jaggies).
- Level 1:
  - the legs are the darkest part (light from above);
  - the bow and the javelins are drawn in ink (as ash they fused with the legs);
  - no slack string.
- The bow's upper limb is lit and the lower one shaded; it had been lit from below.
- The pavise rim is one band (its inner dark line was a second outline), squared timbers are flat
  at level 4, and the white mantle's edge shade band starts at level 4.

Result: no FAIL for any kind at any level. The closest level-1 silhouette pair is Sergeant vs Iron
Brethren at 0.8456, and boil is within the gate.

### Item 3: approved colours back

The levy's ochre and the pilgrims' slate are back at the approved ramps, with the hue, base and
light tones of `c00fa8f`, and the archers wear their dark wool hose again. Value against the field
now comes from dark accents, not a darker garment:
- a broader shadow plane, where only the shade step is deepened (`shadeFrom`);
- a rawhide rim on the levy's round shield;
- dark hose on the levy;
- a dark spear haft.

Before/after against the key art is in `templar-keyart-colours-before-after.png`. Critique rounds:
1. With the dyes restored, the levy and archers averaged out to the field's value (ΔL 0.002-0.04).
2. A broader shadow plane did little, because the shield hides the levy's shaded half. The rawhide
   rim (the bright iron rim was 12 % of the figure) and dark hose carried it.
3. Against the key art, the archer matches. The levy's ochre is the approved one; it differs only in
   the dark rim, hose and haft, which the brief allowed.

### Item 2: the Beauséant ripples

The Marshal's banner (3 bones) and the Turcopoles' and Knight-Brothers' pennons (2 bones) hang on
fly bones, with the hoist on the staff or lance bone. `lagCloth` drives them:
- each bone follows the staff a frame later than the one before it;
- each carries a wave whose phase lags toward the tip, so the crest travels from hoist to fly;
- cycles are whole per clip, so the loops close.

The cloth is drawn per frame from whole-pixel joints and snapped angles. A panel turned up against
the one before it is lit, and one turned down is shaded, so the fold bands travel with the wave.
Critique rounds:
1. At first, panels were shaded by their absolute turn, so the whole fly greyed when it dropped. Now
   they are shaded against the previous panel.
2. The gallop swing was too big and the walk sagged, so the amplitudes and droop are smaller.
3. The boil gate reads the top quarter of the figure, which is the banner. So there is still air at
   rest, a slow tip-weighted wave at the walk (head churn 0.134 at most, gate 0.15), and the full
   ripple and stream-back at the gallop, which the gate does not read.

### Item 4: the white knights in a packed charge

The 'knight' value class (`TK` in templar-parts) keeps the light class's whites and lights but gives
them real shadows: shade 0.6 and a dark deep tone, which is also the outline. On top of that:
- a dark rim all round from level 2;
- a shadow half and a turned-under hem on the mantle and the caparison;
- iron-grey destriers under a shorter caparison for the Knight-Brothers, so their legs and heads show
  in a mid value with dark hooves and tack;
- the Marshal on the white grey, shadowed;
- a brighter cross, plus the Rule's cross on the mantle's left shoulder seen from behind.

Level 1 keeps the light class, and the grey horse is the pale grey there. Battle rounds (seed 3,
zoom 5):
1. The rim parted the riders, but their backs were broad flat cream panels.
2. A shadow half and hem on the mantle helped little, because the engine mirrors NE into NW and a
   formation shows mostly backs.
3. With the shoulder cross from behind, every rider carries his accent and can be counted.

At zoom 1 (the level-1 sprites) the knights stay one pale cavalry mass, which is the Medieval II read.

## Weapon-true attacks, high-arc bows and real runs (November 2026)

The user's notes: the spearmen swung instead of poking; every attack must fit its weapon; melee
units need 2-3 blows; a run is not a fast walk (armour and shields change it); archers draw high to
shoot over their own ranks, while crossbows shoot flat. The research these follow is
`weapon-attacks.md` (T1-T10: grip, key poses, timing, mistakes) and `running.md` (walk vs run,
armour §3, shield §4, spear §5, horse gaits §9). Their angles are tagged [est]; I checked them only
against the mocap already in `paper/motion/*.json` (CMU punching, run, pitch and bow; Muybridge
horse plates) and by eye on contact sheets. No new video or mocap was gathered.

### Audit (before) and what changed

| Unit | Weapon | What it did | What was wrong | Now |
|---|---|---|---|---|
| Sergeant-Brothers (0) | arming sword + kite | one diagonal cut; the shield swung out +16° and back −12° | one blow; the shield left the chest (T1 "shield drops"); run: sword forearm bent, but stride and lean as a light man's | 3 blows: cut (shield held on the chest), **sword thrust** from a hip guard along the blade with a step, **shield bash** with the blade cocked. Run: shield locked across the chest (no counter-swing), blade carried forward at shoulder height, heavy-armour stride (×0.78) and lift (×0.7) |
| Spear Levy (1) | spear + round shield | the spear popped level in one frame, the fist barely moved, then the spear **swung up through an arc** back to upright | read as a swing, not a poke (T2's first mistake); no recoil; run: spear upright and still | 3 blows: **overhand** thrust (fist by the ear, point 84°, driven 4.6 units straight along the shaft and pulled back), **underhand** thrust (from the hip, point rising 101°), **shield shove** (spear held back, shield punched out with a 1.5-unit step). Run: spear sloped forward at the port, tip lagging 2 frames; shield locked |
| Javelin Men (2) | javelins + buckler | underarm jab as an arm swing; throw released at 115° | the jab arced; release a little flat | 2 blows: **underarm jab** and **overhand stab**, both straight-line fist paths. Throw released rising ~35° (125°). Run: light runner (stride ×1.12, more flight), a javelin poised at the shoulder, bundle and buckler held to the chest |
| Pilgrim Archers (3) | longbow | drew level (bow arm 92°, stave upright) | flat shot: cannot clear the front ranks | **Draw tilted 35° up** (`bowAuthor`): bow arm straight along the arrow, the stave square to it, the nock on the arrow line at the jaw, elbow back, trunk eased back. Run: the free arm pumps (elbow ~80-90°, ±34°), bow held low; light stride |
| Genoese Crossbows (4) | crossbow + pavise | aim, loose, then the crossbow raised **point-up** while stooping | the span pose was wrong: a belt-hook span points the bow down onto its stirrup | Aim level (direct fire, 93-94°), loose with a kick back, then the bow swung **point-down to the stirrup**, the near foot steps into it, deep stoop to hook the belt claw, stand to span, bring it up. Run: crossbow at the port in both arms. One blow (butt-stroke): missile troops |
| Turcopoles (5) | spear + shield, mounted | one overarm thrust (the old foot THRUST, arcing) | arc, one blow | 2 blows at the gallop: **overarm** and **underarm** straight thrusts. Walk: **trot** |
| Turcopole Archers (6) | composite bow, mounted | drew level | flat | Draw tilted **20° up** (shooting from the flank, a shallower arc). Walk: trot. One melee blow (fist) |
| Knight-Brothers (7) | couched lance + kite | couched lance at the gallop | one blow | 3 blows at the gallop: **couched lance**, **overarm** thrust (Bayeux Tapestry style), **underarm** thrust. No sword is drawn: the key art carries none, and a new drawn weapon was out of scope. Walk: trot |
| Iron Brethren (8) | Dane axe, two hands | overhead chop | one blow; run: an ordinary run | 3 blows: **overhead chop**, **diagonal from the shoulder** (bit behind the head, down through the level and low across), **top-spike thrust** along the haft. Run: axe at the port in both fists, heavy stride |
| Mangonel crew (9) | traction engine | crew haul the ropes, the arm whips over, the sling releases | nothing against the research (T10: the arm is the silhouette, the crew read as several men) | Unchanged. It does not walk or run on the field (the crew stand at the engine) |
| Marshal (10) | sword + Beauséant, mounted | forehand cut from a stand | one blow | 3 blows: **forehand cut**, **rising backhand** from the far hip, **point** stabbed down at a man on foot. Walk: trot |

### How

- `templar-clips.ts`: `reach` (two-bone IK from a fist position, deterministic series trig) and
  `fistPath`/`on` put a thrust's fist on the shaft's own line every frame, so the point travels
  straight out and straight back; the weapon's world angle is held through the drive. `lunge`
  gives the body under a straight blow: rock back at the chamber, hips forward and the
  shield-side foot stepping in at the strike, back to rest.
- Timing for every blow: rest 0, chamber 2, coil 3, drive 4, strike 5 (`strike` event), hold 6,
  recoil 7, guard 8, settle 9-11 (about 35/15/50, as T1-T2 give). A smear only on the cuts.
- Runs keep CMU 09_02 (flight at frames 4-5 and 10-11, hips lowest mid-stance and highest in
  flight, the reverse of the walk) and lay per-carry arms over it (`runArms`). Heavy armour: a
  shorter stride and less lift, 10° lean; light men: a longer stride, more flight, 14°.
- `templar-horse.ts`: rider blows (`rides`), the trot built from Muybridge's walk with both
  forelegs delayed a quarter stride (each fore then moves with the opposite hind), a two-per-stride
  barrel bob and a still head. The gallop was already Muybridge's transverse order (trailing hind,
  lead hind, trailing fore, lead fore, then the gathered suspension), and stays.

### Critique rounds

1. **Spear levy.** The overhand and underhand thrusts read as pokes at once. The shield shove
   moved the shield about a unit, so it went up to +62° (upper arm) with a 1.5-unit lunge. In NE
   that lifted the shield over the head, so the forearm was brought back to +36°: it now drives
   forward rather than up.
2. **Sergeant.** The thrust's chamber put the elbow straight back at shoulder height (a chicken
   wing), with the fist behind the shoulder. The guard moved to the hip (fist 0.15 forward,
   2.35 down from the shoulder, elbow down at the side). The cut's smear was a large white
   crescent, so it was thinned to the outer blade (radii 3.6-5.8).
3. **Lint and the rest.** The full lint showed one new HD FAIL: Pilgrim Archers L2 lightDir 175°,
   although the archer's pixels were byte-identical. The lint credits a colour to the first kind
   and material that paints it. The Sergeant's palette changed with his new blows, so the archers'
   light fletching colour was now credited to their own steel ramp, which the reducer shares with
   the slate cloak. The fletchings are drawn a tone lower at L1-2, and the check is back to its
   baseline warning. The blows left unchanged (punch, butt, chop, cut) keep their old key
   sampling, so their frames are as before.

Contact sheets (ours): `docs/screenshots/anim-weapons/templar/`:
- `k<kind>-blows-L8.png` or `-L4x2.png`: every blow; rows are blow 0, 1, 2 in SE, then NE.
- `k<kind>-walk-run-L4x2.png` for the foot kinds and `k<kind>-trot-gallop-L4x2.png` for the mounted
  kinds: walk SE and NE, then run SE and NE.
- `k2/k3/k4/k6-shoot-L8.png`: the javelin throw, the high bow, the crossbow aim-loose-span and the
  horse bow.

What was still short after this round (all five fixed in the polish round below):
- The angles are the research's estimates, checked by eye, not against video (still true).
- In SE the Sergeant's sword thrust was partly hidden behind his own kite until the strike.
- The Marshal's point was short in SE.
- The trot had no suspension: it was a jog trot, since the walk plate's stances are long.
- The knights carried no sword, so there was no sword blow for them.
- Archers, crossbows and horse archers kept one melee blow each.

## Polish round: the blade over the shield, the knights' sword, second blows, the trot (November 2026)

### References added

| Source | Licence | Taken from it |
|---|---|---|
| Met 468633, *Aquamanile in the form of a mounted knight*, c. 1250: [image](https://images.metmuseum.org/CRDImages/md/web-large/DP122618.jpg) ([page](https://www.metmuseum.org/art/collection/search/468633)) | Public domain (Met Open Access); study copy in `references/knight-sword/` | A great-helmed knight with the sword belt low on the hips and the scabbard hanging steeply at his left hip beside the saddle, not slung back along the horse. So the Knight-Brothers' scabbard hangs from the far hip, steep, past the saddle. |
| Met 461052, *Aquamanile in the form of a knight on horseback*, c. 1350: [image](https://images.metmuseum.org/CRDImages/rl/web-large/DP123982.jpg) ([page](https://www.metmuseum.org/art/collection/search/461052)) | Public domain | The sword arm raised high above the helm, the blade (broken off) held up behind the head: the wind-up of the mounted forehand cut. Frame 4 of the sword blow. |
| Met 32832, *Initial A with the Battle of the Maccabees*, c. 1360-70: [image](https://images.metmuseum.org/CRDImages/md/web-large/DP164982.jpg) ([page](https://www.metmuseum.org/art/collection/search/32832)) | Public domain | Mounted men-at-arms cutting with arming swords: the blade held up and back at about 45 degrees over the shoulder, then falling on the diagonal; the shield kept on the bridle arm. The cut's arc and the shield staying put. |
| Met 23367, *Sword*, c. 1400: [image](https://images.metmuseum.org/CRDImages/aa/web-large/DT759.jpg) ([page](https://www.metmuseum.org/art/collection/search/23367)) | Public domain | The cruciform hilt: a straight cross a little curved, a leather grip, a wheel pommel, the blade about 4.5 grips long. The sheathed hilt's three parts at level 8. |
| Met 27619, *Sword pommel with the arms of Pierre de Dreux*, c. 1240-50: [image](https://images.metmuseum.org/CRDImages/aa/web-large/DP255030.jpg) ([page](https://www.metmuseum.org/art/collection/search/27619)) | Public domain | The disc (wheel) pommel of the Templars' own century, drawn as a round steel blob. |
| Muybridge, *Abe Edgington trotting* and *Occident* (1878) | Public domain (known plates; not downloaded this round) | The trot's diagonal pairs and the brief moment with all four hooves off between them. Our walk plate cannot give it, so the trot is authored. |
| `weapon-attacks.md` T1 (the shield stays on the chest, the thrust over the rim), T4-T5 and T7 (missile men's last resorts), T8 P4 (the sword after the lance) | Our notes | The blows' choice and timing. |

Searches on Wikimedia Commons for the Maciejowski Bible's mounted cuts were rate-limited (HTTP 429)
this round, so the Met's open-access objects stood in for the manuscript.

### What changed

| Unit | Before | Now |
|---|---|---|
| Sergeant-Brothers (0), blow 1 | The thrust's guard at the hip: in SE the blade ran behind the kite until the strike | **Over the rim**: the fist at the shoulder, elbow down, the blade laid level across the shield's top edge (frames 2-8) and driven straight out 3.8 units along its line; the shield eased down and in (-14 degrees at the strike). The blade reads in SE and NE in every frame. |
| Marshal (10), blow 2 | The point at a man on foot drove 4.0 units from the ear and ended over the white neck in SE | The fist chambers higher and drives **5.6 units**; the rider leans out 34 degrees and rises in the stirrups (hips up and forward 0.9); in SE the blade drops at 50 degrees (62 in NE) so the point ends past the neck's line. |
| Knight-Brothers (7) | No sword; blows couch, overarm, underarm | Key art: an **arming sword sheathed at the far hip** (scabbard steep past the saddle, chape below the thigh, hilt under the shield). Blow 2 is now the **sword**: the lance lifted upright and handed to the bridle hand (1-2), the sword drawn from the hip (2-3) into a high wind-up (4), a forehand cut with a smear (5-7), follow-through low (8), sheathed (9), the lance taken back (10). Slots swap `weapon`/`sword`, `farItem`/`farLance` and `hip`/`hipEmpty` from frame 2 to 9, and the pennon's fly bones are hidden while the lance is in the far hand (its pennon is drawn on the lance there). Every swing begins and ends with the lance carried, so blows chain in any order. |
| Pilgrim Archers (3) | One blow (fist) | + **bow-stave jab**: the bow turned so its upper limb points at the face, rammed out 3.6 units along the stave with a step, pulled back and stood upright. |
| Genoese Crossbows (4) | One blow (butt-stroke) | + **stirrup-end jab**: the crossbow levelled at the belly and rammed out along the stock so the iron stirrup strikes, the far hand forward under the prod. |
| Turcopole Archers (6) | One blow (fist) | + **stave jab from the saddle**, driven down at 72 degrees at a man by the horse's shoulder, the rider leaning out. |
| All Templar horses, walk | A jog trot re-timed from the walk plate, no suspension | An **authored working trot**: diagonal pairs (near fore + far hind, far fore + near hind) each planted 5 of 12 frames, the hoof sliding straight back while down; picked up already lifted and swung forward, the fore knee higher than the hock; **all four hooves off at frames 5 and 11** (2-3 px clear at level 4); the barrel lowest mid-stance, highest in the suspension, a 1.6-degree pitch. |

### Critique rounds

1. **Sergeant.** Moving the guard to the shoulder with the elbow raised (overhand) put the blade
   over the shield in SE but stuck the elbow up in a hump in NE at the strike; with the elbow down
   and the fist forward of the shoulder the arm straightens along the blade in both views.
2. **Marshal.** Lengthening the drive alone left the blade over the white neck in SE (steel on
   white): the reach is bounded by the arm, so the extra comes from the lean and the stirrups, and
   SE drops steeper so the point leaves the neck's silhouette.
3. **Knights.** The first scabbard ran back along the saddle at the lance's own angle and read as
   part of the lance; it now hangs steeply. The first stave jab for the horse archer was the foot
   jab, level: from the saddle it now points down at a man on foot. The crossbow's far hand rose
   to the shoulder (looked like a raised fist); it now stays low under the prod.
4. **Trot.** The first pass lifted only 0-1 px at the switch frames (the swing began on the
   ground); the swing now starts already lifted (sin from 0.24 to 0.86 of a half turn), so both
   switch frames clear the ground.

Contact sheets, before and after, every frame, SE above NE, level 4 x2:
`docs/screenshots/anim-weapons/polish/t-k0-sergeant-blows-*.png`, `t-k10-marshal-blows-*`,
`t-k7-knights-blows-*`, `t-k3-archers-blows-*`, `t-k4-crossbows-blows-*`,
`t-k6-horse-archers-blows-*`, `t-k7-knights-trot-*` and `t-k5-turcopoles-trot-*`.

Still short:
- The horse archers' bow is dark on the bay horse in SE, so the stave jab reads mostly in NE.
- The stave jab's lower limb shows behind the archer in NE (a bow held at the grip has two limbs).
- The sergeant's thrust now passes in front of the face in SE at the chamber (frames 2-3).
- The knights' sheathed hilt is hidden by the kite in SE and the scabbard by the leg in NE; the
  sword is seen mostly in the blow.
- The trot is authored, not measured: no trot plate is in `motion/`.

## Performance

`pnpm tsx scripts/sprite-bench.ts templar 8 0,7`: a whole level-8 sheet takes 3.3 s for the
Sergeant and 3.7 s for the Knight-Brothers on the 4-core container, against 1.5–1.7 s for the
undead pose-rig figures. Rigid parts are cached per angle by the skeleton. Skinned cloth is memoised
per its bones' angles and pixel offsets (`memoSkin`), which halved the mounted kinds.

## Not done yet

- The far legs of the riders are hidden by the horse in every pose, so they are not drawn.
- The banner hangs still at rest (the boil gate reads the top quarter of the figure).
- The engine mirrors SE/NE into SW/NW, so a mirrored figure's shading reads as lit from the upper right.

## Lint status (`pnpm pixel-lint --only=sprites --factions=templar`, then `kind-report`)

There is no FAIL for any kind at any level (`kind-report` exits 0 for kinds 0-10). The level-1
silhouette overlap is under 0.85 everywhere (closest pair: Sergeant vs Iron Brethren, 0.8456). The
boil, flicker and value checks all pass.

Warnings that remain (counted over the 44 kind-level reports), as a to-do list:
- aligned band ends 0.2-0.3 (28);
- base band share under 35 % (23);
- figure-vs-ground ΔL 0.06-0.12 (15) and outline-vs-ground ΔL 0.1-0.15 (11), mostly the dark foot
  kinds and the light horsemen;
- light angle 45-90° (14), several at exactly 90° (all regions single-coloured);
- walk head churn 0.08-0.15 (10), the moving cloth and lances;
- outline continuity, jaggies and sel-out ΔL (6-10 each), and hugging 0.6-0.8 (6).
