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
