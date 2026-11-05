# Battle effects: blood, smoke, arrows

Studied for `src/client/render/fx.ts` and the particles in `scene.ts`. Reference only; no pixels copied.

| # | Source | Licence | Taken from it |
|---|--------|---------|---------------|
| 1 | [Gore Blood Gibs Meat Chunks](https://opengameart.org/content/gore-blood-gibs-meat-chunks) (Reactorcore), `blood2_burst_refsheet.png` | CC0 | A hit is a burst of single red pixels flying outward in a ring that thins as it spreads, not a few drops straight up. |
| 2 | same pack, `blood1_splat_refsheet.png` | CC0 | A splat starts as a compact blob and breaks into satellite drops, with two reds at most. |
| 3 | [Blood splat](https://opengameart.org/content/blood-splat) (TobiasM) | CC0 | Pools have a dark core, spiky irregular edges and droplets around them. Once on the ground the blood is dark, not saturated red. |
| 4 | [Smoke particle assets](https://opengameart.org/content/smoke-particle-assets) (Kenney), `preview_200.png` | CC0 | Smoke is lumpy: a cluster of overlapping puffs with a darker core and a ragged rim. Black smoke for impacts, pale for dust. |
| 5 | [More explosions](https://opengameart.org/content/more-explosions) (`test1_0.gif`) | CC0 | An impact is a small bright core plus scattered single-pixel debris. |
| 6 | [Arrow sprite](https://opengameart.org/node/38130) (mart) and [animated arrow](https://opengameart.org/node/78629) | CC0 | What reads on an arrow is the contrast between a dark iron head, a dark shaft and pale fletching at the tail. |
| 7 | [Ground arrows](https://opengameart.org/content/ground-arrows) | CC0 | Single-pixel sparkle and fade sequences: an effect of 1-3 px still reads if it contrasts with what's behind it. |

Applied:
- hit spurts as radial rings of single pixels
- pools with a dark core and droplets
- lumpy two-tone smoke puffs, darker for stone impacts
- arrows with a dark head, a brown shaft and pale fletching

## Blood on the ground at battle scale (HD)

With the field 2–3× larger and arrows reaching about 3× farther, a mark on every hit left lines of red behind blocks advancing under fire. The ground now keeps blood the way a Total War field does: it darkens where the fighting and dying happened, and the open ground crossed under arrows stays clean. No new images were gathered for this pass. It builds on reference #3 above: blood on the ground is dark, not saturated red.
- Every hit still sprays drops in the air. Only a kill, a hit in melee (his target within reach and struck lately) or a bad wound (below 40% hp after losing more than 15% in one hit; half of them) marks the soil. Drops from other hits do not stain where they land, and only kills and melee hits leave splat decals.
- A kill's pool spreads a little past the body (`scene.ts`, `pools`).
- As a stain ages over 50 s it settles into the soil: the thin tint turns from red to darkened earth, and the thin rim of a pool sinks into it (`field-hd.ts` compose shader). This needs no extra recomposition.

## What the undead shed (HD and classic)

This follows `undead.md` (ref 8: undead deaths end in a bone heap, never blood; one green light source) and the bodies as `sprites128.ts` draws them. No new images were gathered. The rules match the blood rules above: the ground is marked only at kills and in melee, and old marks age into the soil. Living factions are unchanged.
- **Bone** (legionaries, skirmishers, arbalests, riders, Death Knights, the Colossus, the Lich-Marshal): a hit throws a ring of bone-white and grey single-pixel chips and a breath of pale grave dust. The chips stain nothing. A kill scuffs the earth a little paler (the wear channel), and so, faintly, does a melee hit. There is no pool.
- **Ghouls** (flesh): a dark, faintly green ichor where blood would be, with the same rules for drops, kills, melee and bad wounds. It soaks into a new marks channel (B) as a near-black slick that dulls with age. There is no wet glint and no red splat decal.
- **Wraiths** (spirit): a few motes of green witchfire, more when one falls, and no mark on the ground.
- Classic art: no red pool sprite under undead corpses, bone chips in place of drops, and a ghoul's drops stamp dark.
