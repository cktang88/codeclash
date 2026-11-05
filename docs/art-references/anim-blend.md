# Animation blending: how battle figures go from one clip to the next

Date: 2026-11-05. Scope: which clip a battle figure plays and from which frame, frame to frame.
Code: `src/client/render/animstate.ts` (pure, tested in `animstate.test.ts`), the per-soldier
block of `src/client/render/scene.ts` `build()`, and the facing helpers in `pose.ts`.

## Why

The user: "Animations ought to blend more into each other." Everything looked rigid. The figures
are pre-painted frames, so there is no bone-level crossfade. The fix is choosing *when* to switch
clips and *which frame* to enter on, so that consecutive frames read as one motion.

## References

| Source | Licence | Taken from it |
|---|---|---|
| Animancer manual, *Mixer Synchronization* ([page](https://kybernetik.com.au/animancer/docs/manual/blending/mixers/synchronization)) | Docs (study only) | Walk and run must be kept at the same *normalized time*, or a walk with its left foot down meets a run with its right foot down. It also warns not to sync a gait with an idle, whose cycle is unrelated. Our Walk, Run and Advance share one 12-frame step (paper/guard.ts `guardWalk`; the faction `WALK_LEGS`/`RUN_LEGS` place contact at frames 0 and 6, passing at 3 and 9). A switch between them carries the cycle fraction over. Idle and Brace keep their own phase. |
| GameDev.net, *Synchronising animations within a blend tree* ([thread](https://gamedev.net/forums/topic/663215-synchronising-animations-within-a-blend-tree/)) | Forum (study) | If foot contacts sit at 0% and 50% of every locomotion clip, the clips line up with no extra markers. Our painters already author them that way, so a frame index carried over is enough. |
| Virginia Tech CS 4204, *Animation transition* lecture ([pdf](https://people.cs.vt.edu/~yongcao/teaching/cs4204/spring2011/notes/cs-4204-lecture19_animation_transition.pdf)) | Course notes (study) | Store a sync offset per clip and map the time of one clip into the other at the transition. This is `AnimTrack.pos`: the frame position a loop started at, recomputed at each switch. |
| Unity manual, *Animation State Machines* ([page](https://docs.unity3d.com/Documentation/Manual/StateMachineBasics.html)), and abratabia, *Animation State Machines for Games* ([page](https://www.abratabia.com/game-animation/animation-state-machines.php)) | Docs (study) | Conditions are checked every frame. A speed near a threshold therefore flips states, and a transition needs a duration or exit time. With sprites we can't blend over a duration, so we use the sprite equivalents: a hysteresis band on each speed threshold (`pickAnim`) and a time the new clip must be called for without a break before it takes over (`settleFor`). |
| *Blue Knight* sprite sheet, OpenGameArt ([page](https://opengameart.org/content/knight-and-knight-animation), [image](https://opengameart.org/sites/default/files/BlueKnightSpriteSheet.png)) | CC0 | Downloaded and examined. Every row (idle, walk, the attacks, hurt) starts and ends on the same sword-across-the-body pose, so any row can follow any other. Our blows start and end on Brace frame 0 (guards.md). The renderer now enters Brace at that frame after a blow, a flinch or a guard-walk, rather than at an arbitrary loop phase. |
| Total War battle footage (see `total-war-battles.md`) | Study | Men in a block in melee never strobe between stances. They hold a guard, step in it, and turn by degrees. That is the target here: few switches per man per second, and no about-face in one frame. |

## What popped, and the rule now

| Pop | Cause | Rule (animstate.ts / pose.ts) |
|---|---|---|
| Walk to Idle to Walk every few ticks; Advance to Brace to Advance in a press | The sim pauses a marching or pressing man for one tick in four (speed 0, then 14+), and speeds hover around the thresholds | `settleFor`: a different loop must be called for continuously for 1.6 ticks before it replaces a gait, 0.8 before a gait replaces a stand, and 3 between Idle and Brace. `pickAnim` adds hysteresis (walk from 3, stop under 2; run from 1.2× top speed, back to the walk under 1.1×). |
| Feet jumping on Walk, Run and Advance switches | Each loop's frame came from `T / ticksPerFrame` and the gaits have different tpf | The stride is carried over: the new gait enters at the old one's cycle fraction. |
| The guard entered at a random sway frame after a blow | Loop phase came from absolute time | Brace entered from Attack, Shoot, Hit or Advance starts at frame 0, where the blow ended. |
| Wounded men flinching forever | `prevHp` was a Float32Array while the sim's hp is a float64. About half of all wounded men read as "hurt again" every tick, so they replayed Hit frames 0 to 2 nonstop and sprayed blood every tick. | `prevHp` is now a Float64Array. |
| A flinch that came due during a blow jumped in mid-way | Attack outranks Hit, and Hit was timed from `hitAt` | A late flinch plays in full from the moment the blow ends. |
| About-face in one frame (SE to NW) | Only 4 facings | `turnVia`: a half turn shows the quarter between for 1 tick. |
| Facing swinging back and forth at each hold's end | Velocity 0 for a tick sent `facing()` from the way he walks to his front or his foe | A man still in his stride faces the way he last moved. Turning back to the facing he just left takes twice `TURN_HOLD`. |

## Measured (Node replay, all men, 4 draws per tick)

Seeds 7 and 23 with 450 men each, run through the old stateless choice and the new track. The
rates are per man per second of battle.

| | seed 7 before | seed 7 after | seed 23 before | seed 23 after |
|---|---|---|---|---|
| clip switches | 0.965 | 0.481 | 1.063 | 0.500 |
| loop-to-loop switches | 0.698 | 0.197 | 0.817 | 0.235 |
| flicker (A, then B, then back to A within 0.3 s) | 0.370 | 0.020 | 0.438 | 0.027 |
| gait switches with a stride jump (total) | 5090 / 6155 | 0 / 3575 | 5987 / 7367 | 0 / 3814 |
| guard entered off frame 0 after a blow or guard-walk | 12285 / 14074 | 0 / 8144 | 9745 / 11211 | 0 / 6123 |
| frame jumps within a clip (mostly the endless flinch) | 77003 | 266 | 68887 | 231 |
| one-frame about-faces | 7299 | 435 (blows and shots only) | 5514 | 311 |
| facing back-and-forth within 0.8 s | 7958 | 3660 | 6840 | 3024 |

One marching spearman (seed 7, man 395, ticks 400 to 416, 4 draws a tick) before the change:
`Walk 6 7 7 8, Idle 2 2 2 2, Walk 10 11 11 0 ...`. He dropped into Idle every fourth tick. After:
`Walk 7 7 8 8 9 9 10 10 11 11 0 0 1 ...`, with no break in the stride.
