# Light in the mirrored facings (HD paper sprites)

Subject: the HD paper figures draw two facings (SE front three-quarter, NE back) and make SW and NW
by mirroring them. Painted shading assumes a key light from the top-left, so before this fix the
mirrored facings were lit from the top-right: half of the figures in a battle had their light on
the wrong side. The fix is described in `src/client/render/paper/README.md` ("The light in the
mirrored facings"). Before/after: `docs/screenshots/hd-sprites/mirror-light-before-after.png`.

Study copies are in the git-ignored `references/mirror-light/`. Nothing third-party is committed.

## References

| Image / page | Licence | What we took from it |
|---|---|---|
| Technopeasant, "8 Directional Sprite Sets": <https://opengameart.org/sites/default/files/tluphap.png> ([page](https://opengameart.org/content/8-directional-sprite-sets)) | CC0 | Hand-pixelled front, back and side views of one man. Each view is drawn for its own direction and keeps the same light (the lit plane of the coat stays on the upper left), so the left/right side views are **not** pixel mirrors of each other. The back view keeps its lit side where the front view has it. |
| "Mini Daemon": <https://opengameart.org/sites/default/files/minidaemon.png> ([page](https://opengameart.org/content/mini-daemon)) | CC0 | An 8-direction sheet. The highlight sits on the same screen side in every row, whichever way the body faces, so the figure turns under a fixed light rather than carrying its light around with it. |
| "Isometric walking sprite": <https://opengameart.org/sites/default/files/spritesheet_12.png> ([page](https://opengameart.org/content/isometric-walking-sprite)) | CC-BY 3.0 (study only) | Pre-rendered from 3D with one fixed sun. The cast shadow always falls lower-left and the lit side stays the same in all 8 directions. This is the target for an isometric battle: the world light is fixed and the figures turn under it. The same holds in the games we take after (Diablo II, the Total War sprites). |
| Phaser forum, "Light shading only works from one side": <https://phaser.discourse.group/t/light-shading-only-works-from-one-side/3287> | text | The same bug in an engine: flipping a lit sprite with a negative x scale flips its lighting too. Engines fix it by flipping the light along with the sprite. That is our option (b): draw the facing for the mirror with the light flipped, then mirror it. |
| `docs/art-references/pixel-art-craft.md`, `pixel-art-techniques.md` | ours | One light source per scene. The lit side and the sel-out outline face the light. Shade by planes, not pillow shading. |

## What was done

- **Option (b), applied centrally.** `Paper.lightX` (1 as seen, -1 when drawing for a mirror) is set by `drawFacing` and `paintSkeleton`. `poly` works out its across-axis (lit edge to shadow edge) in the seen frame. So `rod`, axis-shaded volumes and `detail(u)` follow it, and `blob` flips its light cluster. The result is exact: a part drawn for the mirror and then mirrored equals the same part drawn where the mirror puts it (unit test).
- **Hand-written shading** reads its horizontal lighting terms through `c.litX(dx)`, a small helper. Geometry stays in plain x. This was done per site in templar-static, templar-parts (spear head), samurai-static and samurai-parts (every `lit(c, base, …)` argument, plus the horse, the helms, the dō and the kusazuri tones), undead-parts (`planeLight` via `drawLightX()`, the hood, the pavise skull, the lit-edge pass in `shadeLower`) and undead-static (`keyLight`'s rim, plate specular, highlights in blob details).
- Option (a) was rejected: re-shading from a tone buffer can't tell a lit band from painted detail, such as a white cross or a gilt edge, so it would recolour heraldry.
- **Caches** key on the light side: the part images in skeleton.ts and templar-rig's `memoSkin`.

## Critique rounds

1. **Core primitives only** (poly axes, rod, blob). Measured with the lint's per-region light-angle error. Mirrored facings went from 85–110° to 80–95°, almost no change. Looking at the sheet showed why: most of the shading in the figures is hand-placed (templar `shapeU` planes, samurai `lit()` planes, undead `planeLight`).
2. **Templar and samurai hand shading.** At level 8, templar SW/NW went to 28/36° (SE/NE 28/39°) and samurai to 34/36° (27/28°). Against the references: the horse's croup and barrel now take their highlight on the upper-left like the CC0 sheets, and the mantle and caparison folds have their lit ridge on the light side. At level 2, samurai SW was still lit right: the kusazuri panel tones come from a table by position. Fixed by taking the mirrored panel's tone.
3. **Undead and level 2.** `planeLight` (most undead cloth and plate) follows the light. So do the hood, `keyLight`'s rim and the lit-edge pass, which steps toward the light. The Legionary's shield, hood and pauldron now light top-left in SW. Where the remaining light-angle error on some mirrored undead and level 1–2 figures comes from: near/far depth tones (the near leg is lighter and is on the right in SW), and the metric's noise on 13–26 px figures. Those are geometry, not light, and are left alone. A flicker check gave per-facing frame-to-frame churn: SW/NW within ±1 point of SE/NE at levels 2 and 8. No new A-B-A brightness flips.

## Numbers (lint light-angle error, mean of 11 kinds, degrees; SE / SW / NW / NE)

| | before | after |
|---|---|---|
| templar L2 | 53 / 91 / 93 / 63 | 53 / 46 / 51 / 63 |
| templar L8 | 28 / 94 / 93 / 39 | 28 / 28 / 36 / 39 |
| samurai L2 | 35 / 82 / 77 / 48 | 35 / 53 / 52 / 48 |
| samurai L8 | 27 / 112 / 100 / 28 | 27 / 34 / 36 / 28 |
| undead L2 | 60 / 77 / 75 / 68 | 60 / 82 / 54 / 68 |
| undead L8 | 27 / 92 / 77 / 44 | 27 / 41 / 38 / 44 |
