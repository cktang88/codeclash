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
