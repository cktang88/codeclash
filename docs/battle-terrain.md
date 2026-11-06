# Battle terrain (battle v17)

The field used to be flat and bare. A battle on the league or the demo now has ground generated
from its seed (`src/game/terrain.ts`): gentle hills, a few woods, sometimes a stream with fords,
and patches of soft ground. Set pieces and tests stay flat unless they ask for ground
(`BattleSetup.terrain`: `'field'`, `'flat'` (the default), or a field laid out by hand,
`TerrainSpec`). Tools: `npx tsx scripts/terrain-map.ts <seed>` prints a field as text,
`npx tsx scripts/terrain-sanity.ts` measures every effect in set pieces, `scripts/duel.ts
--ground=hillA|hillB|woodA|woodB|woodMid|stream|ford` puts ground under a duel, and `/demo?terrain`
tints the classic painter's ground with it (debug only; drawing it properly is still to do).

## What real fields and Total War fields look like

| Field | Ground | What we took |
|---|---|---|
| Hastings, 1066 | The English shield wall on Senlac Ridge, the Normans deployed at the foot of its slope; heathland on the slopes, a swampy undrained valley between, the Weald behind the ridge ([Historic England listing](https://historicengland.org.uk/content/docs/listing/battlefields/hastings), [Albion: The Senlac](https://albion-swords.com/old_albion_site/The%20Senlac.html)). | A long gentle rise is enough to decide a day: the side on top stands, the side below has to come up. Soft ground in the low places between the armies. |
| Crécy, 1346 | The English on a ridge about 35 m above the Vallée des Clercs; the French came up some 400 of the last 500 yards on rising ground, steeper near the top; woods and the village covered the English flanks; pits dug on the slope against horse ([longbow-archers.com](https://www.longbow-archers.com/historycrecy.html), [science-and-fiction.org](https://science-and-fiction.org/science/battle15.html), [Liverpool UP on the site](https://liverpooluniversitypress.blog/2018/08/29/the-battle-of-crecy-new-discoveries-overturn-centuries-of-scholarship/)). | Archers on a height outrange and outshoot archers below; horse charging uphill is spent when it arrives; woods anchor a flank because horse will not go into them. |
| Nagashino, 1575 | The Oda-Tokugawa line on the Shitaragahara plain behind a palisade, the small Rengo river with steep banks before it, the Takeda crossing open ground out of the woodline ([Shinsengumi archives PDF](https://shinsengumi-archives.github.io/samuraihistory/data/files/10_PDF_Files/11_Nagashino.pdf), [rekishinihon](https://rekishinihon.com/2016/02/15/nagashino-battlefield-and-museum/), [Aichi Now](https://aichinow.pref.aichi.jp/en/spots/detail/312/)). | A stream between the armies is a line to hold: men wading it are slow, out of their ranks, and shot at. |
| Sekigahara, 1600 | A valley where roads meet, ringed by low hills (Matsuo-yama, Nangu-yama) where whole armies stood and waited; the fight in the valley floor (from general knowledge; the search found no map). | Hills on the flanks and the sides of the field; who holds them matters to the whole line. |
| Total War (Medieval II, Shogun 2) | Height gives melee and missile bonuses and more missile range; uphill movement tires units; woods hide units, slow them, break formation and ruin cavalry charges; rivers are crossed at fords and bridges, and a unit in water fights badly; maps are mostly open around the deployment zones. | The list of effects below, kept to Total War's scale but measured in our units, and deployment zones left open. |

## The generated field

- 2400 x 2400 units on a 16-unit grid (150 x 150 cells). Height, slope, ground kind and depth into
  a wood are precomputed per cell, so the sim reads one cell per man per tick and never scans.
- **Fair by construction.** Everything drawn on team 0's half has a twin turned about the centre
  on team 1's half: each army has the same hills before it, on the same hand. A stream runs
  through the middle, itself point-symmetric. Woods and soft ground keep out of both deployment
  zones (720 units from either edge), so both armies form up in the open; hills may run into them.
- **Hills:** one or two pairs of elliptical rises, 230-420 units across (45-80 m), 28-70 units
  high (5-13 m), no steeper than about 0.2 (11 degrees) where they are steepest; sometimes a low
  rise in the middle that whoever reaches it first holds.
- **Woods:** one or two pairs, each a clump of 3-6 round copses 45-100 units across, between the
  armies.
- **Stream:** half the fields, a stream 22-32 units wide (4-6 m) winding across the field between
  the armies, with soft banks, in a shallow bed, and two to five fords.
- **Soft ground:** half the fields, a pair of marshy or ploughed patches.

## What the ground does (numbers from `scripts/terrain-sanity.ts`)

| Ground | Effect |
|---|---|
| Uphill | Pace x (1 - 2 x grade), no less than half; downhill up to 1.12. Climbing tires (0.008 fatigue a half-second per unit of grade, 0.025 at a run). A block of heavy foot marching 260 units up a 45-unit hill: 35 s against 25 s on the flat, fatigue 0.15 against 0.04. |
| Height in melee | Attack + 20 x the grade down to the foe (at most ±5): the man above strikes down, the man below up. A charge's force x (1 - 1.5 x grade along the charge), 0.85-1.25. Sixty heavy foot holding a hill top against sixty attacking: the holders lose 88 men over 6 days against 129 on the flat, and win every day. Knights charging heavy foot downhill: the foot loses 411 hit points in the 2 s after contact against 296 on the flat. |
| Height and missiles | Reach + 1.2 x the height above the target (at most a fifth of the range; less from below). Archers on a 45-unit hill reach a block 610 off at once; on the flat it has to come 70 units closer; from below 120 closer. |
| Woods | Foot pace 0.62, horse 0.35. Every man picks his own way: his own pace (± 22% by his eagerness), a sidestep round the tree before him, and only 0.3 of his usual pull back to his place, so a block goes ragged (men 9 units off their places on average against 4 on the flat; horse 35 against 5). No impetus over 0.15 among the trees: a charge into a wood stops (16 knights into foot in a wood: 58 hit points in 2 s against 389). No shield wall or pike wall among trees (stance defence at 0.4, spears hold nobody at the points). Missiles: half of those at a man deep in a wood (lobbed; a third of direct shots) hit trees, a quarter at its edge. A block more than 24 units into a wood is seen only within 90 units; a line of sight through more than 48 units of trees is blind. |
| Stream | Water: foot pace 0.35, horse 0.28, no impetus; a man in the water fights at -8 attack, -10 defence, and no spear wall forms in it. Ford: pace 0.72, no penalty. Banks are soft ground. |
| Soft ground | Foot pace 0.78, horse 0.62. |

## Choosing ground (the "a real person would do that" standard)

- **Hold the hill.** A block of the line holding (the General's hold plan, or waiting) steps up to
  a crest within 260 units before it if it rises 8 units or more, short of the enemy (`standGround`).
  A General whose first line has a crest 12 units above it within that reach leans to the hold
  plan (+0.35 to its score).
- **Archers in the edge of a wood.** Shooters waiting take a spot just inside a wood's edge within
  170 units, their whole front among the trees and open ground before them: covered, still seeing out.
- **Horse out of woods.** Horse never takes foot standing in a wood as its prey (it looks for
  prey in the open, or waits outside); only a rash general's knights sent in with a charge order
  go. Its goals come out of woods, and its rides go round them (`skirtWoods`).
- **Fords under fire.** A block that would wade a stream goes by a ford if that adds no more than
  120 units (or 30% of the way); under the enemy's bows it goes by a ford up to 650 units out of
  its way. Not on a charge, a chase or in a fight.
- **No charge into a wood or across water**: they walk in.

## For the renderer

The data shape is documented in the header of `src/game/terrain.ts`; the renderer reads it from
`battle.terrain` (rebuilt from the setup by every browser, nothing sent). Grid arrays for shading
(height, slope, ground kind, depth into woods) and the feature shapes (hill ellipses, wood discs,
soft-ground ellipses, the stream's polyline with its width and ford discs) for drawing smooth
edges, trees and water.
