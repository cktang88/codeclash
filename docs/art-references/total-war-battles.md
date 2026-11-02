# Total War battles from above

Studied for the camera, block readability, standards and shadows in `src/client/render/scene.ts`. The screenshots are copyrighted (Creative Assembly / SEGA) and were used for study only; nothing is committed.

| # | Source | Licence | Taken from it |
|---|--------|---------|---------------|
| 1 | Medieval II: Total War, Steam store screenshot `0000000842` (desert hills, high camera), https://store.steampowered.com/app/4700/ | © SEGA, reference only | From high up a regiment reads as a dense dark mass on light ground. Lines are long and thin, each unit has one small, saturated flag standing above it, and the fallen are scattered dark specks. The light, warm ground is what makes the blocks read. |
| 2 | Medieval II, screenshot `0000000843` (green field, two armies) | © SEGA, reference only | Banners are the brightest, most saturated things on the field and carry the army colour. Cavalry reads by its pale horses, and the far enemy line is a thin band of flags. |
| 3 | Medieval II, screenshot `0000000846` (melee close-up) | © SEGA, reference only | In melee the formations dissolve into a mixed crowd, and the standards still mark where each unit is. |
| 4 | Medieval II, screenshot `0000000845` (lines before a siege) | © SEGA, reference only | Deployed blocks stand in neat ranks with spacing between units, and the three-quarter angle keeps the ranks legible. |
| 5 | Total War: Rome Remastered, Steam screenshot `ss_94607ef2…`, https://store.steampowered.com/app/885970/ | © SEGA, reference only | Late-sun lighting: every man throws a long, hard cast shadow in the same direction, which gives the crowd depth and rhythm. |

Applied:
- a 30°-turned, half-squashed three-quarter view
- one standard per regiment raised above it, with more saturated cloth
- long sheared cast shadows from a low sun
- brighter ochre ground, so the blocks read as dark masses
- corpses left on the field as dark lumps
