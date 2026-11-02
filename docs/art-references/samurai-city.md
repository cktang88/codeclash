# The Samurai castle town (HD city)

References for `src/client/render/city/samurai.ts`, the Samurai rows of `ground-hd.ts` (paddies,
moat, pines) and the Samurai looks in `people-hd.ts`. These images were studied in the session
scratchpad and none of them are in the repository. Every pixel of the city is painted by our own
code.

The plan follows a Sengoku jōkamachi. The castle's tenshu stands on an ishigaki base in the
inner bailey. The bailey is closed by plastered dobei walls with corner yagura and a yagura-mon
gate, and moats and rice paddies lie outside it. Each building is the commandery's counterpart
on the same lot (see the header of `samurai.ts`).

## Castles and walls

| Reference | Licence | What we took |
| --- | --- | --- |
| [Tenshu of Himeji Castle](https://commons.wikimedia.org/wiki/File:Tenshu_of_Himeji_Castle_13.jpg) | CC BY-SA 4.0 | The grand tier: white shikkui walls, stacked grey kawara skirts with white ridges, long white dobei on battered stone. The plaster ramp is lit cream (`#f3ecd9`) and shaded lavender-grey (`#aaa6a6`). The tier-4 tenshu has five storeys and no boards. |
| [Matsumoto Castle](https://commons.wikimedia.org/wiki/File:Matsumoto_Castle05s5s4592.jpg) | CC BY 2.5 | Black-stained shitamiyita boards under narrow white bands, and the keep rising straight out of the moat on a low ishigaki. Tier 3 has black boards on the lower 40% of every storey. The Samurai ground puts a wide moat outside stone walls. |
| [Hikone Castle](https://commons.wikimedia.org/wiki/File:Hikone_castle5537.JPG) | CC BY 2.1 JP | Chidori-hafu: triangular gable dormers standing on the skirt roofs. Each gable is white with a gilt fin, and the black lower walls carry gold fittings. These are the `hafu()` dormers on the tenshu's skirts and the gilt points on gables. |
| [Hitoyoshi Castle ishigaki](https://commons.wikimedia.org/wiki/File:Hitoyoshi_Castle,_ishigaki.jpg) | CC0 | Ishigaki are big rough granite blocks in uneven courses, with dark joints, lichen and moss low down, a battered face and a capping course. The `ishigaki()` shader uses 5-px courses, blocks 6-10 px wide offset per row, 1-px dark joints, a lit top edge on the lit face and rare moss. The batter comes from `frustum()`. |
| [Gilt shachihoko, Nagoya Castle](https://commons.wikimedia.org/wiki/File:Dolphin_of_Nagoya_Castle_2.JPG) | CC0 | The tiger-headed carp at each ridge end, gold with a raised tail. It is reduced to a 9-pixel gilt flick (`shachiAt`) on the top roof of tier 3 and above. |

## Town, shrine and work

| Reference | Licence | What we took |
| --- | --- | --- |
| [Streets of Gion, Kyoto](https://commons.wikimedia.org/wiki/File:Streets_of_Gion,_Kyoto_-_Gion7712.jpg) | CC0 | Machiya: ochre plaster, dark wooden koshi lattices in front, a low second storey, grey kawara with rolled rows, and one red lantern as the street's accent. The physician's house has a lattice front, a low upper storey, a noren and a paper lantern. Kawara are drawn as 3-px columns: lit, mid, then a dark gap. |
| [Kura door](https://commons.wikimedia.org/wiki/File:Kura_door.JPG) | CC BY-SA 3.0 | Namako-kabe: dark square tiles set diagonally with raised white plaster joints, below thick white plaster, with heavy doors. This became the `namako` window kind (a 6-px diagonal lattice) on the kura storehouses. |
| [Kyūdōjō at Mishima Taisha](https://commons.wikimedia.org/wiki/File:%E5%BC%93%E9%81%93%E5%A0%B4_-_%E4%B8%89%E5%B3%B6%E5%A4%A7%E7%A4%BE.jpg) | CC BY-SA 4.0 | The shajō is a raised wooden floor, open on the target side, under a deep roof, with the archers in a row. The azuchi (a sand bank) has its own little roof, and the mato are black and white rings. |
| [Byōdō-ji main hall](https://commons.wikimedia.org/wiki/File:Byodo-ji,_Main_Hall_01.jpg) | CC BY-SA 4.0 | A temple hall's irimoya roof (a hip with a gable on top) and deep eaves on a stone platform. `irimoya()` is a hip roof at 62% of the rise with a gable above. It covers the dōjō, the halls and the top of the keep. |
| [Matsumae castle town byōbu (Kodama Teiryō)](https://commons.wikimedia.org/wiki/File:Byobu_of_Matsumae_by_Kodama_Teiryo.jpg) | Public domain | The castle town as a whole: the castle on its height, lines of grey-roofed townhouses, shrines among trees and fields at the edge. It confirmed keeping the lots and roads and changing the buildings. |
| [A couple viewing rice planting (ukiyo-e, LACMA)](https://commons.wikimedia.org/wiki/File:A_Couple_Viewing_Rice_Planting_LACMA_16.16.18.jpg) | Public domain | Planters bent double in flooded plots in sedge hats, with pines on the bunds. The Samurai farmers wear `kasa` and work in the bent `tend` pose, and the fields are flooded paddies split by aze bunds with seedling clumps. |
| [Rice planting, Katori](https://commons.wikimedia.org/wiki/File:Rice-planting-machine_2,katori-city,japan.JPG) | CC BY-SA 3.0 | Paddy water is a grey-green sky reflection, not blue. The seedlings stand in regular rows of small clumps. Water uses `#6f8a8c` with a few lighter glints, and the clumps are three blades in two greens. |

Shrine notes, from general knowledge of Ise and Izumo-style honden and checked against the temple
photo: the honden is raised on posts. It has chigi (crossed finials) and katsuogi (logs) on a
cypress-bark ridge, a shimenawa rope with white shide over the door, a vermilion torii and stone
tōrō on the approach, and a shōrō bell house. At tier 4 a three-storey pagoda stands beside it,
because shrine and temple shared precincts until 1868.

## Rules applied (pixel-art craft, `scratchpad/pixel-art-craft.md` and xave_pixel's 128/64/32 sheet)

- Clean clusters, never per-pixel noise. Ground tone is chosen per 4×2-pixel cell. Textures are
  regular: kawara columns, ishigaki courses and board lines every 3 px.
- Hue-shifted ramps of 4 steps per material. Plaster is cream to lavender, wood brown to
  violet-black, and tile is blue-grey.
- Coloured outlines. People take a dark tint of the neighbouring colour, and buildings keep the
  dark aubergine `#1b1418`.
- One saturated accent per element: shrine vermilion, gilt on the ridges, the nobori's mon, the
  sakura (one pink tree in five).

## Critique rounds (2560×1440 screenshots, scratchpad `r1`–`r3`)

1. **Round 1:** the tenshu read as a pile of roofs: storeys hidden under 30%-rise skirts, black
   boards on 55% of each storey, white hip lines running down the middle like a seam. The
   topknot read as a top hat. The moat ran off past the corners (an old classic-ground bug). The
   chidori-hafu were hidden inside the roof slopes.
2. **Round 2:** storeys raised and skirts lowered to a 16% rise, so more white wall shows
   (Himeji). Boards cut to 40% (Matsumoto) at tier 3 and dropped at tier 4. Hip lines in a light
   tile tone. Moat strips clamped to their own sides. Topknot made a flat knot over a shaven
   pate. The engine became an ōzutsu (a bronze bombard) with smoke.
3. **Round 3:** chidori-hafu moved onto the slope just above each eave, so their white
   triangles and gilt fins show (Hikone). Checked against the references at zoom 4: the ishigaki
   batter and courses, the kura's namako and the gate's yagura-mon.

4. **Round 4 (fixes):** the chidori-hafu read flat. Each now has thick barge boards with a white
   line of end-tiles along their tops, a two-pixel shadow under the eaves on the plaster, a dark
   tie-beam at its foot and a hanging gilt fin (`gableDepth`), which is how the Hikone gables
   read. The armourer's lean-to now has an open mono-pitch roof, so its fire is seen under it,
   not painted over a roof. City soldiers are drawn from the HD sprite sheets at the city's own
   density, a pace further apart.

## Study copies and direct image links

The images above were downloaded as study copies to `references/samurai-city/` (git-ignored, never committed).
Each is linked here as a direct image, with its Commons page and licence.

| Local copy | Image | Page | Licence |
| --- | --- | --- | --- |
| `references/samurai-city/sam-himeji.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Tenshu_of_Himeji_Castle_13.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Tenshu_of_Himeji_Castle_13.jpg) | CC BY-SA 4.0 |
| `references/samurai-city/sam-kumamoto.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Hitoyoshi_Castle%2C_ishigaki.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Hitoyoshi_Castle,_ishigaki.jpg) | CC0 |
| `references/samurai-city/sam-machiya.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Streets_of_Gion%2C_Kyoto_-_Gion7712.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Streets_of_Gion,_Kyoto_-_Gion7712.jpg) | CC0 |
| `references/samurai-city/sam-kura.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Kura_door.JPG?width=640) | [page](https://commons.wikimedia.org/wiki/File:Kura_door.JPG) | CC BY-SA 3.0 |
| `references/samurai-city/sam-paddy.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Rice-planting-machine_2%2Ckatori-city%2Cjapan.JPG?width=640) | [page](https://commons.wikimedia.org/wiki/File:Rice-planting-machine_2,katori-city,japan.JPG) | CC BY-SA 3.0 |
| `references/samurai-city/sam-matsumoto.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Matsumoto_Castle05s5s4592.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Matsumoto_Castle05s5s4592.jpg) | CC BY 2.5 |
| `references/samurai-city/sam-byobu.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Byobu_of_Matsumae_by_Kodama_Teiryo.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Byobu_of_Matsumae_by_Kodama_Teiryo.jpg) | Public domain |
| `references/samurai-city/sam-shachi.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Dolphin_of_Nagoya_Castle_2.JPG?width=640) | [page](https://commons.wikimedia.org/wiki/File:Dolphin_of_Nagoya_Castle_2.JPG) | CC0 |
| `references/samurai-city/sam-kyudojo.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/%E5%BC%93%E9%81%93%E5%A0%B4_-_%E4%B8%89%E5%B3%B6%E5%A4%A7%E7%A4%BE.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:%E5%BC%93%E9%81%93%E5%A0%B4_-_%E4%B8%89%E5%B3%B6%E5%A4%A7%E7%A4%BE.jpg) | CC BY-SA 4.0 |
| `references/samurai-city/sam-temple.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Byodo-ji%2C_Main_Hall_01.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:Byodo-ji,_Main_Hall_01.jpg) | CC BY-SA 4.0 |
| `references/samurai-city/sam-ricefarm.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/A_Couple_Viewing_Rice_Planting_LACMA_16.16.18.jpg?width=640) | [page](https://commons.wikimedia.org/wiki/File:A_Couple_Viewing_Rice_Planting_LACMA_16.16.18.jpg) | Public domain |
| `references/samurai-city/sam-hikone.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Hikone_castle5537.JPG?width=640) | [page](https://commons.wikimedia.org/wiki/File:Hikone_castle5537.JPG) | CC BY 2.1 jp |

## Detail pass (2026-11): a town with a ton of detail

The user's targets (`references/user-targets/town-gstatic.png`, `town-redbubble.png`,
`town-displate.jpg`; study only, never committed) are dense, lived-in pixel towns. They show
clutter at every wall foot, individual roof tiles, stones with mortar, timber framing, plank
doors with iron, sills, weathering and moss, and cobbles with grass. They also have strong sun:
golden-hour warm pools against cool blue-violet shade, lanterns and windows glowing even by day,
and vines in curtains. The Samurai town was rebuilt toward that, in the iso view at the HD
density (2 buffer pixels per unit, zoom to 8×). The work is in `samurai.ts` (materials and
buildings) and `samurai-props.ts` (props, light, ground decals). The props go through the shared
library (`props.ts`: `registerProp`, `registerTheme`).

### New references (study copies in `references/city-samurai-detail/`, git-ignored)

| Local copy | Image | Page | Licence | What we took |
| --- | --- | --- | --- | --- |
| `rakuchu-uesugi-gion.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/EITOKU_Uesugi-Gion-matsuri.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:EITOKU_Uesugi-Gion-matsuri.jpg) | Public domain (Kanō Eitoku, Rakuchū-rakugai-zu, Uesugi screens) | The town from above, our camera: grey roofs in dense rows, each roof a grid of tile courses; lattice fronts, noren and blinds at street level; pines and gold mist between. Clutter belongs at the eaves' foot, and the roofs carry the texture. |
| `namako-house.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Namako-kabe_house_(4003011809).jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Namako-kabe_house_(4003011809).jpg) | CC BY-SA 2.0 (emi moriya) | Namako: dark square tiles set diagonally, raised white joints wider than a line, lit on one side. The lattice went from a 6-px to an 8-px period with 2-px joints, the lit edge one step lighter. Also a row of round end tiles along every eave, and onigawara at ridge ends. |
| `komodaru-toshogu.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Sake_barrels_at_Toshogu_shrine,_Nikko,_Japan.JPG?width=960) | [page](https://commons.wikimedia.org/wiki/File:Sake_barrels_at_Toshogu_shrine,_Nikko,_Japan.JPG) | CC BY-SA 2.5 (MichaelMaggs) | Komodaru: white straw-wrapped drums stacked in pyramids, rope bands near top and foot, a bold painted label (red, green, black). `komodaru()` draws drums with two rope bands and a coloured badge with a brush stroke on the lit side. |
| `ishiotoshi-kumamoto.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Isiotosi_machicolation_of_Gennosinyagura_Hoarding_Kumamoto_Castle.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Isiotosi_machicolation_of_Gennosinyagura_Hoarding_Kumamoto_Castle.jpg) | CC BY-SA 4.0 (Mukai) | Ishi-otoshi: a boarded bay that projects over the ishigaki with a slanted underside, black boards with battens, a small sama. Drawn on the corner yagura and the keep's first storey. Shitamiita became horizontal overlapping boards with vertical battens. |
| `onigawara-ritsurin.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Late_Edo_onigawara_from_Ritsurin.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Late_Edo_onigawara_from_Ritsurin.jpg) | CC0 (Photos of Japan) | The onigawara is a broad dark-grey block with flaring ears, wider than the ridge. At our size it is a low broad block with a lit pixel per ear; a tall one read as a spike. |
| `komainu-fushimi.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Komainu,_Fushimi_Inari-taisha,_Kyoto,_20240818_1404_4482.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Komainu,_Fushimi_Inari-taisha,_Kyoto,_20240818_1404_4482.jpg) | CC BY 4.0 (Jakub Hałun) | A guardian seated on a tall plinth with a banded top: stacked lumps (haunch, chest, maned head), pale weathered stone with lichen, one open-mouthed and one closed (a-un). |
| `pagoda-kiyomizu.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Sanjunoto,_Kiyomizu-dera_(36860171592).jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Sanjunoto,_Kiyomizu-dera_(36860171592).jpg) | CC BY 2.0 (DavideGorla) | A vermilion sanjūnotō with a deep dark band of bracketing under each eave and a tall bronze sōrin of rings. The pagoda got a dark-gold bracket band, a railed balcony per storey and nine two-tone rings with a flame. Also: azaleas in flower before the temple, maple and pine overhead. |
| `torii-shide.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Shide_jinja_-_Torii_1.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Shide_jinja_-_Torii_1.jpg) | CC BY-SA 4.0 (運動会プロテインパワー) | The shimenawa: a thick twisted straw rope sagging between the pillars, thickest in the middle, white zig-zag shide hanging; komainu and tall stone lanterns in pairs at the approach. `shimenawa()` twists light and dark strands diagonally and steps the shide. |
| `ema-suga.jpg` | [image](https://commons.wikimedia.org/wiki/Special:FilePath/Ema_at_Suga_Shrine_in_Shinjuku,_Tokyo,_9_December_2024.jpg?width=960) | [page](https://commons.wikimedia.org/wiki/File:Ema_at_Suga_Shrine_in_Shinjuku,_Tokyo,_9_December_2024.jpg) | CC BY-SA 4.0 (Yuet Man Lee) | The ema rack: a vermilion frame under a small roof, rows of pale pentagonal plaques on white cords, a few brush marks each. |
| `oga-jetrel-japanese-iso.png` | [image](https://opengameart.org/sites/default/files/jpisotbs.png) | [page](https://opengameart.org/content/japanese-buildings-isometric-strategy-game-mockup) | CC0 (Jetrel) | Japanese buildings at our iso angle in low-res pixel art. Roofs dominate the silhouette, the eaves overhang deeply, and grass and a pink cherry crown read as clumps, not noise. Our tree pads are lumpy clusters, each lit on its own corner. |
| `shogun2-steam-1.jpg` | [image](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/201270/ss_333be0aca0dec5c08ab6556bb0b597afb6509c10.1920x1080.jpg) | [Steam store](https://store.steampowered.com/app/34330/) | © Creative Assembly / SEGA, study only | Thatched village buildings in warm late light, translucent sunlit foliage. It confirmed the warm-sun/cool-shade grade more than any building detail. |

### What changed

- **Roofs:** `kawara()` tiles at a 4-px period (lit edge, crown, shaded side, the flat tile's
  trough) with a seam every 4 rows. Single tiles are bleached or darkened by hash, there is moss
  in the troughs and a few lichen spots. The eave has a dark fascia line and a row of round end
  tiles, each with a dark mon dot. `noshi()` stacks the ridge with white mortar lines under a
  cap, with a low onigawara at each end (or shachi on the tenshu). `hipRidge()` adds hip ridges
  with an upturned corner tile. `eaveEdge()` draws the fascia and rafter ends along both visible
  eaves. `karahafu()` adds cusped porches (the keep's entrance tower, the grand keep's second
  skirt, the haiden). The shachihoko is a 9×12-px gilt carp.
- **Walls:** plaster has dark posts and a tie-beam (`frame`), lit sills and dark frames round
  the windows, and rain streaks under them. A dirt splash runs along the foot, and a deep cool
  shadow sits under each eave, sized from the overhang. New window kinds: `sudare`, `mushiko`,
  `irondoor` (kura), `sama` (triangle and square loopholes), and plank `door`s with iron bands
  and a ring pull. Shitamiita are horizontal clapboards with battens and bleached boards. Ivy and
  wisteria hang from the dōjō, the kura, the physician's house, the stables and the walls'
  copings. Noren with a white mon hang over doors, and chōchin under eaves.
- **Castle:** the ishigaki has fitted stones in uneven courses. Stones in a course vary in height,
  each is lit on its upper and left edges, and moss and weeds grow in the low joints. The corner
  is laid in sangi-zumi long and short blocks. `stoneBase()` builds it as three battered courses
  leaning most at the foot (the fan slope). The yagura carry ishi-otoshi bays and sama, and the
  gate has iron-banded leaves, lanterns, a fire barrel and a tōrō.
- **Shrine and temple:** the torii has a gakuzuka tablet and a shimenawa with shide, the honden a
  railed engawa, gilt fittings and a shimenawa. The haiden is open-fronted, with a karahafu, a
  lamp inside and chōchin under its eaves. The bell house has red posts, a banded bronze bell
  and a striker log on ropes. The pagoda has bracket bands, balconies and the sōrin. The precinct
  is raked gravel with a stepping-stone approach.
- **Props** (registered as `samurai:*` with `props.ts`, placed by the Samurai theme): komodaru
  stacks, tawara heaps, oke, tenbōsui fire barrels with their bucket pyramid, andon, nobori,
  kanban, a daihachi handcart, yotsume-gaki bamboo fence, a tsukubai with spout and ladle, the
  well with a pulley, hasa racks, woodpiles, crates, tōrō, a-un komainu, an ema rack, pots
  (bonsai, azalea, fern), azaleas and box shrubs, a wisteria arbour, rocks, yatai stalls at the
  fair, and pines, cherries and a maple. Fixed: the well, the trees, the shrine's approach, the
  keep's tōrō and the wisteria.
- **Ground:** the keep's raked gravel ring with stepping stones and a rock in ripples, the
  shrine's gravel, petals under the cherries, moss tufts, and the dappled shade of every
  canopy. These are flat decal arts under everything; the gravel is slightly translucent so the
  ground's cast shadows show through. No faction ground hook was needed.
- **Light:** `finishLit()` warms the lit planes toward `#ffcf86` (17%) and pushes the shade
  planes toward `#323a78` (24%). `sunlit()` walks each pixel up the sun's cast (props.ts `SUN`)
  to the canopies, so plaster and tile near a tree are broken by leaf shade and sun flecks.
  Emissive pixels (shōji, chōchin, andon, tōrō windows) go in a lights canvas: they glow by
  night, and a little by day, with a 1-px bloom. Lanterns also throw a ragged warm pool on their
  own surface and the ground below, cut by depth. The pools are baked, not drawn as round halos,
  and the torches are gone.

### Critique rounds (2560×1440, levels 5, 10 and 20, day and night, zoom 1 and 4)

1. **Round 1:** the materials read at zoom 4 (tile columns, end tiles, the eave shadow, ishigaki
   courses). Against the targets, there was too little clutter at zoom 1, and the keep's gravel
   was only a thin band. Hip ridges ended in dark blocks that stuck out of the corners like bars.
   The onigawara on short ridges (the kura) were spikes. The ishigaki read as a regular brick
   grid.
2. **Round 2:** onigawara low and broad, the hip corner now a 2-px upturn; stones in a course
   vary in height; gravel translucent, without a kerb grid. The props moved from hand placement
   to the shared library's theme, which spreads them along every building and road. At the gate
   (zoom 4) the yatai with indigo awnings, the fire barrel, the lanterns and the curved ishigaki
   now read like the targets' street clutter.
3. **Round 3:** the warm/cool split strengthened toward the golden-hour target. Ivy and wisteria
   added on more walls.
4. **Round 4 (night, the lighting rule):** the first pools reached onto roof skirts in front of
   the upper windows and lit the keep's plaster in cream blobs. Now only lanterns, andon and tōrō
   pool; shōji and windows only bloom, and a pool stays on its source's own surface (depth within
   1.5 units). Windows read as small warm panes. The lantern by the physician's door lights its
   noren and plaster.
