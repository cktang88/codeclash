# Weapon attack motions: research notes for animators

Date: 2026-11-03. Scope: real-world attack mechanics for every unit weapon in the Templar, Samurai and Undead factions, plus animator-facing frame guidance.

## How to read this file

- **[src]** = taken from a page we actually opened or a search snippet that names the point. Source URLs are listed per weapon.
- **[est]** = animator estimate. Joint angles, frame counts and timing ratios are NOT in the sources we found. They are reasoned from the mechanics described in the sources and from general martial and archery practice. Check them against video before locking any frame data.
- **[adapt]** = a creative but plausible adaptation for an undead unit that has no direct historical counterpart.
- Joint-angle convention used throughout:
  - **Shoulder**: upper-arm elevation from the torso. 0 = arm hangs at side, 90 = horizontal forward, 180 = straight overhead.
  - **Elbow**: flexion. 0 = straight, 90 = right angle, 150+ = tightly folded.
  - **Torso twist**: rotation of the shoulder line toward the target. Positive = chest faces the target.
  - **Lean**: forward tilt of the trunk from vertical.
- Timing ratios are shown as anticipation / strike / follow-through (A/S/F). Percentages are of the total action time.
- Most unit attacks are a 6–10 frame loop at game speed. The frame maps below assume an 8-frame loop unless stated.

## Source quality warning

Much of the freely available material is HEMA forum posts, reenactor threads and retailer pages. Where we could, we used museum pages, Wikipedia, ZNKR/iai instructional material, and primary manuscript pages. Several points are still unverified:

- Talhoffer's exact spear hand placements from a shield wall.
- Kyudo stage details beyond the Wikipedia list.
- The grip on kesagiri specifically.
- Any sourced timing for pilum, crossbow reload, or trebuchet release beyond the mechanics.

Those gaps are flagged inline. Verify them before a production sprint.

---

## Templar faction

### T1. Sergeant-Brothers: arming sword + heater/kite shield

**Grip**
- Sword: one-handed, right hand. Hilt in a full fist with the crossguard against the index-finger knuckle. Thumb along the ricasso or flat of the grip [est].
- Shield: left arm through the enarmes (inner strap), grip on the back bar. Shield held close, top edge at eye or brow height, lower edge at knee [src: general HEMA shield practice, est in detail].

**Stance and footwork**
- Shield-side (left) foot leads. Body is angled about 45° to the opponent, so the shield covers the chest and the sword arm is tucked behind the shield edge [est].
- Feet about shoulder width. Weight sits low, roughly 60/40 forward. Knees bent [est].
- Footwork (Fiore-style): step through with the lead foot, drag the rear foot to close. Passare/tornare terms name the step-through and turn, per Windsor's footwork vocabulary [src].
- In the Fiore guard family, the middle iron gate (meçana porta de fero) answers an inbound thrust with a parry and a counter-thrust without moving the feet [src: AEMMA Fiore page].

**Key poses: cut (forehand from the right shoulder)**
1. **P1 Chamber (anticipation)**: right arm raised, elbow about 110° flexion, upper arm shoulder elevation about 120°, blade pointing back and up over the right shoulder. Torso twist about −25° (away from target). Lean about 5°. Left (shield) foot leads, shield up.
2. **P2 Strike**: upper arm drops to about 60° elevation and the elbow extends toward 60° flexion as the cut comes down diagonally. Torso twist swings toward +20° over a short arc. Right foot steps through, body lean rises to about 15°.
3. **P3 Contact / extension**: arm nearly straight (elbow 20–30°), shoulder elevation about 40°, blade edge crosses target line. Torso twist about +30°. Shield stays on the chest.
4. **P4 Recovery**: arm returns to guard, elbow about 90°, sword tip down-left. Torso returns to about +5°.

**Key poses: thrust (from the guard, shield high)**
1. **P1**: sword hand at hip or upper chest, elbow about 100°, shield top edge at eye height. Torso twist about −10°.
2. **P2 Strike**: elbow extends to about 170° as the sword drives forward. Shoulder elevation about 70° (arm in line with the sword). Torso twist about +25°. Lean about 15°. Lead foot steps forward.
3. **P3 Contact**: arm locked, shoulder about 75°, point at chest height. Shield pushes forward slightly to keep distance.
4. **P4 Recovery**: elbow back to about 100°. Sword returns to the guard.

**Timing (thrust, A/S/F)**: 35 / 15 / 50 [est]. The follow-through includes a shield bind or push that is part of the attack.

**Loop emphasis (8 frames)**
- F1–2: shield stays up, sword arm draws back. Make the shield visually anchor the chest.
- F3: sword leaves the guard, lead foot starts moving.
- F4: full extension. This is the readable frame.
- F5: contact hold (1 frame).
- F6–8: return to guard, shield does not drop.
- Keep the shield in the same screen position throughout. It should read as "shield in front."

**Common mistakes**
- Shield drops during the cut. The shield should never move below the chest during the strike.
- Sword swings from the elbow only. Use the torso and back foot.
- Thrust that retracts too far before extending, which reads as a sword swing.
- Both feet square to the enemy. Body should angle about 45°.
- Cut that starts from the hip. The chamber should be high, over the shoulder.

**Sources**
- Gladius (stab-first doctrine, shield leads, thrust at stomach height): https://en.wikipedia.org/wiki/Gladius [src]
- Fiore middle iron gate (parry + counter-thrust): https://aemma.org/onlineResources/liberi/liberi4_body.htm [src]
- Fiore guard progression: https://www.academieduello.com/learn/resources/wiki/fiore-poste-progression [src, seen in search]
- Footwork terms and 3-turns research: https://guywindsor.net/2024/03/fiore-dei-liberi-footwork-revisited/ [src, seen in search]

### T2. Spear Levy: spear + shield, shield-wall thrusts

**Grip**
- Two-handed on the spear. Overarm grip: right hand near the balance point, left hand forward on the shaft, roughly two forearm lengths apart [src: spear grip snippet, thearma.org/forum thread, weak].
- Underarm grip: right hand at the balance point, thumb on top of the haft, shaft held roughly at shoulder height [src, forum snippet, weak].
- Overhand and underhand grips alternated depending on position in the formation [src, search snippet].
- Shield on the left arm, as in T1.

**Stance and footwork**
- In the wall, feet are shoulder-width or a little narrower, body square to the front. Left shield forward [est].
- Spear is held in front, point at face or chest height of the enemy. The left hand is forward and pushes the shaft.
- Front rank steps forward into the thrust. Rear ranks do not step, they thrust over shoulders [est].

**Key poses: overhand thrust (point down from above)**
1. **P1 Guard**: spear angled up, butt near the right hip, left hand forward at chest height. Shoulder elevation about 70° (arm forward). Elbow about 95°. Torso twist about −10°.
2. **P2 Strike**: right elbow extends from about 95° to 160° as the spear drives forward and slightly down. Left hand pushes forward. Torso twist +20°. Lean about 10°. Left (shield-side) foot leads.
3. **P3 Contact**: spear straight, elbows near 175°. Shoulder about 85°. Point is at neck-to-chest height on the enemy. Torso twist +25°.
4. **P4 Recovery**: right hand draws the spear back to the hip, elbow about 100°. Left hand stays on the shaft.

**Key poses: underhand thrust (point rising from the hip)**
1. **P1**: spear low, butt behind the right hip, point at knee height. Elbow about 80°. Torso twist about −5°.
2. **P2 Strike**: right hand drives forward and up, shoulder about 30°, elbow extends to about 150°. Point rises toward the abdomen or groin. Torso twist +15°.
3. **P3 Contact**: arm nearly straight, point at belly height. Lean about 10°.
4. **P4 Recovery**: point drops back to the hip. Shield stays up.

**Timing (overhand, A/S/F)**: 30 / 20 / 50 [est]. Thrust is fast, the recovery is the longer part because the spear must be reset for the next thrust.

**Loop emphasis (8 frames)**
- The thrust must read as a straight line, not an arc. Keep the spear tip on a line from the body to the target.
- F1–2: short chamber. F3–4: fast straight extension. F5: contact. F6–8: reset.
- Show the shield wall: adjacent figures overlap. Keep the shield in the frame for the whole action.

**Common mistakes**
- Spear swings in an arc like a sword. The tip must travel in a straight line.
- Thrust starts from the shoulder instead of the hip for underhand. Underhand is hip-to-belly.
- Rear-rank thrusts drawn as full-body lunges. Rear ranks thrust with the arm only.
- Spear point drifts off target during the thrust.
- Front-rank thrust is sometimes drawn as a step-lunge without the shield pushing forward.

**Sources**
- Spear grip overarm and underarm, shield-wall gaps: https://www.romanarmytalk.com/rat/showthread.php?tid=22319 [src, forum, weak] and https://tastesofhistory.co.uk/post/about-history-the-spear-part-two [src, search snippet]
- Manciolino high guard (partisan at forehead height, point in line): https://www.romanarmytalk.com/rat/showthread.php?tid=22319 [src, forum, cites Manciolino]
- Fiore spear material (point off line, place yourself so the opponent's point misses): https://www.hroarr.com/manuals/fiore/omsg_lanza.pdf [seen in search, not opened]
- Talhoffer spear plates: https://thearma.org/forum/viewtopic.php?p=6676 [src, search snippet, unverified hand positions]

### T3. Javelin Men: javelin (pilum-style) throw

**Grip**
- Throwing hand grips the shaft behind the balance point, palm roughly up or sideways for the draw-back [src, forum, weak].
- Non-throwing hand is free for balance during the approach.

**Stance and footwork**
- Approach is short, not a track-and-field run. Sources disagree: some describe three or four long steps, some describe a single step-and-throw [src, forum posts, disagree].
- The model used in the Karwansaray analysis is a charge at set speed with a 45° ideal throw arc [src].

**Key poses**
1. **P1 Draw-back**: throwing arm pulled back, palm up. Forum sources say the tip is roughly level with the eyes and the back arches in a C-shape, with the shoulders nearly parallel to the shaft [src, forum]. Shoulder elevation about 150°, elbow about 100°. Torso twist about −40°, lean about −5° (leaning back into the throw).
2. **P2 Strike (heave)**: arm whips forward, shoulder about 120° elevation, elbow extending to about 30°. Torso rotates rapidly from −40° to +30°. Non-throwing arm pulls back across the chest. Front (opposite) foot plants. Lean about 15°.
3. **P3 Release**: arm nearly straight, shoulder about 100°, elbow about 5°. Release at around 45° arc [src, Karwansaray model].
4. **P4 Follow-through**: throwing arm continues across the body, body rotates through, rear foot pivots. Torso twist about +70°.

**Timing (A/S/F)**: 45 / 10 / 45 [est]. The throw itself is short. The draw-back and follow-through carry the weight.

**Loop emphasis (8 frames)**
- F1–3: wind-up, torso coiled. Show the back arch.
- F4: release (1 frame, very fast).
- F5–8: follow-through and recover. Do not cut the follow-through, the body must rotate.
- Sell the release frame with the javelin leaving the hand (a separate thrown sprite or a single frame in the hand is enough).

**Common mistakes**
- Throw drawn with an overhand chop like a hammer. The motion is a whipping arc with torso rotation.
- No torso rotation; arm only.
- Release point too early or too late. The release should be near full arm extension.
- Standing still during the throw. Use the opposite foot as a plant.
- Javelin does not leave the hand, or disappears before the release frame.

**Sources**
- Pilum draw-back, torso heave and arm mechanics: https://www.romanarmytalk.com/rat/showthread.php?tid=4955 [src, forum, weak]
- Pilum charge model and 45° throw arc: https://karwansaraypublishers.com/gb_army/model-of-the-charge [src, model]
- Pilum short-range volley and short approach: https://romanarmytalk.com/rat/showthread.php?tid=7552 [src, forum, not opened]

### T4. Pilgrim Archers: longbow / self bow, draw-loose

**Grip**
- Bow hand: holds the grip at the middle of the bow (handle), fingers wrapped, back of the hand toward the target [src: general longbow practice].
- Draw hand: three-finger draw on the string, fingers hooked below the nock [src].

**Stance and footwork**
- Feet about shoulder width, slightly open to the target. Body square to the target with the bow arm forward [est].
- Weight stays even. No lunge.

**Key poses**
1. **P1 Nock and raise**: bow raised to shoulder-to-face height, draw hand at the chest, nocking hand near the hip. Shoulder about 60°, elbow about 90°.
2. **P2 Draw**: draw hand pulls the string back toward the anchor. The bow arm pushes out and is almost locked. Bow-arm shoulder about 80°, elbow about 170° (near straight). Draw elbow comes back level with the shoulder line, shoulder elevation about 80°, elbow about 60°.
3. **P3 Anchor (full draw)**: draw hand at the cheek or mouth corner. Shoulder elevation about 85°, elbow about 60°. Torso twist about 0°. The longbow archers pulled to about 30-inch draw on Mary Rose-type bows [src: Wikipedia English longbow].
4. **P4 Release**: fingers relax, draw hand flies back, elbow opens to about 110°. Bow arm holds its position.
5. **P5 Follow-through / recover**: draw hand comes back to the cheek then drops to the side.

**Timing (draw-loose, A/S/F)**: 40 / 15 / 45 [est]. The hold at anchor is part of the anticipation.

**Loop emphasis (8 frames)**
- F1–3: raise and draw.
- F4: full anchor hold (show it for a frame, it is the readable pose).
- F5: release, the bowstring snaps forward, arrow leaves.
- F6–8: follow-through with the draw hand back at the cheek, then relax.

**Common mistakes**
- Bow shoulder collapses during the draw.
- Draw hand comes to the ear instead of the cheek or mouth.
- No anchor hold; the release is instant.
- Bow held upright, or pointed at the floor.
- Arrow drawn on the wrong side of the bow.

**Sources**
- English longbow draw weight and 30-inch draw (Mary Rose estimates): https://en.wikipedia.org/wiki/English_longbow [src]
- Anchor point and finger draw: https://historyrise.com/article/the-techniques-of-shooting-and-shooting-accuracy-for-english-longbowmen/ [src, weak]
- Mary Rose bow study (Abigail Parkes thesis, Southampton): https://eprints.soton.ac.uk/500151/1/2025.04.21_AccessibleThesisFINAL.pdf [src, not opened, best next source]

### T5. Genoese Crossbows: aim, shoot, span and reload

**Grip**
- Crossbow held at the stock with the front hand under the stock or the forestock. Cheek to the stock when aiming.
- Stirrup: at the front of the bow, foot placed through it when spanning.
- Belt hook: a claw-like hook attached to the belt, catches the string [src, British Museum drawing and Britannica snippet].

**Stance and footwork**
- Aim: standing, feet shoulder width, body turned so the crossbow is forward. Pavise shield planted in front for protection [src, search snippet, weak].
- Spanning (belt hook): the crossbowman sets the stirrup on the ground, steps into it, hooks the string to the belt hanger, then stands up to draw the string to the nut [src, museum drawings].

**Key poses**
1. **P1 Aim (ready)**: crossbow at shoulder, cheek on stock, both arms extended. Front arm shoulder about 70°, elbow about 170°. Torso square. Lean about 5°.
2. **P2 Fire**: trigger pulled, bolt leaves. Crossbow kicks back into the shoulder. Shoulder elevation about 70°, bow kick slight upward.
3. **P3 Span (belt hook)**: crossbow dropped to the floor, front foot in stirrup. Torso bent forward about 45° lean, both hands on the bow. Belt hook engaged. Shoulder about 20°, elbow about 60°.
4. **P4 Stand and draw**: legs straighten, body rises, hands pull the string to the nut. Lean goes from 45° to 0°, shoulder about 60°.
5. **P5 Load**: bolt set in the groove, crossbow raised back to aim.

**Cranequin (for the Genoese, and for later heavy crossbows)**: the crank handle is turned from a standing or crouched position. The Met's 1562 example is described as squat-and-stand to engage the nut [src, Met search snippet]. Crank rotation has no sourced timing.

**Timing (fire and reload, A/S/F)**: aim 40 / fire 10 / reload 50 [est]. The reload is the long part of the action.

**Loop emphasis (8 frames)**
- Make the fire recoil the strongest frame.
- The span should read as a full-body push, not just arms. Show the stirrup foot.
- F1–2: aim. F3: fire. F4–8: reload loop (bend, hook, stand, draw, set bolt).
- Reload can be an 8-frame loop by itself if the aim-to-fire is a separate state.

**Common mistakes**
- Crossbow fired and spanned in one motion. There must be a visible reload.
- Stirrup foot not shown, the reload looks like it's done by hand alone.
- Bow kick missing on fire.
- Cranequin drawn as a hand crank with no body involvement.
- Belt hook drawn on the chest instead of the belt.

**Sources**
- Belt hook and stirrup sequence (British Museum drawing, Britannica, Michigan Reid quote): https://www.britishmuseum.org/collection/object/P_1848-1013-128 [src, museum]
- Cranequin, 16th century, squat-and-stand, Met 1562: https://www.metmuseum.org/art/collection/search/33739 [src, museum, seen in search]
- Cranequin at Fitzwilliam: https://fitzmuseum.cam.ac.uk/explore-our-collection/highlights/HENM4111933 [src, museum]
- Crossbow spanning methods (belt hook, cranequin, windlass) and rolling-nut trigger: https://en.wikipedia.org/wiki/Crossbow [src, fetched]
- Mechanically spanned arbalests firing about 2 bolts per minute versus 12+ for a skilled archer: https://en.wikipedia.org/wiki/Crossbow [src, fetched]
- Shield planted, step behind to span, step out to fire: https://historyrise.com/article/the-evolution-of-crossbow-mechanisms-from-thumb-draw-to-windlass/ [src, weak, unverified]

**Dating caveat**: the belt-hook date varies across sources (10th century to about 1200). Do not put a date on it in-game.

### T6. Turcopoles: light cavalry with lance or spear

**Grip**
- Lance held in one hand, shaft braced under the arm or at the hip [est, the couched lance sources (T9) describe the same bracing].
- Reins in the other hand.

**Stance and footwork**
- Seat is light and mobile. Knees grip the horse. No stirrup lock [est].

**Key poses (mounted lance thrust)**
1. **P1 Raised / rest**: lance upright or at a slight forward angle, butt near the thigh. Shoulder about 90°, elbow about 150°.
2. **P2 Lower**: lance comes down to the level of the rider's arm, point at the target. Shoulder about 60°, elbow about 130°. Torso lean about 20°.
3. **P3 Contact**: arm braced, shoulder about 70°, elbow about 170°, lance pressed forward. Torso twist about +10°.
4. **P4 Recover**: lance withdrawn, elbow returns to about 100°.

**Timing**: 35 / 20 / 45 [est].

**Loop emphasis**: the lance drop (P1 to P2) is the readable beat. Keep the horse's gallop cycle in step with the lance.

**Common mistakes**: lance drawn as a sword swing; no bracing under the arm; the horse does not move with the lance.

**Source**: [src] for the general lance-bracing principles from the couched lance sources (T9). The specifics above are [est].

### T7. Turcopole Archers: horse archer, composite bow

**Grip**
- Bow held in the left hand at the grip, bow sits at the left side of the horse. Draw hand pulls the string to the cheek or near the ear [est].

**Stance and footwork**
- Riding stance. Rider's torso twists to face the target while the horse is still moving [est].

**Key poses**
1. **P1 Nock**: bow at the left, draw hand at the quiver. Torso twist about −20°.
2. **P2 Draw**: draw hand to the cheek or ear. Shoulder about 85°, elbow about 60°. Torso twist about +40°. Rider leans back slightly.
3. **P3 Anchor**: full draw hold at the cheek. Torso fully turned to target.
4. **P4 Loose**: fingers release. Draw hand flies back.
5. **P5 Recover**: bow arm lowers, torso faces forward.

**Timing**: 40 / 15 / 45 [est].

**Loop emphasis**: torso twist is the most important part. The bow must read as held in the left hand, drawn to the right.

**Common mistakes**: the draw is done from the front, not the side; torso does not twist; bow is drawn to the chest.

**Adaptation analogy**: the yabusame sources (see S5) describe a bow held in the left hand and moved across the horse's neck to aim to the right. Use that as the reference for the torso and bow-arm geometry. The composite bow itself is not described in our sources. Check a composite bow reference before final art.

**Sources**
- Yabusame metesugai (bow over horse's neck, body twist, left-hand bow): https://en.wikipedia.org/wiki/Yabusame [src]
- Yabusame official notes: https://yabusame.or.jp/english/on-yabusame [src, not opened]

### T8. Knight-Brothers: couched lance charge, then sword

**Grip**
- Lance held in one hand, shaft tucked under the armpit, butt resting in the saddle or on a fixed hip. Other hand steers the horse [src: Wikipedia Lance, medievalists.net snippet].
- Lance rest on the armour and a grapper (leather ring behind the hand) are used on later lances to stabilise the couched position [src].

**Stance and footwork**
- Rider sits deep in the saddle, legs locked against the horse [est].
- The knight stages the lance from upright, with the butt between thigh and saddle, into the charge position. Weight carried by palm, underarm and chest, not the point [src: commentary on a 15th-century text, secondary].

**Key poses (charge)**
1. **P1 Upright / rest**: lance vertical or 45°, butt at the thigh. Shoulder about 100°, elbow about 110°.
2. **P2 Couch**: lance lowered under the arm to horizontal. Shoulder about 60°, elbow about 150°, lance tucked. Torso twist about 0°, lean about 15°.
3. **P3 Impact**: arm braced, shoulder about 80°, elbow about 175°. Chest pushed forward into the lance. Torso twist about +10°.
4. **P4 Sword phase** (after the lance is lost or broken): arm changes to a forehand cut, shoulder about 130°, elbow about 90°.

**Timing (couch, A/S/F)**: 40 / 15 / 45 [est]. The charge is held for a long time in anticipation.

**Loop emphasis**: the couch position must be unmistakably under the arm. The lance is the central silhouette.

**Common mistakes**: lance held out in front like a spear with no armpit bracing; lance point too low; horse and lance animated separately with no shared weight.

**Source**: https://en.wikipedia.org/wiki/Lance [src] and https://www.medievalists.net/2022/11/lance/ [src, snippet]. Biomechanics [est].

### T9. Iron Brethren: heavy foot, two-handed sword and mace/axe (pick one, both described)

**Option A: two-handed sword (longsword)**

*Grip*
- Two hands, one above the other, roughly a forearm apart. Right hand (rear) at the pommel-side of the grip, left hand (forward) at the crossguard side [src: general longsword practice; Fiore].
- Hands sit on the grip, not spaced out to the pommel.

*Stance and footwork*
- Feet staggered, lead foot forward. Blade guards: the Zornhut (wrath guard) starts with the sword held at the right shoulder, left foot forward [src: Wiktenauer Zornhaw, Meyer].
- Fiore footwork: step through with the lead foot, rear foot drags [src: Windsor].

*Key poses: Zornhau (wrath cut)*
- Target: the opponent's left ear, face or chest [src: Meyer quote, Wiktenauer].
1. **P1 Guard (Zornhut)**: sword at the right shoulder, blade back. Right shoulder elevation about 140°, elbow about 60°. Torso twist about −15°.
2. **P2 Strike**: sword comes down diagonally from the right shoulder. Shoulder drops to about 70°, elbow extends to about 120°. Torso twists to +30°. Right foot steps through, lean about 15°.
3. **P3 Contact**: arms extended, shoulder about 60°, elbow about 150°. Blade crosses the target line. Torso +40°.
4. **P4 Recovery**: sword returns to guard, or to the next line. Shoulder rises to about 100°.

*Timing (Zornhau, A/S/F)*: 35 / 15 / 50 [est].

*Loop emphasis*: the cut needs the body weight. Show the lead foot step at the strike frame.

*Common mistakes*: cut from the elbow only; no step; blade waves instead of cutting on a line; grip one-handed.

*Sources*: https://wiktenauer.com/wiki/Zornhaw [src, fetched]; https://thearma.org/essays/Talhoffer/HT-Web.htm [src, search snippet, unverified plate detail]. Krumphau is contested and unverified in our sources.

**Option B: mace or axe (heavy one-handed or two-handed)**

*Grip*
- Two-handed axe or mace: hands at the butt and about 40 cm up the haft, hands together [est].

*Stance*
- Front foot forward, weight over the back foot to start the wind-up.

*Key poses*
1. **P1 Raise**: axe raised overhead, both arms extended. Shoulder about 160°, elbow about 60°. Torso lean back about 10°.
2. **P2 Strike**: axe falls. Shoulder about 90°, elbow about 150°. Torso swings forward, lean +25°. Front foot steps in.
3. **P3 Contact**: arms straight. Shoulder about 70°, elbow about 175°.
4. **P4 Recovery**: head lifts, axe returns.

*Timing*: 50 / 10 / 40 [est]. Heavy weapons have long anticipation and long follow-through.

*Source*: Maciejowski Bible rider with a large war axe, Arma description [src]: https://thearma.org/arttalk/at42.htm. Morgan facsimile: https://www.themorgan.org/collection/Crusader-Bible [src, not read for folio].

*Loop emphasis (8 frames)*: the raise must be long and visible. Overhead beat-down with weight.

*Common mistakes*: axe swung from the shoulder only; no weight shift; no follow-through.

### T10. Mangonel crew: trebuchet-style siege engine (operations)

**Note**: our sources cover the trebuchet and crew mechanics well. The mangonel (torsion/tension arm engine) is not separately described in what we opened, so mangonel-specific details are [est]. Use trebuchet sources for the release logic.

**Roles and crew**
- Traction trebuchet: crew of about 4–20 pulling ropes on command. Coordinating many pullers is difficult, but reloading is fast [src: Wikipedia Trebuchet].
- Counterweight trebuchet: about 10 operators, plus winch or treadwheel crew to raise the counterweight. Reloading is much slower [src].
- Magister tormentorum reassembled trebuchets after transport [src].

**Firing sequence (trebuchet release, counterweight design)**
1. **P1 Set**: arm pulled down and held at the ground, counterweight raised. Crew at winch or treadwheel.
2. **P2 Release command**: counterweight released, beam begins to rotate. Arm rises through about 180°.
3. **P3 Sling release**: sling swings about 360° and faster than the beam. The sling release point is the main range control [src].
4. **P4 Follow-through**: arm keeps rotating, then slows on its own [src].

For the mangonel (torsion/tension arm engine), the wind-up is the crew cranking the arm back. Release is the arm stopping against a crossbar.

**Timing (release, A/S/F)**: 60 / 10 / 30 [est]. Winding the arm back is the long part. Release is fast.

**Loop emphasis**
- Arm is the main silhouette. Show the counterweight drop as a separate beat.
- Crew should read as several people, not one.
- Keep the arm rotation smooth. Ease in at the start of the release, ease out at the end.

**Common mistakes**
- Arm moves through the release in a straight line. It is a rotation with a long arc.
- No crew shown at the winch or treadwheel.
- Projectile leaves the sling before the arm stops.

**Sources**
- Trebuchet mechanics, traction vs counterweight, crew roles: https://en.wikipedia.org/wiki/Trebuchet [src, fetched]

---

## Samurai faction

### S1. Katana Samurai: two-handed katana (kesagiri, shomen, tsuki, kamae)

**Grip (two-handed)**
- Right hand near the tsuba (guard), left hand at the bottom of the grip near the pommel (kashira). Hands roughly a fist apart, left pinky sits near the end [est, standard katana practice].
- The sword is held with both hands in the full two-handed grip for the cut.

**Stance and footwork**
- Starting guard: hasso no kamae (sword held at the right side, point up, blade toward the sky). Used for seitei drawing practice [src: ZNKR seitei summary].
- Kesagiri setup: raise to jodan no kamae, draw the left foot behind the right [src: ZNKR summary].
- Body opens about 30° to the left of the shomen line for the descending kesa cut [src: ZNKR instructional considerations].
- Face stays toward the front [src].

**Key poses: kesagiri (diagonal cut, 1 o'clock to 7 o'clock)**
- Cut angle: from 1 o'clock (upper right) to 7 o'clock (lower left) [src: ZNKR].
1. **P1 Jodan (raised)**: sword up behind the head, blade angled back. Shoulder about 165°, elbow about 60°. Torso twist about −10°, lean about 0°.
2. **P2 Strike**: sword comes down along the diagonal. Shoulder elevation drops to about 100°, elbow extends to about 130°. Torso twists to about +35°. Left foot steps forward, lean about 15°.
3. **P3 Contact**: arms extended. Shoulder about 70°, elbow about 165°. Blade crosses the target from upper right to lower left. Torso +40°.
4. **P4 Recovery**: sword returns to guard. Shoulder back to about 90°.

**Key poses: shomen (straight overhead cut)**
1. **P1 Jodan**: same as kesagiri.
2. **P2 Strike**: sword falls in a straight line, shoulder about 90°, elbow extends to about 140°. Torso twist about 0°, lean about 20°. Front foot steps.
3. **P3 Contact**: arms straight. Shoulder about 60°, elbow about 170°.
4. **P4 Recovery**: sword lifts back to the guard.

**Key poses: tsuki (thrust)**
1. **P1 Chudan (middle guard)**: point at the enemy's throat, elbows bent about 100°. Shoulder about 70°.
2. **P2 Thrust**: lead foot steps, sword drives straight forward. Elbow extends to about 170°, shoulder about 85°. Torso +20°, lean about 15°.
3. **P3 Contact**: arms locked, point on the line.
4. **P4 Recovery**: sword pulls back to chudan, elbow about 100°.

**Timing (kesagiri, A/S/F)**: 40 / 20 / 40 [est]. The cut must be clean; the recovery is the readable reset.

**Loop emphasis (8 frames)**
- F1–3: jodan hold, foot draws back.
- F4: cut begins with the lead foot step.
- F5: contact (blade on the diagonal).
- F6–8: return to guard.
- Shomen and kesagiri should look different: shomen is a straight vertical line, kesagiri is diagonal.

**Common mistakes**
- Katana swung one-handed in a two-handed attack.
- Kesagiri drawn as a shomen (straight down).
- Blade not crossing the target line.
- No foot step; the cut is arms only.
- Body square to the target in the cut (body should open about 30°).

**Sources**
- Kesagiri anatomy and grip notes: https://shinkanryu.org/kesagiri-anatomy-of-a-sword-strike [src, 404 on fetch, not read; do not cite grip details from it]
- ZNKR seitei kesagiri, 1 o'clock to 7 o'clock, 30° open: https://www.akban.org/wiki/Seitei_gata_-_Kesagiri_袈裟切り [src, seen in search]
- ZNKR Seitei gata summary: https://kampaibudokai.org/Seiteigata.htm [src, seen in search]
- ZNKR iai instructional considerations (PDF): https://kendoargentina.org/wp-content/uploads/2025/04/ZNKR-Iai-Instructional-Considerations-2024-ENG.pdf [src, not opened]

**Gap**: our sources do not describe the grip for kesagiri specifically. Confirm with a seitei video.

### S2. Yari Ashigaru: yari thrust in ranks, plus overhead beating with nagae yari

**Grip**
- Two-handed. Rear hand grips at the hip or side at full extension. This gives force transfer in the thrust and control in recovery [src: Owari Kan Ryu material, later school, indirect evidence].
- Front hand forward on the shaft, about an arm's length from the rear.

**Stance and footwork**
- Ranks stand in a line, feet shoulder width, body square to the front [est].
- Front rank steps into the thrust. Rear ranks thrust over shoulders and do not step [est].
- Infantry use: the yari was the main infantry thrusting weapon, used in formations, and in duels it could also strike with the shaft or cut [src: yari overview, lightinthecloudsblog].

**Key poses: thrust (chudan)**
1. **P1 Guard**: rear hand at the hip, front hand at chest height, point at the enemy's chest. Shoulder about 60°, elbow about 100°. Torso twist about −5°.
2. **P2 Strike**: front hand pushes forward, rear hand drives the butt forward. Elbows extend to about 160°. Shoulder about 80°. Torso +15°. Front foot steps.
3. **P3 Contact**: arms straight, point at chest height. Torso +20°. Lean about 15°.
4. **P4 Recovery**: rear hand pulls the shaft back to the hip, front hand keeps the grip. Elbow about 90°.

**Key poses: overhead beat (nagae yari)**
1. **P1 Raise**: spear lifted to the shoulder. Shoulder about 150°, elbow about 70°.
2. **P2 Strike**: spear comes down in an arc. Shoulder about 90°, elbow extends to about 130°. Torso lean +15°.
3. **P3 Contact**: shaft hits the target. Elbow about 150°.
4. **P4 Recovery**: back to the guard.

*The overhead beat is [est], not from our sources.*

**Timing (thrust, A/S/F)**: 30 / 20 / 50 [est].

**Loop emphasis (8 frames)**
- The thrust is a straight line. The yari point should read as the leading shape.
- F1–2: guard hold. F3–4: extension. F5: contact. F6–8: recovery with the rear hand drawing the shaft back.
- Ranks: the rear-rank thrust is shorter than the front-rank thrust.

**Common mistakes**
- Yari swung like a sword.
- Thrust with one hand.
- Rear hand not at the hip.
- Ranks animated as single figures with no spacing.
- Overhead beat drawn as a thrust.

**Sources**
- Owari Kan Ryu yari (sliding yari, rear-hand grip, thrust and pull-back): https://koryu.com/library/harmstrong1 [src, later school]
- Yari overview, infantry use, formation support: https://lightinthecloudsblog.com/2016/04/13/yari-the-rise-and-fall-of-the-japanese-spear/ [src, search snippet, blog]
- Sojutsu overview: https://en.wikipedia.org/wiki/S%C5%8Djutsu [src, not opened]

### S3. Nage-yari Skirmishers: thrown short spear

**Grip**
- One-handed throw. Hand grips the spear behind the balance point [est].

**Stance and footwork**
- Skirmisher stands in a half-turned stance, throwing arm back, opposite foot forward [est].
- Short approach: one or two steps before the throw [est].

**Key poses (throw)**
1. **P1 Draw-back**: arm drawn back behind the head. Shoulder about 150°, elbow about 100°. Torso twist about −45°, lean about −5°.
2. **P2 Heave**: arm whips forward, shoulder about 120°, elbow extends to about 30°. Torso rotates rapidly to +30°. Opposite (front) foot plants. Lean +15°.
3. **P3 Release**: arm nearly straight at release, shoulder about 100°, elbow about 5°. Release at about 45° arc [est, using the javelin model in T3].
4. **P4 Follow-through**: throwing arm continues across the body, torso rotates through. Torso +70°.

**Timing**: 45 / 10 / 45 [est]. Same as T3.

**Loop emphasis**: the release frame. Show the spear leaving the hand in a separate frame.

**Common mistakes**: thrown like a sword; no torso rotation; spear does not leave the hand.

**Sources**: javelin mechanics as T3 (https://www.romanarmytalk.com/rat/showthread.php?tid=4955, https://karwansaraypublishers.com/gb_army/model-of-the-charge). No Japanese nage-yari technique source found in this run. Treat the motion as an analogy [est].

### S4. Yumi Ashigaru: asymmetric bow, hassetsu, loose

**Grip**
- Bow: asymmetric yumi, grip sits at the lower third of the bow. Left hand grips the bow at the grip [src: Wikipedia Kyudo, yumi asymmetric, and yabusame snippet on the daikyu].
- Draw hand: thumb-hooked draw (torikake) on the string, drawn to behind the ear [src: Wikipedia Kyudo].

**Stance and footwork**
- Ashibumi: step onto the line, turn to the target, feet about one yazuka apart in a 60° V [src: Wikipedia Kyudo, shomen-style].
- Dozukuri: straighten the back and posture, shoulders and feet form a straight line [src].

**Hassetsu (eight stages, from Wikipedia Kyudo)**
1. **Ashibumi (footing)**
2. **Dozukuri (body forming)**
3. **Yugamae (bow readying)**: right hand grips the string (torikake), left hand on the grip (tenouchi), head turns to look at the target (monomi).
4. **Uchiokoshi (raising)**: bow raised overhead.
5. **Hikiwake (drawing apart)**: bow lowers while arms spread. Left hand pushes the bow out, right hand draws the string. Midpoint is daisan (the "big three" point, about the top of the chest).
6. **Kai (full draw)**: right hand held behind the ear. Arrow sits below the cheekbone or level with the mouth. Includes tsumeai and nobiai.
7. **Hanare (release)**: right hand releases the string, right arm extends behind the archer.
8. **Zanshin (continuation)**: hold the post-release position, then lower the bow (yudaoshi).

**Key poses (animator mapping)**
1. **P1 Yugamae**: bow at the left, string at the right. Left shoulder about 60°, elbow about 150°. Torso twist about −5°.
2. **P2 Uchiokoshi**: bow lifted overhead. Left shoulder about 150°, elbow about 150°. Right shoulder about 80°, elbow about 60°.
3. **P3 Kai (full draw)**: bow arm extended forward, shoulder about 80°, elbow about 170°. Draw hand at the ear, elbow about 90°. Torso twist about 0°. Lean about 5°.
4. **P4 Hanare**: draw hand flies back, elbow opens to about 120°. Bow arm holds.
5. **P5 Zanshin**: hold position, then bow lowers.

**Timing (hassetsu, A/S/F)**: 55 / 10 / 35 [est]. Kyudo is slow and ritualised, so the anticipation is long. The full draw at kai is a held pose.

**Loop emphasis (8 frames)**
- F1–3: raise (uchiokoshi) and draw (hikiwake).
- F4: kai hold, show the anchor at the ear and the arrow at the cheek.
- F5: release. Arrow leaves the bow.
- F6–8: zanshin hold and bow lowers.
- Show the asymmetry: bow is taller than the archer's head. Draw hand is high, bow arm is extended.

**Common mistakes**
- Bow drawn symmetrically (like a Western bow). Yumi is asymmetric.
- Draw to the chest rather than the ear.
- No zanshin hold after release.
- Arrow drawn on the wrong side.
- Bow held vertical instead of tilted.

**Sources**
- Kyudo hassetsu (Wikipedia, fetched): https://en.wikipedia.org/wiki/Ky%C5%ABd%C5%8D [src]
- Itten Dojo summary (names only, no stage detail): https://www.ittendojo.org/arts/kyudo [src, names only; did not give the stage detail]
- Kyudo overview and ANKF codification (search snippet): https://www.britannica.com/sports/kyudo [src, search snippet]

**Gap**: the ANKF Kyudo Kyohon is the authoritative source for hand positions. It was not opened in this run.

### S5. Teppo Ashigaru: matchlock aim, fire, reload

**Grip**
- Stock at the shoulder, cheek on the stock. Left hand supports the forestock or barrel [est].
- Match held in a serpentine clamp at the top of the cock. Trigger lever at the bottom of the gun [src: Wikipedia Matchlock].

**Stance and footwork**
- Standing or kneeling, rear foot back, body angled 45° [est].
- Matchlock could be rested on a forked stand for aiming [src: Tibetan forked stand snippet, Wikipedia Matchlock, used as analogy].

**Firing sequence (from Wikipedia Matchlock)**
1. **Match set**: burning slow match in the clamp.
2. **Trigger pull**: musketeer pulls a lever or trigger that protrudes from the bottom of the gun, connected to the serpentine.
3. **Match lowered**: clamp drops, lowering the match into the flash pan. Priming powder ignites.
4. **Main charge ignites**: flash passes through the touch hole and ignites the barrel charge.
5. **Release and reset**: trigger released, serpentine springs back.
6. **Reload**: match removed before the gun is reloaded.

*Aiming and ignition delay are not described in the source. Both are [est].*

**Key poses**
1. **P1 Aim**: musket at the shoulder, cheek on stock. Front shoulder about 70°, elbow about 170°. Torso square. Lean about 5°.
2. **P2 Trigger**: trigger pulled, match descends into the pan. Hold for about one frame.
3. **P3 Fire**: flash in the pan, then the main charge. Musket kicks into the shoulder. Shoulder about 70°, elbow about 90°.
4. **P4 Reload**: musket lowered, body turns. Ramrod and powder flask gestures (see below).

**Reload (from de Gheyn's 1607 drill book)**
- Dutch manual lists 28 steps just to fire and load the gun [src: Wikipedia Arquebus, citing de Gheyn].
- Loading broken into small, repeatable motions, each commanded by a word (Maurice of Nassau reforms) [src: search snippet, weak].
- Engravings: the 117 copper plates in de Gheyn's manual show the stages [src: search snippet].
- Animation must simplify the 28 steps into about 4–6 readable beats for a game loop [est].

**Timing (aim, fire, reload)**: aim 35 / fire 5 / reload 60 [est]. Reload is the long part.

**Loop emphasis (8 frames)**
- Fire is a 1–2 frame event with a muzzle flash and recoil.
- Reload loop: F1–2 turn and lower, F3 ramrod or powder, F4–5 stand and bring the musket up, F6–8 aim again.
- Keep a visible smoke or match glow for readability.

**Common mistakes**
- Musket fires without a match in the clamp. The pan needs a visible flash.
- Musket fires instantly on trigger, with no delay.
- Reload shown as a single wiggle.
- No recoil.
- Cheek not on the stock during aim.

**Sources**
- Matchlock firing sequence: https://en.wikipedia.org/wiki/Matchlock [src, fetched]
- Arquebus, de Gheyn 1607 manual, 28 steps: https://en.wikipedia.org/wiki/Arquebus [src, search snippet]
- Dutch drill manual, Jacob de Gheyn's Wapenhandelinghe (1607): https://www.librarything.com/work/1304658 [src, search snippet]
- Matchlock and musket handling notes: https://corsairsandcaptivesblog.com/muskets-part-2/ [src, search snippet, blog]

**Gap**: no sourced aiming or ignition timing. Animators should check a matchlock reenactment video for aim timing.

### S6. Yari Cavalry: mounted yari thrust

**Grip**
- Yari held in one hand (rear hand at the hip) while the other hand controls the reins [src: yari grip, Owari Kan Ryu; mounted use is est].
- Bajutsu (horse-riding military arts) developed spear techniques from horseback in the late 14th century [src: Wikipedia Bajutsu].

**Stance**
- Rider stands in stirrups or sits deep; legs grip the horse [est].

**Key poses (mounted thrust)**
1. **P1 Raise**: yari at shoulder height, point forward and slightly up. Shoulder about 100°, elbow about 100°.
2. **P2 Lower**: yari comes down to hip height, point at the enemy. Shoulder about 60°, elbow about 130°.
3. **P3 Contact**: arm extends to about 170°, shoulder about 70°. Torso lean about 20°. Torso twist +10°.
4. **P4 Recover**: yari withdrawn to hip. Elbow about 100°.

**Timing**: 35 / 20 / 45 [est].

**Loop emphasis**: the lower-to-thrust beat is the readable action. Keep the horse gallop cycle in step.

**Common mistakes**: yari swung like a sword; no hip anchor; horse and yari move independently.

**Sources**: Bajutsu (https://en.wikipedia.org/wiki/Bajutsu) [src, search snippet]; Total War wiki yari cavalry (https://wiki.totalwar.com/w/Yari_Cavalry_(STW_unit).html) [src, game, unverified].

### S7. Yabusame: mounted archery, bow over the horse's neck

**Grip**
- Bow held in the left hand. Bow is long (daikyu, about 6.5 ft / 2 m) [src: Wikipedia Yabusame].
- Draw hand on the string, drawn to the right ear or cheek.

**Stance and footwork**
- Rider controls the horse with the knees because both hands are needed for the bow [src: Wikipedia Yabusame].
- Bow shifted over the horse's neck to the right side, while the rider straddles the horse and twists the upper body [src].
- Drawing with the right hand is said to be "virtually impossible" from this position in one source [src, search snippet]. Treat this as an exaggeration. The sources describe the shifting of the bow as very difficult.

**Key poses (metesugai, aiming across the neck)**
1. **P1 Gallop (bow low, left side)**: bow held at the left. Left shoulder about 60°, elbow about 120°. Torso twist about −30° (facing forward, left).
2. **P2 Bow across neck**: bow extended across the horse's neck to the right. Left shoulder about 100°, elbow about 170°. Torso twist about +40°. Rider leans right.
3. **P3 Draw**: right hand draws to the ear. Right shoulder about 80°, elbow about 60°. Torso fully rotated to target.
4. **P4 Loose**: right hand releases. Right elbow opens.
5. **P5 Recover**: bow returns to the left, rider faces forward.

**Timing (metesugai, A/S/F)**: 45 / 15 / 40 [est].

**Loop emphasis (8 frames)**
- The bow crossing the horse's neck is the signature shape. Show it.
- The torso twist should read as a large body rotation.
- Horse gallop cycle should be visible under the rider.

**Common mistakes**
- Bow held to the right side of the horse.
- Torso doesn't twist; rider looks like a standing archer.
- Horse is stationary.
- Bow drawn in front of the chest instead of to the ear.

**Sources**
- Yabusame metesugai, bow over neck, left-hand bow, torso twist: https://en.wikipedia.org/wiki/Yabusame [src]
- Yabusame official: https://yabusame.or.jp/english/on-yabusame [src, not opened]
- Mounted archery overview: https://en.wikipedia.org/wiki/Mounted_archery [seen in search, not opened]

### S8. Hatamoto Horse: mounted katana and yari

**Grip**
- Katana: one hand for mounted cuts, or two hands for a heavier cut from the saddle [est].
- Yari: rear hand at the hip, as S6.

**Stance**
- Rider stands in stirrups or sits deep. Legs grip the horse [est].

**Key poses (mounted katana cut)**
1. **P1 Raise**: katana above the head. Shoulder about 165°, elbow about 70°.
2. **P2 Strike**: katana comes down diagonally (kesagiri-like). Shoulder about 100°, elbow about 130°. Torso +30°.
3. **P3 Contact**: arm extended, shoulder about 70°, elbow about 170°.
4. **P4 Recover**: katana back to the right side.

**Timing**: 40 / 15 / 45 [est].

**Loop emphasis**: a diagonal cut from horseback. The horse's stride should read under the cut.

**Common mistakes**: cut from the horse's side as a flat swing; horse does not move; rider stays square.

**Sources**: Bajutsu (https://en.wikipedia.org/wiki/Bajutsu) [src, search snippet, notes that mounted sword technique is not described in detail]. No mounted kenjutsu source was found in this run. Motions above are [est].

### S9. Sohei Warrior Monks: naginata, two-handed sweeping cuts and thrusts

**Grip**
- Two hands on the shaft. Rear hand at or near the butt, front hand forward, about shoulder width apart [est].
- Blade at the top of the shaft, arm lengths from the body.

**Stance and footwork**
- Feet staggered, lead foot forward. Torso angled [est].
- Sweeping arcs are the main attack; thrusts and butt strikes are secondary [src: SCNF history].

**Key poses: sweeping cut (nagi)**
1. **P1 Guard**: blade held out to the side at hip height. Shoulder about 60°, elbow about 100°. Torso twist about −30°.
2. **P2 Sweep**: blade sweeps across in a horizontal arc. Shoulder about 90°, elbow about 130°. Torso swings from −30° to +30°. Front foot steps.
3. **P3 Contact**: blade at the far end of the arc. Arms extended, shoulder about 90°, elbow about 150°. Torso +40°.
4. **P4 Recover**: blade drawn back to the guard. Torso returns.

**Key poses: thrust (tsuki)**
1. **P1 Guard**: blade at the front, shaft at the hip. Shoulder about 60°.
2. **P2 Thrust**: shaft pushes forward, rear hand slides up. Elbow extends to about 170°. Torso +15°.
3. **P3 Contact**: arms extended, blade on the line.
4. **P4 Recover**: rear hand pulls back.

**Timing (sweep, A/S/F)**: 40 / 15 / 45 [est]. The sweep needs space; the follow-through carries through the arc.

**Loop emphasis (8 frames)**: the arc must be visible. Sweep is the signature.

**Common mistakes**: naginata drawn like a yari (one-line thrust) when it is a sweep; no torso rotation; blade does not follow an arc.

**Sources**
- Naginatajutsu overview (kata groups, horse-targeting solo forms): https://en.wikipedia.org/wiki/Naginatajutsu [src]
- SCNF naginata history (sweep, thrust, butt, horse-leg cuts): https://scnf.org/page0/index.html [src, search snippet]
- V&A naginata description (thrust pierces armour from a long pole): https://api.vam.ac.uk/v2/object/O92658 [src, museum, search snippet]
- The sohei link is a common association, not firmly documented [src, samurai-archives snippet].

### S10. Ozutsu bombard crew: big gun

**Note**: our sources do not describe the ozutsu crew sequence. The motions below use the matchlock sequence (S5) scaled up, plus recoil and crew roles [est].

**Crew and roles**
- Several crew: one loads the powder, one rams the charge, one sets the match, one aims [est].

**Firing sequence (est)**
1. **P1 Load**: crew pushes the powder charge and ball down the barrel with a ramrod. Crew member's arms about 90° at the elbow.
2. **P2 Aim**: gunner sights the barrel. Body low, sighting along the barrel.
3. **P3 Fire**: match applied to the touch hole. Recoil kicks the barrel back. Crew leans back.
4. **P4 Recover**: crew resets. Barrel is cooled or swabbed.

**Timing (fire cycle, A/S/F)**: load 60 / fire 5 / recover 35 [est]. Load is long.

**Loop emphasis**: the recoil frame is the big beat. Show a dust or smoke puff.

**Common mistakes**: barrel with no recoil; crew standing up straight while firing; no sense of mass.

**Sources**: matchlock sequence [src: Wikipedia Matchlock] and de Gheyn load steps [src: Wikipedia Arquebus]. Ozutsu-specific sources not found in this run.

---

## Undead faction (historical base plus adaptations)

Undead units use the same weapons as the historical units above. Adaptations are marked [adapt].

### U1. Grave Legionaries: gladius + shield

**Base**: same as T1 (Sergeant-Brothers), with stab-first doctrine and shield leading [src: Gladius].

**Adaptation [adapt]**: a shield-punch (scutum-bash) before the thrust. The shield thrusts forward to open the enemy's guard, then the gladius stabs at stomach height. Gladius shield-punch is not confirmed in our sources.

**Key poses (shield punch then thrust)**
1. **P1 Guard**: shield forward, gladius at the hip. Shield arm elbow about 90°, sword elbow about 110°.
2. **P2 Shield punch**: shield pushes forward. Shoulder about 60°, elbow about 150°. Torso +20°. Lead foot steps.
3. **P3 Thrust**: sword arm extends from behind the shield. Shoulder about 70°, elbow about 170°. Torso +25°.
4. **P4 Recover**: sword returns behind the shield, shield back up.

**Timing**: 25 / 20 / 55 [est, quick shield push, slower recovery].

**Loop emphasis**: the shield punch should be the first readable beat. Thrust should look like it comes from behind the shield.

**Common mistakes**: shield drops during thrust; sword swings instead of thrusts; no shield punch weight.

**Sources**: https://en.wikipedia.org/wiki/Gladius [src]

### U2. Ghoul Spears: spear thrust

**Base**: Spear Levy (T2) and yari (S2).

**Adaptation [adapt]**: a lunging, uneven thrust. Ghouls are less disciplined, so use a longer anticipation and a quicker lunge with a jitter in the shoulder.

**Key poses**
1. **P1 Guard**: spear low, point at knee height. Shoulder about 40°, elbow about 100°.
2. **P2 Lunge**: forward and up, with a body jerk. Shoulder about 85°, elbow about 170°. Torso +25°, lean about 25°.
3. **P3 Contact**: arm straight, point at belly height.
4. **P4 Recover**: body pulls back, spear to hip.

**Timing**: 40 / 15 / 45 [est, longer wind-up for the "ghoulish" feel].

**Loop emphasis**: the jerky lunge. Keep the spear on the line even when the body is erratic.

**Common mistakes**: spear swings; the lunge is too slow to read; body and spear move in different directions.

**Sources**: T2 and S2 sources, plus adaptation [adapt].

### U3. Bone-Throwers: thrown bones or javelins

**Base**: javelin throw (T3) and nage-yari (S3).

**Adaptation [adapt]**: a sidearm sling-throw with a bone or spear. Lower arm, quicker release, less torso rotation than the Roman pilum.

**Key poses**
1. **P1 Draw-back**: arm at the side, bone held at the hip. Shoulder about 60°, elbow about 90°.
2. **P2 Sling**: arm swings forward in a lower arc. Shoulder about 90°, elbow about 30°. Torso +20°.
3. **P3 Release**: arm nearly straight, shoulder about 100°. Release at about 30° arc.
4. **P4 Follow-through**: arm crosses the body.

**Timing**: 35 / 10 / 55 [est].

**Loop emphasis**: release frame; the bone must visibly leave the hand.

**Common mistakes**: thrown from above the head (should be a low sling); no release frame.

**Sources**: javelin (T3) mechanics [src, forum and model]. Adaptation [adapt].

### U4. Wraith Bows: self-bow with a ghostly draw

**Base**: longbow draw-loose (T4) and yabusame-style bow shape (S7) where relevant.

**Adaptation [adapt]**: a longer anchor hold with a faint spectral string. The anchor is at the cheek, but the draw is slowed and the release has a flicker.

**Key poses**: same as T4 (nock, draw, anchor, release, follow-through), with a 2-frame anchor hold.

**Timing**: 45 / 15 / 40 [est].

**Loop emphasis**: the anchor hold and the release flicker. The flicker is the effect, not the arm.

**Common mistakes**: spectral effect obscures the bow; anchor is not held long enough to read.

**Sources**: T4 sources [src]. Adaptation [adapt].

### U5. Revenant Arbalests: crossbow

**Base**: T5 (Genoese crossbows), with belt-hook and cranequin.

**Adaptation [adapt]**: a cranequin crank done by a bone hand that is visibly too long, with the crank handle turning on its own.

**Key poses**: same as T5 (aim, fire, span, load, aim).

**Timing**: aim 40 / fire 10 / reload 50 [est].

**Loop emphasis**: the reload loop, with the crank visible.

**Common mistakes**: reload skipped; crossbow fires with no bolt loaded.

**Sources**: T5 sources [src]. Adaptation [adapt].

### U6. Black Riders: cavalry lance and sword

**Base**: knight-brothers couched lance (T8) and Turcopole lance (T6).

**Adaptation [adapt]**: a lance that drags along the ground during the charge, then lifts into a couch. Riders are slightly off-rhythm with the horse.

**Key poses**: same as T8 (upright, couch, impact, sword phase).

**Timing**: 40 / 15 / 45 [est].

**Loop emphasis**: the lance-to-couch lift.

**Common mistakes**: lance held upright through the charge; horse animates separately.

**Sources**: T8 sources [src]. Adaptation [adapt].

### U7. Barrow Horse Archers: mounted archers, Parthian-style

**Base**: yabusame metesugai (S7) and Turcopole archers (T7).

**Adaptation [adapt]**: a backward shot (turn the torso to the rear while riding away). This is the classic Parthian shot, which we did not find sourced in this run. The yabusame torso geometry is the closest reference.

**Key poses**
1. **P1 Gallop, bow low**: as S7 P1.
2. **P2 Turn back**: torso rotates to face the rear. Torso twist about +120°. Lean back about 15°.
3. **P3 Draw and anchor**: as T7 P3.
4. **P4 Loose**: as T7 P4.

**Timing**: 45 / 15 / 40 [est].

**Loop emphasis**: the backward torso twist. Show the horse heading forward.

**Common mistakes**: horse reverses direction; torso does not twist; bow drawn to the chest.

**Sources**: S7 and T7 sources [src]. Adaptation [adapt].

### U8. Death Knights: heavy greatsword or axe

**Base**: Zornhau two-handed sword (T9A) and two-handed axe (T9B).

**Adaptation [adapt]**: a slow, heavy overhead cut with a visible pause at the top. Death knights hold the cut at apex for a frame before falling.

**Key poses**: same as T9A (Zornhut guard, cut, contact, recover), with a 1–2 frame hold at P1.

**Timing**: 50 / 10 / 40 [est, longer wind-up for heaviness].

**Loop emphasis**: the apex hold and the weight of the cut.

**Common mistakes**: cut too fast for the heavy weapon; no apex pause.

**Sources**: T9 sources [src]. Adaptation [adapt].

### U9. Bone Colossus: giant slam and sweep

**Base**: naginata sweep (S9) for the arc, and two-handed axe overhead (T9B) for the slam.

**Adaptation [adapt]**: a giant body with a very long wind-up. The slam uses the whole body; the sweep uses the torso.

**Key poses**
1. **P1 Raise**: both arms overhead or to one side. Shoulder about 165°.
2. **P2 Slam**: arms fall. Shoulder about 90°, elbow about 140°. Torso lean +30°. Lead foot stomps.
3. **P3 Impact**: arms straight, body low. Shoulder about 60°.
4. **P4 Recover**: body rises slowly, arms return.

**Sweep variant**: torso rotates from −40° to +40° with arms extended. Shoulder about 90°.

**Timing (slam)**: 55 / 10 / 35 [est]. Heavy, slow recovery.

**Loop emphasis**: the stomp and the impact frame, with a dust effect.

**Common mistakes**: slam is too fast; no weight shift; arms detached from the torso.

**Sources**: S9 sources and T9 sources [src]. Adaptation [adapt].

### U10. Corpse Trebuchet crew: siege engine operation

**Base**: trebuchet release (T10) and ozutsu fire cycle (S10).

**Adaptation [adapt]**: crew is undead. The crew should read as a few figures pulling a rope or cranking a winch, with slow, uneven motions.

**Key poses**: same as T10 (set, release command, sling release, follow-through).

**Timing**: 60 / 10 / 30 [est].

**Loop emphasis**: arm is the silhouette. Crew should be visible.

**Common mistakes**: arm moves straight; no crew.

**Sources**: T10 sources [src]. Adaptation [adapt].

---

## Animation loop guidance (general)

Applies to every unit.

- **Phases**: standby, wind-up (anticipation), strike, follow-through. The Smash Bros breakdown splits attacks into these four phases, with the follow-through being the window after the hit but before the return to standby [src: amara.org transcript of "How to Animate a Smash Bros Attack"; https://amara.org/subtitles/I8Bnr4dEmv1u/en/1/download/How%20to%20Animate%20a%20Smash%20Bros%20Attack%20%20LINK.en.txt].
- **Wind-up gives the cue**. The anticipation is what conveys power [src: same].
- **Strike is brief**. An attack's active frames are often 4–6 frames at 60 fps [src: developer guideline, aztez.com/?p=8443 and slynyrd pixel blog, weak].
- **Freeze on hit**. A few frames of hitstop on both characters is a common trick [src: aztez.com/?p=8443].
- **Cancel follow-through**. Long follow-through feels sluggish without cancel windows [src: aztez.com/?p=8443, design critique].
- **Pixel art weight**: heavier weapons have longer anticipation and recovery. Quote from pixel tutorial: longest anticipation and recovery on the heaviest weapon [src: https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation].
- **Readability**: silhouette of the weapon at the strike frame matters more than the arm.

---

## Frame-count quick reference (game loops, 6–10 frames)

Use these as starting points, then adjust by weight and speed.

| Weapon class | Loop | A frames | S frames | F frames | Notes |
|---|---|---|---|---|---|
| Sword cut (one-hand) | 8 | 3 | 2 | 3 | Strike is 1–2 frames |
| Thrust (one-hand, spear) | 8 | 3 | 2 | 3 | Straight line |
| Two-hand sword | 9 | 4 | 2 | 3 | Heavier wind-up |
| Javelin / throw | 8 | 3 | 1 | 4 | Release is one frame |
| Bow draw and loose | 9 | 4 | 1 | 4 | Anchor hold in A |
| Crossbow fire | 6 | 2 | 1 | 3 | Fire + reload separately |
| Matchlock fire | 8 | 3 | 1 | 4 | Reload is the long part |
| Mounted lance | 8 | 3 | 2 | 3 | Lower-to-thrust beat |
| Kyudo hassetsu (fire) | 10 | 5 | 1 | 4 | Ritualised, slow |
| Naginata sweep | 9 | 4 | 2 | 3 | Arc must read |
| Heavy slam | 10 | 5 | 1 | 4 | Stomp on strike |
| Trebuchet release | 10 | 6 | 1 | 3 | Arm is silhouette |

---

## Gap list for the team

Verify these before production:

1. Talhoffer spear hand placements: check the Talhoffer plates directly (Wiktenauer).
2. Kesagiri grip: confirm two-handed grip with a ZNKR seitei video.
3. Kyudo stage hand positions: confirm with the ANKF Kyudo Kyohon.
4. Pilum arm mechanics: confirm with a reenactor video.
5. Matchlock aim and ignition timing: confirm with a reenactment video.
6. Composite bow (Turcopole Archers, Barrow Horse Archers): no composite-bow source was opened. Add one before final art.
7. Mangonel-specific sequence: only trebuchet sources were opened.
8. Ozutsu crew: no sources found. Use the matchlock sequence as a base.
9. Mounted kenjutsu: no source found beyond Bajutsu background.
10. Krumphau and Zwerchhau: contested, do not define in-game.

---

## Common mistakes, cross-faction

- Thrusts drawn as swings (spear levy, yari, ghoul spear, knight lance).
- Two-handed weapons drawn one-handed (katana, longsword, naginata).
- Bows drawn to the chest or ear without an anchor hold (longbow, yumi, composite).
- Crossbows and matchlocks with no visible reload.
- Torso missing from throws and mounted attacks.
- Shields that drop during the strike.
- Mounted attacks where the horse does not move.
- Heavy weapons with the same timing as light ones.
- Asymmetric yumi drawn as a symmetric bow.

---

## Source list (all URLs used)

Templar and European:
- https://en.wikipedia.org/wiki/Gladius
- https://aemma.org/onlineResources/liberi/liberi4_body.htm
- https://www.academieduello.com/learn/resources/wiki/fiore-poste-progression
- https://guywindsor.net/2024/03/fiore-dei-liberi-footwork-revisited/
- https://www.romanarmytalk.com/rat/showthread.php?tid=22319
- https://tastesofhistory.co.uk/post/about-history-the-spear-part-two
- https://www.hroarr.com/manuals/fiore/omsg_lanza.pdf (seen in search, not opened)
- https://thearma.org/forum/viewtopic.php?p=6676 (seen in search)
- https://www.romanarmytalk.com/rat/showthread.php?tid=4955
- https://karwansaraypublishers.com/gb_army/model-of-the-charge
- https://romanarmytalk.com/rat/showthread.php?tid=7552 (seen in search)
- https://en.wikipedia.org/wiki/English_longbow
- https://historyrise.com/article/the-techniques-of-shooting-and-shooting-accuracy-for-english-longbowmen/
- https://eprints.soton.ac.uk/500151/1/2025.04.21_AccessibleThesisFINAL.pdf (not opened)
- https://www.britishmuseum.org/collection/object/P_1848-1013-128
- https://www.metmuseum.org/art/collection/search/33739
- https://fitzmuseum.cam.ac.uk/explore-our-collection/highlights/HENM4111933
- https://en.wikipedia.org/wiki/Crossbow
- https://historyrise.com/article/the-evolution-of-crossbow-mechanisms-from-thumb-draw-to-windlass/
- https://wiki.totalwar.com/w/Yari_Cavalry_(STW_unit).html
- https://en.wikipedia.org/wiki/Lance
- https://www.medievalists.net/2022/11/lance/
- https://wiktenauer.com/wiki/Zornhaw
- https://thearma.org/essays/Talhoffer/HT-Web.htm
- https://thearma.org/arttalk/at42.htm
- https://www.themorgan.org/collection/Crusader-Bible
- https://en.wikipedia.org/wiki/Trebuchet

Japanese:
- https://en.wikipedia.org/wiki/Ky%C5%ABd%C5%8D
- https://www.ittendojo.org/arts/kyudo (names only)
- https://www.britannica.com/sports/kyudo (search snippet)
- https://en.wikipedia.org/wiki/Yabusame
- https://yabusame.or.jp/english/on-yabusame (not opened)
- https://en.wikipedia.org/wiki/Mounted_archery (not opened)
- https://en.wikipedia.org/wiki/Bajutsu
- https://www.akban.org/wiki/Seitei_gata_-_Kesagiri_袈裟切り
- https://kampaibudokai.org/Seiteigata.htm
- https://kendoargentina.org/wp-content/uploads/2025/04/ZNKR-Iai-Instructional-Considerations-2024-ENG.pdf (not opened)
- https://shinkanryu.org/kesagiri-anatomy-of-a-sword-strike (404 on fetch, not used for grip claims)
- https://koryu.com/library/harmstrong1
- https://lightinthecloudsblog.com/2016/04/13/yari-the-rise-and-fall-of-the-japanese-spear/
- https://en.wikipedia.org/wiki/S%C5%8Djutsu (not opened)
- https://en.wikipedia.org/wiki/Matchlock
- https://en.wikipedia.org/wiki/Arquebus
- https://www.librarything.com/work/1304658
- https://corsairsandcaptivesblog.com/muskets-part-2/
- https://en.wikipedia.org/wiki/Naginatajutsu
- https://scnf.org/page0/index.html
- https://api.vam.ac.uk/v2/object/O92658
- https://samurai-archives.com/wiki/Special:MobileDiff/12395

Animation and art:
- https://amara.org/subtitles/I8Bnr4dEmv1u/en/1/download/How%20to%20Animate%20a%20Smash%20Bros%20Attack%20%20LINK.en.txt
- https://aztez.com/?p=8443
- https://www.slynyrd.com/blog/2025/5/23/pixelblog-56-top-down-character-attack-animation

CC0 pixel-art sources for animators (licence checked on the listing; confirm on the page before download):
- Kenney Tiny Dungeon (CC0, weapons and characters): https://kenney-assets.itch.io/tiny-dungeon and https://opengameart.org/content/tiny-dungeon
- Kenney Tiny Battle (CC0 per OpenGameArt; credit optional): https://opengameart.org/content/tiny-battle
- Clint Bellanger Tiny Creatures (CC0, Tiny Dungeon expansion): https://opengameart.org/content/tiny-creatures
- Not usable as-is: LPC spade/shovel sheet (CC-BY-SA 3.0, based on XOR's spear walk, has a known frame-bounds issue): https://opengameart.org/content/lpc-spadeshovel-spritesheet

Note on CC0 weapon sheets: no CC0 sheet with a spear thrust or a bow draw was confirmed in this run. Tiny Dungeon has the weapons as static sprites, so animators will need to build the motion frames themselves. The summerengine.com spear sheets were not verified for licence and were not used.

---

## Summary table

| Unit | Weapon | Primary attack motion | Must read as |
|---|---|---|---|
| Sergeant-Brothers | Arming sword + heater shield | Forehand cut from shoulder; stab from guard behind shield | Shield in front, sword cuts from the shoulder, stab is straight |
| Spear Levy | Spear + shield | Overhand thrust from above, underhand thrust from hip, in a wall | Straight thrust in a line, shield wall overlapping, NOT a swing |
| Javelin Men | Javelin (pilum-style) | Whipping overarm throw with torso rotation | Back coiled, release frame, body heaves through |
| Pilgrim Archers | Longbow | Draw to cheek, anchor hold, release | Bow arm locked, anchor at the cheek, held before release |
| Genoese Crossbows | Crossbow with stirrup/belt hook or crank | Aim, fire with recoil, span with stirrup and hook | Fire is sudden, reload is a full-body push with a visible stirrup foot |
| Turcopoles | Light lance | Lance drop from upright, braced thrust | Lance tucked and steady, horse moving under it |
| Turcopole Archers | Composite bow | Torso turn, draw to ear, loose on the run | Torso twisted to target, draw from the side |
| Knight-Brothers | Couched lance, then sword | Lance tucked under arm, impact, then sword cut | Lance under the armpit, impact through the chest |
| Iron Brethren | Two-handed sword (or axe) | Zornhau from right shoulder, diagonal cut; or overhead axe | Two-handed cut from the shoulder, weight behind it |
| Mangonel crew | Trebuchet-style engine | Winch set, counterweight drop, sling release | Arm is a long rotation, crew visible at winch |
| Katana Samurai | Two-handed katana | Kesagiri diagonal (1 to 7 o'clock), shomen straight, tsuki | Diagonal vs straight cut are clearly different; two hands on the grip |
| Yari Ashigaru | Yari | Chudan thrust with rear hand at the hip; overhead beat with nagae yari | Straight thrust, rank spacing, rear hand anchor |
| Nage-yari Skirmishers | Thrown short spear | Overarm throw with torso rotation | Release frame, spear leaves the hand |
| Yumi Ashigaru | Asymmetric yumi | Hassetsu: uchiokoshi, hikiwake, kai at ear, hanare, zanshin | Bow asymmetric and high, draw to ear, zanshin hold |
| Teppo Ashigaru | Matchlock | Aim, trigger (match drops to pan), fire with recoil, reload | Match glow at the pan, recoil, reload is the long part |
| Yari Cavalry | Yari from horse | Yari from hip to thrust, horse under it | Yari anchored at the hip, horse moving with the thrust |
| Yabusame | Long bow from horse | Bow across horse's neck, torso twist, draw to ear | Bow crosses the horse's neck, rider twisted to target |
| Hatamoto Horse | Katana and yari from horse | Diagonal cut from horse; mounted yari thrust | Cut from horseback, horse stride readable |
| Sohei Warrior Monks | Naginata | Sweeping horizontal cut, thrust | Blade traces an arc, not a thrust |
| Ozutsu bombard crew | Large matchlock gun | Load, aim, fire with recoil, recover | Recoil is the big beat, crew reads as a team |
| Grave Legionaries | Gladius + shield [adapt] | Shield punch, then stab from behind shield | Shield push first, stab from behind it |
| Ghoul Spears | Spear [adapt] | Jerky lunge thrust | Straight line despite erratic body |
| Bone-Throwers | Thrown bone or javelin [adapt] | Low sling throw, short arc | Release frame, low arc |
| Wraith Bows | Longbow with spectral string [adapt] | Long anchor hold, flicker release | Anchor hold reads, release flickers |
| Revenant Arbalests | Crossbow with crank [adapt] | Aim, fire, crank reload | Reload is visible with the crank |
| Black Riders | Lance and sword [adapt] | Lance drags then lifts into couch | Lance lifted into couch, not held upright |
| Barrow Horse Archers | Bow from horse [adapt] | Backward turn, parthian shot | Torso turned to the rear, horse heads forward |
| Death Knights | Greatsword or axe [adapt] | Heavy overhead cut with apex pause | Apex pause, weight in the cut |
| Bone Colossus | Giant slam and sweep [adapt] | Overhead slam with stomp; torso sweep | Stomp on impact, dust effect |
| Corpse Trebuchet crew | Trebuchet [adapt] | Winch set, release, sling | Arm silhouette, crew visible |
