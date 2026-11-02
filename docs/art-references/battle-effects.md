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
