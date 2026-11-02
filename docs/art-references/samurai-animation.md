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

Katana Samurai lint (level 1/2/4/8): no FAIL. Warnings left: aligned band ends 0.24-0.30, outline and figure vs
ground ΔL 0.07-0.13, light-angle error at levels 1-2, mid-widest silhouettes. Level-1 silhouette:
closest the Daimyō at 0.61.
