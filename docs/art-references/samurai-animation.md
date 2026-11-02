# Samurai HD animation: references, key poses and critique rounds

The Samurai battle figures on bones (`src/client/render/paper/samurai-rig.ts`; the key art they are
rebuilt from is `samurai-static.ts`). The machinery is the Templar's (`templar-rig.ts`): every
key-art piece rides one bone through a part map, the dō is skinned over pelvis, spine and chest,
and cloth and gear trail the body by 1-2 frames. The motion comes from the CMU captures and
Muybridge (`motion/*.json`, see `motion-reference.md`), with the weapon arms authored per kind to
the brief in `motion-reference.md` §9 and the martial art of each weapon.

Study copies of the images below live in the git-ignored `references/samurai-anim/`. None is
committed; the screenshots in `docs/screenshots/hd-sprites/samurai-anim-*.png` are our own art.

## References

| Image | Licence | What we take from it |
|---|---|---|
| [Japanese kyūdōka draws a daikyū](https://commons.wikimedia.org/wiki/File:Japanese_Kyudoka_Draws_Daikyu_Longbow.png) (early 20th-century photograph, Wikimedia Commons) | Public domain (Commons) | Full draw (*kai*): the bow arm straight to the target at shoulder height, the draw hand *behind the ear* with the elbow high, the arrow at the mouth line. The yumi is gripped a third of the way up: the upper limb is twice the lower, towering over the head. Feet wide and side-on (*ashibumi*), back straight. |
| [Strings for night firing](https://commons.wikimedia.org/wiki/File:Strings_for_night_firing.jpg) (Edo-period hōjutsu manual, Commons) | Public domain (Commons) | Teppō at the aim: the short butt held *at the cheek*, the head down along the barrel, both elbows low under the gun, a long side-on stance with the front knee bent. The dōran (cartridge box) and the sword at the hip. |
| [Ashigaru using shields (tate)](https://commons.wikimedia.org/wiki/File:Ashigaru_using_shields_(tate).jpg) (Edo-period manual, Commons) | Public domain (Commons) | The volley behind planted tate: kneeling or crouched gunners firing over the rim, and the men behind *ramming with the gun held muzzle-up*, the ramrod pushed down with the near hand. Our reload frames are this pose. |
| [Kenjutsu at the Japanese Garden 05](https://commons.wikimedia.org/wiki/File:Kenjutsu_at_the_Japanese_Garden_05.jpg) (Commons) | CC BY-SA (study only) | A committed cut is a long driving step: the front knee bent far forward, the rear leg straight, the hips low; the attacker's hands rise over the head for the cut while the defender's blade goes out low on the diagonal. |
| [A fighting monk](https://commons.wikimedia.org/wiki/File:A_Fighting_Monk,_Military_Costumes_in_Old_Japan..jpg) (*Military Costumes in Old Japan*, 1893, Commons) | Public domain (Commons) | The sōhei's naginata carried low, the blade forward and down at the knee, the shaft along the forearm; the cowl wrapped round the head; the robe layered over the armour. |
| Kyūdō hassetsu (the eight stages): [nippon.com](https://www.nippon.com/en/features/jg00090/kyudo-japanese-archery.html), [Hamburg kyūdō handbook](https://www.slm.uni-hamburg.de/en/iaa/personen/ehemalige-emeriti/rodenberg-hans-peter/downloads/handbook-kyudo.pdf) | Text, study only | *Uchiokoshi*: the bow raised straight up, the arms over the head; *hikiwake*: the bow brought down while the arms open; *kai*; *hanare*; *zanshin* (the held after-shot) and *yugaeri* (the bow turning in the hand). |
| Kesa-giri: [shinkanryu.org, anatomy of a sword strike](https://shinkanryu.org/kesagiri-anatomy-of-a-sword-strike), [Toyama-ryū kata dictionary](https://toyamaryu.org/dictionary_kata.htm) | Text, study only | The cut falls on the line of the *kesa* (the monk's stole): from the shoulder through the opposite hip, from *jōdan* or *hassō* (the hilt by the near shoulder), driven by the hips and the step, the blade finishing low. |

## Key poses per kind

### Katana Samurai (0)
- **Idle** is the key art in *chūdan*: both hands on the hilt, the blade forward and up; the capture's
  slow weight shift and breathing over it.
- **Walk**: the katana in the near hand at the hip, the point up and back, clear of the body and
  below the head; the far arm swings; the kusazuri panels and the sode trail the thighs and arms.
- **Run**: both hands on the hilt, the blade raised high for the charge.
- **Attack: kesa-giri** on the cut-diagonal capture. 0 chūdan; 1-4 both hands climb above the near
  (right) shoulder to *hassō*/*jōdan*, the blade back over the head, the chest arched back 10° and
  the shoulders coiled back; 5 the hips turn first while the hands are still high; 6-7 the blade
  falls through the whole diagonal, shoulder height to past the far knee, one solid smear arc over
  5-7; 7 impact with the front foot planted 1.7 units ahead in a deep stance (hips down 0.75, the
  trunk folded 30° over the front thigh, the shoulders turned through); 8 *zanshin* held; 9-11 back
  to chūdan. The far hand stays on the hilt by IK all through.
- **Brace**: a deep chūdan: knees well bent, the front foot forward with the weight on it, the
  trunk over the front thigh, the blade levelled at the enemy's throat.
- **Sashimono**: the pole whips after the trunk in the cut and the hit (1.5 times its turn, two
  frames late), streams back and flutters at the run, and stays steady in the walk (no boil).
- **The katana** (`samurai-parts` `katana`): from level 4 one shape with its curve, a bright edge,
  the lit flat and a dark back, a gilt-rimmed tsuba and the long black tsuka in a white diamond
  wrap; drawn over the body in both facings.
- **Hit, Die, Dead** as the Templar: the snap back with a flash and a step; the knock-down with the
  sword falling free and the sashimono going down with the body.

### Yari Ashigaru (1)
- **Idle** is the key art: the nagae-yari upright in both hands. **Walk**: carried upright at the
  shoulder, held steady (a tall pole sweeping would boil the top of the sprite), the far arm swinging.
  **Run**: levelled at the hip in both hands for the charge.
- **Attack: the thrust** (sōjutsu, underarm, two hands; the thrust capture with the lunge the brief
  adds): 1 the spear comes down level at the hip; 2 chamber, the rear hand back 1 unit, the weight on
  the rear foot; 3-4 the drive, the hips first (frame 3), the front foot lunging 1.7 units, the arms
  shooting the shaft out along its own line, so the point travels straight; 5-6 held at full reach;
  7-11 drawn back slower and raised to the slope.
- **Brace**: crouched low, the front foot forward and the rear foot back, the butt grounded behind
  the rear foot, the point rising at a horse's chest.
- **Die**: forward (the reversed get-up, its first half sped up), the spear falling free ahead.

### Nage-yari Skirmishers (2)
- **Idle** is the key art: a javelin cocked overhead, the bundle on the back, the free arm aiming.
  **Walk** and **Run**: the javelin at the shoulder sloped forward and up, held steady; the free arm
  swings low.
- **Attack: a jab** with the cocked javelin: the weight back, an overhand stab forward and down along
  the shaft with a step, held, back to the cock.
- **Shoot: the throw** (motion-reference §4, Muybridge's javelin thrower): 0-3 the withdraw, the arm
  straight back at shoulder height and the trunk leaning back 16° over the bent rear leg, the free
  arm pointing at the target; 3-4 the front leg plants 1.4 units ahead (the block); 4-5 the delivery
  over the block, released on 5 (the javelin leaves the hand, a new one comes from the bundle on 11);
  6-8 the follow-through, the arm across the body, the trunk folding over the front leg and the rear
  foot lifting behind; 9-11 back to the stance.
- The jacket is dyed deep in the army colour (`samurai.lacTeam`): in the bright flag colour the
  figure's mean value sat on the field's.

### Yumi Ashigaru (3)
- **Idle** is the key art: the yumi upright in the bow hand, an arrow in the other, the ebira at the
  hip. **Walk/Run**: the bow carried upright and steady, the arrow hand at the side.
- **Shoot: kyūdō's hassetsu** on the bow capture (the daikyū photograph for the full draw): 0 the
  stance; 1 the arrow nocked (the arrow in the hand goes onto the string); 2-3 *uchiokoshi*, the bow
  raised above the head in both arms; 4-5 *hikiwake*, the bow coming down to the target as the arms
  open; 5-6 *kai*, the bow arm straight at shoulder height, the draw hand behind the ear with the
  elbow high and back, the arrow at the mouth line; 7 *hanare*, the draw hand flies straight back
  and the bow turns in the hand (*yugaeri*); 8-9 *zanshin*, both arms out in one line, held;
  10-11 the bow lowered, a new arrow from the ebira. The string runs to the draw hand and the yumi
  bends with the draw's length (the bow part reads the frame).
- **Attack**: a stab with the arrow in the fist on a step.

### Teppō Ashigaru (4)
- **Idle** is the key art: port arms beside the planted tate. **Walk/Run**: the gun at port arms in
  both hands, steady; the tate stays where it was planted (not drawn on the march).
- **Shoot** (the gun capture's timing; the Edo manuals for the stance and the reload): 0-2 the gun
  comes up, the short butt *to the cheek*, the far hand under the barrel, the head down along it;
  3-5 the aim, still; 6 fire: the pan flashes at the lock, the muzzle flashes, the smoke starts;
  7 recoil, the muzzle kicking up 15° and the head and shoulders rocking back; 8 settle;
  9-10 the gun stood upright at the near hip, the far hand over the muzzle driving the ramrod down
  (as the men behind the tate in *Ashigaru using shields*); 11 back to port arms. The smoke stays
  where the muzzle was, swelling and drifting up for the rest of the clip.
- **Attack**: the gun levelled at the hip and rammed muzzle-first on a step.
- **Brace**: the volley behind the tate, crouched low on a long stance, the gun at the cheek.
- **Die**: back, away from the tate.

### Sōhei (8)
- **Idle** is the key art: the naginata upright in both hands. **Walk**: carried upright in the near
  hand, steady, the far arm free; the long robe's skirt panels trail the thighs. **Run**: levelled
  forward in both hands.
- **Attack: the sweep** (on the chop capture's rise and drop): 1-3 the naginata swung back and up over
  the near shoulder, the blade high behind and the trunk coiled; 4 the top, the hips turning; 5-6 the
  blade sweeps round in a wide arc forward and down (a solid smear over the blade's reach) as the
  body steps 1.5 units and sinks; 7-8 the blade low and forward past the far knee, held; 9-11 back up.
- **Brace**: *gedan*, deep and low, the blade forward and down at the enemy's knee (the
  fighting-monk photograph).

### Daimyō (10)
- **Idle** is the key art: the gunbai raised forward, the horo on his back. **Walk**: the fan held at
  the chest; the horo swells a little. **Run**: the fan pointing ahead; the horo balloons (its frame's
  bone stretched back 30% and fluttering) and trails the trunk.
- **Attack: the command** with the war fan: 1-3 raised high over the head; 4 held, the line looking
  to him; 5-6 swept forward and down to point at the enemy with a step and a lean; 7-8 the point
  held; 9-11 back to the chest.
- **Brace**: planted wide, the fan held out over the line.

### Yari Cavalry (5)
- The horse is the key art's, split into pieces on bones (`samurai-static` `horsePiece`): far and
  near legs (upper, lower with the knee or hock, hoof), barrel, tail, neck, mane, head with the
  bridle, saddle-cloth, saddle and tassels. The gaits are Muybridge's (`horse-walk`, `horse-gallop`),
  each hoof planted while the plate shows it down; the barrel pitches and bobs with the neck
  pumping against it; the mane is skinned between the neck and a mane bone that trails it and
  streams back at the gallop (`samurai-horse.ts`, after the Templar horse).
- The rider sits on a saddle bone with the foot rig's bones; his hips follow the saddle a frame
  late, his head stays level; the sashimono streams back and flutters at the gallop.
- **Run: the charge**, the yari couched level over the horse's neck. **Attack**: at the gallop, the
  rider leans hard in, the point dips onto the target as the horse drives into it, the trunk is
  thrown back at the impact and settles.
- **Hit**: the horse shies (head up, half a step back) and the rider snaps back; **Die**: the horse
  buckles onto its knees, then its hind legs, the neck stretching out; the rider is pitched back
  over the cantle and the yari falls free.

### Yabusame Archers (6)
- **Idle** is the key art: the yumi across the horse's neck with an arrow nocked to the draw hand.
  On the march and at the gallop the bow is carried braced (no string to the bobbing hand).
- **Shoot: yabusame at the gallop** on the gallop keys: the bow raised over the head (1-2), drawn
  to behind the ear while it comes down (3-5), held (6), loosed with the draw hand flying back (7),
  held in zanshin (8-9), lowered for the next arrow (10-11); the string runs to the draw hand and the
  bow bends with the draw. The rider leans a little forward over the neck and sits plumb while the
  barrel pitches under him.
- **Attack**: a stab with the arrow from the saddle.

### Hatamoto Horse (7)
- **Idle** is the key art: the katana raised, the horo on his back. **Run**: the katana held high
  for the charge; the horo balloons (its bone stretched back 35% with a flutter) and trails.
- **Attack: the cut at the charge**: the katana over the near shoulder, the rider leaning out over
  the neck, the blade falling down the horse's near side under a solid smear, held, back up.

### Ōzutsu (9)
- The key art split into the gun (chocks, plank bed, cradle, the bronze barrel on its own bone, the
  rear block, the shot) and the two crew on bones of their own with moving arms (the Templar
  engine's method): the gunner with the linstock at the breech, the loader with the rammer at the
  muzzle. From behind the crew stand this side of the gun, drawn as back views.
- **Attack/Shoot: load and fire**: 0-2 the loader rams the charge home leaning in over the muzzle
  and draws the rammer out; 3 he steps clear and turns away; 3-5 the gunner leans in and lowers the
  match to the touch-hole; 5 the priming flashes; 6 the gun fires (muzzle flash, smoke); 7 the recoil
  throws the barrel back 1.4 units off its cradle, the muzzle kicking up, the crew flinching; 8-9 it
  settles and is run back; 10-11 the loader swabs the bore. The smoke stays where the muzzle was,
  swelling and rolling up for the rest of the clip.
- **Walk/Run**: the crew heave at the bed with their arms, the gun shuffling on its chocks;
  **Idle**: the match smoulders, the loader leans on his rammer; **Brace**: the gunner crouched with
  the match poised; **Hit**: the gun jolts, the crew reel; **Die**: the barrel is thrown off its
  cradle nose-first and the crew are flung down.

## Critique rounds

### Katana Samurai
1. **Round 1.** The far sode floated as a board beside the hands: the far arm's IK bent its elbow
   the wrong way (the elbow is now bent as the key art bends it). The katana carried at 200° in the
   walk vanished over the blue armour: now carried at the near hip, point up and back, clear of the
   body. The sashimono stayed upright while the man lay dead: in falls the pole follows the chest.
   The lint failed the figure against the field (the bright army-colour lacquer averaged to the
   grass): the armour is now a deep lacquer in the army colour (`samurai.lacTeam`), and the army
   ramps step their hue (violet shadows, warm lights) so none is a straight ramp.
2. **Round 2.** At 2 px a unit the lames striped the dō (the lint's aligned band ends): at level 2
   the lames are one plate, limbs show their tone and shadow side only, and the side plane's edge is
   slanted. The smear was a big pale fan over the head on two frames: now one frame on the blade.
3. **Round 3**, against the kenjutsu photographs: the cut lacked commitment. The step is now long
   (1.6 units), the hips drop into it and the rear leg straightens; the trunk leans 22° at impact.

4. **Round 4** (the coordinator's review): the blade was a thin grey line lost on the armour, now a
   2-3 px blade with an edge highlight and a dark back, drawn over the near sode in NE; the cut was
   a wrist flick, now hands above the right shoulder, a 1.7-unit step, the shoulders turning through
   and the blade running shoulder to far knee under a solid arc; the brace was idle again, now a deep
   low chūdan; the sashimono sways and lags in the run and the cut.

### Yari Ashigaru
1. **Round 1.** A kusazuri panel and the far sode stood out at 60-150° in the idle: the leg and arm
   IK can return a bone a full turn from its rest (358° for -2°), which the Templar `lagCloth` read
   as a 360° swing of the cloth following it. The Samurai rig now has its own copy that takes the
   turns the short way round.
2. **Round 2.** The thrust's point barely travelled: the drive now carries the hips 1.1 units and the
   arms reach out 56°, so the point moves about 3 units in a straight line; the brace was nearly the
   idle, now a deep crouch with the butt grounded.
3. **Round 3.** At level 2 the faction's 16-colour palette merges the pole, the hat and the dō into
   one brown: the chest's lit plane is raised a step and the skirt and sash lowered a step at level 2
   so the figure still takes its light from the top-left.

### Nage-yari Skirmishers
1. **Round 1.** The throw on the captured pitch travelled 1.5 m and ended bent over, far from the
   stance: the body is now authored on a still base (lean back, plant, whip forward, fold, step back).
2. **Round 2.** The mean value of the bright happi sat on the field (lint): deep-dyed jacket.
3. **Round 3.** Walk carry: the cocked javelin overhead in the walk would sweep through the head
   zone; it rides at the shoulder instead.

### Yumi Ashigaru
1. **Round 1.** The loose came a frame late (kai held on 7) and the draw hand flew *up*: hanare is on
   7 now and the hand goes straight back along the arrow's line, as in the zanshin of the photograph.
2. **Round 2.** Against the daikyū photograph: the bow is gripped a third of the way up (the upper
   limb towers over the head) and the draw hand ends behind the ear, not at the chin.
3. **Round 3.** The bow sweeping in the walk would boil the top of the sprite: the bow arm holds the
   key-art pose in the gait.

### Teppō Ashigaru
1. **Round 1.** The gun was presented at the chest, not the cheek: the arms now lift it until the
   butt sits under the cheekbone, as in *Strings for night firing*.
2. **Round 2.** The ramrod hand reached for a muzzle two heads above the hat: the gun is now stood
   low at the hip so the muzzle is at the chin, and from behind the far arm reaches up and forward.
3. **Round 3.** The forward fall carried the body under the tate; the butt-stroke rotated the gun
   muzzle-up. He now falls back, away from it, and the melee rams the gun forward level.

### Sōhei
1. **Round 1.** The sweep against the brief's chop (rise, top, drop with the head lagging, the body
   lower at impact): reads; the smear only covers the blade's reach (5.4-8.6 units), not the shaft.
2. **Round 2.** The brace was copied from the yari (point rising): the naginata guards low, blade
   down, as the monk in the 1893 photograph.
3. **Round 3.** Checked NE: the upright naginata stays on the near side over the cowl's back, and the
   sweep reads the same from behind.

### Daimyō
1. **Round 1.** The command on a standing base (the brace capture, no travel): the lord does not
   lunge, he signals; only a half step with the point.
2. **Round 2.** The horo hung slack at the run: its bone now stretches back with a flutter (the
   balloon filling), and it trails the chest two frames late.
3. **Round 3.** NE: the near hand with the fan is given its own rest (forward of the near shoulder),
   so the fan shows past the horo from behind.

### Lint pass over the seven foot kinds

With all foot kinds on bones the faction's shared low-level palettes (12-16 colours) shifted and
the gate failed in places; the fixes, found with the lint's own frames and per-region light vectors:
- **Grey shadows at level 2**: near-twin materials (bone silk and cotton, mask iron and iron,
  red-brown and shu, black and lacquer, ochre and straw) are painted as one below level 4
  (`samurai-static` `LOW_MERGE`, applied by `samurai-rig` `lowMerge`), so the palette's merges keep
  the hue in the shadows.
- **Light direction**: the dark pixels at the very top of a figure read as the shadow side (the
  sashimono pole at level 2, the javelin in the cocked hand at level 1), and pale props low on the
  right as the light (the tate, the kusazuri's bound hem, the sash's folds): those are toned to
  their place in the form light at the low levels. The skirmisher's happi sleeves are now the
  jacket's own cloth.
- **Aligned band ends** at levels 1-4: okegawa plates show staggered seam dashes instead of full
  lit and dark rows, the bow is one unbroken line with the braced string from level 8, the sash's
  folds from level 8, the limbs' bands taper at level 4, and at 13 px the yari shaft stands a
  pixel outside the body.
- **Values against the field**: the daimyō's horo is a step darker (the dark army colour at level
  1), the yumi's string is waxed hemp and its bindings lacquered, the ebira's fletchings a step down.

Lint (all seven foot kinds, levels 1/2/4/8): no FAIL. Level-1 silhouettes: closest pair 0.74
(Katana Samurai and Daimyō; Teppō and Daimyō), all under 0.85. Warnings left: aligned band ends
0.17-0.30, outline and figure vs ground ΔL 0.07-0.15, mid-widest silhouettes, a few light-angle
warnings (41-68°) and jaggies at levels 1-2 on the skirmisher.

### Yari Cavalry
1. **Round 1** (against Plate 626 and the brief's gallop keys): the gathered suspension and the
   extended phases read, the hooves stay planted, the mane trails.
2. **Round 2.** At levels 1-4 the faction palette had no room for the bay: the near-twin materials
   are also merged at level 4 (`MID_MERGE`), so the horse keeps its browns.
3. **Round 3.** The light read from the bottom-right at levels 1-2 (bright legs and hooves under a
   dark rider): the lower legs and hooves are the darkest tone there, the barrel two big planes
   (croup and back lit, belly in shade), the tail lit with the croup.

### Yabusame and Hatamoto
1. **Round 1.** The yumi in NE was drawn over the horse; from behind it is on the horse's far side:
   it now goes before the horse's body.
2. **Round 2.** The top of the yabusame sprite churned in the walk (lint): the rider rotated with the
   barrel's pitch, swinging the tall bow by whole steps, and the nocked string followed the bobbing
   hand. The rider now sits plumb (Plate 626: the horse moves under him) and the bow is carried
   braced off the shot.
3. **Round 3.** At 13 px the horse archers' black bow over the horse and the white socks at its feet
   inverted the light: the bow is a pale bamboo line and the socks drop out at level 1.

### Ōzutsu
1. **Round 1.** From behind, the crew's mirrored arm rest stretched the far arm across the body:
   they now keep their key-art stance from behind, drawn as back views (as the Templar crew).
2. **Round 2.** The crew lay floating at their feet's height in the wreck: they stand on the far
   side of the bed, so they now drop to the ground there.
3. **Round 3.** Head boil (lint): the two men rocking by fractions of a unit rounded differently
   (their feet stand on different sub-pixel origins) and their hats churned; the idle and the
   shift now move their arms and the gun, never their bodies.

### Lint pass with the mounted kinds and the ōzutsu
The horses, the crew and the bronze brought new colours into the small palettes, so the pass was
repeated: the near-twin materials are also merged at level 4 (`MID_MERGE`), the off-whites never
take their deepest (grey) tone below level 8, the cotton is a little warmer, the horse's lower legs,
hooves, neck and head sit a step down below level 8 and the barrel is two planes there (croup lit,
belly shaded), the white socks show from level 8, the yari shaft and poles are lit at levels 1-2, the
ōzutsu's bed and chocks are the figure's shadowed base at level 1, and the kyahan, the bow and the
tabi lose their painted detail at levels 1-2.

**Lint, all eleven kinds, levels 1/2/4/8: no FAIL.** Level-1 silhouettes: closest pairs 0.83 (the
three mounted kinds, which share the horse), all under the 0.85 gate; the foot kinds 0.66-0.74.

Katana Samurai lint before the pass (level 1/2/4/8): no FAIL. Warnings left: aligned band ends 0.24-0.30, outline and figure vs
ground ΔL 0.07-0.13, light-angle error at levels 1-2, mid-widest silhouettes. Level-1 silhouette:
closest the Daimyō at 0.61.
