# City people and beasts (HD towns)

The townsfolk, horses, oxen, dogs, hens, crows and carts of the three HD towns: the Templar
commandery, the Samurai castle town and the Undead necropolis. Code: `src/client/render/city/folk-paint.ts`
(materials, finishing, atlas), `folk-people.ts` (the figure rig, clips, clothes, heads, tools),
`folk-beasts.ts` (horse, ox, bone horse, dog, hen, crow, cart), `people-hd.ts` (who lives in each
town, and the cache), with small hooks in `life.ts`.

Study copies live in the git-ignored `references/city-people/` and `references/user-targets/`. Only links
are recorded here. None of the files below is committed. The CC0 sprites were studied but not copied.

## References

### Period sources (public domain)

| Image | Source and licence | What I took from it |
|---|---|---|
| Maciejowski Bible, fol. 23v (Morgan MS M.638), https://upload.wikimedia.org/wikipedia/commons/ (file `Maciejowski_Bible_-_Morgan_Library_&_Museum_MS_M.638,_fol._23v.jpg`), page https://commons.wikimedia.org/wiki/File:Maciejowski_Bible_-_Morgan_Library_%26_Museum_MS_M.638,_fol._23v.jpg | c. 1250, public domain | Men in knee-length tunics, belted, over hose in strong single colours (red, blue). Long robes fall in straight vertical folds from the belt, and the folds run toward the feet. Hoods and coifs frame the face. Beards are short on the jaw. The trebuchet hauler shows the working man: a short tunic, red hose, the body leaning into the rope. |
| Morgan Bible 28r detail, https://commons.wikimedia.org/wiki/File:Morgan_Bible_28r_detail.jpg | public domain | Hose and short turnshoes. A hitched tunic shows the coloured hose to the hip. The figure bends at the hip with a straight back. I used that for the tending and planting pose. |
| Tacuinum Sanitatis, cabbage harvest, https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Tacuinum_Sanitatis-cabbage_harvest.jpg/960px-Tacuinum_Sanitatis-cabbage_harvest.jpg | 14th c., public domain | The woman wears a long gown, the skirt kicked forward by the step, a kerchief over the hair, and a basket carried on the forearm. Those became the Templar women and their `basket` carry. The man carries a load on his head and wears a chaperon with a hanging tail, which became the liripipe on the `hood` and `chaperon` heads. He also has a dagger at the belt. |
| Hiroshige, *Mishima* (Tōkaidō, Hōeidō), https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Hiroshige-53-Stations-Hoeido-12-Mishima-MET-01.jpg/960px-Hiroshige-53-Stations-Hoeido-12-Mishima-MET-01.jpg | 1833, public domain (MET) | The kasa is a wide, shallow, pale straw cone, much wider than the head. Porters wear short indigo kimono with white kasuri splashes and bare legs, with a headband (tenugui) and straw sandals. The pack horse is loaded with straw-wrapped bales. These became `kasa`, `kasuri`, `lower: 'bare'`, `tenugui`, the straw-coloured sandals and the `pack` tack. |
| Hiroshige, *Yokkaichi*, https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Hiroshige-53-Stations-Hoeido-44-Yokkaichi-MFA-01.jpg/960px-Hiroshige-53-Stations-Hoeido-44-Yokkaichi-MFA-01.jpg | public domain (MFA) | A labourer with a bundle tied on his back (the furoshiki `bundle`), a short kimono and gaiters. Also a traveller's cloak blown by the wind. |
| Rakuchū rakugai-zu, Funaki screen, https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Scenes_in_and_around_Kyoto_Funaki_1.jpg/1920px-Scenes_in_and_around_Kyoto_Funaki_1.jpg | early 17th c., public domain | Crowds on castle-town streets: dark kosode with white patterns, women in long kimono with wide obi and their hair up, parasols, carrying poles with a load at each end (`yoke`). |
| Hokusai Manga, bathing people, https://commons.wikimedia.org/wiki/File:Hokusai-MangaBathingPeople.jpg | public domain | Topknots and shaven pates (sakayaki). The topknot lies forward on the crown. Gesture over detail. |

### CC0 pixel art (OpenGameArt; studied, not copied)

| Image | Licence | What I took from it |
|---|---|---|
| Animated Slavic medieval woman, https://opengameart.org/node/100877 (`Woman_Walk_1.gif`) | CC0 | The target scale: a woman about 30 px tall in three-quarter view, with a head about 8-9 px. Feet show alternately below a long skirt. The arms swing against the step. The hem gets an embroidered band. Our figures are 28-31 px tall with a 6×7 head, and the robe hem widens with the stride. |
| Medieval Citizens Vol. 1 sample (farmer), https://opengameart.org/node/191913 | CC0 | Straw hat with a dark band, sleeves shaded separately from the torso, and a dark line between the legs. I took the `straw` hat's band and the dark seam round the near arm from here. |
| Medieval Services Vol. 1 sample, https://opengameart.org/node/191729 | CC0 | Apron, belt, beard and tunic as separate clusters, with a buckle highlight. Used for the smith's apron and beard and the belt buckle pixel. |
| Zombie and Skeleton 32x48, https://opengameart.org/node/14803 | CC0 | The skeleton's ribcage as bone bars over a dark hollow, knees bent, a slight hunch, red eyes, and a contact shadow ellipse. Used for `paintRibs`, the green-eyed skulls and the shadow under every figure. |
| Some zombie, https://opengameart.org/node/37762 | CC0 | The shambler's arms are held out forward and the gait is stiff. Used for the `shamble` pose: arms out, short stride, a stiff leg, lean 18°. |
| Animated horse, https://opengameart.org/content/animated-horse (`HorseWalk_0.gif`, `HorseEat_0.gif`) | CC0 | A ~40 px horse with an 8-frame lateral walk (hind, fore, hind, fore), darker far legs, a black mane and tail, and a head bob. The graze puts the muzzle to the ground with a chewing loop. Our horse follows that sequence (`ph` 0, 0.25, 0.5, 0.75) and has a 6-frame graze. |
| German shepherd, https://opengameart.org/content/german-shepherd-0 (`Shepherdwalk.gif`) | CC0 | The dog trots in diagonal pairs, with a dark saddle along the back, ears up and the tail up. |
| Chicken sprites, https://opengameart.org/content/chicken-sprites | CC0 | A hen of 8-10 px: tail feathers up and back, a red comb, a peck frame with the head down to the ground. |

### User targets (`references/user-targets/`, see user-targets.md)

- `town-displate.jpg`, `town-gstatic.png`, `town-redbubble.png`: warm sun and cool violet shade. Dark
  coloured outlines (never pure black) close every form, and the detail level is high. The figures
  have to sit in that light, so their ramps are hue-shifted toward the town's key and ambient (`folkRig`),
  and the night uses the buildings' own night rig (`rigFor`) with moonlit rims.

## What was built

- **Scale.** Adults are 28-31 art pixels tall (one art pixel is half a world pixel, the HD buildings'
  density). Children are about 22. The head is 6×7. Soldiers from the battle sheets in the yard stand at the same height.
- **Figure.** A 2D rig with hip, knees, ankles, shoulders, elbows, hands and head. Limbs are tapered rods
  (`Paper.rod`) lit from the upper left. The body is one polygon shaded across its axis, and its folds
  run from the belt toward each knee (a robe's toward each foot), so they move with the legs. The near
  arm has a dark seam so it reads over the body. Contact lines (`Paper.contact`) and the small-cluster
  cleanup (`Paper.clusters`) come from the paper painter, and a coloured outline is added
  (`folk-paint.ts finish`): the darkest tone of the colour it bounds, darker on the lower right.
- **Faces.** An eye, a brow (men), a nose pixel past the profile, a mouth in its own material (so the
  cleanup keeps it), an ear, and a beard on the jaw.
- **Heads.** hair, coif, hood, chaperon, wimple, kerchief, straw hat, slouch hat, cap (Templar); kasa,
  jingasa, eboshi, topknot, tenugui, shimada bun, shaven (Samurai); skull, cowl with green eyes, hood (Undead).
- **Clips.** Walk: 8 frames, from the distance walked. Idle: 4. Work loops of 8 frames: hammer (slow
  wind-up, hold, fast strike with a smear, ring, recover), saw, dig (push, foot on the spade, lever,
  lift, toss), scythe, tend (bent double), pray (hands joined, a bow), sweep. Carrying: sack and
  bundle on the shoulder, plank, bucket, basket, lantern, book, staff, parasol, carrying pole with two
  baskets, spade and broom over the shoulder.
- **Beasts.** Horse with walk (8), idle (4, tail swish), graze (6, chewing) and toss (4). Tack: the
  Templar caparison with the cross, the Samurai war saddle with red tassels, the pack saddle with straw
  bales. Ox for the castle town's carts. Bone horse (ribs over a dark hollow, skull, green eye). Dog
  (trot 8, sit, stand wagging), hen (stand, peck), crow (4-frame flap, the necropolis's bigger ragged
  carrion birds with a red eye), cart (wheel turning over 4 frames, rice bales in the castle town).
- **Boil-free.** Angles snap to 7.5° and joints round to whole pixels. A part is always redrawn from the same
  outline, never rotated as an image. Every frame is painted once and kept.
- **Light.** Ramps are built in OKLCH from each look's colours under the town's rig: a warm key on the lit
  side and a cool violet in the shade, never black or white. At night the buildings' night rig
  (`nightCanvas`) is applied to each frame: a cool palette, a navy outline, and a moonlit rim on the edges
  facing the moon. The night twin is laid over the day frame at the town's night opacity. Every figure
  has a contact shadow, a three-row ellipse lying a little toward the sun's cast.
- **Cache.** One atlas per town (`FolkAtlas`), on 1024×512 pages, with a night twin of each page. Frames
  are painted when first drawn, at up to 8 ms of painting per drawn frame. Past that budget a
  painted frame of the same clip stands in.

## Critique rounds (against the references)

1. **First draw.** Faces read as a dark mask, because the hair cap and beard covered all but three
   columns. The near arm vanished into the body (same cloth, no line). The stride was a lunge, wider
   than the Slavic woman's walk. A sack sat over the head. The wimple swallowed the face. The scythe
   was held like a club. Fixes: the hair stays behind the ear and above the brow, beards only on the
   jaw, a dark seam round the near arm, a shorter stride and toe-off, the load slung behind the head,
   a bigger face opening, and a low scythe swing with a proper crescent blade.
2. **In the towns at zoom 4.** The tenugui read as a blindfold (moved above the brow). Skeletons
   were white mannequins next to the CC0 skeleton (they now have a ribcage over a dark hollow,
   vertebrae, a pelvis and rags). Parasol canopies, staffs and the necromancer's skull hung at the
   bottom of their shafts (fixed the tool direction). The furoshiki bundle disappeared into indigo
   kimono (now green). The dog was a table on legs (now slimmer, legs angled, a curled tail).
3. **Finish.** Colours per figure went down from about 40 to about 31 (the xave_pixel 32 px figure
   has about 26): the lit outline is the material's own darkest tone and the arm seam is the cloth's
   tone 0. Merchants carry a book, not planks. Night and day were checked in all three towns.

## Checks

- Classic is pixel-identical: classic screenshots of all three factions at level 12, day and night,
  against master (438e2c0) differ in no pixel.
- Folk pixel checks (frames of every look's walk, `folklint`): orphan pixels 9-11% of a figure (the
  1 px eye, nose and buckle; the city lint warns above 12%), 25-32 colours per frame on average.
  `pnpm pixel-lint --only=city --quick` has the same 3 failing checks as before (the buildings of the
  undead and samurai towns), none from the folk.
- Frame time (headless Chromium, SwiftShader, 2560×1440 output, all buildings at level 20, 60 s of
  simulated warm-up, then 240 frames; p50 of `CityScene.lastCost`, master 438e2c0 → this branch):

  | town | day, zoom 1 | day, zoom 4 | night, zoom 1 | night, zoom 4 |
  |---|---|---|---|---|
  | Templar | 8.7 → 9.2 ms | 7.6 → 7.8 ms | 10.9 → 10.8 ms | 8.4 → 8.5 ms |
  | Samurai | 7.1 → 7.2 ms | 5.2 → 5.9 ms | 9.7 → 9.8 ms | 7.0 → 7.3 ms |
  | Undead | 8.7 → 9.5 ms | 7.3 → 7.9 ms | 10.6 → 10.8 ms | 7.6 → 7.9 ms |

  Painting is lazy, with up to 8 ms per drawn frame. In the first minute a level-20 day town paints
  about 1,000 frames (mirror copies included) in 230-390 ms in total. The worst single frame while the
  town is first shown is 70-190 ms (master: 40-80 ms). Figures that miss the budget borrow a painted
  frame of their clip or wait a frame.
- Memory: folk sheets 4.75 MB → 12 MB by day after a minute (three 1024×512 pages, each with its
  night twin) and 3 → 8 MB at night (fewer people about).
- `pnpm typecheck`, `vitest run` (542 tests) and `pnpm build` pass.

Screenshots: `docs/screenshots/city-detail/people-<faction>-{before,after}-z4-day.png` (zoom 4, the
yard at level 20), `people-<faction>-{before,after}-z8-day.png` (the same, doubled crop, as at
zoom 8), and `people-templar-{before,after}-z4-night.png` and `people-undead-after-z4-night.png`.

# Round 2 (quality pass after the user's review)

The user's notes on round 1: a walker beside the dog looked broken in all three towns, the undead
cowls were black balls on sticks, the shading was flat next to the battle units, the proportions were
stubby and the beasts were thin.

## More references

Study copies in the git-ignored `references/city-people2/`.

| Image | Source and licence | What I took from it |
|---|---|---|
| rehcub, *2d character monk*, https://opengameart.org/sites/default/files/monk.png (page https://opengameart.org/content/2d-character-monk) | CC0 | The hood is a dome with a point that falls back, and the face opening is a dark oval framed by the hood's lit edge. The robe widens like a bell from the cord belt to the hem, and its folds are long vertical dark ridges. The hands are held together in front. This became `paintHood` (the peaked shell, the opening, the gugel cape), the wider robe hem and the cultists' candle held in both hands. |
| rmazanek, *Dog*, https://opengameart.org/sites/default/files/dog_medium.png and `dog_medium_sitframe.png` (page https://opengameart.org/content/dog-3) | CC0 | The husky has a deep chest and a tucked waist, a tail that curls up over the back, a wedge head with pricked ears, and a dark saddle that still leaves a lit line along the spine. The new `paintDog` uses two body masses, a lit back line, a shaded belly, a plumed tail and an ear triangle. |
| Jason of GDN, *Dog Spritesheets*, https://opengameart.org/sites/default/files/spritesheet_brown.png (page https://opengameart.org/content/dog-spritesheets) | CC0 | At about 16 px a dog is a rounded block with legs, a raised head and a tail. Silhouette matters more than detail. The paws are a pixel wider than the legs. |
| alizard, *Pixel wolf*, https://opengameart.org/sites/default/files/styles/medium/public/wolf_run.gif (page https://opengameart.org/content/pixel-wolf) | CC0 | The pale back runs over a darker belly in one long light plane, and the tail extends the line of the back. |
| Our battle sheets: `docs/screenshots/hd-sprites/templar-anim-k0-L8.png`, `undead-anim-k5-L8.png` / `k7` (skeletal mounts), `undead-battle-hd-seed3-zoom5-knights.png` (hooded dead) | ours | The shading standard. Each material has four tones lit from the top-left, folds have a lit ridge, there is a dark coloured outline, fists are visible and the boots have soles. The skeletal horse has dark sinewed bones in the legs and ribs and a pale skull with a dark socket. The hooded dead show a **pale skull face** with two eye sockets inside a dark hood. That pale face is what makes a cowl read at a distance. |
| User targets `references/user-targets/town-redbubble.png` (and displate, gstatic) | reference only | Warm wood and stone, and dark brown coloured outlines rather than black. Lit planes are clearly separated from shade. The figures have to hold that contrast. |

## What was wrong, and the fixes

- **The broken walker next to the dog.** I identified it by hiding entities one at a time and diffing the
  frame (`who.cjs` in the scratchpad). It is a villager carrying a bucket (`villager(17, 'bucket')`, e.g. walker 8 in the
  Templar yard), and the dog was at the same depth beside him. Three things combined:
  - The bucket hung at the knee as a striped band across the legs, so the body read as cut in two.
  - Dark hair and a beard (or, in the necropolis, a dark hood) made a dark ball at the top of the figure.
  - The dog, kept at (u−4, v+3) from the walker it follows or wandering anywhere within 14 of him, sat
    on or behind his body.

  Depth sorting itself was correct (`d = u + v`, so the dog was drawn first). The fixes:
  - The bucket is now a stave bucket hanging by its bail from a straight arm, drawn before the fist so
    the hand closes over the bail. It has a lit rim, water and two hoops.
  - In HD a following dog keeps 13 world px to the walker's heel side, at the same depth as his
    feet. It wanders only on that side and runs to catch up. Classic keeps its old spot.
  - Short hair seen from behind stops above the nape, and the neck and ears show under it.
  - Hair and hats have a wider ramp with a lit sheen.
  - Raised arms no longer cover the face. Sacks and bundles are slung on the back with a strap, and a
    plank sits on the shoulder behind the head.
- **Mirrored frames are lit from the top-left.** A west-facing frame is now painted as its own frame. It
  is drawn with `Paper.lightX = −1` and then `Paper.mirror()`, the approach in `paper/facing.ts`.
  The hand-written light terms (`oval`, kasa, jingasa, parasol, bucket, ear, hood rim) go through
  `c.litX` / `c.litLeft()`. The atlas no longer copies the east-facing image flipped. It holds the
  same number of cells as before, because the old flipped copies were cells too.
- **Cowls.** `paintHood` draws a peaked shell, shaded by plane with a dark core on the lower right.
  - A seam runs down the shell with a lit ridge beside it.
  - The brow rim catches the light.
  - A gugel cape widens past the shoulders. Its hem is a shade line under a lit band, and its front falls to a point.
  - Inside a cowl is a pale skull face: brow, cheekbones and jaw, dark sockets with a green glint, and a nose hole. These are kept
    colours, because the contact pass would sink a 3 px face into the shadow.
  - On a plain hood the face is painted first and the shell goes round it. The contact pass then
    draws the inner shadow along the opening.
  - Undead cultists hold a candle in both hands, with a pale green flame.
  - Shamblers lean 26°. Their hands reach forward and down, and rag tatters hang from the hem.
- **Shading.**
  - The body has four tones across its axis: a lit plane, the colour, a shade plane and a deep core on
    the far edge. The tops of the shoulders are lit one or two steps higher.
  - Folds are a valley line with a lit ridge on the light side.
  - On the lit side the outline is two steps below the edge pixel (sel-out). On the shade side it stays
    the material's darkest tone pulled toward the outline colour.
  - Fists are 2×2 with a lit knuckle. Shoes are planted flat.
- **Proportions.**
  - Men: thigh 7.5, shin 7.5, torso 10.5, head 5.2×5.6, shoulders 8.4 across over a 5.4 waist.
  - Women: a 4.8 waist, and gowns flaring to the hem.
  - Children: a bigger head for their size.
  - Measured, an adult is 35-36 art px tall with a 5-6 px head, so about 6.5 heads (7 with the hood or hat).
  - Arms reach mid-thigh. Legs taper from 3.6 to 2.1 px, so there are no stick legs.
  - The stride is shorter (15° instead of 20°), so the feet stay under the hips.
- **Beasts.**
  - Dog: a deep rounded chest and the haunch as two masses, a tucked waist, a lit back line, the belly
    in shade, a plumed tail lit at the tip, an ear triangle and wider paws.
  - Horses and oxen: lit tops on the quarters and the shoulder, a groove behind the shoulder and a
    deep belly line.
  - Bone horse: matches the battle mounts, with dark sinew-brown legs, ribs and spine over a near-black
    hollow, a pale skull with a dark socket and a green eye.
  - Crow: a stout body tapering to the tail, a round head and a pointed bill. The wing is never level
    (up, half up, down, half down), so the bird is never a stick.

## Critique rounds

1. **Contact sheets** (`sheet.cjs` modes `hoods`, `bucket`, `dirs`, `roles`, `beasts`).
   - Hoods read as long hair: the hanging tail rod and an unshaded cape. I removed the tail on hoods
     (chaperons keep it) and gave the cape a pointed front and a hem line.
   - The cowl's face vanished into the opening, so it became kept skull pixels.
   - The sack carrier's raised arm hid his face, so the load went on the back.
   - The plank crossed the mouth, so it moved to the shoulder, behind the head.
   - The shambler's arms made a T with the cape, so they were lowered.
2. **In the towns at zoom 4 and 2× crops, day and night, against the battle sheets.**
   - The back of a dark head was still a ball, so the nape and ears now show, with a hair sheen.
   - The dog trailed behind walkers' heads, so it now walks at the heel side.
   - The undead hoods were too dark on the dark ground, so they are sackcloth greys now.
   - Kasa and parasol light was mirrored wrong on west-facing frames, which `litX` fixed.
3. **Final pass.**
   - The gravediggers' felt hats were dark balls, so they got a lighter felt with a band and a lit crown.
   - I compared night frames: the moonlit rim now runs along the hood, the cape and the bucket.
   - What is still short of the battle sheets: the figures are about 35 px against the battle's
     L8, so folds are single lines and faces are three or four pixels.

## Checks (round 2)

- **Classic is pixel-identical.** I took classic screenshots of all three factions at level 12, by day
  and by night, from this branch and from master (648315d), and no pixel differs. In classic the dog's
  spot, wander and pace go through the old code path.
- **Frame time.** Measured as in round 1: headless Chromium (SwiftShader), 2560×1440, every building
  at level 20, 60 s of warm-up, then 240 frames. The p50 of `CityScene.lastCost`, master → this branch:

  | town | day, zoom 1 | day, zoom 4 | night, zoom 1 | night, zoom 4 |
  |---|---|---|---|---|
  | Templar | 9.3 → 9.0 ms | 7.6 → 7.7 ms | 10.2 → 11.0 ms | 8.0 → 8.5 ms |
  | Samurai | 6.6 → 6.7 ms | 5.2 → 5.2 ms | 9.3 → 9.3 ms | 6.9 → 7.0 ms |
  | Undead | 9.4 → 8.9 ms | 7.6 → 7.3 ms | 10.3 → 10.3 ms | 7.7 → 7.4 ms |

  The worst change is Templar by night at +8%. Everything else is within ±6%. Because mirrored frames
  are now painted rather than copied, a level-20 day town paints about 1,650-1,700 frames in its first
  minute instead of about 1,000, which takes 380-440 ms of painting instead of 215-265 ms. That cost is
  spread over the 8 ms per-frame budget. The worst warm-up frame went down, from 64-87 ms to 51-59 ms.
- **Memory.** The folk sheets take the same space as before: 12.0 MB by day and 8.0 MB by night. Mirrored
  cells take the place of the flipped copies.
- **Folk pixel checks** (`folklint`, every look's 8-frame walk), master → this branch:
  - Orphan pixels per figure: 9.3-11.3% → 11.2-12.8%. Most of them are single pixels that I put there
    on purpose: diagonal runs of the new lit-side outline, the kasuri splashes and the skull face's
    kept pixels.
  - Colours per frame: 25-32 → 29-37. The new tones are the fourth body tone and the lit outline.
  - Head boil across the walk: 0.
- `tsc --noEmit`, `vitest run` (543 tests) and `pnpm build` pass.

Screenshots, in `docs/screenshots/city-detail/`:
- `people2-<faction>-{before,after}-z4-{day,night}.png`: zoom 4, the yard at level 20.
- `people2-<faction>-{before,after}-z8-{day,night}.png`: a 2× crop of the same, as at zoom 8.
- Contact sheets: `people2-templar-roles.png`, `people2-undead-hoods.png` and `people2-beasts-{templar,undead}.png`.
