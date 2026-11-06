# Battle realism review, round 3: the single man (QA, 2026-11-06)

The standard is the user's: *"at any point a real person IRL would do that; there shouldn't be a
single person on the battlefield where you wonder why aren't they doing X, since I would do X, or
wondering why they're so stupid."* Rounds 1 and 2 (`battle-realism-review.md`, `-2.md`) looked
mostly at blocks: shooters, horse, reserves, generals. This round looks at **individual men**,
one by one, in small set pieces.

**What was reviewed.** Branch `cc/qa3` from `master` @ `5f692f9` (battle v17).

**How.** Small and headless, as the fast-sim skill says, every command under `timeout 180`.
- `scripts/qa/soldier-sense.ts` (new): stages set pieces with `src/game/testing.ts` and checks
  every man still fighting, every other tick, for:

  | Metric | What it counts |
  |---|---|
  | struck-idle | No foe of his own while an enemy who has him as his foe stands within that enemy's reach of him: struck at, and not answering. |
  | idle-hand | No foe while an enemy (not running) is within his own striking distance, with no friend between them and the enemy not covered by his own front rank. Also counted as runs of 1 s and more. |
  | idle-near | No foe, standing still (under 3 u/s) for 2 s and more, with an enemy within 25 u and no friend between them. |
  | lone-in | No friend within 20 u, 3 or more enemies within 30 u, and walking toward them. |
  | through | Centre within 0.6 of the two radii of a friend of another block. |
  | heading reversals | Turns of 135 degrees or more, both legs over 5 u/s, sampled each second, per man-minute. |
  | lost | No foe, 50 u or more from his place, no enemy within 40 u, not walking back. |
  | struck from behind | Facing his own foe in front, while another foe strikes him from behind (by his block's front). |

  It also counts two things per block:
  - under fire idle: arrows falling on it, not in a fight, not shooting, not moving;
  - idle beside a fight: a line block standing within 40 u of a friend's fight and 80 u of the enemy in it.

  The set pieces are:

  | Set piece | What it stages |
  |---|---|
  | `clash` | Heavy foot against heavy foot, and the grind after the clash. |
  | `spears` | Spears against heavy foot. |
  | `spearwall` | Templar spears against yari. |
  | `edge` | 90 men against 36: outer files with nobody to fight. |
  | `rear` | A third block falls on the rear of a block in a fight. |
  | `reserve` | A second line behind the first. |
  | `skirm` | Skirmishers chased by foot. |
  | `archers` | Archers caught by foot. |
  | `rout` | Rout and pursuit. |
  | `survivors` | Three quarters of a block cut down at once, leaving scattered survivors. |

  `--demo 450 --seeds 1-4` runs the same checks over whole demo battles, as a survey only (5 s a battle).
- New narrow probes:
  - `rout-contact.ts`: a block breaking in contact: fugitives cut down, victors' pause; with
    `--last` the whole army breaks, the end of a battle;
  - `rout-foot.ts`: foot routing from foot, second by second;
  - `brace-idle.ts`: spears braced while enemy horse fights a friend;
  - `skirm-rest.ts`: skirmishers fallen back behind their line, under arrows;
  - `stalled.ts`: formed foot that cannot reach its goal.
- Existing probes: `face-away-render.ts`, `realism-audit.ts` (seeds 1-4 at 450),
  `trace-block.ts`, `scripts/duel.ts`.
- Debug traces, per man and per second, were run on the worst men each metric found. They show
  position, velocity, target, rank, file and the blocks about him.

## Summary (prioritised)

| # | Finding | Severity | Before → after | Status |
|---|---|---|---|---|
| 1 | Spear on spear: the second and third ranks are stabbed over their own front rank by men they cannot reach, and stand there with no foe | **High** | struck-idle 3.85% → 1.25% of man-time (`spearwall`, seeds 1-6); demo s1-4 at 450: 0.05-0.36% → 0.04-0.20% | Fixed |
| 2 | Spears stand braced, 30 u from enemy knights hacking at the foot beside them, for up to 14 s | **High** | braced with the horse fighting a friend: 37% of all braced time (1,641 of 4,427 man-s, longest 14 s) → 8% (270, longest 8 s); set piece 4.9 s → ≤1.3 s | Fixed |
| 3 | Skirmishers with no line of their own stand and throw until slower foot is on them | **Medium-high** | cut down with javelins in hand 48 of 120 → 0; javelins thrown 357 → 480; spears felled 18 → 41 | Fixed |
| 4 | A reserve shuffles side to side for 5-12 s in a gap between two friendly shooter blocks too narrow for it | Medium | stalled foot 57-75 block-s a battle, longest 5-7 s | Not fixed (attempt made it worse) |
| 5 | Retired skirmishers stand behind the line under arrows and are shot down there | Medium-low | 3-13% of their retired time under arrows; 2-16 shot dead there per battle (s3: 16 of 30 skirmisher deaths) | Not fixed (most arrows from circling horse archers) |
| 6 | Front-rank men fighting the man before them while a second foe strikes their back | Low | 1.5% of man-time in a frontal clash, 0.1-0.2% in demos | Not fixed (melee crowding) |
| 7 | Skirmishers in reserve standing 12 u from an unengaged enemy for 5 s and more | Low | 0-9 runs a battle | Not fixed |
| 8 | Out of javelins with no line, skirmishers go in against heavy foot | Low | by design ("someone must end it") | Not fixed |

**Passes: men doing what a man would.**

| Check | Result |
|---|---|
| idle-hand, runs of 1 s+ (demo s1-4 at 450) | 0.00-0.06% of man-time, after #1. Most short runs are the 0.3 s between looks. |
| idle-near (2 s+ standing by an open enemy) | 0.01-0.03% |
| lone-in (alone, walking into 3+ enemies) | ≤ 0.01% |
| through (walking through friends) | 0.01-0.04% |
| lost men | ≤ 0.1% |
| heading reversals | 1.3-1.8 per man-minute. Nearly all are the melee's breathers (P3: a step back out of measure and in again, by design) and men stepping up into a file. Horse archers turning to kite are cavalry, not looked at here. |
| face-away, as the renderer draws it (s1/450) | 1.33% |
| The rout in contact (`rout-contact.ts`) | Fugitives in contact are cut down in the first 5 s: 29-49% of them. Victors in contact set off after them in a median 0.3-0.8 s, 1.5 s for spears. Still true when the whole army breaks (`--last`). |
| Survivors of a block cut to a quarter | They break, run the right way, and are not left standing about. |
| A block attacked in the rear | Its rear ranks face about. Men struck at with no foe: 0.14%. |
| Men at the edge of a wide line against a narrow one | Idle 0.07%. They curl round (P6). |

---

## 1. Spear on spear: the ranks behind are speared where they cannot answer — High (fixed)

**What happens.** Two spear blocks meet. A man in the enemy's front rank, or a yari of their second
rank striking past their own front, takes as his foe our *second or third* rank man, 15-25 u off,
over the head of the front-ranker before him. Our man is a Templar spear (reach 13), not a pike
(17+). Behind his own front he cannot strike past it (`act`: `REACH.inside`), and his look (`seek`,
R 10-15) does not reach the man stabbing him. He stands with no foe and is stabbed.

**Where.**
- `spearwall` (48 Templar spears v 48 yari, seeds 1-6): struck-idle **3.85%** of all man-time.
- By rank, for the man struck and the man striking: 85% of it was rows 1-2 struck at 15-25 u by
  spears (`struckBy row1 me-rcspear by-rcspear dist20 303`, …).
- Demo s3/450: man 504 (yari, rank 1) at t597-608 stands with Templar spearman 139 (front rank)
  targeting him from 14.5 u, through his own front rank (503, 505, 515 at 4.6-10 u).
- Demo s1-4 at 450: struck-idle 0.05/0.27/0.36/0.14% of man-time, the worst of any per-man check.

**Why it's unrealistic.** In a push of spears the front rank fences with the front rank facing it. A
spearman does not ignore the point at his own face to reach over it at the man behind. When he
does, that man would close up or step into the gap, not stand and take it.

**Fix** (`seek`, battle.ts). Past a body's length, nobody takes as his foe a man standing behind his
own front rank or file (`open`), unless that man is at him. Pikes striking past their own front
are included. Body to body, a man is fought wherever he stands.

**After.**
- `spearwall` seeds 1-6: struck-idle **1.25%**; idle-hand 0.67% → 0.29%; 1 s runs 25 → 1.
- The rest is mostly men chosen while still open (the front-ranker before them just fell), kept for
  the 0.6 s until the next look.
- Demo s1-4 at 450: struck-idle 0.04/0.20/0.14/0.07% (the battles change, so per seed this is not an
  exact before and after).
- `duel.ts spearmen:templar:48 spearmen:samurai:48 --seeds=1-8`: the yari win 8 of 8 either way.
  Survivors went from 31-46 to 29-46: about the same.

**Test.** `soldier-sense.test.ts` "spear on spear": struck-idle under 2% over seeds 1-3. It was 5.2%
before the fix.

## 2. Spears braced against horse that is not coming — High (fixed)

**What happens.** Enemy knights charge a block of our foot and stick in a melee there. Our spears
stand 20-40 u beside that fight. `thinkLine` braces any spear block with enemy horse within 150 u
that is charging or flanking, or in a melee within 40 u. So the spears set themselves, facing the
horse, and stand while it hacks at their friends.

**Where.**
- Demo s3/450: L20 (39 Templar spears), t860-t980. Knights K13 are locked with heavy foot L17, edge
  -9 to -13 u from them, 25-33 u from L20. The spears brace for 12 s, through the whole fight.
- `brace-idle.ts`, demo s1-4 at 450: of 4,427 man-seconds braced, **1,641 (37%)** had the nearest
  horse locked in a melee with another of our blocks. Longest run 14 s.

**Why it's unrealistic.** Horse at a stand among foot is what spears are for: it has lost its
impetus, and its flank is open. Any spearman would go for it, and any captain would wheel his men in.
Bracing is against a charge, and none is coming.

**Fix** (`thinkLine`, the brace branch). Horse in a melee and engaged, its target another block of
ours, no other horse coming at us (`horseComing` within 150), and no word to withdraw: the spears
`startCharge` at it, rather than brace.

**After.**
- `brace-idle.ts`, s1-4/450: **270 man-s (8%)**, longest 8 s.
- Set piece: 30 spears 30 u beside 30 heavy foot, 16 knights at the heavy foot. Braced while the
  knights fought the friend: 4.9 s → 0.4-1.3 s on seeds 2-4. Knights lost 8-10 → 10.

**Test shift.** `game-matchups` "a pike wall breaks a frontal charge of horse" compared knights
killed by spears in pike wall against spears in line. Over its three days, line spears now kill 17
riders (was 10), against 14 for the pike wall, and lose 97 men (was 88) against 16. Neighbouring line
blocks now go in at knights stalled on the next block, which is the point of the fix. The test now
checks that the wall still kills riders (≥ 10) and loses under half what the line does.

**Test.** `soldier-sense.test.ts` "spears go in at horse locked in a fight": under 1.5 s braced on
seeds 2-4. It was 4.9 s.

## 3. Skirmishers with no line stand to be caught — Medium-high (fixed)

**What happens.** `thinkSkirmish`: "with no line of our own there is nothing to fall back behind:
they fight it out." Skirmishers alone (a small army, or the end of a battle with the line gone)
stand and throw while slower heavy foot walks up to them, then are cut down in melee with javelins
left. They run at 34 u/s, and the foot at 22.

**Where.** 30 samurai skirmishers v 48 undead spears 140 u off, seeds 1-4:
- 48 of 120 skirmishers cut down with javelins still in hand;
- 357 of 480 javelins thrown;
- 18 spears felled.

`duel.ts skirmishers:templar:30 heavyInfantry:templar:48`: they are all dead or gone by t=29 s.

**Why it's unrealistic.** Light troops give ground before heavy foot and throw as it comes on. At
Lechaeum, peltasts destroyed a Spartan mora that way. Nobody with javelins in hand and longer legs
waits for armoured men to reach him.

**Fix** (`thinkSkirmish`, `SKIRM.back` …). With no line, javelins left, and foot slower than 0.85 of
their speed within 70 u, they run back (`giving`, at 0.9 of their speed: `moveAnchor`) to 125 u from
it. Then they halt, throw, and give ground again. They do this only while there are 30 u of ground
behind them; at the field's edge they fight. Out of javelins, they still go in (see #8).

**After.**
- Cut down with javelins in hand **0 of 120**.
- All 480 javelins thrown.
- 41 spears felled.
- Against Templar heavy foot (armour and shields) they still kill nobody.

**Test.** `soldier-sense.test.ts` "skirmishers with no line": fewer than 8 caught, more than 420 thrown.

## 4. A reserve shuffling in a gap too narrow for it — Medium (not fixed)

**What happens.**
- Demo s2/450, L2 (30 heavy foot, reserve), t490-t600. Its goal, behind its friend L0, runs on
  ahead: 868 → 978.
- In its way stand two friendly archer blocks halted to shoot, M7 and M8 (95 u wide, loose). The
  gap between them is about 29 u, and L2 is 57 wide.
- `giveWay` slides L2's step along M8 one tick, then along M7 the next. The anchor moves ±1.08 u
  sideways each tick and gains nothing. The men step to and fro: 68 heading reversals in 10 s.
- It never counts as halted, so `clearGoal` never looks for the way round. After 11 s it finally
  forms column and goes through.

**Measure.** `stalled.ts`: foot blocks out of a fight in advance, reserve or hold, with a goal 40 u+
off, that moved under 12 u in 5 s. 57-75 block-seconds a battle at 450, longest 5-7 s.

**Tried.** Count a step that gains less than a quarter of itself toward the goal as held up, so that
`clearGoal` routes round. It made things worse: 79-102 block-seconds, longest 13 s, because the
dodged goals put blocks into other friends. Reverted.

**Suggested.**
- Let formed foot pass through the intervals of friendly shooters in loose order (archers stepping
  aside was drill), or have the shooters sidestep.
- Or choose the reserve's spot with the shooters' footprints in mind, at the word, not at each step.

## 5. Retired skirmishers shot down behind the line — Medium-low (not fixed)

**What happens.** Skirmishers that have fallen back rest 70 u behind their line ('reserve'). Arrows
keep falling on them there, and they stand.

**Measure.** `skirm-rest.ts`, s1-4/450:
- 3-13% of their retired time under arrows (150-483 man-s);
- 2-16 shot dead while retired; in s3 that is 16 of the battle's 30 skirmisher deaths.

**Tried.** Shot at there, rest 130 u further back for 30 s. Shot dead while retired went from 33 to 27
in total. The trace (s3 S4, t600-t990) shows why it does little: most of those arrows come from enemy
horse archers (H30) circling 360-415 u off, and they follow. Reverted. A set piece with foot archers
did not reproduce it, because foot archers shoot at the line.

**Suggested.** Retired skirmishers under fire from horse archers close in behind or into a formed
block (as QA2 #1 cover does for shooters and horse), or ask the General to set horse on the horse
archers. Both touch the missile and cavalry code that is being worked on elsewhere.

## 6. Struck from behind while fighting the man before him — Low (not fixed)

In a frontal clash the lines interpenetrate. A front-rank man fights the foe before him while a
second foe, past his shoulder, strikes his back:
- 1.48% of man-time in `clash`;
- 0.92% in `rear`;
- 0.11-0.18% in demos.

A real man in that spot would give a step back into his own ranks. Probably best left to the melee's
breathers (P3). Watch it if lines are made to interpenetrate more.

## 7. Skirmishers in reserve beside an idle enemy — Low (not fixed)

Demo s3/450, S4 men 163 and 164, t1424-1474. They stand in reserve 12 u from enemy 382, who
fights nobody (att 0), for 5 s. Their look is 10 u (not line, leash 9). There are up to 9 such runs a
battle. They should throw at him or step away.

## 8. Skirmishers out of javelins go in — Low (by design)

With no line and no javelins, `thinkSkirmish` hands them to `thinkLine`, and they advance on the
nearest enemy, heavy foot included. That is a hopeless fight, but something has to end the battle:
alone, a skirmisher army would never break. Left as it is.

## Not reproduced

- **Victors standing after the enemy breaks.** In `rout-foot.ts` (80 heavy v 24 yari, the whole army
  breaking) the block-level pace is low for 5 s. Man by man, though, `rout-contact.ts --last` shows
  the men in contact set off in a median 0.3-0.7 s and cut down 29-49% of the fugitives in contact.
  The low block pace is the rear ranks, keeping formation.
- **Front-rank man "idle" in melee.** A trace showed front-ranker 4 with no foe for 6 s: he was dead
  (state 2). Not an issue.

## Reproduce

```
npx tsx scripts/qa/soldier-sense.ts --seeds 1-6 --pieces spearwall,spears   # #1
npx tsx scripts/qa/soldier-sense.ts --demo 450 --seeds 3 --worst             # survey + worst men
npx tsx scripts/qa/brace-idle.ts 450 3                                       # #2
npx tsx scripts/duel.ts skirmishers:samurai:30 spearmen:undead:48 --gap=150 --seeds=1-4 --quiet   # #3
npx tsx scripts/qa/stalled.ts 450 2                                          # #4
npx tsx scripts/qa/skirm-rest.ts 450 3                                       # #5
npx tsx scripts/qa/rout-contact.ts --v [--last]                              # rout in contact
npx vitest run src/game/soldier-sense.test.ts
```
