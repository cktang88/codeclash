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
- battle shots, `templar-anim-battle-zoom1.png`, `-zoom5-sergeants.png` and `-zoom5-knights.png` (seed 3).

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

## Lint status (`pnpm pixel-lint --only=sprites --factions=templar`, then `kind-report`)

These pass for every kind:
- level-1 silhouette overlap under 0.85 (closest pair: Sergeant vs Iron Brethren, 0.85 rounded but under the gate);
- idle and walk boil (head churn);
- figure and outline value against the field.

These FAILs remain. They are level-specific pixel structure of the key art at levels 2–4, which the
static key art fails too:

| Kind | Remaining FAILs |
|---|---|
| 0 Sergeant | aligned L2, lightDir L4 |
| 1 Levy | aligned L4 |
| 2 Javelin Men | lightDir L2, aligned L2, hug L4 |
| 3 Archers | jaggies L2, aligned L2, lightDir L4, hug L4 |
| 4 Crossbows | aligned L2/L4, hug L8 |
| 5 Turcopoles | edgeVsGround L4 (0.095) |
| 8 Iron Brethren | lightDir L1 |
| 9 Mangonel | hug L4 |

These depend on how the shared faction palette merges colours (12 to 33 colours per level). They
move whenever another kind's colours change, so they are best fixed after the faction's palette has
settled.
