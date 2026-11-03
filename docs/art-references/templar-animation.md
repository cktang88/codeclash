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
