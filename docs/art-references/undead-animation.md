# Undead HD animation on bones: references, method and critique rounds

All eleven Hollow Host kinds are rebuilt on bones from the approved key art
(`paper/undead-static.ts`) and animated from real motion, with the dead's own way of moving laid
over it:
- `undead-rig.ts`: the machinery that carries key-art drawing calls onto bones (`mapped`);
- `undead-foot.ts`, `undead-clips.ts`: the foot kinds and their clips (Legionary, Ghoul Spears,
  Bone-Throwers, Wraith-Wardens, Revenant Arbalests, Lich-Marshal);
- `undead-horse.ts`: the mounted kinds (Black Riders, Barrow Horse Archers, Death Knights);
- `undead-beast.ts`: the Bone Colossus and the Corpse Trebuchet;
- `undead-bones.ts`: each kind's spec (its blow, brace, death and what falls away).

Contact sheets (level 8 ×2, rows are animations Idle, Walk, Run, Attack, Shoot, Hit, Die, Dead,
Brace; SE block above NE; the faint line in each cell is the ground):
- `docs/screenshots/hd-sprites/undead-anim-k<kind>-L8.png` (kinds 0–10);
- the ×4 walk strips `undead-walk-k0-x4.png` (Legionary) and `undead-walk-k8-x4.png` (Colossus);
- battle shots (seed 3, zoom 5): `undead-anim-battle-zoom5-foot.png`, `-zoom5-throwers.png`.

## References studied

The motion sources and their licences are in `motion-reference.md` (§0, §7) and the key poses in
its §9 brief; the Templar worked example is `templar-animation.md`. What these animations took:

| Source | Licence | Taken from it |
|---|---|---|
| CMU mocap 08_01 *walk*, 09_02 *run*, 137_28 *idle*, 77_03 *ready stance*, 02_07 *cut*, 143_23 *thrust*, 79_01 *chop*, 124_01 *javelin*, 77_09 *flinch*, 90_18 *fall back*, 90_16 (reversed) *fall forward* (`paper/motion/*.json`) | CMU terms (derived keys; credit mocap.cs.cmu.edu) | <ul><li>The weight, hips and planted footwork of every gait, blow and fall.</li><li>The walk's halves mirrored for an even stride (`mirror`), the hip bob and the shoulders against the hips.</li><li>The cut's timing, the chop's rise and drop (the Colossus' smash), the javelin's withdraw/block/release (the Bone-Throwers' hurl), the punch's rear-foot drive (the ghoul's lunge, the Arbalest's butt-stroke).</li></ul> |
| Muybridge, *The Horse in Motion* and Plate 574 (`horse-gallop`, `horse-walk`) | Public domain | The hoof contact flags that plant the skeletal horse's hooves by IK, the barrel's pitch (×2.2 in the gallop) and bob, the neck pumping against it. |
| Muybridge, *Two men boxing, one falls* (`motion-ref/fall-back.jpg`) | Public domain (Wellcome) | The fall's order (knees, seat, back, the legs swinging up), kept for the first eight frames of each death before it comes apart. |
| Harryhausen's skeleton fight, *Jason and the Argonauts* (1963), stills and the article [How Ray Harryhausen conjured the skeletons](https://animationobsessive.substack.com/p/how-ray-harryhausen-conjured-the) (GIF `substack-post-media.s3.amazonaws.com/public/images/01aa1018-…550x329.gif`) | Study only (film stills) | <ul><li>Stop-motion timing: a model held for a frame and moved on, "theatrical, not realistic"; it reads as uncanny precisely because the timing is uneven.</li><li>So: `jerk` holds the trunk, arms and skull on a pose for one or two frames once per cycle while the legs keep their rhythm and the rags keep swinging.</li></ul> |
| OpenGameArt [zombie animations](https://opengameart.org/content/zombie-animations) (`zombie_2.gif`, 10-frame walk) | CC-BY 3.0, study only (not committed) | A short-lifted, stiff-kneed shuffle with the toe dragging and the head forward: the undead walk lifts the swing foot at 40% of a man's and hangs its toe (`stiffen`). |
| 2D animation course on the zombie walk (lynda, *Animate Monsters & Aliens*) and a mocap vendor's note on zombie mocap (mocaponline.com) | Study only | "A big move, a slight move, then a drag"; the forward lean is the convention audiences read as undead: the posture adds a hunch to every gait and stance. |
| Total War: Necrofex Colossus, Varghulf, Hexwraiths, Black Knights (barded lance), Skeleton Horsemen Archers, Mortis Engine, Screaming Skull Catapult (`references/undead/`) | Study only | The Colossus' mass and club, the skeletal horses' ribs and bard, the barded charge with the couched lance, the engine's crew. |
| Dürer, *The Four Horsemen* and *Knight, Death and the Devil* (The Met, open access) | Public domain | Death's starved horse: the broken, stumbling gait the gallop's holds aim at. |
| Darkest Dungeon Bone Soldier/Captain/Rabble, LPC skeleton walk (`references/undead/`) | Study only (LPC: CC-BY-SA) | The weight of a skeleton with a heavy weapon; the LPC walk's stiff, short swing. |
| User targets `references/user-targets/armored-undead-x3.png`, `undead-unit-gstatic.jpg` | Study only | Unchanged from the key art: the Legionary's plate and long blade carried low, the warden's hood, mask and cloak. The walk carries the blade low in front as the target holds it. |

## Method

- **The key art is the rest pose, pixel for pixel.** Each kind's key-art function is split into
  pieces (a thigh, the bascinet's bowl, the shield, the skull and its jaw) that make exactly the
  key art's calls from the figure's joints; the static drawing is the pieces in order, and its
  hashes at level 8 are unchanged by the split (checked for every kind).
- **Pieces ride bones through `mapped`.** Every polygon a piece fills is carried from the rest
  pose to where its bone is now and re-rasterised there; each pixel is shaded by asking the key
  art what it painted at the matching rest pixel. So idle is the key art, a whole-pixel move is
  the same pixels moved (no boil), and a turned part keeps its texture, rivets and painted skull.
  Cloth is drawn on its parent's map with the swing of a trailing cloth bone.
- **Back views.** Limbs are drawn from the NE rest joints (sides swapped about the body's axis,
  arms moved with their shoulder), toes and blades still forward; the back details are the
  pieces' `back` branches (the back of the skull, the shield's boards and straps, the pavise's
  painted face, the hood's seam).
- **The mocap is the base**, the arms are authored per weapon and timed to the clip's events
  (templar-rig.ts `mocapKeys`, `overlayKeys`), and the undead is laid over it:
  - a hunch and the skull held at an odd tilt;
  - stiff knees: the swing foot lifts 40% as far and its toe hangs (`stiffen`);
  - stop-motion holds (`jerk`): the upper body freezes for one or two frames and jerks on;
  - the jaw on its own bone, hanging open and gaping on the blow;
  - rotted cloth trailing two frames late and heavy (`lagCloth`), at speed streaming back.
- **Deaths come apart.** The capture's fall for the first frames (the trunk laid flat and the legs
  along the ground from the landing, so nothing reads as sinking); then, over the last four
  frames, the ribcage collapses under the armour (the chest squashed down its length) and the
  pieces fall away on free bones (`addDrops`): the weapon and shield first, then the helm, the
  skull, the jaw and the arm bones roll free of the heap. `groundClamp` lifts the body wherever a
  joint would go below the ground line. The wraiths and the Lich dissolve instead: the robe sinks
  empty, the mask drops and a green wisp rises.
- **Parametric figures on bones.** The skeletal horse, the Colossus and the Trebuchet are drawn
  by their key art's parametric code; their bones are posed (IK-planted hooves and feet, holds,
  trailing cloth) and the drawing is made each frame from the angles they have.

## Per kind

| Kind | Walk / Run | Attack / Shoot | Hit, Die, Brace |
|---|---|---|---|
| 0 Grave Legionary | Stiff plod, blade low in front, one 2-frame hold a stride | Heavy diagonal cut, wind-up held, jaw gapes on the strike, impact held | Snap-back + half-step + flash; falls back, heap; shield wall |
| 1 Ghoul Spears | Hunched shuffle (hunched spine bones) | Hunched two-handed lunge: chamber, drive, hold, retract | Falls on its face, comes apart; spear set |
| 2 Bone-Throwers | Plod, cape trailing | Overarm stab / overarm hurl with release and a new javelin from the quiver | Falls back, the quiver and hood roll free |
| 3 Wraith-Wardens | Glide (feet slide under the hem); run leans hard, cloak streaming | Slow draw past the jaw, held, string snap, hand flick, re-nock | Dissolve to an empty robe, mask and bow, wisp rising |
| 4 Revenant Arbalests | Plod, pavise on the back | Butt-stroke / shot and crank-spanning reload (cranequin) | Pavise falls off; aims from a crouch |
| 5 Black Riders | Muybridge walk; broken-rhythm gallop | Spear driven down at the charge, rider leaning in | Horse goes down, rider comes apart |
| 6 Barrow Horse Archers | as above | Bow from the saddle | as above |
| 7 Death Knights | as above | Couched-lance heavy charge, driven back at the impact | as above |
| 8 Bone Colossus | Lumbering IK gait, heavy drops | Femur smash, impact held three frames, dust | Sags, kneels, falls into a bone mound |
| 9 Corpse Trebuchet | Hauled, crew leaning, frame rocking | Crew haul, beam whip, green-burning shot in flight, winch and reload | Racks and topples to a wreck |
| 10 Lich-Marshal | Floats and glides | Spell cast: the witch-hand over the crown, then thrust, witchfire streaming | Dissolve; staff stance |

## Critique rounds

1. **Legionary, first pass.** The death floated: the clamp was lifting the body because the legs
   and the near arm hung toward the camera (the capture's depth projected below the hips); they
   now lie flat from the landing. The hit swung the blade through the ground; it is held up.
2. **Lint, idle and walk.** A skull twitch in the idle and a blade swinging overhead in the walk
   churned the head zone (8-22%); the skull holds still in the idle, the blade is carried low.
3. **Coordinator review (Legionary).** The blade stuck out behind like a pole: carried low in
   front, tip down. Undead character wasn't visible: stiffer knee, dragging toe, one 2-frame hold
   a stride, a stronger tilt, the jaw dropping open on the strike. The death fell intact: it now
   collapses and scatters (ribcage, skull, jaw, both arms, a shin) over the last four frames.
4. **Ghoul.** From behind, the far arm reaching across to the haft stuck out of the back; it is
   hidden in the back view (the body covers it). The lunge's chamber was too small to read.
5. **Coordinator review (Wraith-Wardens).** The run was indistinguishable from the walk: it now
   leans hard with the cloak streaming and a quicker bob. The draw was too small: the string now
   comes fully back past the jaw, held, with the arrow flaring, a visible snap and a hand flick.
   They fell like a body: they now dissolve to an empty robe with the mask and bow, a wisp rising.
6. **Arbalests.** The crank was a stub at the feet: the crossbow is now upright nose-down and the
   far hand turns the handle by IK on a grip that circles the butt.
7. **Mounted.** The horse's sign conventions were checked against templar-horse.ts (+ rears);
   the falling horse's folded legs went through the ground, so its barrel is held up on them.
8. **Lint.** The riders overlapped at level 1 (0.87-0.88): the lance, spear and bow are drawn
   longer or larger there. The riders' light read from the bottom-right at level 8 (the rim
   light on the horse's bones): the lower body is in shade as the old figures had it. Level-1
   detail that lined up into bands (quilting, leg wraps, pavise planks) is plain at level 1.

## Lint status (`pnpm pixel-lint --only=sprites --factions=undead`, then `kind-report`)

These pass for every kind:
- level-1 silhouette overlap under 0.85 (closest pairs: Barrow Horse Archers vs Death Knights
  0.84, Wraith-Wardens vs Lich 0.82, Black Riders vs Horse Archers 0.81; Legionary vs
  Bone-Throwers is now 0.61-0.70);
- idle and walk head churn (boil) under the fail line at every level, and idle head churn under
  3% for every foot kind except the Bone-Throwers at level 2 (4%);
- the light direction at level 8.

These FAILs remain, all level-specific pixel structure or value of the key art's materials:

| Kind | Remaining FAILs |
|---|---|
| 0 Grave Legionary | jaggies L1 (1.88) |
| 2 Bone-Throwers | edgeVsGround L1 (0.09), L8 (0.094) |
| 3 Wraith-Wardens | edgeVsGround L1 (0.076), straightRamp L4 (0.44) |
| 4 Revenant Arbalests | aligned L1 (0.37) |
| 7 Death Knights | jaggies L4 (1.67) |
| 8 Bone Colossus | lightDir L1 (121°) |
| 10 Lich-Marshal | aligned L1 (0.30), edgeVsGround L1/L2 (0.096) |

The edge values are the lit-side outlines of mid-value cloth (rag, violet, shroud) sitting near
the field's value at levels 1-2; they move with the shared faction palette and are best fixed
with it.

## Not done yet

- The rider's far leg is hidden by the horse and not animated separately; the riders' cloth
  trails on one bone each.
- The horse itself does not come apart in the death (its drawing is one piece); the rider does.
- The Trebuchet's crew are the parametric crewmen driven by a work-phase bone, not men on bones.
