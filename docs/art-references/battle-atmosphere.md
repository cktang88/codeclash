# Battle atmosphere: dust, gun smoke, contact

Studied for the atmosphere pass in `src/client/render/scene.ts` (`raiseDust`, `contact`,
`gunSmoke`, `atmosTick`, and the breeze in the particle update). It builds on
[battle-effects.md](battle-effects.md) (blood, puffs, arrows) and
[total-war-battles.md](total-war-battles.md) (camera, standards). The images were studied, not
copied. Study copies stay in the git-ignored `references/battle-atmosphere/`.

| # | Source | Licence | Taken from it |
|---|--------|---------|---------------|
| 1 | [Shooting a Pattern 1853 Enfield musket reenactment](https://commons.wikimedia.org/wiki/File:Shooting_a_Pattern_1853_Enfield_musket_reenactment.jpg) (US Navy photo) | Public domain | Black powder fires as a dense white **jet** driven a body length or more out of the muzzle, at the height of the gun, and opening into lumpy, overlapping balls. Its edges are already thinning while the root is still dense. So a shot is a fast, short-lived jet plus a slower cloud left behind, not one puff. |
| 2 | [Total War: NAPOLEON](https://store.steampowered.com/app/34030/) Steam screenshot 6 (`tw-34030-6.jpg`: line infantry firing by a farmhouse) | © SEGA, reference only | Musket smoke lies as a long, low, **translucent bank along and in front of the firing lines**. The men stay readable through it, and it smears downwind into the next block, so the field gets hazier as the fight goes on. Burning buildings give dark columns, a different thing. This is the main model for the bank. |
| 3 | [Battle of Nagashino screen](https://commons.wikimedia.org/wiki/File:Battle_of_Nagashino.jpg) and its detail [Nagashino Teppo-Ashigaru](https://commons.wikimedia.org/wiki/File:Nagashino_Teppo-Ashigaru.jpg) (Edo-period byōbu) | Public domain | The teppō stand in a dense, deep rank behind the palisade, every barrel levelled at once, with the standards behind them. The screen paints no smoke (the grey band in front is the stream), so it gives the shape of the volley, a whole rank firing along a line, but not the look of the smoke. That shape is why a volley's bank is spread **along** the line rather than piled at each gun. |
| 4 | [Dust Cloud in Etosha National Park](https://commons.wikimedia.org/wiki/File:Dust_Cloud_in_Etosha_National_Park.jpg) | CC BY-SA 3.0 | Dust raised by a herd is **paler than the ground it comes off**, a near-white cream, and thickest at leg height. Above it, it thins into a broad veil that drifts with the wind. The animals stay dark and readable in front of it. |
| 5 | [Medieval II: Total War](https://store.steampowered.com/app/4700/) Steam screenshot 2 (`tw-4700-2.jpg`: horse sweeping across dry hills) | © SEGA, reference only | Even horse at the gallop on dry ground raise **no visible cloud** here. The read comes from the dark masses on pale ochre ground and the bright flags. So dust must stay a subtle veil that never turns a block into a grey blob or hides the flags, and it is low-alpha and paler than the ground. |
| 6 | [dust animation](https://opengameart.org/content/dust-animation) (`dusty.gif`, 10×7 px, 8 frames) and `jump_effect.png` from the same page | CC0 | At small pixel scale dust is a scatter of **single grey texels** that rise, drift apart and drop out, with no outline and no gradient. An effect this sparse still reads because it moves. Our puffs (fx-hd.ts) already break up their rims by dropping texels, so the job was colour, size, life and motion, not new art. |

## Applied

- **Marching and galloping dust.** Every moving man in view has a chance per tick to raise a puff. The chance grows with his speed (foot from a walk, horse much more, galloping horse bigger and higher puffs), and the puff sits behind him, low, with a kick back against his heading (ref 4). Alpha stays low so the blocks still read as dark masses (ref 5). The colour is a tint above 1 over the puff's grey shading, so it comes out a sunlit cream lighter than the ground (ref 4). A tan tint (round 1) read as brown smoke over the grass. Alpha is low (0.13 to 0.22) so that many overlapping puffs build a haze instead of blobs.
- **One budget for the whole field.** The demand of all the moving men in view last tick sets this tick's chance scale, capped at about 45 puffs a tick. An army on the march thins evenly instead of the first regiments in the list using up the pool. Nothing is raised off-screen (`nearView`).
- **Gun smoke.** Each teppō and ōzutsu shot fires a jet: fast, dense, short-lived puffs driven out along the aim (ref 1). It also leaves a bank: slow, pale, low-alpha puffs spread sideways along the line a body or two in front, living 9 to 17 s, so a volley leaves one band of haze (refs 2, 3). It replaces the single billow there was before.
- **A breeze.** Smoke and dust drift with a slowly gusting wind (dust at 60% of it, since it settles). Banks lean downwind and lose their shape over time (ref 2).
- **Contact.** The tick a man first trades blows, a puff of dust kicks up where he meets his foe, now and then. If he came in at a run (a charge) it always does: more dust thrown forward, sparks if either side wears armour, and clods under hooves for horse. After that the press of a melee scuffs up a low haze now and then under each man, from the same budget.
- **Both arts.** Classic and HD share the code (the classic path drew dust the same way, more faintly), and the particles come from the existing pool (`spawn` reuses dead ones).

## Critique rounds (screenshots in `docs/screenshots/atmosphere/`)

1. `gun-round1.jpg`, `cavalry-dust-round1.jpg`. The gun smoke reads as a row of round, bright puffs (a string of cotton balls), not a band, and is too opaque. The cavalry wake has the right size and length but a tan-brown that reads as burnt smoke, and marching foot showed no dust at all (the demand was too small at a walk).
2. `gun-round2.jpg`, `cavalry-dust-round2.jpg`. The bank is spread along the line with lower alpha, and the jet now leans along the aim: it reads as a drifting band (ref 2). The dust is the pale cream of ref 4 and veils the horses' legs and the ground behind, not the riders. Foot still showed too little.
3. `march-dust.jpg`, `melee-contact.jpg`. Foot dust is raised from a walk, with a slightly higher alpha: a faint skirt at the rear rank's feet, much fainter than horse (ref 5: never a blob over the block). The melee haze stays mostly behind the press. Since dust is drawn under the figures at their feet' depth, it shows only at the edges, which is enough. It must not hide the fighting.

## Not done

Regimental standards (already per regiment, with morale states and a dropped standard on a
rout: `scene.ts`, `standards-hd.ts`) and arrow flights with arcs and arrows stuck in the ground
(`buildHd`) were already in place, and were left alone in this pass.

## Cost

`scripts/battle-render-bench.mjs perf`, `men=3000 t=420 zoom=2 focus=1 fa=samurai fb=templar`,
1280×720, 120 frames, SwiftShader, base (master `5f692f9`) and this branch run one after the
other, three pairs. Draw median per frame: base 1.6 / 1.5 / 1.4 ms, here 1.4 / 1.4 / 1.3 ms. Mean:
base 3.5 / 2.2 / 2.6, here 2.6 / 2.4 / 2.8. `afterStep` per tick: base 5.8 / 3.8 / 5.8, here
5.8 / 3.3 / 4.3. That is within the machine's noise. The particle cap is unchanged, and dust
gives way first.
