# Melee reaction: blows that land, blows that are stopped, men who fall (cc/anim2)

Date: 2026-11-06. Scope: how a battle figure's whole body answers the fight at zoom 2-4 in HD.
Code: `src/client/render/react.ts` (pure, tested in `react.test.ts`), the per-soldier block of
`src/client/render/scene.ts` `build()` and its `blowsTick` / `fallDir` / `landed`, `render/frames.ts`
(Hit timing). Tools: `scripts/qa/melee-film.cjs` (filmstrips), `scripts/anim-sheets.ts` (contact sheets).

## What was wrong

A melee screenshot at zoom 4 was a wall of men standing in the same guard. The painted clips were
there (blows from the guard, a Hit, a Die with five upright stagger frames, the horse going down
under its rider, the Grave Legionary coming apart), but the body never moved off the sim's spot:
a blow did not step in, a wound did not drive a man back, a parried blow (most blows: battle.ts
`strike` lands at ~36%) showed nothing at all, the second rank stood frozen, and the fall took
half a second, every corpse turned a random way (`fallDir` hashed it), so a man could flip from
facing his killer to facing away in the frame he died.

## References (study copies in `references/melee-reaction/`, git-ignored)

| Image | Licence | Taken from it |
|---|---|---|
| Muybridge, *Two men boxing, one falls* (`src/client/public/motion-ref/fall-back.jpg`, already in the repo) | Public domain | The striker steps in with the blow and recovers; the man struck is pushed back first (four cells of stagger, his feet sliding back) and only then topples away from the blow in two or three cells. The push, not the topple, is most of the time. |
| *RPG Character (Knight)*, OpenGameArt ([page](https://opengameart.org/content/rpg-character-knight), [zip](https://opengameart.org/sites/default/files/knight_asset.zip)) | CC0 | Hit (15 frames): the body snaps back in 3-4 frames and eases home over the other 10 (out fast, back slow: `recoil`). Death (21 frames): a slow tip back, then the drop, then a small bounce and a long hold on the ground. |
| *Dark Knight 2D character sprites*, OpenGameArt ([page](https://opengameart.org/content/dark-knight-2d-character-sprites), [zip](https://opengameart.org/sites/default/files/Knight%202D.zip)) | CC0 | Impact: a hit on the shield is a small jolt of the shield arm and a head snap, the feet stay planted (a parry is a smaller shift than a wound: `REACT.parry` half of `recoil`). Block: the shield is pulled in square, the sword low. Death (77 frames): over half the clip is the reel back with the arms flung up; the topple is ~8 frames; the body travels back across the frame as it goes (`slide`). |
| Met 338534, *Battle Scene* (drawing), 1590-1646 ([image](https://images.metmuseum.org/CRDImages/dp/web-large/DP809193.jpg), [page](https://www.metmuseum.org/art/collection/search/338534)) | CC0 | Men leaning into their blows, weight forward; the man struck leans back behind his shield; the fallen lie at every angle, one still propped on an arm. |
| Medieval II: Total War, Steam screenshot `0000000846` ([image](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4700/0000000846.1920x1080.jpg), [store](https://store.steampowered.com/app/4700/)) | (c) SEGA, reference only | In the press no two men stand alike: the front line is ragged, men step out to strike and back; the ranks behind lean in on the backs in front rather than standing to attention. |

## What was done (react.ts, scene.ts)

- **Who struck whom** (`blowsTick`, every step): a man whose `actedAt` is the tick just stepped and
  whose target is within a few paces struck at him; if the target's hp fell the blow landed
  (`Reactions.hurt`, with the direction from the striker), else it was parried or taken on the
  shield (`parried`; HD: a few sparks where it stopped). A man hurt with no blow seen (an arrow,
  the stakes) is driven back from the nearest foe, else from the way he faces.
- **The body off the sim's spot** (world units; a man is ~14 tall), in `build()`:
  into his blow and back (`lunge`: -0.22 in the chamber, +1.6 at the strike, home at the
  recovery, so the blow still starts and ends on the guard), driven back by a wound (`recoil`:
  1.5 out by 0.07 s, back by 0.45 s), rocked by a parry (0.75), and between blows the front rank
  weaves at its foe (`weave`, -0.6..1 of 0.55, a cycle of its own per man) while the ranks behind
  lean in (0..0.7). Riders get a third of it (the horse's gait carries them).
- **Hit** plays 0.3 s instead of 0.2 s (`TICKS[Hit]` 0.4 -> 0.6), so the flinch and the shield
  block read under the recoil.
- **The fall**: he faces the man who struck him (one in four a quarter turn off, so a rank cut
  down together still lies every way: `battle-dead.md`), the Die clip's five upright stagger frames
  play at 0.65 speed (`dieFrame`; the fall now takes 0.65 s, the stagger ~0.33 s of it) and he is
  carried 2.6 back from the blow over the stagger (`slide`; 1.2 for a horse), so a back-fall goes
  down away from the killer. The corpse lies where the fall took him (`fallX/Y`, used by every
  corpse draw), a riser gets up back onto his spot. A body landing raises a ring of dust, and the
  bone of the undead clatters (`landed`).

- **Room to step in**: the lunge and the weave toward a foe go no further than the room between
  the two bodies (the sim presses men together; one in front of the other on screen would be
  drawn inside each other).
- **Facing through the stagger**: he keeps the way he faced while he staggers and turns to his
  fall's facing as he topples (frame 5), where the body's motion hides the turn.

## Critique rounds (`docs/screenshots/anim2/`, made with `scripts/qa/melee-film.cjs`)

1. Isolated deaths (`ISOLATE=1 DEATH=team`: the dying man and the nearest foe alone, time run on
   without the sim) against Muybridge and the Dark Knight death: the Die clips already had the
   stagger, but it played in 0.2 s and the man flipped facing as he was hit. Slowed the stagger,
   added the slide back from the blow, faced the blow. The undead rider's horse goes down under
   him (`death-undead-rider.jpg`); the legionary comes apart into a heap (`death-undead-legionary.jpg`).
2. Crowd filmstrips at zoom 3-4 (`piece=1 ... n=36`) against the Total War press: the shifts
   (1.5 units) were lost in the crowd and the weave jumped when a blow started; one weave under
   every clip, larger shifts, a slower Hit.
3. Duelling pairs (`PAIR=n`: n pairs of men trading blows, the rest off the field) against the
   Dark Knight impact/block: an axe blow taken on the undead shield reads as a block and a jolt
   (`duel-templar-axe-vs-undead-parry.jpg`); men pressed one in front of the other were drawn
   inside each other by the lunge (fixed: room to step in); the fall's facing turn moved to the topple.
