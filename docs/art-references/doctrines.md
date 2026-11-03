# Doctrines on screen: references

What the battle doctrines (`docs/faction-doctrines.md`, `DOCTRINE` in `src/game/command.ts`) look
like, and what was taken from where. Screenshots: `docs/screenshots/doctrines/`.

## The dead rising (U3 What falls, rises)

| # | Reference | Licence | Taken from it |
|---|---|---|---|
| 1 | patvanmackelberg, *Skeleton and friends (8 directional)*, "Skeleton Rise Animation" strip, OpenGameArt: https://opengameart.org/content/skeleton-and-friends-8-directional — image https://opengameart.org/sites/default/files/Skeleton%20Rise%20Animation.png | CC0 | A rise is **not** a fall played at the same speed: the bones lie still (a few twitches) for several frames, then heave up to sitting, then stand quickly. Hence `RISE.hold` (lie still 0.4 s) and `RISE.slow` (each Die frame 1.5x as long) in `contract.ts`. |
| 2 | Same pack, "Gate Keeper" idle and raise-staff strips: https://opengameart.org/sites/default/files/Gate%20Keeper%20Raise%20staff.png | CC0 | One green light source per necromantic figure: the raising reads through a little **green** against bone and black, not a big effect. |
| 3 | `docs/art-references/undead.md` refs 5, 6, 8 (Skeletons rework, Gate Keeper, OGA CC0) | CC0 | Undead deaths end in a bone heap (`remains`), so Die played backwards is the bones gathering and standing; the faction's grave-green (`#5f8f4e` trim, brighter for light). |
| 4 | Utagawa Kuniyoshi, *Ghosts of the Taira at Daimotsu Bay* (Met 55743, public domain), as studied in `undead.md` ref 4 | PD | The death-glow as a few pale green motes and a thin translucent haze that dissolves upward: the grave-light is 10 one-pixel green motes rising and fading plus 6 faint green puffs (`graveLight`, `PK.Wisp` in `scene.ts`). |

Searched for a Total War: Warhammer "Raise Dead" capture as a fourth source; none showed the effect
clearly enough to study (the wiki pages only describe the spell).

Rounds: (1) puffs only, alpha 0.35, invisible at game scale; (2) bigger, brighter puffs, still lost
on the grass, and in a long run without frames the particle cap (blood) refused them; (3) one-pixel
motes on the soft layer plus a reserve in the particle cap: the green reads at zoom 3
(`undead-dead-rise-detail.jpg`). In classic art a corpse that may still rise is kept off the ground
texture (drawn as a figure on its last Die frame) so it can get up out of it.

## The teppō screen (S3) and the Marshal's charge (T1)

No new art: both reuse existing sprites, muzzle smoke and charge dust. Composition follows
`formations.md` §4 (Nagashino: guns before the spears, behind the fence) and `total-war-battles.md`
(a cavalry wedge hitting a locked block from the flank). Shots: `samurai-teppo-screen.jpg` (HD; the
teppō block out before the samurai spears, front rank firing), `templar-marshal-charge.jpg` (classic;
Knight-Brothers into a samurai block on the Marshal's signal).
