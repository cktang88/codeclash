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

## Palette and lint clean-up

Before/after (top row before, bottom row after; idle frame 0, SE):
`undead-palette-before-after-L8.png`, `-L2.png` and `-L1.png` in `docs/screenshots/hd-sprites/`.
The contact sheets `undead-anim-k<kind>-L8.png` are re-rendered.

### References for this round

| Reference | Licence | Taken from it |
|---|---|---|
| The approved key art, `docs/screenshots/hd-sprites/undead-static-L8.png` (and `undead-static-k*-L8-x3.png`) | Our own | The colours to hold: the ghoul's blue-grey, the wardens' deep violet, the Black Rider's violet-black shroud, bone, rust and the green soul-fire. Every round was compared with it. |
| `templar-animation.md`, "Clean-up" | Our own notes | The cause of the moving lint fails, and the per-kind palette options. |
| `pixel-art-mistakes.md` #7, #8 | Our own guide (from the sources it cites) | Near-duplicate colours break flat masses into stripes. A straight ramp (one hue from shadow to light) reads as flat, so hue-shift it. |
| User targets `references/user-targets/armored-undead-x3.png`, `undead-unit-gstatic.jpg` | Study only | The Death Knight's lance is carried upright. The Legionary's pauldron is broad. |

### What was wrong

The cause was the one the Templar agent found. One master palette for the whole host folded every
dark material onto a few browns:
- at levels 1-2 the wardens' violet went team-blue, and the ghoul, the riders' shroud and the
  arbalests' gambeson picked up greenish browns;
- the lint credits a shared colour to the first material that lists it, so unrelated parts (a
  rope belt and the shield's painted skull, the crossbow's iron and the gambeson) became one
  "region";
- any kind's colours re-decided every other kind's.

### What changed

- **Per-kind palettes** (`undead.ts`): `setFactionPaletteOptions('undead', { perKind: true,
  minDist: [0.1, 0.18, 0.1, 0.06], keepChroma: 0.12, weightOutlines: true, kinds })`. Per kind:
  - The Bone-Throwers, wardens and Lich take a dark rim all round, from level 1. They are
    mid-value cloth: their pale lit-side rim and dark shade-side rim averaged out to the field's
    value (edge vs ground). This uses a new additive core option, `PaletteOpts.litDarkFrom`; the
    Templar and Samurai hash byte-identical.
  - The Legionary uses a little less merging at level 2.
  - The Colossus merges by chroma (`darkChroma`), so the char and rust keep their hues.
  - The Arbalests merge near-duplicates harder at level 4.
  - The Lich does no near-duplicate merging at level 2.
- **Hue-turned ramps** (`undead-parts.ts` `hueTurn`): the ghoul's flesh and the wardens' violet
  turn 7° a tone, bluer in the folds and warmer in the light. The base tone is unchanged. Both
  had been straight ramps (straightRamp 0.74 and 0.45).
- **Level-specific art:**
  - Legionary, level 1: no rope belt (a row of bone pixels). The near pauldron is a touch larger
    and further out, so the shoulder steps evenly down to the sword arm (jaggies 1.88 → 0.62).
  - Death Knights: the lance stands upright, as the key-art notes describe it. The 6° lean made
    an uneven 1-px staircase at level 4 (jaggies 1.67 → 1.47).
  - Arbalests, level 1: the near knee sits a pixel lower than the far one. Both legs' wraps had
    started on one row.
  - The low shade at levels 1-2 is set per kind (`FootSpec.shadeL1`, new `shadeL2`) so the shade
    line does not end on the rows where a robe's or coat's bands end:
    - the wardens and the Lich go deeper at level 1 (0.6);
    - the Bone-Throwers go shallower at level 2 (0.3);
    - the wardens (0.5) and the Arbalests (0.6) go deeper at level 2.

### Critique rounds

1. **Opting in.** Against the key art, the colours came back: the wardens are violet again at
   levels 1-2 (they had gone blue), the ghoul is blue-grey, the Black Rider's shroud is violet.
   But with the materials now apart, the lint saw more: 18 FAILs, up from 10. Some were light
   from the right (L1 regions whose lit pixels were another material's), some were straight
   ramps, and some were bands.
2. **Edges and ramps.** The dark rim cleared every edge-vs-ground fail. At level 8 the cloaked
   kinds still read as before, with a crisper silhouette. The hue turn cleared the straight
   ramps and moved the warden's level-2 light from 156° to 27°.
3. **Level 1-2 structure.** The overlays (aligned runs, jaggy runs, light vector per region,
   and a one-pixel-change sensitivity map) found the actual causes:
   - the Legionary's belt joined the shield's skull to the forearm bones;
   - the shoulder stepped 1-2-1-3;
   - both of the Arbalest's knees ended on one row;
   - the shade line ended level with the robes' folds.

   After the fixes the before/after lineups were checked at each level. The Legionary's
   level-1 hood now shows the aventail's grey, as the key art has it, and the Death Knight's
   upright lance is still his level-1 signature.

## Lint status (`pnpm pixel-lint --only=sprites --factions=undead`, then `kind-report`)

There is **no FAIL for any Undead kind at any level** (`kind-report` exits 0 for kinds 0-10).
- Level-1 silhouette overlap is under 0.85 everywhere. The closest pairs are Barrow Horse
  Archers vs Death Knights (0.83) and Wraith-Wardens vs Lich (0.82).
- Idle and walk boil are within the gate. Idle head churn is unchanged from before this round:
  at most 4.3 % on the foot kinds (Bone-Throwers, level 1) and 5.7 % on the Trebuchet's crew.
- Light angles of exactly 90° (all regions single-coloured) remain on the riders at level 1, the
  Arbalests at levels 2 and 4, and the Lich at level 1. They pass, as the Templar's do.

Warnings that remain (counted over the 44 kind-level reports), as a to-do list:
- base band share under 35 % (33);
- aligned band ends 0.2-0.3 (32);
- light angle 45-90° (18);
- idle silhouette change (18);
- figure vs ground ΔL 0.06-0.12 (9);
- sel-out ΔL and jaggies (8 each);
- idle and walk head churn (6 and 5).

## Not done yet

- The rider's far leg is hidden by the horse and not animated separately; the riders' cloth
  trails on one bone each.
- The horse itself does not come apart in the death (its drawing is one piece); the rider does.
- The Trebuchet's crew are the parametric crewmen driven by a work-phase bone, not men on bones.

## Weapons and runs: every blow fitted to its weapon (2026-11)

The user: "Spear people animations totally wrong lol, isn't it more a poking action. Go through
every soldier and make sure their attack animation actually fits their weapon", "many melee units
probably need 2 or 3 attack animations", "running is not just a faster walk", "archers need to draw
bows at an angle to shoot above the heads of troops". The research is `weapon-attacks.md` (U1-U10,
with the T/S bases they adapt) and `running.md` (§3 armour, §4 shield, §5 spear carries, §8 undead
gaits, §9 Muybridge gallop); the references behind both (Fiore and Wiktenauer, the gladius, the
crossbow museum drawings, Muybridge's plates, Williams' run keys) are listed there. Each round below
was compared against those notes and the motion references in `motion-reference.md`.

Code: `paper/undead-blows.ts` (new: the line thrust, the authored run, every new blow), wired in
`undead-clips.ts` (`FootClipSpec.blows`, `run`, `runArms`, `shootHigh`), `undead-horse.ts`
(`MountSpec.blows`, `shootHigh`, the sword swap), `undead-beast.ts` (sweep, stomp, the Colossus'
run), `undead-parts.ts` (`warSword`) and `undead-bones.ts` (each kind's choices and blow count).

### Audit (before)

| Unit | Weapon | What it did | What was wrong |
|---|---|---|---|
| Grave Legionaries | gladius + scutum | One blow: an overhead diagonal cut with the blade raised far above the helm. Run: the walk capture leaned forward, the blade waving, the shield arm free. | A gladius stabs first and the shield leads (U1); no shield punch; one blow. The run had no flight and the shield arm swung. |
| Ghoul Spears | two-handed spear | One lunge thrust, but the spear snapped from upright to level in one frame and swung back up in an arc. Run: the walk capture, spear upright. | One blow; the lowering and the recovery read as a swing. The run was the walk with the spear upright. |
| Bone-Throwers | bone javelins | Attack: an overarm "stab" whose arm keys (230-260°) turned the javelin round the head. Shoot: overarm hurl released level. | The stab was a swing; the release was flat (T3: a ~45° arc). One blow. Run = walk capture. |
| Wraith Bows | longbow | Shoot and Attack the same level shot. | Volleys must go up 30-45° to clear the ranks (user, T4). The run is a glide (kept). |
| Revenant Arbalests | crossbow | Attack: a "butt-stroke" that turned the crossbow 90° (a swing). Shoot: aim, loose, cranequin span (good). | One blow, and the butt-stroke was a swing of the prod. Run = walk capture, crossbow loose at the hip. |
| Black Riders | spear from the saddle | Drawn up and back, then pivoted down (the shaft turning 25°). | The thrust rotated instead of driving along its line; one blow. |
| Barrow Horse Archers | bow from the saddle | Shoot = Attack = level shot. | No high volley (the Parthian shot: see "Not done"). |
| Death Knights | couched lance, kite shield | One blow: the couch (good). | No sword phase; the research asks for the heavy overhead cut with an apex pause and a diagonal (U8, T8 P4). |
| Bone Colossus | femur club | One overhead smash (good). Run: the mocap run with a lean. | One blow; the run had a flight a heap that size cannot have. |
| Corpse Trebuchet | engine crew | Shoot: haul, beam whip, sling release, winch (good). Attack: the crew beating with tools. | Fine; kept. |
| Lich-Marshal | staff, witchfire | One blow: the cast. | One blow. |
| Horses (all mounted) | | Muybridge gallop, but the whole horse took the stop-motion hold (frame 2 shown twice, 3 skipped). | The hold broke the four-beat footfall order. |

### What changed

- **Thrusts on a line** (`lineArm`): the fist is placed on the shaft's own line every frame and the
  arm is solved for it by two-bone IK in the shoulder's frame; the shaft keeps its angle through
  the chamber, the drive and the hold. The weapon comes into line during the anticipation (frames
  1-2) and goes back to the carry at the end, so every blow begins and ends at rest and blows chain.
- **Blows per kind** (blow 0 first):
  - Legionaries (3): shield punch, then the gladius stab from behind the rim at the belly (the
    shield shoved out with a step on the shield foot, the stab after it); a low stab under the rim
    with the shield held up; the heavy diagonal cut kept as the third.
  - Ghoul Spears (3): the rising lunge (shaft at 102°, a twitch on the held chamber, a long step);
    the overhand stab from over the shoulder, point down (72°); a quick double jab low (86°).
  - Bone-Throwers (2): overhand javelin stab, point dipping (80°); underarm jab rising (104°).
    Shoot: the javelin's point rises through the delivery and leaves the hand ~35° up.
  - Wraith Bows: Shoot is aimed 38° up (bow arm, bow and arrow rise together, the trunk leans back
    from the hips, the skull looks up the shaft); Attack stays the level point-blank shot.
  - Revenant Arbalests (2): the crossbow levelled and rammed out along its line; the club (a
    crossbow is a blunt weapon in melee, so this one swings: overhead, held, down with the back).
  - Black Riders (3): overhand down at a man on foot (66°), couched level (93°), low past the
    horse's shoulder (50°), all on the line, the rider leaning into each.
  - Barrow Horse Archers: Shoot aimed 34° up, Attack level.
  - Death Knights (3): the couched lance; then the sword phase (the lance swapped for a blackened
    war sword, `warSword`, by a slot key for the blow's length): the overhead cut heaved up over
    the shoulder and **held two frames at the apex**, then the fall through the horse's shoulder
    line with the trunk; the diagonal forehand cut from a flat chamber.
  - Bone Colossus (3): the smash; the sweep (club drawn back low behind the hip, swept forward at
    shin height with the torso, carried up through the front); the stomp (the foot heaved up, held,
    slammed down with the heap dropping onto it, dust bursting at the foot).
  - Lich-Marshal (2): the cast; the staff jab (the burning head driven out along the staff).
- **Runs** (`runKeys`, 12 frames): a flight phase (both feet off, the hips highest) and the bob
  reversed from the walk's (lowest at mid-stance); the foot rolls toe-down at push-off.
  - Legionaries: heavy armoured run: 5 stance frames a step, one flight frame, a deep sink, the
    shield arm locked up before the chest, the gladius forward at chest height point up, its tip
    bouncing late.
  - Ghoul Spears: crouching bounds: 3 stance frames, 3 in the air, the back folding on landing and
    opening in flight, the spear low and level at port in both hands.
  - Bone-Throwers: the skeleton's lope: long stride, two clean flight frames, a shallow down, the
    free arm stiff (elbow ~135°) and out of phase, a hitch at contact (the upper body holds).
  - Revenant Arbalests: heavy jog with the crossbow at port across the body.
  - Bone Colossus: a lumbering heavy run that barely leaves the ground (one short lift), the heap
    sinking hard onto each stance leg, the club carried up in front.
  - Wraiths and the Lich keep their glide (they have no legs to run on); the run leans and streams.
  - Horses: the Muybridge gallop keeps its beat: the stop-motion hold is on the rider's trunk, arms
    and skull only, so the footfall order and the suspension frame are intact.

### Critique rounds

Contact sheets (level 4, SE above NE; rows = each blow, then Shoot; and Walk, Run):
`docs/screenshots/anim-weapons/undead/k<kind>-<name>-blows.png` and `-walk-run.png`. Before (SE;
rows Walk, Run, Attack[, Shoot]): `before-k<kind>.png`. The showcase Units tab (HD, 4×):
`demo-units-se.png`, `demo-units-ne.png`.

1. **First pass.** The thrusts read as pokes (the ghoul's three, the legionary's stab), but the
   shield punch was too small to read (the shield arm turned 44°): now 62°, with the step. The
   Colossus run floated four frames: its drawing places the hips from its own torso angle, so an
   extra lean pulled the feet off the IK targets; the lean is cut to −4° and the flight to one
   short lift. Flight frames were checked by measuring the gap under the lowest pixel per frame.
2. **Second pass.** The Death Knight's sword vanished on the follow-through (iron on the black
   horse): the blade is steel now and stops higher (44°), across the horse's neck. The javelin
   left the hand flat: the point now rises to ~35°. The heavy run had flight in only one half of
   the cycle (the trailing toe still down): the toe lifts on frame 11 as on frame 5.
3. **Third pass, against the research.** No thrust turns its shaft during the drive; the ghoul's
   chamber holds with a twitch (U2); the legionary's shield leads the stab (U1); the Death Knight
   pauses at the apex (U8); the Colossus' stomp has its impact and dust (U9); the bows go up for
   the volley. In the showcase the runs read as runs beside the walks (shield up, spear levelled,
   flight).

### Lint

`pnpm pixel-lint --only=sprites --factions=undead`, then `kind-report` for kinds 0-10: **no FAIL
on any HD kind at any level**, every blow audited (kind-report lists 3 blows for the Legionaries,
Ghoul Spears, Black Riders, Death Knights and Colossus, 2 for the Bone-Throwers, Arbalests and
Lich). Level-1 silhouette overlap stays under 0.85 (closest: Horse Archers vs Death Knights 0.83,
Wraith Bows vs Lich 0.82). The 51 failed checks the run reports are all the classic (non-HD)
painter's, unchanged.

### Not done

- The Barrow Horse Archers' Parthian backward shot: our riders face forward in both drawn views,
  and turning the torso 120° needs a rider drawn from behind on a horse seen from the side; their
  Shoot is a forward volley aimed high instead.
- ~~The Death Knight's lance-to-sword change is a slot swap on the blow's first frame~~ (fixed in
  the polish round below).
- The Corpse Trebuchet's crew are unchanged (their haul and winch were right).
- ~~Wraiths and the Lich glide; their run is the faster glide~~ (now a flight: polish round below).

## Polish round: the Death Knight's sword, the wraiths' flight, the javelin reload, the port (November 2026)

### References added

| Source | Licence | Taken from it |
|---|---|---|
| ImogiaGames, *Ghost monster* (remix of Balmer's *Skeleton and Ghost spritesheets, Ars Notoria*): [anim-nme-ghost.png](https://opengameart.org/sites/default/files/anim-nme-ghost.png) ([page](https://opengameart.org/content/ghost-monster)), [skeleton-ghost-preview.png](https://opengameart.org/sites/default/files/skeleton-ghost-preview.png) ([page](https://opengameart.org/content/skeleton-and-ghost-spritesheets-ars-notoria)) | CC0 (study copies in `references/wraith-run/`, not committed) | A hooded wraith in flight: the body pitched forward, the robe tapering back into a tail that never touches the ground, its tip breaking into loose bright pixels. So the run lifts the robe, pitches it and trails afterimage pixels. |
| OpenGameArt, *Upwards floating soul* (`sSoul.png`, [page](https://opengameart.org/content/upwards-floating-soul)) | CC0 | Four frames of a teardrop ghost: the tail lags and swings against the head; the motion is in the tail, the head steady. The wraiths' head is held (dw -2) while the robe and the ghost streaks move. |
| OpenGameArt, *Ghost 5* (`Ghosts.png`, [page](https://opengameart.org/content/ghost-5)) | CC0 | A frilled hem that changes shape frame to frame as the body moves: the hem, not legs, carries the gait. |
| Met 468633, knight aquamanile c. 1250 ([page](https://www.metmuseum.org/art/collection/search/468633)); Met 461052, knight aquamanile c. 1350 ([page](https://www.metmuseum.org/art/collection/search/461052)) (see `templar-animation.md`, polish round) | Public domain | The sword sheathed at the left hip of a mounted knight, hanging steeply by the saddle; the sword raised high behind the head before the cut. The Death Knight's scabbard and his draw-and-heave. |
| `weapon-attacks.md` U3 (javelin: withdraw, block, release), U5 (crossbow), U8 (Death Knight) and `running.md` §5 (weapons at the port) | Our notes | The reload order and the carry. |

### What changed

| Unit | Before | Now |
|---|---|---|
| Death Knights (7) | The sword blows swapped the lance for the sword for the whole blow (frame 0), so a knight showed the lance one swing and the sword the next | **Lance-based, the sword drawn inside each sword blow.** The key art gains a sheathed war sword at the far hip (scabbard steep past the saddle; a steel chape and locket at level 8). In both sword blows: the fist carries the upright lance to the shield hand (1), is on the hilt at the far hip with the blade along the scabbard (2), heaves up (3-4), cuts (5-8), sheathes (9) and takes the lance back (10). Slots `weapon`/`weapon.sword`, `hip`/`hip.empty` and `farLance`/`farLance.held` swap from frame 2 to 9. Chosen over "all sword" because the idle, walk and charge all carry the lance: with this, every swing starts and ends as they do. |
| Wraith-Wardens (3), Lich-Marshal (10) | Run = the glide leaned harder, faster bob | A **flight**: the robe lifted clear (0.8 units, the Lich 1.1), the body pitched 36 degrees forward, the legs trailing back up under the hem, the free arm swept back a frame late (the wardens' bow arm with the nocked bow low behind; the Lich's witch-hand, the staff carried slanting forward), a surge twice a cycle, the robe and cloak streaming (cloth run 3.2). A `ghost` extra draws **afterimage streaks** of the robe's own cloth behind it at four heights, each on its own beat, drifting back and breaking into loose pixels. |
| Bone-Throwers (2), Shoot | After the throw the new javelin appeared point-forward in a raised fist in front of the face (frame 10) and swung back to the cocked carry (11) | The hand goes up behind the shoulder to the **fan on the back** and draws the next javelin point-up (9, now a keyed frame), brings it over the shoulder turning point-forward (10), settles into the carry (11): at most ~40 degrees a frame. |
| Revenant Arbalests (4), Run | The crossbow at the port low across the body, brown on the brown gambeson at level 4 | Carried **higher and further out** (the fist 2.2 forward, 1.3 below the shoulder, the stock at 116 degrees) so the prod stands by the near shoulder clear of the body, and a **lit rim** (bone, lightest tone) along the stock's upper edge and the prod's tip while at the port (event `port` on the authored runs; from level 2). |

### Critique rounds

1. **Death Knight.** The first scabbard was dark leather on the dark barding and vanished; the
   steel chape and locket carry it at level 8. At level 4 they pushed the aligned-band-ends check
   over its gate (0.294 -> 0.301 FAIL), so below level 8 only the leather is drawn (0.295).
2. **Wraiths.** First pass: the near arm could not trail (its IK holds the string hand on the
   nock), and the streaks were dark, evenly stacked dashes that read as stripes. The bow arm now
   trails instead (the string hand follows); the streaks are the cloth's lightest tones, four rows
   on their own beats, set back from the robe's slanted back edge (the first set hid behind it).
   With the bow arm swept far back, the bow in NE crossed the whole robe: the sweep was halved.
3. **Javelin.** The keyed path was right but frame 9 was not a key (interpolated between 8 and 10):
   added to the clip's extra keys, so the draw from the fan shows.
4. **Arbalests.** Higher alone (fist 0.9 below the shoulder) put the prod in front of the face in
   SE; at 1.3 below it sits by the shoulder, and the rim carries the stock across the gambeson.

Contact sheets, before and after, every frame, SE above NE, level 4 x2:
`docs/screenshots/anim-weapons/polish/u-k7-death-knights-blows-*.png`, `u-k3-wraiths-walk-run-*`,
`u-k10-lich-walk-run-*`, `u-k2-bone-throwers-shoot-*` and `u-k4-arbalests-run-*`.

Still short:
- The Death Knight's sheathed sword is small and dark at levels 1-4 (the leather alone); it reads
  in the blow, not at rest.
- The wraiths' ghost streaks use the robe's own ramp (dark violet, the Lich's shroud): a paler
  ghost would need a new material.
- The wardens' run carries the bow drawn half-back behind them (the string hand stays on the nock).
- The Bone-Throwers' withdraw (frame 0 to 1) is still one big step from the carry to the arm back.
