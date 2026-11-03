# Running vs walking: biomechanics and animation notes

Scope: run cycles for Templar, Samurai and Undead soldiers in Code Clash, including heavy armour, shields, spears, drawn swords, and routing. Also horse gaits for any mounted unit.

Status: research notes for animators. Written 2026-11-03. Nothing here has been drawn or tested in-engine yet.

## How to read the confidence tags

- **[S]** Stated in a source linked in this file. The URL is in the source list at the end.
- **[S-snip]** Taken from a search-result snippet, not a full read of the page. Check before relying on it.
- **[I]** My inference or a convention from animation practice. Not measured by any cited study.
- **[G]** General running-gait knowledge with approximate values. Not checked against a fetched source. Verify against a reference clip or a CC0 breakdown before locking numbers.

## Headline findings

1. **The studies do not show armour making strides shorter.** The main armour study (Askew et al.) found the cost of locomotion roughly doubled, the leg-swing work rose, and breathing rose, but stride kinematics were "largely unaffected" [S]. Shorter, quicker steps under load come from *load-carriage* studies, not armour studies [S]. Treat the armour pose changes below as animation choices, not measured facts.
2. **Running is defined by flight, not by speed.** Walking always has one foot on the ground. Running has a flight phase, a stance phase that is short, and a centre of mass that is highest in flight and lowest during stance. Walking is the reverse [S].
3. **Shields and spears remove the counter-swing.** No study of shield carriage during running was found [S, negative result]. The arm-restriction effect is documented for rifles and general load carriage [S]. The shield rules below are [I].
4. **Horse gaits are well documented.** Walk, trot, canter and gallop footfall orders are consistent across sources [S].

---

## 1. Walk vs run fundamentals

### 1.1 The phases

| Concept | Walk | Run |
|---|---|---|
| Ground contact | One foot always down ("double support" between steps) [G] | Short contact, then flight. No double support [S] |
| Flight | None | Both feet off the ground [S] |
| Stance share of the cycle | Stance is most of the cycle (about 60% or more) [G] | About 35–40% at jogging pace, about 20–22% at sprint [S, Waikato text and a flight-phase summary] |
| Vertical centre of mass (COM) | Highest at mid-stance, lowest near toe-off [S] | Highest in flight, lowest at mid-stance when the leg is flexed [S] |
| Leg model | Inverted pendulum (leg swings over a straight stance leg) [G] | Spring-mass (stance leg compresses, then rebounds) [S, Waikato text] |
| Energy | Potential/kinetic energy exchange over the step | Stored and released in the leg spring during stance [S] |

Key animation consequence: **the vertical bob is reversed**. A walk cycle has its low point at contact and its high point mid-stance. A run cycle has its low point at mid-stance (the "down" pose), with the high point in flight. Copying a walk bob into a run looks like a bouncy walk.

### 1.2 Run key poses, right-foot-forward, side view

Angles are approximate [G] unless tagged otherwise. Use them as starting points and tune against a reference.

**A. Contact (front foot strikes)**
- Front foot lands under or slightly ahead of the hip, on the ball or midfoot (see 1.4 on strike).
- Front knee flexed about 15–25° at strike.
- Front hip flexed about 20–35° (thigh forward).
- Trunk leans forward about 3–7° from the ankles, not from the waist [coaching claim, unverified].
- Lead arm (opposite leg) forward, elbow about 90°, hand near chest height.
- Trailing arm back, elbow about 90°, hand near hip.
- Back leg: toe still on the ground or just leaving, heel raised, knee flexed about 50–70°.

**B. Down / absorb (lowest point of the bob)**
- Front knee at its most flexed in stance, about 25–40° [G].
- Hips drop, pelvis lowest point.
- Trunk upright to slightly forward.
- Arms: lead arm rising toward the chin, trailing arm reaching back and up.
- Head stays level; eyes do not bob.

**C. Passing (stance leg under the body)**
- Stance leg vertical under the hip, knee about 15–25° [G].
- Swing leg knee passes the stance knee, thigh roughly vertical, shin folding under.
- Pelvis at mid-height, rising.
- Arms swap; lead arm at chin, trailing arm at hip.

**D. Up / push-off (highest point of the stance bob)**
- Stance hip extends, about 10–15° of extension behind the body [G].
- Stance heel lifts, toe pushes off, ankle plantarflexed.
- Stance knee extends to about 15–30° flexion (not locked).
- Swing leg knee rising, heel tucking toward the buttock (about 90–120° knee flexion in the recovery) [G].
- Lead arm dropping back down; trailing arm swinging forward.

**E. Flight A and Flight B (both feet off)**
- Both feet off. The recovery leg's knee is most flexed at the start of flight (heel tucked, about 110–130°), then extends forward before the next contact [G].
- Body reaches its highest point in flight; COM is above the feet by a few centimetres at sprint pace [G].

### 1.3 Stride length, cadence, and lean

- Stride length and cadence trade off: speed is the product of step length and cadence [S].
- A systematic review (Schubert et al. 2014) found that a higher stride rate (shorter stride, same speed) reduced COM vertical excursion, ground reaction force and energy absorbed at the hip, knee and ankle [S]. The authors caution that most studies were small, mostly male, and methodologically varied [S].
- Practical targets for a side-view sprite: **shorter, quicker steps look more like "tired/loaded running"**. A longer stride with more flight looks like "fresh running". Use this as an expressive lever.
- Forward trunk lean from the ankles, about 3–7° at jog and more in charge or sprint [coaching claim, unverified].

### 1.4 Heel vs midfoot vs forefoot strike

- Most runners at jog pace land on the midfoot or rearfoot. Sprinters land on the forefoot/ball [G].
- For a pixel sprite, a forefoot or ball contact with the heel visible just above it reads as "running" more clearly than a flat foot.
- A flat-foot contact with a long stance reads as walking, even with a flight phase in the timing. Keep stance short.
- Heel-to-toe contact (in the Williams sense, see section 1.6) appears in some Animator's Survival Kit-style cycles; it looks rigid in 3D because the knee snaps [S-snip, student blog].

### 1.5 Arm swing

- Arms bent at about 90° [coaching claim, unverified].
- Arm movement is opposite to the legs, which counterbalances the body's rotation in flight [S, from the arm-swing description in the run-gait overview]. Without it, the airborne leg twists the torso.
- Shoulder range is modest, about 40–60° of swing [G]. Arms should move from the shoulder, not from the wrist.
- Elbows stay near the torso; hands cross at or just below the chest in the passing pose.

### 1.6 Animator's Survival Kit run (Richard Williams)

The book's pose diagrams were not available in any fetched source. The following comes from student blogs and forum posts that cite the book [S-snip]:

- Key poses: **Contact, Contact (second), Down, Up**, with in-betweens (passing and up-to-contact) filling the gaps.
- Walk vs run difference: in a walk one foot is always down. In a run, the character should not touch the ground between Up and Contact.
- "Springy" character: crouch on Down, launch on Up.
- Contact is heel-to-toe in Williams' drawings; in 3D this snaps the knee [S-snip].

Read the book directly for exact poses. Do not copy from a blog.

### 1.7 Pixel-art constraints

- At 32 px tall, the knee and hip swing usually need 1–2 pixels of offset. Keep the bob at 1 px per frame or less.
- Flight is shown by a gap under both feet (at least 1–2 px) for 2 frames minimum.
- The arm swing is the main cue of run vs walk at small sizes. Keep the lead arm up to chin height in contact.

---

## 2. Cycle timing: 8-frame and 12-frame breakdowns

Each full cycle covers both legs (one stride per leg). Frame numbers below are for one loop. "R" and "L" are the front leg at contact.

### 2.1 Eight frames (each leg contributes 4 frames)

| Frame | Pose | Notes |
|---|---|---|
| 1 | Contact R | Front foot lands under the hip. Lead arm forward. Lowest point starts. |
| 2 | Down R | Lowest bob point. Knee at max stance flexion. |
| 3 | Passing R | Stance leg vertical. Swing leg passes. |
| 4 | Up R / push-off | Highest point. Stance heel lifts. Flight starts. |
| 5 | Contact L | Left foot lands. Mirror of frame 1. |
| 6 | Down L | Mirror of frame 2. |
| 7 | Passing L | Mirror of frame 3. |
| 8 | Up L / push-off | Mirror of frame 4. Loops to frame 1. |

Problem with 8 frames: there is no separate flight frame, so flight is implied by the gap between frames 4 and 5. Use this only for small sprites or when you need a fast loop.

### 2.2 Twelve frames (recommended for Templar and Samurai)

| Frame | Pose | Notes |
|---|---|---|
| 1 | Contact R | Foot under hip, lead arm forward. |
| 2 | Absorb R | Knee bends, trunk slightly forward. |
| 3 | Down R | Lowest point. |
| 4 | Passing R | Stance vertical. |
| 5 | Push-off R | Heel lifts, hip extends. |
| 6 | Flight A | Both feet off, rising. |
| 7 | Flight B | Highest point, heel tucked. |
| 8 | Contact L | Mirror of frame 1. |
| 9 | Absorb L | Mirror of frame 2. |
| 10 | Down L | Mirror of frame 3. |
| 11 | Passing L | Mirror of frame 4. |
| 12 | Push-off L | Mirror of frame 5. Flight A/B repeat on the next loop. |

Timing note: flight here covers two frames in each half of the loop. Heavy armour versions use 1 flight frame instead of 2 (see section 3.4).

### 2.3 Timing offsets at 12 frames

- Arms lead the legs by about 1 frame. Lead arm at contact, trailing arm at push-off.
- Torso bob peaks at frame 3 (down) and frame 7 (flight B). Head lags the torso by 1 frame.
- Shield or spear bounce should lag the torso by 1–2 frames (see sections 4 and 5).

---

## 3. Running in heavy armour (mail, plate, lamellar, o-yoroi)

### 3.1 What the studies measured

**Askew, Formenti and Minetti 2012 (Proc R Soc B, 279:640–644, DOI 10.1098/rspb.2011.0816, online 2011)** [S]:
- Four experienced male subjects, mean 79 kg, 175 cm. They wore replica late-15th-century armour averaging 35 ± 5 kg, which is 44% of body mass (including a padded arming doublet).
- Net metabolic cost was **2.1–2.3× unloaded for walking** and **1.9× unloaded for running** (p = 0.009). The increase is larger than the 1.4× rise in body mass.
- Walking speeds 0.5–2.0 m/s; running 1.7–2.0 m/s.
- Leg-swing mechanical power rose about 63% across walking speeds (p < 0.001).
- Ventilation and breathing frequency rose at fast walking speeds (p < 0.05). Tidal volume did not change.
- **Stride kinematics were "largely unaffected" by armour.** No numbers given for stance/swing, duty factor or stride frequency.
- Arm swing was not calculated: subjects held a longsword two-handed, so upper-limb movement was small.
- Maximum sustainable walking speed in armour dropped from about 2.7 to 1.7 m/s for the example subject, at the same metabolic budget [S].

**Jaquet (Historical Methods; Max Planck Institute for the History of Science)** [S]:
- A volunteer in replica armour was filmed walking and running on a treadmill and analysed with 3-D kinematics.
- Armour added weight and energy cost, but "the wearer retained most of his range of motion." No speeds given.

What this means for animation: **the energy cost is large, but the body mostly moves the same way.** Armour changes the effort and breathing more than the range of motion. The clearest animation cues are therefore:
- Keep joint angles close to the unarmoured cycle.
- Make the effort visible through small changes: slightly higher cadence, a slight extra knee bend at push-off, more head bob, a heavier hip sway, and open mouth or breath cues in fatigue states.

### 3.2 Load carriage and running (not armour, but related)

- A 2020 *Gait & Posture* study (Effects of load carriage on biomechanical variables associated with tibial stress fractures in running) found that carrying a 22.7 kg load increased stride frequency, and lighter participants changed more. Loads of 11.3 kg and above increased variables linked to tibial stress fracture [S-snip, abstract].
- A USARIEM technical report on backpack carriage found that as load grew very heavy, stride frequency increased, and double-support time as a share of the stride increased along with it. The effect was attributed to a delayed push-off [S-snip].
- A systematic review of backpack walking found increased cadence and trunk flexion with load, with results dependent on speed, hip belt use and load position [S-snip].
- A 2021 military load-carriage gait review notes that joint kinetics and kinematics change under load, but results vary a lot between studies because of different load systems [S-snip].
- Body armour in lifting and carrying tasks increased trunk flexion and reduced trunk rotation [S-snip, Coventry University abstract on soldier posture].

Animation takeaways from load-carriage studies:
- Shorter, quicker steps (higher cadence) with a more forward trunk.
- Less trunk rotation: the torso does not twist into the stride.
- Double-support time rises, so the frames where both feet are on the ground grow longer. Use a short flight, or none, for loaded running at jog pace.

### 3.3 Armour mechanics: what to animate

- **Mail (hauberk, coif)**: shifts on the shoulders and hips. A mail skirt or hem bounces with the stride. Use a 1–2 frame lag behind the hips [I].
- **Plate (cuirass, arms, legs)**: rigid. Only the joint seams and straps move. The plate itself moves with the torso, with no lag [I].
- **Skirts and tassets (plate skirt, kusazuri, cuisses)**: pendulum motion. Swing toward the back leg at push-off and forward on the swing. Use a 2–3 frame lag [I].
- **Sode (Japanese shoulder guards)**: lift and drop with each arm swing. Keep them close to the shoulder joint and have them drop about 1 px on contact [I].
- **Helmets**: head bob is small. Keep the head level and let the helmet bob 1 px with the torso.
- **Weapon in hand**: travels with the arm, with a 1–2 frame lag.

### 3.4 Cycle changes for heavy armour

Recommended (animation choice, not measured [I]):
- Cadence: about 10–15% faster than the unarmoured jog, to match the studies' higher stride frequency under load. Use 8 frames instead of 12 for a heavy jog.
- Flight: one flight frame, or none. Walking-like double support in heavy jog.
- Trunk lean: a little more forward than a light jog, about 4–8° from the ankles.
- Arms: reduce the amplitude of the arm swing about 20–30%. Arms stay closer to the chest. Elbows bent more (about 80–90°). The Askew study says arm swing was not measured, so this is an inference.
- Knee: keep the same flexion. Armour does not block the knee at this scale.
- Head: small, slightly lower bob.

Walk-to-run distinction under heavy armour: a heavy "run" can look like a fast walk with a short flight or none. That is correct for armour, not a bug. Keep the flight at least 1 frame so the state reads as run and not walk.

---

## 4. Running with a shield

### 4.1 What is known

- No study of shield carriage during running was found [S, negative result].
- Rifle carriage changes the ground reaction forces in walking, raising the impact peak and mediolateral forces [S-snip].
- Restriction of arm swing is a known effect of weapon carriage in load carriage [S-snip].
- A study of weapon carriage on 17 soldiers found no significant change in stride-time variability on a treadmill [S].

### 4.2 Shield rules (animation convention [I])

- **Shield arm**: elbow flexed about 90–110°, forearm across or in front of the chest. Hand grips the strap. The arm does not swing.
- **No counter-swing on the shield side.** The opposite (free) arm swings as usual but with a larger amplitude, because the body still needs counter-rotation.
- **Torso rotation**: reduced on the shield side. The shoulders rotate less into the stride. The torso can face the threat more directly, so the shield side leads.
- **Shield bounce**: the shield rises and drops with each step. Offset the shield 1–2 frames behind the torso bob. Bounce about 1–2 px at 32 px sprite height.
- **Free arm**: swing about 20% larger than normal.
- **Shield edge**: the bottom edge sweeps slightly on the stride (about 1 px). Keep the shield in front of the body, not swinging back.
- **Heavy shield (kite, tower)**: larger bounce, slower reaction. Tower shields are not running shields; a tower-shield unit should jog at most.

### 4.3 Shield + sword

- Sword hand low, at hip height, or forward at chest in charge.
- The sword arm swings forward and back less. In a charge, the blade is held forward at shoulder height with the elbow bent about 100–120°.
- Frame the sword hand at the lowest point of the bob in frame 3/9 to show the weight shift.

---

## 5. Running with spear, pike, yari, or other two-handed weapon

### 5.1 Carry positions

- **Port arms** (across the body, diagonal): front hand at chest height, rear hand at hip. The shaft crosses the torso. Both arms are bent about 90–110°. Arms do not swing. Torso may rotate a little with the legs.
- **Levelled** (charge): shaft held horizontal, forward hand at shoulder height, rear hand near the hip. Elbows locked near the body. Head slightly lowered, trunk leaning 8–12° forward [I].
- **Shouldered / trailing**: shaft over the shoulder, held at the rear hand. Arms swing little. The shaft bounces up and down 2–3 px at the tip.
- **Trailing**: shaft dragged or held at the lower third, pointing back. Use for routing units or slow advance.

### 5.2 Animation rules for a long shaft

- The shaft tip oscillates more than the hands. Lag the tip by 1–2 frames behind the body. Tip swing amplitude is about 2–3 px in 32 px sprites [I].
- The rear hand stays on the shaft and does not swing with the leg.
- Torso rotation is mostly absorbed by the shaft and arms. The head and shoulders do not twist as much as in an unarmed run.
- Feet and cadence stay the same as the unarmed cycle (section 1). The spear does not change leg mechanics, but it does lower the arm amplitude.

### 5.3 Ashigaru yari (formation infantry)

- Historical use: ashigaru fought in formation, usually holding ground rather than charging [S-snip, general descriptions of ashigaru role; a miniature-seller description and a game wiki both say so, neither is a historical source]. Treat "running with yari" as a charge or advance, not a standard drill. The Wikipedia article on ashigaru confirms light, portable armour and long spears [S].
- Yari length: some descriptions give up to about 9 ft (about 2.7 m) [S-snip, unverified].
- Run style: short, controlled jog with the yari at port arms. Feet stay close together. Arms do not swing. Head forward.
- Lightly armoured ashigaru (tatami-do, kusazuri with lacing) can run more freely. Heavy armour (plates, dō) should be a slower jog.

### 5.4 Pike (for Templar-style pike or lance units)

- Pike or lance held in both hands, levelled or at rest. Length makes the tip drop and rise with each step.
- Use a 2-frame lag on the tip. Keep the hands rigid.
- Low trunk lean with a clear pelvis bob. The longer the weapon, the more the body leans to counter it (about 5–10° [I]).

---

## 6. Other carries

### 6.1 Drawn sword (no shield)
- Sword held at chest or over shoulder for running. Blade tip points forward or up. Elbow about 90°.
- Arm swing is reduced on the sword side. The free arm does the counter-swing.
- Keep the sword hand in view during the passing pose (frame 3/9).

### 6.2 Bow (yumi, unstrung or strung)
- Unstrung bow: held in the left hand, arm extended slightly forward. The right hand is free and swings normally.
- Strung bow: draw hand near the cheek or at rest. Running with a strung bow is not standard; use only for a charge or a short sprint.

### 6.3 Matchlock or firearm
- Not in the current roster. If added: held at port or shouldered with both hands. The matchlock is heavy, so use the heavy-armour cycle plus a rigid carry.

---

## 7. Charging vs jogging vs sprinting vs fleeing (routing)

| State | Cadence | Flight | Trunk lean | Arms | Notes |
|---|---|---|---|---|---|
| Jog (formation advance) | Medium | Short | 3–5° | Relaxed, 90° elbows | Default. Head level. |
| Charge | High | Medium | 8–12° | Weapon levelled, free arm pumps | Lean forward from the ankles. Knees higher. |
| Sprint | Highest | Longest | 10–15° | Both arms pump, more amplitude | Stance short (about 20%). |
| Routing / fleeing | Irregular | Unstable | Variable, often upright then pitched | Flailing, dropped or dragged weapon | Stumble and recover. Head turns back. |

Routing details [I]:
- Irregular step length: alternate long and short steps, with a stumble frame where the body dips and the recovery is a 1–2 frame hitch.
- Head turns back and sideways. Keep the look-back to 1 frame per cycle.
- Arms flail: one arm up, one dropped. Weapon held loosely, may be dropped (drop after 2–3 cycles).
- Stance is short on the lead foot, with a longer back-leg push that looks uneven.

---

## 8. Undead run adaptations

No sources for undead locomotion were found. The following is animator convention [I] and should be checked against reference footage of the animal or human models named.

### 8.1 Skeleton (loping)
- Long, loose stride with a pelvis-led gait. Ribcage and head slightly forward.
- Arms hang and swing out of phase with the legs. Elbows bend less (about 110–140°) to read as stiff.
- Contact is short and abrupt; use a hitch rather than a smooth absorb. Knees lock briefly at push-off.
- Flight is clean: the skeleton has no weight to absorb, so the Down pose is shallow.

### 8.2 Ghoul (bounding on all fours)
- Front arms reach forward on each bound, hind legs push. Two-point or three-point contact, then a flight.
- Spine arches on the push and extends on the reach.
- Head drops and rises with the back. Tongue or cloth hang is secondary motion.

### 8.3 Shambling (zombie or weakened undead)
- Stiff-legged, locked-knee contact with no flight. Keep both feet on the ground in the cycle.
- Arms out in front, not swinging. Head sways side to side.
- Short stride, slow cadence.

---

## 9. Horse gaits (for any mounted unit)

Sources: Wikipedia's horse gait article and Muybridge's gallop plates [S]. Timing and footfall order follow the standard sequence.

### 9.1 Footfall orders

| Gait | Beats | Footfall order (example: left lead) | Suspension | Notes |
|---|---|---|---|---|
| Walk | 4 | Left hind, left front, right hind, right front | None. Two or three feet always on the ground | Lateral sequence. Rider sits. |
| Trot | 2 | Diagonal pairs move together: left front + right hind, then right front + left hind | Yes, two feet off | Rear leg usually leads the diagonal at contact and lift-off (per a modern analysis) [S-snip]. |
| Canter | 3 | 1) One hind leg pushes (e.g., right hind). 2) Left hind + right front land together. 3) Left front lands, then suspension | Yes, all four off | Leading leg is the foreleg that reaches farther. |
| Gallop | 4 (canter variant at speed) | The second canter stage splits into two falls. Inside hind lands just before outside front. Leading front strikes off, then suspension | Yes, all four off with legs bent | Muybridge's 1877 sequence tested whether all four hooves are ever airborne at once [S]. |

### 9.2 Rider posture
- Walk: rider sits, relaxed. Torso moves with the horse.
- Trot: most riders post above a jog. Rise on one beat, sit on the other. A sitting trot is harder and fast trots are hard to sit [S].
- Canter: rider leans slightly forward. Seat follows the rhythm. Source gives limited detail on canter and gallop seat [S-snip].
- Gallop: rider low, forward, sometimes crouched. Source gives no detail [G].

### 9.3 Muybridge references
- *The Horse in Motion* (1878) plates show gallop and trot sequences [S]. The NGA holds gallop plates such as plate 627 ("Annie G." galloping) [S].
- Plate descriptions from the National Gallery of Art pages give the gait but not timing charts [S]. For timing diagrams use Muybridge's *Animal Locomotion* or equine gait-analysis sources.

---

## 10. Common animation mistakes

1. **Walk sped up.** A run made by adding frames to a walk. Symptom: double support and no flight. Fix: the flight phase and short stance are mandatory.
2. **Feet sliding.** Stance foot slides during contact. Fix: pin the planted foot to the ground for the stance frames, then move the body over it.
3. **No flight phase.** Feet never leave the ground. Fix: at least 2 frames with a gap under both feet.
4. **Bob at the wrong time.** Run bob copied from the walk, lowest at contact. Fix: lowest at mid-stance (Down), highest in flight.
5. **Symmetric arms with a shield.** Both arms swing equally. Fix: the shield arm is locked; the free arm carries the counter-swing.
6. **No lean.** Upright torso at charge speed. Fix: 3–7° at jog, 8–12° at charge, from the ankles.
7. **Knees bending the wrong way or snapping.** The heel-to-toe contact in 3D causes this [S-snip]. Fix: keep the knee bend smooth through stance.
8. **Armour that does not move.** Skirts, sode and shield stay rigid. Fix: add 1–3 frame lags.
9. **Identical cycles for every unit.** Same run for a knight and a skeleton. Fix: use the per-unit table in section 11.
10. **Head fixed.** Head does not bob. Fix: head lags torso by 1 frame.
11. **Mirrored frames that read as the same leg.** Left and right legs look the same. Fix: the swing leg has a different knee shape from the stance leg.
12. **Routing that looks like a jog.** Routing units with perfect rhythm. Fix: irregular steps, stumble, look back.

---

## 11. Per-unit-type table

Map these to the actual unit IDs in `src/game` (the repo's faction files). Styles are recommendations, not verified against in-game sprites.

| Unit type | Run style | Cadence / flight | Key cues |
|---|---|---|---|
| Templar sergeant (heavy armour, shield, sword) | Heavy jog, shield-locked | 8–12 frames. Short flight, 1 frame. | Shield arm at chest, no counter-swing on shield side. Skirt lag. 4–8° lean. Shield bounce 1–2 px. |
| Templar knight (mail, plate, lance or sword, shield) | Heavy jog or charge when levelled | 12 frames. Flight 1–2 frames on charge. | Lance levelled, elbows locked near body. Head lowered. Mail hem bounce. |
| Templar pike or spearman (no shield) | Heavy jog with spear at port | 8 frames. No flight in formation. | Both hands on shaft. Tip lag 2 frames. Torso steady. |
| Samurai (lamellar, light, katana) | Quick light run | 12 frames. Clear flight. | Sode lift on arm swing. Sword arm swings less. Hakama skirt sways. Lean 4–6°. |
| Ashigaru yari (light armour, long spear) | Controlled jog at port | 8–12 frames. Short flight. | Yari at port, both hands, arms not swinging. Feet close. Light armour bounce. |
| Ashigaru archer (yumi, light) | Light jog, bow carried | 12 frames. Short-medium flight. | Bow in left hand, free right arm swings. |
| Skeleton (undead) | Loping, stiff | 8 frames. Clean flight, shallow down. | Pelvis-led, locked knee at push-off, arms out of phase, elbows at 110–140°. |
| Ghoul (undead) | Bound on all fours | 8 frames. Bounce with arch. | Front arms reach, hind legs push. Spine arches. Head drops. |
| Zombie or shambler (undead) | Shamble | 8 frames. No flight. | Locked knees, arms out, head sway, short stride. |
| Mounted (any horse unit) | Canter or gallop for charge, trot for advance | Canter 3 beats. Gallop 4 beats, all four off. | See section 9. Rider posts on trot, leans forward in canter. |
| Routing (any unit) | Irregular run, stumble | Variable. Flight unstable. | Look back, arms flail, weapon dropped after a few cycles. |

---

## 12. Next steps for animators

1. Read Williams' *The Animator's Survival Kit* (run cycle chapter) for exact poses. The blogs above are secondhand.
2. Pull 3–5 CC0 run cycles to compare (section 13). The OpenGameArt results found so far include an 8-frame run ("Punk Run Animation") and a running man; confirm the licence on each page before committing any file.
3. Film or find real footage of running in armour, with a shield, and with a spear. The Jaquet/Leeds treadmill footage and the Askew paper are the best sources for armour. No shield-carriage running study was found.
4. Build the 12-frame base cycle for Templar sergeant first, then derive Samurai and Undead by changing the arm, lean and flight rules in section 11.
5. Render each cycle as a strip, play at 12 fps, and compare against a flight-phase checklist (section 10).

---

## 13. Source list

Biomechanics and armour
- Askew, Formenti & Minetti, *Limitations imposed by wearing armour on Medieval soldiers' locomotor performance*, Proc R Soc B 279:640–644 (2012, online 2011), DOI 10.1098/rspb.2011.0816. https://pmc.ncbi.nlm.nih.gov/articles/PMC3248716
- Smithsonian write-up on the Leeds/Jaquet study (knights running and walking in armour). https://www.smithsonianmag.com/smart-news/study-shows-knights-were-pretty-spry-their-suits-armor-180959699/
- Medievalists.net write-up of the Jaquet armour-mobility experiment (video-based). https://www.medievalists.net/2016/07/can-you-move-in-armour-an-experiment-in-mythbusting/
- Jaquet, *Historical Methods* (treadmill gait study, cited via Smithsonian). Journal page not fetched; see the Smithsonian link above.
- Schubert, Kempf & Heiderscheit, *Influence of stride frequency and length on running mechanics: a systematic review*, Sports Health 2014;6(3):210–7. https://pubmed.ncbi.nlm.nih.gov/24790690/
- University of Waikato research-course text on running COM, spring-mass model and stance/swing proportions. https://researchcommons.waikato.ac.nz/bitstreams/f8717547-b713-4d87-bfd7-2edc68f05139/download
- Sasaki & Neptune, ISB 2005 abstract on flight-phase vertical acceleration. https://media.isbweb.org/images/conf/2005/abstracts/0460.pdf
- Running biomechanics overview on flight phase and stance proportions (secondary, coaching-oriented). https://www.healthline.com/health/fitness/running-gait

Load carriage and running
- 2020 *Gait & Posture* study, load carriage and tibial stress-fracture variables in running. https://pubmed.ncbi.nlm.nih.gov/32058282/
- USARIEM technical report on backpack carriage and walking (stride frequency, double support). https://apps.dtic.mil/sti/tr/pdf/ADA394891.pdf
- Systematic review and meta-analysis of backpack carriage on walking biomechanics (Curtin). https://espace.curtin.edu.au/handle/20.500.11937/20483
- Weapon carriage and stride-time variability in treadmill load carriage (Sheffield Hallam). https://shura.shu.ac.uk/37910/
- Walsh & Low 2021, military load-carriage gait review. https://radar.brookes.ac.uk/radar/file/48e81c11-9b2d-4b2c-ac64-f32100d482c8/1/Military%20load%20carriage%20-%202021%20-%20Walsh%20Low.pdf
- Coventry University abstract on heavy-load soldier posture (trunk flexion under load). https://pureportal.coventry.ac.uk/en/publications/influence-of-carrying-heavy-loads-on-soldiers-posture-movements-a/
- Exeter 12 km load-carriage study PDF (not read in full, listed for follow-up). https://ore.exeter.ac.uk/repository/bitstream/10871/23971/1/12kmLoadCarriage.pdf

Animation references
- Richard Williams, *The Animator's Survival Kit* (book, not fetched). Secondhand descriptions: https://blogs.ulster.ac.uk/adambell/?p=443 , https://blogs.ulster.ac.uk/b00812104/2022/01/07/walk-run-and-mechanics-run-cycle , https://community.aseprite.org/t/still-learning-or-trying-to-learn-to-do-walking-animation/8291?page=2
- Muybridge, *Animal Locomotion* (Wikipedia overview, plate catalogue context). https://en.wikipedia.org/wiki/Animal_Locomotion
- Muybridge, *The Horse in Motion* (Wikipedia). https://en.wikipedia.org/wiki/The_Horse_in_Motion
- NGA, Muybridge plate 627, "Annie G." galloping. https://www.nga.gov/collection/art-object-page.167045.html
- NGA, Muybridge plate 622, "Smith" cantering. https://www.nga.gov/collection/art-object-page.167040.html
- Nelson-Atkins, Animal Locomotion plate 60 (running man, three rows). https://art.nelson-atkins.org/objects/56940/animal-locomotion-plate-60
- Horse gait overview (Wikipedia). https://en.wikipedia.org/wiki/Horse_gait

Samurai and ashigaru
- Ashigaru (Wikipedia). https://en.wikipedia.org/wiki/Ashigaru
- Total War wiki, Yari Ashigaru (game unit, not historical). https://wiki.totalwar.com/w/Yari_Ashigaru_(STW_unit)
- Osprey, *Ashigaru 1467–1649* (Turnbull & Gerrard), cited in search, not fetched. No link found in results.

CC0 sprite run cycles (OpenGameArt; check each licence page before use)
- Punk Run Animation, 8-frame run, CC0 (snippet). https://opengameart.org/content/punk-run-animation
- Running man, 8-frame walk-cycle collection, CC0 (snippet). https://opengameart.org/node/126823
- Pixel runner, pixel art, CC0 (snippet). https://opengameart.org/node/70700
- 8-direction runwalk sheet. https://opengameart.org/content/8d-runwalk-idle-sprite-sheet
- Mini Knight (Master484), CC0 walk cycle (snippet; licence wording inconsistent on the page). https://opengameart.org/content/mini-knight
- Knight spritesheet (marqueeplier), CC0 walk cycle (snippet). https://opengameart.org/content/knight-spritesheet

Gaps
- No shield-carriage running study found.
- No spear or yari running study found.
- No undead locomotion source found; section 8 is convention only.
- Joint angles in sections 1 and 3 are [G] approximations, not from a fetched study. Verify before locking.
