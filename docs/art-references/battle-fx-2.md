# Battle effects 2: fallen standards, missiles in men, riderless horses

Studied for the second effects pass in `src/client/render/scene.ts` (`standardsTick`,
`pinMissile`/`drawPins`, `unhorsed`/`drawHorses`), `horse-fx.ts` and the `pin_*`/`horse_*`
sprites in `fx-hd.ts` and `fx.ts`. Everything here is derived on the client from what the sim
already exposes (soldier state and regiment, hp drops, projectiles landing, `Soldier.dismounted`);
`src/game` is untouched. The study copies are in the git-ignored `references/battle-fx2/`.

| # | Source | Licence | Taken from it |
|---|--------|---------|---------------|
| 1 | [Bayeux Tapestry, scene 52](https://commons.wikimedia.org/wiki/File:Bayeuxtapestryscene52.jpg) (shield wall at Hastings) | Public domain | The English shields **bristle with arrows**: two or three short shafts per shield, at different angles, with pale fletching, standing out of the face toward the archers. The standard is carried in the middle of the shield wall, above the heads. Dead men lie in the margin, their weapons beside them. |
| 2 | [Bayeux Tapestry, scene 57](https://commons.wikimedia.org/wiki/File:Bayeux_Tapestry_scene57_Harold_death.jpg) (Harold's death) | Public domain | Arrows stand in shields and in men, a hand's length showing. Men fall where the fighting is and the **standard falls with its bearer**. A horse goes down head first among them. |
| 3 | Paolo Uccello, [The Battle of San Romano (Uffizi panel)](https://commons.wikimedia.org/wiki/File:Paolo_Uccello_023.jpg) | Public domain | **Horses down on their sides** in the foreground, legs stiff and out, with saddles still on and broken lances among them. Unhorsed men fight on foot beside them, and the loose horses in the press kick and turn away. |
| 4 | Eadweard Muybridge, [The Horse in Motion](https://commons.wikimedia.org/wiki/File:Muybridge_horse_gallop.jpg) (1878) | Public domain | The four gallop phases used for the bolting horse: extended, gathered in the air with all four legs under, hind feet landing, front feet landing. The head and neck stretch forward, the tail streams back and falls, and the barrel is deep, with the legs about as long as the body is deep. |
| 5 | Paolo Uccello, [Saint George and the Dragon](https://commons.wikimedia.org/wiki/File:Paolo_Uccello_047b.jpg) | Public domain | The proportions of a war horse seen side on: a thick, arched neck, a rounded haunch and chest, and dark lower legs. Round 1's thin neck read as a deer. |
| 6 | Total War screenshots from [round 1](battle-atmosphere.md) (Medieval II `ss` 2, Napoleon `ss` 6) | © SEGA, reference only | Horses lie where cavalry met infantry, and riderless horses run loose through the field. The standard stands at the centre of each block until its bearer falls. |

## Applied

- **Standards carried by a man.** Each regiment's standard is carried by one of its men, at first the one nearest its centre, and is drawn where he stands rather than at the block's centre. When he falls or leaves the block, or the block breaks, the standard goes down where he was (the "dropped" sprite in the dirt). About 3 s later the man of the block nearest the spot takes it up. It is hoisted from his hands to full height over 0.8 s (refs 1, 2). If the block has moved more than 30 away by then, the standard stays lying on the field (up to 64 are kept) and the block raises a spare at its centre.
- **Missiles in men and shields.** An arrow, bolt or javelin that lands on a man who lost hp that tick stays in him. One that lands on an unhurt man of the block is caught by his shield (85% if he carries one) or, now and then, by his mail (30%). Bullets and stones never stick. Each man carries up to three. They point the way the missile flew, show a hand's length of shaft and the fletching, sit on the side the volley came from at body or shield height, mostly on his near side, and are gone when he dies or 25 s after the last one (ref 1). New sprites are `pin_{arrow,bolt,jav}0-7` (HD) and `pin0-7` (classic).
- **Riderless horses.** When a rider is unhorsed, his horse either goes down on its side a length ahead, with a pool of blood and dust (ref 3), or bolts at the gallop away from the enemy for 9 s, raising dust (ref 4). The sim doesn't say whether the horse fell or bolted, so it is guessed: one brought down at the gallop mostly falls. Coats are grey for the Templars (their white horses), and bay, black or grey for the samurai. The undead have bone horses: theirs shatters into bone chips. Painted from shapes in `horse-fx.ts`: four gallop frames and one down, each facing left and right, at every level (classic at L = 1). Dead horses are kept up to 400 and drawn under the figures, like corpses.

## Critique rounds (`docs/screenshots/battle-fx-2/`)

1. `horses-round1.jpg` and the first sprite sheet. The horse had a thin neck, a small bent head and spindly legs, and read as a deer. It was too small next to the mounted figures, and a big red saddle cloth dominated. `pins-round1-crop.jpg`: missiles in the shield wall showed as tiny dark ticks, and few stuck (only struck men).
2. `horse-sprites-round2.png`, `horses-round2.jpg`. Deeper barrel, rounded chest and haunch, a thick tapering neck with a dark mane, a longer head, a tail falling back, shorter legs (refs 4, 5). The horse is drawn 1.35 times bigger to match the figures' horses, under a small dark saddle cloth. Pins: longer shafts, shields and mail catch unhurt hits, drawn a step nearer. `pins-forced.jpg` checks the drawing on every man of a block.
3. `horses-and-pins-round3.jpg`. Unhorsed knights fight on foot among their fallen white horses, with arrows standing in them, as in ref 3. Standards: `standard-1-down.jpg` (bearer killed, the standard down), `standard-2-taken-up.jpg` and `standard-3-raised.jpg` (taken up by the nearest man, so it now flies at the front corner where it fell). Still weak: the dropped standard is the small morale-broken sprite, easy to miss at zoom 1. In a deep shield wall most shields are hidden behind the rank in front, so pins show mainly on the front rank and on loose men.

## Cost

`scripts/battle-render-bench.mjs perf men=3000 t=420 zoom=2 focus=1 fa=samurai fb=templar`,
1280×720, against master (with horse wounds), two pairs run in turn. Draw median per frame: master 2.1 / 2.4 ms, here
1.3 / 1.6 ms. `afterStep`: master 4.3 / 5.0, here 4.5 / 4.0. That is within the machine's noise.
Pins live in flat typed arrays indexed by soldier, with a list of the pinned. A landing is matched
only against men hurt that tick and blocks within 90, and nothing is pinned off-screen.
