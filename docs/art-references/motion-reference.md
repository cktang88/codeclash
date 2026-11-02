# Motion reference: how real bodies swing, thrust, charge and run

The user asked for unit animations that look very realistic. This file collects the motion
reference behind our HD unit animations: Muybridge's photographs, CMU motion capture, fencing and
historical-martial-arts material, archery and missile biomechanics, horse gaits, and animation
craft. It is the source for the converted clips in `src/client/render/paper/motion/` and for the
animators' brief at the end of this file.

Researched on 2026-11-02. Downloaded study copies live in the git-ignored `references/motion/`:
- `muybridge/*.jpg` and `*.txt`: full plates and their catalogue records;
- `grids/*.png`: the photo grids cropped out of the plates;
- `bvh/*.bvh`: CMU trials.

## 0. Licences at a glance

| Source | Licence | What we may do |
|---|---|---|
| Eadweard Muybridge, *Animal Locomotion* (1887), scans from the [Wellcome Collection](https://wellcomecollection.org/search/works?query=muybridge%20animal%20locomotion) | **Public Domain Mark** (each work page says so). Two plates there are CC BY-NC (trotting horse `nxr5w2rw`, boxing `rhzveqqe`). We use those for study only and never commit them. | Study, measure, and commit crops (credit Muybridge and the Wellcome Collection in README.md). |
| Muybridge, *The Horse in Motion* (1878), animated GIF on [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Muybridge_race_horse_animated.gif) | Public domain (published 1878) | Same as above |
| [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) | "This data is free for use in research projects. You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." Requested credit: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." | We derive key poses (a few numbers per key) into our JSON and credit CMU in README.md. The raw BVH stays in `references/`, never in the repo. |
| cgspeed BVH conversion (Bruce Hahne, 2008/2010), via the [una-dinosauria/cmu-mocap](https://github.com/una-dinosauria/cmu-mocap) mirror | Same terms as CMU. The READMEFIRST.txt gives the conversion "with no restrictions". | As CMU |
| HEMA videos and articles, museum pages, coaching texts | Copyright of their owners | Study only. We write down what we learned, and copy no images. |

## 1. Eadweard Muybridge, *Animal Locomotion* (1887)

All plates were downloaded through the Wellcome IIIF image API
(`https://iiif.wellcomecollection.org/image/<id>/full/1600,/0/default.jpg`). The page links are below.
Each plate is a grid of 12 to 24 exposures taken at equal intervals by a battery of cameras. Many
plates add a second row seen from the front, the back or at 60°, which is close to our
three-quarter facings.

| Study file | Plate (catalogue page) | Licence | What we take from it |
|---|---|---|---|
| `walk-naked` | [A naked man walking](https://wellcomecollection.org/works/arjhfnhj) (12 lateral + 12 rear) | PDM | Lateral row: the heel lands with the knee nearly straight, then the knee *flexes* about 15° as weight comes on (the "down"). The pelvis is highest at passing. The rear row shows the hips dropping on the swing side and the body shifting over the stance foot, about half a foot-width each way. |
| `walk-man`, `walk-man2`, `walk-man3` | [A man walking](https://wellcomecollection.org/works/bgd7pfcz), [2](https://wellcomecollection.org/works/cwrcvqwv), [3](https://wellcomecollection.org/works/v5t3b2ar) (clothed, with cane and case; lateral, rear and **front-oblique** rows) | PDM | Clothed walking in front three-quarter: the far leg disappears behind the near leg at passing; the arm opposite the forward leg is forward. In front three-quarter the stride shows mostly as *vertical* spacing between the feet. This is the SE facing problem in a photograph. |
| `run-naked`, `run-naked2`, `run-man`, `sprint` | [running](https://wellcomecollection.org/works/w8unj8ex), [2](https://wellcomecollection.org/works/p7sjrwv7), [man running](https://wellcomecollection.org/works/df49p5cx), [sprinting](https://wellcomecollection.org/works/k76j2uyr) | PDM | The run has a flight phase in which both feet are off the ground. The trunk leans about 10–15° forward. Elbows are bent to about 90° and pump forward and back, not across. The swing heel kicks up behind to the buttock height in a sprint. The foot lands nearly under the hips, not far ahead. |
| `fencing`, `fencing2` | [Two men thrust and parry with swords](https://wellcomecollection.org/works/pvst5zm5), [Two men fencing](https://wellcomecollection.org/works/kjre6ung) | PDM | **The lunge.** The rear leg drives straight. The front shin is vertical over the heel. The back arm flies up and back as a counterweight. The trunk stays almost upright, and the sword arm is fully extended *before* the front foot lands. The guard is knees bent, feet wide, weight central. |
| `javelin`, `javelin2` | [Man holds a javelin above his shoulder then throws it](https://wellcomecollection.org/works/jf3v5bev), [A javelin thrower](https://wellcomecollection.org/works/rdg554fv) | PDM | The withdraw takes the arm straight back at shoulder height, with the body leaning back 15–20° over the bent rear leg. The block is a planted, near-straight front leg. The release happens over the block. In the follow-through the rear leg swings high behind and the trunk pitches over the front leg, with the throwing arm ending low across the body. |
| `throw-ball`, `throw-rock` | [Man raises his right arm to throw a ball](https://wellcomecollection.org/works/d8bj6n5m), [holds a rock at shoulder height, leans forward to throw](https://wellcomecollection.org/works/trzksgpw) | PDM | The throw is a chain: hips open first, then shoulders, then elbow, then wrist. The non-throwing arm points at the target, then pulls in. |
| `chop`, `hammer`, `pickaxe` | [chops wood and hammers](https://wellcomecollection.org/works/jed2f8bs), [raises a hammer above his head and strikes an anvil](https://wellcomecollection.org/works/vse34wjq), [digging with a pickaxe](https://wellcomecollection.org/works/yekqse26) | PDM | **The overhead chop.** The tool goes up and back past vertical, the trunk extends and rises onto the toes, and the knees are soft. The downswing is driven by trunk flexion and knee bend: the man gets *lower* at impact. The hands slide together on the haft. After impact the head of the tool rebounds a little and the trunk settles. |
| `punch`, `box-hit` | [throws a punch with his right hand](https://wellcomecollection.org/works/pepa3v3j), [one hits the other's left shoulder](https://wellcomecollection.org/works/b8gyammq) | PDM | The punch starts from the rear foot and hip. On the receiver, the struck shoulder snaps back first, then the trunk twists, then the feet step back to catch the weight. That gives the order of a hit react. |
| `fall-boxing` | [Two men boxing, one falls on mattress](https://wellcomecollection.org/works/ss2hcpua) | PDM | **The backward knock-down**, frame by frame: the head snaps back, the knees buckle while the trunk is still upright, the arms fly up and out, the buttocks hit first, then the back, and the legs swing up from the momentum and drop back. It takes 6–8 frames from impact to flat. |
| `lie-down` | [lowers himself onto a mat, lying on his side](https://wellcomecollection.org/works/wru83ab7) | PDM | A controlled descent, close to a crumpling death: knees first, then a hip, then a shoulder. |
| `fall-horse` | [A man falling off a horse](https://wellcomecollection.org/works/vyzcucen) | PDM | A rider thrown backward pivots over the cantle. The legs come up over the horse and the head goes down. |
| `gun`, `rifle-aim`, `rifle-walk`, `rifle-prone` | [A man firing a gun](https://wellcomecollection.org/works/zfamkuvg), [raises a rifle, aims](https://wellcomecollection.org/works/d3mjydga), [walks carrying a rifle with fixed bayonet](https://wellcomecollection.org/works/zqx8348p), [lies on the ground and fires](https://wellcomecollection.org/works/yemkzr6m) | PDM | The aim shows the head down on the stock, the front elbow under the barrel and the weight slightly forward. The recoil moves the shoulder and head back by a few centimetres and the muzzle up, then the shooter settles back. |
| `horse-walk`, `horse-walk2` | [A horse walking](https://wellcomecollection.org/works/a98xvb7f) (Plate 574, 24 frames), [2](https://wellcomecollection.org/works/jm2xhudy) | PDM | A four-beat lateral sequence (LH, LF, RH, RF). Three feet are down most of the time, and two at the brief diagonal moments. The head nods *down* as each fore foot lands. The hind hoof lands in or just behind the fore hoof print (tracking up). |
| `horse-racehorse` | [A jockey riding a race-horse](https://wellcomecollection.org/works/jjxt2f5d) (walk; lateral and **front three-quarter** rows) | PDM | Front three-quarter view of a walking horse: the near fore and hind legs are separated by the barrel. The rider sits tall and moves with the back. |
| `horse-canter` | [A horse cantering](https://wellcomecollection.org/works/fhcu8gze) (lateral and rear rows) | PDM | Canter: three beats and one moment of suspension. The rear row shows the hindquarters lifting and the tail swinging opposite to the lead. |
| `horse-gallop-rider` | [A galloping horse and rider](https://wellcomecollection.org/works/uwc8xuuu) (Plate 626, 16 frames) | PDM | **The gallop that the keys are measured from** (see `horse-gallop.json`). The suspension is *gathered*: all four legs are folded under the belly, never stretched out like a rocking horse. The neck reaches forward as the fore legs land and lifts as the hind legs come under. The jockey's trunk stays almost still while the horse moves under him. |
| `horse-trot` | [A horse trotting](https://wellcomecollection.org/works/nxr5w2rw) | **CC BY-NC**: study only | Diagonal pairs land together, with a short suspension between beats. The rider rises and falls once per beat. |
| `horse-in-motion-anim*.gif` | [The Horse in Motion, 1878](https://commons.wikimedia.org/wiki/File:The_Horse_in_Motion-anim.gif) ("Sallie Gardner", 11 frames) | Public domain | It settled Stanford's bet: in the gallop all four feet are off the ground *together under the body*. Eleven frames per stride also makes a good game gallop loop. |
| `horse-ride1`, `horse-ride2` | [A clothed man riding a saddled horse](https://wellcomecollection.org/works/mr4hkn8r), [2](https://wellcomecollection.org/works/czzjs3ha) | PDM | The rider's hips follow the saddle while the head stays level. Hands are low, and the lower leg hangs under the hip. |

## 2. CMU motion capture: trials used

The CMU database has 2,605 trials of 144 subjects, captured at 120 Hz with Vicon. The cgspeed BVH
conversion adds a T-pose as frame 0 (we skip it) and sets `Frame Time 0.0083333`. Its joint names
follow MotionBuilder (`Hips, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, LowerBack, Spine, Spine1,
Neck, Neck1, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, ...`). Finger joints carry no data.

Files are fetched as `data/<subject padded to 3>/<subject>_<trial>.bvh` from the mirror. The
trimmed ranges and the reasons for them are recorded in each clip's `meta` in
`src/client/render/paper/motion/*.json`.

| Trial | CMU description | Used for | Notes |
|---|---|---|---|
| 35_01 | walk | **walk** | Subject 35 is the cleanest straight-line locomotion set. Even, natural cadence. |
| 138_01 | marching | march (reference variant of walk) | Stiffer knees, higher thigh lift, little arm swing. Good for disciplined infantry. |
| 20_06 | soldiers march | march (cross-check) | |
| 09_02, 16_55 | run | **run** | Subject 9 is a fast run with a clear flight phase. |
| 35_17, 16_35 | run/jog | jog (cross-check for run) | |
| 02_07, 02_08 | swordplay | **sword cut** (attack) | One-handed stick "sword" cuts and thrusts with a step. Subject 2 is an early session, so it is noisier. We use it for timing and trunk rotation. |
| 79_01, 22_20 | chopping wood; picks up a stool, threatens to strike | **axe chop** (attack variant) | Overhead two-handed downswing: rise, chop, settle. |
| 143_23, 02_05 | punching; punch/strike | **thrust** timing (spear jab), hit cross-check | A punch is the closest captured motion to a spear jab: rear-foot drive, hip, shoulder. |
| 124_01 | baseball pitch | **javelin / throw** | Overhand throw with stride, block and follow-through. |
| 79_86 | shooting bow and arrow | **shoot** (bow draw and loose) | A mimed bow: raise, draw to the face, hold, release, recover. |
| 79_96 | shooting a gun | **shoot** (gun variant) | Raise to the shoulder, aim, recoil. |
| 77_03 | ready stance | **brace** | A crouched, careful ready pose with a low centre and wide feet. |
| 77_09 | duck to avoid flying object | **hit** (flinch) | A sudden flinch-and-duck: the closest captured motion to a hit react. The CMU set has no "being struck" trials. |
| 90_18, 90_17 | RugPullFall; BananaPeelSlip | **die, backward** | Real backward falls onto a mat: the feet go forward, the buttocks land, then the back. |
| 90_16 | fall on face | **die, forward** | A controlled forward fall: knees, hands, chest. |
| 85_15 | 90TwistsFall | **die, crumple** (cross-check) | |
| 140_06, 141_20, 137_28 | idle; waiting; normal wait | **idle** | Long standing captures with real breathing and weight shifts (every 3–6 s). |
| 79_65 | horse | — | An actor *mimes* a horse. It is not usable as horse data. **There is no horse motion capture in CMU**, so horse keys are measured from Muybridge plates instead (§5). |

Other free mocap we know of but did not use:
- Bandai Namco Research Motiondataset (CC BY-NC 4.0; it has sword and fighting styles, so study only);
- Ubisoft LaFAN1 (CC BY-NC-ND 4.0);
- SFU Motion Capture Database (research terms);
- Mixamo (Adobe's terms tie the animations to use in projects, not redistribution as data).

The first two are non-commercial, and the other two have unclear terms for our use. CMU's
terms clearly allow derived data in a commercial product.

## 3. Fighting: swords, axes, spears, shields, pikes

### Longsword and one-handed cuts (HEMA)
- Sources: [swordfight.uk, Straight cuts](https://swordfight.uk/straight-cuts/); [Introduction to longsword](https://swordfight.uk/longsword-introduction/); [sevenswords.uk, Longsword techniques](https://sevenswords.uk/longsword-techniques-in-hema/); [schwertkampf-ochs.de, the master cuts](https://www.schwertkampf-ochs.de/essays/script_different_mastercuts.pdf); [ARMA forum, stances](https://www.thearma.org/forum/viewtopic.php?p=41443); [Bielefeld thesis on HEMA biomechanics](https://pub.uni-bielefeld.de/record/2937422). Liechtenauer glosses on [Wiktenauer](https://www.wiktenauer.com/) for study only.
- What we take:
  - **The cut is thrown by the body, not the arm.** The *Oberhau* (high cut) starts in *vom Tag*, with the sword over the shoulder or head. The cut is a passing step, or at least a hip turn, onto the front foot: hips turn first, then shoulders, then the arms extend, and the wrists turn the edge over last.
  - **Extension before the step lands.** The blade should arrive just before, or as, the front foot plants. That is the "true time" rule: hand before foot.
  - The cut ends in a low guard (*Alber* or *Wechsel*), point down and forward, the arms extended, the weight on the front foot. It does not stop in mid-air.
  - Recovery goes back to the guard with a step, the blade coming up along the same line.
  - The *Zornhau* is a diagonal descending cut from the right shoulder. In an iso three-quarter view it is the most readable cut: a long diagonal sweep across the body.

### Axe and mace (overhead chop)
- Sources: Muybridge `chop`, `hammer`, `pickaxe` (above); CMU 79_01 and 22_20.
- What we take: the chop is a *vertical* power motion. Rise with the tool going up and back, the chest opening and the heels lifting. Drop the body into the strike, with knees bending, trunk flexing and the elbows ending straight. The head of the tool lags the hands on the way down (follow-through), and the arms stop at about horizontal in front.

### Spear thrust and shield
- Sources: [Michigan War Studies Review on hoplite spear postures](https://michiganwarstudiesreview.com/2014-073.htm); [Tastes of History, the spear](https://www.tastesofhistory.co.uk/post/about-history-the-spear-part-two); [Liberty University, hoplite spear grip](https://digitalcommons.liberty.edu/exhibit/2025-research-week-awards/undergraduate-oral-presentations/a-gripping-controversy-examining-hoplite-spear-grip-positions-in-art-practice-and-context/); Muybridge fencing (the lunge).
- What we take:
  - **Underarm thrusts** (spear at the hip, two hands or one) give endurance and accuracy. **Overarm thrusts** (spear over the shoulder) go over the shield rim in a shield wall. Infantry with a big shield uses overarm, and pikes and two-handed spears use underarm.
  - A thrust is a short slide of the rear hand forward with a step or a lean. The spear moves along its own axis, so the point must travel in a **straight line**, not an arc. The thrust is *fast out and slower back* (retract over twice the frames).
  - The shield is held edge-forward, close to the body, with the elbow bent. Blocking means **moving the shield out to meet** the blow (punching the shield 10–20 cm forward and up), then the weight rocks back onto the rear foot. The head ducks behind the rim.

### Pike bracing against cavalry
- Sources: [British Civil Wars project, Pikeman fact sheet](https://britishcivilwars.ncl.ac.uk/wp-content/uploads/2021/06/Pikeman-Fact-Sheet.pdf); [Pike square (Wikipedia)](https://en.wikipedia.org/wiki/Pike_square); [Pike (weapon) (Wikipedia)](https://en.wikipedia.org/wiki/Pike_(weapon)); de Gheyn, *The Exercise of Armes* (1607) on [Wiktenauer](https://www.wiktenauer.com/wiki/Page:The_Exercise_of_Armes_For_Calivres,_Muskettes,_and_Pikes_(Jacob_de_Gheyn_II)_1607.pdf/13).
- What we take: to receive horse, the pikeman **crouches**. The butt is set against the instep of the rear foot (or planted in the ground behind it), and the front knee is bent. The left hand is forward on the shaft and the right hand back near the butt, holding it down. The point is aimed at the horse's chest, about 1.2–1.5 m up, at a 20–30° rise. In the brace loop only the breathing and a tiny tremor of the point move; the body is set.

### Fencing timing (lunge)
- Muybridge `fencing`: the lunge takes about 4 exposures (about 0.25–0.3 s). The back arm goes up as the sword arm goes out, and the recovery pushes back off the front heel.

## 4. Missile weapons

### Bow: draw, anchor, release, follow-through
- Sources: [Konstanz ISBS proceedings (archery phases)](https://ojs.ub.uni-konstanz.de/cpa/article/view/3653/3434), [2](https://ojs.ub.uni-konstanz.de/cpa/article/view/2570/2419), [3](https://ojs.ub.uni-konstanz.de/cpa/article/view/2571/2420); [Kyudo, nippon.com](https://www.nippon.com/en/features/jg00090/kyudo-japanese-archery.html); [Kyudo handbook (Hamburg)](https://www.slm.uni-hamburg.de/en/iaa/personen/ehemalige-emeriti/rodenberg-hans-peter/downloads/handbook-kyudo.pdf); CMU 79_86.
- What we take:
  - The phases are fixed: **stance, set (nock), raise, draw, full draw/anchor, aim (hold), release, follow-through**.
  - The draw is made with the *back* (the shoulder blades close), not the arm. The draw elbow ends level with or slightly above the arrow line, behind the head.
  - The anchor is the draw hand at the jaw or cheek. The head turns to the target *before* the draw and stays still.
  - The release takes only about 0.03 s (one game frame or less). The draw hand flies back past the ear along the jaw line, and the bow hand drops or turns slightly toward the target.
  - The follow-through holds about 0.5 s (*zanshin*, the "remaining body" in kyudo).
  - **Kyudo (samurai)** raises the bow *above the head* first (*uchiokoshi*), then opens the bow while lowering it into the draw (*hikiwake*). The yumi is gripped below its centre, the arrow is drawn to behind the ear, and after the release the bow turns in the hand (*yugaeri*).
- War archery (English longbow): the bow is raised or angled for distance (arcing volleys at about 45°), and the draw goes to the ear or chest.

### Crossbow: span, load, shoot
- Sources: [British Museum, crossbowman spanning with a belt hook](https://www.britishmuseum.org/collection/object/P_1848-1013-128); [Met Museum, crossbow with cranequin](https://www.metmuseum.org/art/collection/search/33739); [Fitzwilliam Museum, cranequin](https://data.fitzmuseum.cam.ac.uk/id/object/19465); [Tod's Workshop, spanning methods](https://todsworkshop.com/blogs/blog/crossbows-spanning-methods).
- What we take:
  - **Stirrup and belt hook**: the bow is set nose-down, with a foot in the stirrup. The man **stoops**, hooks the string on the belt claw, then **straightens his legs and back**. The legs span the bow, not the arms.
  - **Cranequin** (heavier bows): the bow is braced on the ground, and the man cranks with both hands for many turns. That is slow, so animate it as a loop of cranking.
  - Then the man lays the bolt in the groove and **shoulders** the stock (the stock goes against the cheek or the shoulder). He aims and squeezes the long trigger lever. The recoil is small: a slight jolt forward and down at the nose.
  - In a 12-frame Shoot, put the loose at frame 2–3 and show the reload as stoop, hook and stand. Otherwise the crossbow reads as a bow.

### Javelin
- Sources: [The Conversation, biomechanics of a javelin throw](https://theconversation.com/science-of-the-spear-biomechanics-of-a-javelin-throw-29782); [ISBS javelin phases](https://ojs.ub.uni-konstanz.de/cpa/article/view/3737/3468); [Thomas Röhler, the block](https://www.thomas-roehler.de/javelin-technique-the-block/); [teachpe, javelin technique](https://www.teachpe.com/?p=2012); Muybridge `javelin`, CMU 124_01.
- What we take: there is an approach, then a **withdrawal** of the arm straight back at shoulder height, with the palm up and the spear along the forearm. Then come the crossover steps with the trunk leaning back, the **block** (the front leg plants nearly straight), the **delivery** (hips, chest, shoulder, elbow, hand, *over the block leg*) and the **release** at 30–36°. In the **follow-through** the rear leg comes through or swings up, and the trunk folds over the block. War javelins are thrown from a standing or one-step start, so we use the withdraw, block, release and follow-through phases only.

### Matchlock (teppō)
- Sources: [Tanegashima (Wikipedia)](https://en.wikipedia.org/wiki/Tanegashima_(gun)); [Hōjutsu (Wikipedia)](https://en.wikipedia.org/wiki/H%C5%8Djutsu); [Hōjutsu: the art of samurai gunnery](https://www.insideninjutsu.com/articles/hojutsu-the-art-of-samurai-gunnery); [MLIT multilingual database, firing a matchlock](https://www.mlit.go.jp/tagengo-db/R4-00151.html); Muybridge `gun`, `rifle-aim`; CMU 79_96.
- What we take:
  - The tanegashima has a short butt held **against the cheek, not the shoulder**. Hōjutsu shares its stance with kyudo: feet wide and side-on, weight even, back straight.
  - The firing sequence is: blow on the match, open the pan cover, aim, squeeze. The serpentine drops, the **pan flash comes a beat before** the muzzle flash and smoke, and the **recoil jerks the gun up and back**.
  - The gunner absorbs the recoil with the arms and a short rock back, then settles.
  - Reloading is long: the gun goes muzzle-up, then powder, ball, ramrod and priming. In 12 frames, show only the fire, recoil and settle, then bring the barrel up as the start of the reload.

## 5. Horse gaits

- Sources: [PMC6826507, gait kinematics](https://pmc.ncbi.nlm.nih.gov/articles/PMC6826507/); [PMC10451235](https://pmc.ncbi.nlm.nih.gov/articles/PMC10451235); [MDPI Animals 9(10):763](https://www.mdpi.com/2076-2615/9/10/763); [Biancardi and Minetti 2012, transverse and rotary gallop](https://www.originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/10/Biancardi-and-Minetti_2012_Biomechanical-determinants-of-transverse-and-rotary-gallop-in-cursorial-mammals.pdf); [Equine biomechanics: gaits](https://ampascachi.com/en/blog-horse-riding-holidays-and-horses/all-about-horses/horse-gaits.php); Muybridge plates 574 and 626 and *The Horse in Motion*.

| Gait | Beats and footfall order (left lead) | Duty factor (fraction of stride each hoof is down) | Suspension | Head and neck | Speed |
|---|---|---|---|---|---|
| Walk | 4: LH, LF, RH, RF (lateral sequence, evenly spaced) | about 0.6–0.7 | none (2–3 hooves always down) | **nods twice per stride**: down as each fore hoof lands, up as it leaves | 1.4–1.8 m/s |
| Trot | 2: LH+RF, then RH+LF (diagonal pairs) | 0.35–0.45 | two short ones (about 9% each) | **steady** (a trot has almost no nod) | 3–5 m/s |
| Canter | 3: RH; then LH+RF together; then LF (the lead) | about 0.3 (hind) | one, after the lead fore | one big nod per stride: down on the leading fore, up in the suspension | 4–7 m/s |
| Gallop (transverse) | 4: RH, LH, RF, LF (lead) | 0.2 (hind) and lower | one, **gathered** (legs folded under the body) | the neck reaches out and down as the fores land, then rises and recoils as the hinds land | 10–18 m/s |

- **Gallop as a loop**: *The Horse in Motion* gives 11 frames per stride, and Plate 626 gives about 11–12 of its 16. Our Run has 12 frames, so one stride per Run loop.
  - Frames 0–1: the hinds land (first the trailing, then the leading).
  - Frames 3–4: the trailing fore lands; the barrel is lowest and the fores take the weight.
  - Frames 5–6: the lead fore lands.
  - Frames 8–10: suspension, legs gathered under the belly.
- **Pitch**: the barrel rocks about ±4°. It is nose-down as the fores land and nose-up as the hinds push off. The withers dip about 4% of the height after the fore landing.
- **Couched lance charge**, from [Lance (Wikipedia)](https://en.wikipedia.org/wiki/Lance), [Sean Poage, stirrup-less charges](https://www.seanpoage.com/stirrup-less-charges-shocking/), [Oxford Cabinet, stirrups](https://www.cabinet.ox.ac.uk/node/369) and [La bibliothèque mondiale du cheval, a la brida](https://labibliothequemondialeducheval.org/en/p/299/a-la-brida-and-a-la-gineta.html):
  - The lance is carried **upright** (butt on the thigh or stirrup) in the approach, and is lowered only in the last strides (the "couch").
  - The butt is clamped **under the right armpit**, with 30–45 cm of shaft behind it. The right hand grips just in front of the armpit. The point crosses over the horse's neck to the left (*a la brida*).
  - The rider sits **deep and braced**: legs straight and forward in the stirrups (the long-stirrup *brida* seat), the back against the high cantle, and the trunk leaning *slightly forward* into the impact.
  - At impact the trunk is pushed back against the cantle, the lance shaft bends or breaks, and the rider's shoulder recoils. The shield arm and the reins yield.
  - While the horse gallops, the rider's head and the lance point stay **steady** relative to the ground. The horse moves under them.

## 6. Animation craft

### Walk and run (Richard Williams, *The Animator's Survival Kit*)
- Sources: Williams, *The Animator's Survival Kit* (2001), walk chapter; [UW CSE 459 walk cycle](https://courses.cs.washington.edu/courses/cse459/19au/assignments/assignment_5/index.html); [Monmouth University walk tutorial](https://animation.monmouth.edu/instruct/?p=351); [Aseprite community walk thread](https://community.aseprite.org/t/still-learning-or-trying-to-learn-to-do-walking-animation/8291/26); [gait kinematics (OUHSC)](https://ouhsc.edu/bserdac/dthompso/web/gait/knmatics/gait.htm).
- **Four key poses per step**:
  - **contact**: the heel strikes, the legs are at their widest, the arms are at their widest, opposite to the legs;
  - **down**: the front knee bends to absorb the weight, the body is at its lowest, the arms are at their widest swing;
  - **passing**: one leg straight under the body, the other passing with its knee bent;
  - **up**: pushing off the back toe, the body at its highest.

  Williams' walk puts the *down* just after contact. Real gait data (OUHSC: about 5 cm sinusoid, lowest in double support, highest at midstance) agrees that the body is high over the planted leg.
- **Our timing.** Walk has 12 frames at 0.05 s each, so 0.6 s per loop. A natural stride (two steps) takes about 1.0–1.1 s, so one stride per loop plays as a brisk, quick march, which is right for troops.
  - With 6 frames per step, the layout is: contact on frames 0 and 6, down on 1 and 7, passing on 3 and 9, up on 4–5 and 10–11.
- **Run** has 12 frames at 0.042 s each, so 0.5 s per loop, close to a real fast run stride (0.6–0.7 s; a sprint is 0.45 s).
  - Keys per step: **contact** (the foot lands under the hips; the body is lowest just *after* contact), **down/compress**, **push-off** and **flight** (both feet off; the body highest).
  - The trunk leans forward 10–15°. The arms pump with elbows at about 90°, opposite to the legs.
- **Opposition and twist.** The shoulders counter-rotate against the hips (the hips turn toward the forward leg, the shoulders the other way). In front three-quarter, this shows as the near shoulder coming forward when the far leg is forward.
- **Weight shift.** The pelvis moves sideways over the stance foot and drops on the swing side. In side view this does not show, but in the three-quarter views it is a 1-unit x shift each step.

### Strikes, weight and impact
- **Anticipation, action, follow-through, settle** (Williams; Disney's twelve principles). A strike needs a wind-up opposite to the blow. The wind-up should take about 40% of the clip, the strike 1–2 frames, the follow-through 2–3 and the settle the rest. The default `poseAt` ease already does "slow wind-up, fast strike".
- **Smear frames**, from [Gamineai on pixel combat effects](https://gamineai.com/blog/pixel-art-combat-fx-hitstop-smear-frames-impact-timing-2026): one or two elongated in-betweens on the weapon arc during the fastest frame. Our `smear` event and `smearPart` draw these.
- **Hit-stop (impact freeze)**, from [Capcom, SF Seminar on hit stop](https://game.capcom.com/cfn/sfv/column/131545?lang=en), [critpoints.net on hitstop](https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/), [Sakurai on hitstop (Source Gaming)](https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/) and [Smash wiki, hitlag](https://www.ssbwiki.com/Hitlag): at contact, both attacker and defender freeze for a few frames (usually about 0.1–0.2 s). Heavier hits get longer freezes. Projectiles give no hit-stop to the shooter.
  - In baked sprites we fake it by **holding the impact pose for 2 frames** (two identical keys) in Attack, and by starting Hit on the most displaced pose (frame 0 = impact) with no wind-up.
- **Total War**, from [MCV, Creative Assembly mo-cap studio](https://www.mcvuk.com/development-news/the-creative-assembly-opens-new-mo-cap-studio/), [PC Gamer, Rome 2 preview](https://www.pcgamer.com/rome-2-total-war-preview) and [Uppsala, mocap for games](https://babel.speldesign.uu.se/?p=8458):
  - Shogun 2 and Rome II use mocap at scale, so that thousands of soldiers do not repeat in sync.
  - Melee uses paired ("matched") attack, defence and death animations.
  - At our scale, the lessons are: **vary the phase** of loops per soldier (the battle already offsets frames); make deaths **long and heavy** (the body falls in stages); and keep idle loops subtle.

### Frame counts for 12–24 fps sprites
The atlas gives Idle 8 (2 ticks each, 1.6 s), Walk 12, Run 12, Attack 12, Shoot 12, Hit 5, Die 12,
Dead 1 and Brace 8 (`render/frames.ts`). Key counts that read well at those lengths:
- idle: 2–3 keys;
- walk and run: 4 per step, 8 per loop;
- attack: 5–7 keys (ready, anticipation, strike, impact hold, follow-through, recover);
- hit: 3 keys (impact, recoil peak, return);
- die: 5–7 keys;
- brace: 2 keys.
