# Factions

Every faction fields the same ten unit classes (src/game/units.ts) and the same eight buildings.
A faction renames them, gives them a look, and nudges **at most 3 stats by at most ±10%**
(design.md §4). Data lives in `src/game/factions.ts`; art references in
`docs/art-references/samurai.md` and `docs/art-references/undead.md`.

The team hue (heraldry, chosen by the player) goes on what the eye finds first in a crowd: the
Templar shield and banner, the Samurai **sashimono** back-flag, the Undead **shield and tattered
banner**. Faction palette colours never compete with it: the Samurai are dark lacquer with vermilion
lacing, the Undead bone and black with a sickly green glow.

## At a glance

| Class (UnitClass) | Knights Templar | The Samurai Clans | The Hollow Host |
|---|---|---|---|
| 0 HeavyInfantry | Sergeant-Brothers | Katana Samurai (*samurai*) | Grave Legionaries (*legionaries*) |
| 1 Spearmen | Spear Levy | Yari Ashigaru (*ashigaru spears*) | Ghoul Spears (*ghoul spears*) |
| 2 Skirmishers | Javelin Men | Nage-yari Skirmishers (*skirmishers*) | Bone-Throwers (*bone-throwers*) |
| 3 Archers | Pilgrim Archers | Yumi Ashigaru (*bowmen*) | Wraith Bows (*wraith bows*) |
| 4 Crossbowmen | Genoese Crossbows | Teppō Ashigaru (*teppō*) | Revenant Arbalests (*revenants*) |
| 5 LightCavalry | Turcopoles | Yari Cavalry (*yari riders*) | Black Riders (*black riders*) |
| 6 HorseArchers | Turcopole Archers | Yabusame Archers (*yabusame*) | Barrow Horse Archers (*barrow archers*) |
| 7 Knights | Knight-Brothers | Hatamoto Horse (*hatamoto*) | Death Knights (*death knights*) |
| 8 Shock | Iron Brethren | Sōhei Warrior Monks (*warrior monks*) | Bone Colossus (*colossi*) |
| 9 Artillery | Mangonel | Ōzutsu Bombard (*bombards*) | Corpse Trebuchet (*corpse trebuchets*) |
| Commander | Marshal of the Temple | Daimyō | Lich-Marshal |

| Building key | Templar | Samurai | Undead |
|---|---|---|---|
| barracks | Sergeants’ Hall | Dōjō | Ossuary |
| range | Archery Butts | Kyūdōjō | Bone Butts |
| stables | Stables | Umaya | Carrion Stables |
| workshop | Siege Workshop | Kaji Forge | Bonewright’s Yard |
| chapter | Chapter House | Clan Shrine | Black Chapel |
| granary | Granary & Fields | Rice Paddies | Grave Fields |
| hospital | Hospital | Physician’s House | Charnel Pit |
| walls | Walls & Pavises | Palisade & Tate | Barrow Walls |

Buildings are mechanically identical; only the names change. (The Charnel Pit still returns the
day's fallen: here they are dug up rather than nursed.)

## Stat tweaks and balance

| Faction | Tweak | Why |
|---|---|---|
Since battle v13 the factions differ mostly by their **doctrines** (below, and
`docs/faction-doctrines.md`); the stat tweaks are what is left.

| Faction | Tweak | Why |
|---|---|---|
| Templar | Archers missileDamage ×0.95 | Pilgrim archers. The knights' charge ×1.10 and morale ×1.05 went in v13: the Marshal's charge (T1) and re-forming on the banner (T2) replaced them. |
| Samurai | **HorseArchers missileDamage ×1.10** | Yabusame, the clan's signature art. Horse archers are 5% of the standard mix and fragile; +10% damage is a flavour edge, not a swing. |
| Samurai | **HeavyInfantry morale ×1.05, attack ×1.06** | Bushidō: the katana line holds a little longer and cuts harder (attack added in v13's balance). The Spearmen armour ×0.95 malus went in v13. |
| Samurai | Crossbowmen (teppō) reload ×1.34, missileDamage ×1.3 | The matchlock: fewer, heavier volleys (v11). |
| Undead | **every class but the Colossus and the trebuchet: hp ×0.71** (`DEAD_HP`; Colossus ×0.8) | The price of never routing (v12: 0.69; v13, with the doctrines: 0.66; v17, at real scale: 0.71). |
| Undead | **Archers missileDamage ×0.90** | Rotten sinew bowstrings: the weakest archery of the three factions. |

### Balance results

Script: `<scratchpad>/balance/balance.ts` (not committed). Standard mix from `game.test.ts`
(`MIX`), equal men, commander on both sides, `fight()` from `battle.ts`. Every seed is fought from
**both sides of the field** (faction left vs Templar right and the reverse), which cancels side
bias: the Templar mirror comes out at exactly 50.0%. One-sided runs were too noisy (the mirror
read 60–61% with 20–80 seeds).

| Matchup | 250 men | 400 men | 600 men | Overall |
|---|---|---|---|---|
| Templar vs Templar (40 seeds × 2 sides) | 50% | 50% | – | 50.0% |
| Samurai vs Templar (30 seeds × 2 sides × 3 sizes = 180) | 43% | 50% | 52% | **48.3%** |
| Undead vs Templar (180 battles) | 53% | 53% | 52% | **52.8%** |
| Requested run: 20 seeds × 2 sides at 400 men | | Samurai 48%, Undead 55% | | |

All inside the 40–60% window. Iterations: first pass (Spearmen armour ×0.90, Undead HI morale ×1.10,
Colossus hp ×1.10) gave Samurai 46.9% and Undead 56.9% (60% at 400 men); the final values above.

### Faction rules and doctrines (battle v13)

Stored as `FactionDef.rule` (text for the player); all simulated. The numbers live in `DOCTRINE`
(`src/game/command.ts`), one row per faction; `docs/faction-doctrines.md` has the research and
design. The ticker tells each doctrine's moment (event `doctrine`).

- **Templar: discipline.**
  - *T1 The Marshal's charge.* While the Marshal lives the Knight-Brothers never go in early or
    rashly: they wait in their place (still answering enemy horse within 220) until his signal,
    given once the lines are locked and an enemy block locked with ours falls under 45 morale
    (for the undead: under 60% of its men), or at the general charge, or 20 s after contact; then
    at most every 25 s, once the knights have re-formed. On it every knight block rides at that
    one block (the light horse at its flank), and the charge hits 1.2× as hard and shakes 1.25× as
    much. After each charge they ride back to 30 in front of the Marshal, and they chase at most
    120 units and 6 s. Ticker: *the Marshal unfurls the Beauséant*.
  - *T2 Re-form on the banner.* A wavering block may be pulled out of the line twice (others
    once), falling back 40 behind the nearest banner within 300 (the Marshal, or a steady block of
    its family); a broken one may re-form once more after its rally (others: a second rout is
    final), at any friendly banner within 200; a rallied block is shaken 25 s (others 40).
  - *T3 Not while the Beauséant flies.* Knight-Brothers and Iron Brethren at breaking point hold
    there, wavering, while the Marshal lives; when he falls they take 1.5× the shock (30). The
    army breaking still routs them.
- **Samurai: valour and the lord.**
  - *S1 The uma-jirushi.* The daimyō's aura is 1.35× as strong (13.5 at full skill; 1.6× until v15) and reaches 300
    (others 240); his death is a 35 shock (others 20) and −20 for the rest of the day (others −14),
    and for 30 s his hatamoto charge the nearest enemy to avenge him.
  - *S2 First spear, long chase.* Katana samurai charge any enemy within 140. The first samurai
    block of the line to reach the enemy claims the first spear: +8 morale, +3 to every block
    within 240. Katana samurai (0.6) and yari riders (0.95) break ranks to chase readily; chases
    run 1.4× as far and as long, and a block called back may go again after 8 s (others 12).
  - *S3 Drilled teppō fire.* The teppō go out 14 before the line (through it, like skirmishers)
    and fire from there; the line waits behind them up to 15 s while they do. They fall back
    through it when a formed enemy comes within 60 (horse 120), when the line comes up to them, or
    at contact. Their first volley is the whole block at once and costs its target 8 morale (the
    old "Teppō volley" rule, now simulated; the undead feel nothing); after it they fire rank by
    rank, up to three ranks a third of the cycle apart, each rank shooting past the others.
    Behind the line of a big army a matchlock, which needs a clear line of fire, found almost
    nothing to shoot (0.3 shots a man at 1500 a side, against 2.9 at 250); before it, 1.7.
- **Undead: the tide** (with *the dead know no fear*, below).
  - *U1 The tide.* Their formed foot marches at 0.8 of the drill's pace except within 240 of a
    living Lich-Marshal; their General never holds, refuses a wing or halts to trade volleys;
    their foot charges at a lurch (×1.15 speed, others ×1.45).
  - *U2 Unflinching.* A charge into them knocks men back 0.3 as far, stuns nobody, and loses its
    impetus 1.3× as fast per man hit. The damage is unchanged.
  - *U3 What falls, rises.* Every 10 s while the Lich-Marshal lives (and the host neither crumbles
    nor is spent), his fallen foot (heavy foot, spears, skirmishers) within 240 of him, dead 3 s or
    more and never raised before, whose regiment still stands, get up with 40% of their hit
    points and go back into their files: 45% of the foot of his host who fall while he stands (v16; until
    then at most 0.8% of the host's start a time, never more than 8 figures, by the clock).
    `Soldier.roseAt` marks them (the renderer plays their fall backwards, with a green
    grave-light); `SideResult.risen` counts them, and dead + fled + alive still make the start.
- **Undead: the dead know no fear** (built in battle v12; `fearless` in `battle.ts`, `UNDEAD` in
  `command.ts`). Undead regiments never waver, rout or rally, and no morale rule touches them
  (morale reads 100). The price is hit points: every class has 71% of its own (69% in v12, 66% v13-v16; `DEAD_HP`; the
  Colossus 80%, `COLOSSUS_HP`; the trebuchet, timber, unchanged), which replaced the stand-in
  HeavyInfantry morale ×1.05 and Colossus hp ×1.05 tweaks. If the Lich-Marshal falls, the whole
  host crumbles: every man loses 2% of his hit points a second and fights at -4 attack, -3
  defence. An undead army is spent (and loses) under 15% standing (8% until v16), or under 20% against twice as
  many, and crumbles where it stands rather than running. The proposed "below 15 morale a
  regiment crumbles at 1% hp/s" was dropped: with no fear there is no morale to fall below.
  Balance (`pnpm fairness --factions undead,templar` and `undead,samurai`, 200 seeds both ways
  round, 250 and 500 a side, on v11's missile drill): before, the undead won 51.3% / 50.5% of
  their battles against the Templars (250 / 500 a side) and 53.3% / 56.8% against the Samurai.
  DEAD_HP 0.68 gave 43.5% / 52.3% and 53.5% / 58.5%; 0.7 gave 52.3% / 56.0% and 53.3% / 60.3%;
  0.69 gives 45.8% / 54.5% and 52.0% / 55.0% (each ±2.5%), as close to the old rates as the
  noise allows. Battles with undead run some 20–30 s longer (no rout cascade on their side):
  mean 117–120 s before, 138–147 s after, none to the time limit.

### Balance with the doctrines (battle v13)

`pnpm fairness --factions a,b`, the standard mix, both sides of the field. Win rate of the first
faction; ± is one standard error (50%/√n).

| Matchup (first faction's wins) | 250 | 500 | 1500 | 2800 |
|---|---|---|---|---|
| Undead vs Templar, v12 | 48.0 | 52.5 | 61.3 | 68.8 |
| Undead vs Templar, v13 | 49.5 | 48.5 | 53.6 | 47.9 |
| Undead vs Templar, v14 | 43.0 | 48.0 | 43.6 | 53.6 |
| Undead vs Samurai, v12 | 50.5 | 53.0 | 67.5 | 73.8 |
| Undead vs Samurai, v13 | 52.5 | 49.0 | 52.1 | 57.1 |
| Undead vs Samurai, v14 | 47.5 | 37.0 | 45.7 | 59.3 |
| Samurai vs Templar, v12 | 54.0 | 47.0 | 40.0 | 46.3 |
| Samurai vs Templar, v13 | 49.0 | 55.5 | 44.3 | 44.3 |
| Samurai vs Templar, v14 | 52.0 | 57.0 | 57.1 | 53.6 |
| Undead vs Templar, v15 | 56.0 | 46.0 | 49.0 | 67.0 |
| Undead vs Samurai, v15 | 39.0 | 45.0 | 56.0 | 67.0 |
| Samurai vs Templar, v15 | 43.0 | 52.0 | 55.0 | 55.0 |
| Undead vs Templar, v16 | 45.0 | 47.0 | 48.5 | 56.0 |
| Undead vs Samurai, v16 | 41.5 | 44.5 | 41.5 | 55.5 |
| Samurai vs Templar, v16 | 51.5 | 47.5 | 52.5 | 51.5 |
| Undead vs Samurai, v16, 400 battles a cell | 45.5 | 45.8 | 44.5 | 56.3 |
| Undead vs Templar, v16, 400 battles a cell | 45.5 | 47.5 | 50.0 | 54.8 |

200 battles a cell at 250 and 500 (±3.5%), 140 at 1500 and 2800 in v13 (±4.2%; v12: 80, ±5.6%).
Mirrors (v13): Templar 48.8% (250 a side, 400 seeds), 51.0% (500, 200); Samurai and Undead 50.0%
(500, 200 battles each way round). No battle ran to the time limit; the longest of these was
292 s; means 121–170 s (undead and big battles the longest).

v14 (battle cohesion, `docs/art-references/battle-cohesion.md` §6; samurai katana attack back to ×1.0): same
battle counts. Mirror (Templar): 49.0% (250 a side, 400 seeds), 51.5% (500, 400 seeds; 57.0% over the first 200), 49.0% (1000, 200). No battle ran to the time limit;
the longest was 315 s; means 110–159 s. Out of the 45–55% band: undead vs samurai at 500 (37.0%, z −3.7) and
2800 (59.3%), undead vs Templar at 250 and 1500 (43–44%), samurai vs Templar at 500 and 1500 (57%).

v15 (the sweep after v14: the general's household no longer rides into the middle of any block
whose bounding circle comes within 40, so the Lich-Marshal, who fell in over half of all battles
and took his host with him, lives through most of them; raising capped at 8 figures a pulse;
daimyō aura 1.35×; samurai curl and surge 1): 100 battles a cell (±5%). Out of the 45–55% band:
the undead win two thirds of battles of 2800 a side (the cause was not found: battles of 2800 run
about 200 s against 180 s at 1500, and the raising, now at most 3% of the host in them, is not it);
the samurai beat the undead 61% at 250 and lose 57% to the Templars there; undead vs Templar at
250 and undead vs samurai at 1500 are at 56%. No battle ran to the time limit. Mirror (Templar): 51.5%
(500 a side, 200 seeds), 49.0% (250, 200 seeds).

v16 (`pnpm battle-stats` for the diagnosis): 200 battles a cell (±3.5%). Why the undead won two
thirds of battles of 2800 a side: the field stays the same size, so a big battle is a crowded and a
long one, and morale rules the living felt but the fearless dead did not grew with it. Outnumbered
counted every engaged enemy block touching a block against that block alone (2-2.6 times its
strength in any clash, 3.5 at 2800 a side: it now weighs the enemy close by against ours close by);
a friend's rout shook every friend within 150 by 7 (5 of them a rout at 2800, 3.4 at 500: now by
its share of the men about it); fatigue grew by the clock in battles that run half as long again
(now by the share of a block's men fighting); and the living sent no reserve at the dead's blocks,
whose morale never falls, while most of a big army's line stands in its second row (62% at 2800,
31% at 500). Removing fatigue's fear alone took the undead at 2800 from 67% to 49% and left 500
alone; outnumbered and the rout shock each moved 2800 more than 500. Besides: the general's
household rode into the enemy's big blocks (the Lich-Marshal fell in 59% of battles at 2800, 22% at
250; now 5-15%), U3 raised by the clock (now a share of the fallen), and big battles ended in archer
duels to the time limit. Out of the 45-55% band: undead vs samurai at 250 and 1500 (41.5%, z -2.4)
and, just, both undead matchups at 2800 (55.5-56%): the undead still gain some 10 points from 1500
to 2800 a side, the cause not yet isolated (per class the numbers barely move between the two; the
undead win the shorter of those battles). No cross-faction battle ran to the time limit (longest
353 s). Mirrors, 100 battles a cell, team 0's share: Templar 54/48/50/52%, Samurai 48/40/54/56%,
Undead 48/58/46/52% (250/500/1500/2800); two hosts of the dead at 2800 a side run 289 s on average,
the longest 351 s, none to the limit (26 of 200 before the undead's spent threshold went to 15%).

v16 measured again (no rule changed; `pnpm fairness --seeds 200`, 400 battles a cell, ±2.5%; the
two rows above marked "400 battles a cell"). **Mirrors:** `pnpm battle-stats mirror`, one battle
a seed, 400 seeds a cell, team 0's share: Samurai 48.3 / 50.3 / 50.3 / 53.3%, Undead 51.5 / 52.0 /
54.8 / 53.5% (250 / 500 / 1500 / 2800), every cell within 2σ, and Undead at 250 and 500 again
over seeds 401–2000: 51.9% and 51.1% (z 1.6 and 0.9). The 40% and 58% of the 100-seed run were
noise (seeds 1–100 alone still read 45% and 57%). No side bias was found. (`pnpm fairness
--factions a,a` cannot measure one: it fights each seed twice, the same battle both ways round.)

**Undead vs Samurai is not a samurai matter.** At 400 battles a cell the undead do as well
against the Samurai as against the Templars, within the noise at every size (the 41.5% cells of
200 battles were noise too). Per class (`pnpm battle-stats types`) the samurai deal and take what
the Templars do, with one exception, the teppō: against the dead at 250 a side, 5 shots a man in a battle against the Templars'
crossbows' 11.5, and three fifths of their damage, because the S3 screen seldom fires before it falls back
(at 250 a side the enemy horse fighting on a wing passes within 120 of the guns at some 20 s and
sends them back before they are out; at 1500 the enemy line comes within 60 first). Against the
Templars the first volley's morale shock makes up for it; against the dead nothing does. Letting
the guns ignore horse locked in a fight and stand to 40 changed neither matchup beyond the noise,
so it was not taken.

**The undead's curve with size is a layout effect, not a rule that grows with the battle.**
Undead vs Samurai, 200 battles a cell: 48.5% at 1000 a side, 44.5% at 1500, 38.5% at 1900, 45.0%
at 2200, 50.0% at 2500, 56.3% at 2800. It is not smooth: it steps with the order of battle
(`battle-stats ladder` now prints the first line's blocks and the biggest Shock block). From 1900
up the first line is five blocks with one block of Shock foot in its middle, and the undead win
more as that block grows (57, 66, 75, 84 men: 38.5, 45, 50, 56%): the Shock class (3% of the mix)
is one block until it outgrows a line block, so it grows with the army while every other block
grows with its square root. Without any Shock foot the undead win 52.5% at 1500 and 57.5% at
2800; with the Shock foot split in blocks of half a line block, 40.5% and 44.5% (against the
Templars 38.5% and 44.0%). A Bone Colossus block loses 85–100% of its duels against Sōhei or Iron
Brethren of its size (30 to 84 men), so its worth in the line comes from never breaking there. Every rule switched off kept the step from 1500 to 2800
(undead's share at 1500 → 2800, 200 battles each): no raising 16.0 → 24.5, no tide 42.0 → 51.5,
generals who cannot fall 41.5 → 53.5, no rout shock to friends 35.5 → 51.5, no outnumbered 32.0 →
45.0, the living's reserve against blocks of the dead at 80% (not 60%) 40.5 → 57.0, the dead's
reserve feeding their thinning blocks 49.0 → 66.0, the living never plugging a gap against the
dead 44.0 → 61.5, the dead never sending their reserve round a flank 30.0 → 43.0, the Colossus at
full hit points 51.0 → 65.0. Only an undead host that routs like the living, at full hit points,
turned it round (72.0 → 58.0). Left as it is: the four sizes of the table land on the band's
edges; a rule of the factions moves every size alike, and only the order of battle changes the
shape, which would change every army's deployment (a design decision: how big a block of Shock
foot should be, for every faction, so that the line looks alike at every size).

v17 (the field at real scale, foot and horse that think for themselves, slower reloads:
battle.ts v17 changelog). Our own pair runner (the standard mix, equal men, both commanders, each
seed fought both ways round), 200 battles a cell at first (±3.5%), 300-400 for the last rows:

| Matchup (first faction's wins) | 250 | 1000 |
|---|---|---|
| Undead vs Templar, v17 as merged (user's measure) | 33–36 | – |
| Undead vs Samurai, v17 as merged (user's measure) | 31–34 | – |
| Samurai vs Templar, v17 as merged (user's measure) | ~55 | – |
| Undead vs Templar, slower reloads, horse-facing fix | 37.0 | 36.5 |
| Undead vs Samurai, slower reloads, horse-facing fix | 36.5 | 27.0 |
| Samurai vs Templar, slower reloads, horse-facing fix | 50.5 | 55.5 |
| Undead vs Templar, + friendly crossing, firing spots, DEAD_HP 0.71 (400) | 53.3 | 49.8 |
| Undead vs Samurai, + friendly crossing, firing spots, DEAD_HP 0.71 (400) | 53.0 | 48.3 |
| Samurai vs Templar, + friendly crossing, firing spots (400) | 44.8 | 55.0 |

Mirrors (200 battles, team 0's share, ±5): Templar 47 / 45, Samurai 40 / 47, Undead 46 / 56
(250 / 1000); none ran to the time limit (undead mirrors at 1000 a median 323 s).

What was found: the approach under fire is not where the dead lose. Before contact (about 63 s in)
they lose 11–13% of the host against the living's 8–9%, a gap of three or four points; the gap
that decides the day opens in the melee after it, which runs a fifth longer at real scale: the
living rally and re-form over it, the dead only fall. Levers that leave that alone changed
nothing beyond the noise (100-200 battles a cell): the tide 0.9 (every block already marches
within 500 of the Lich-Marshal before contact, so it never bites), tide and raising ranges 700
(99% of the fallen already lie within 500 of him), raising 60% of the fallen (45%), no shield
wall for the dead under arrows, the Lich-Marshal's household drawing back from even odds, and on
the samurai side no teppō screen, horse archers at 1.0, no keen charge, the daimyō's aura at 1.2,
lighter teppō balls, the Marshal sparing spear blocks. The Lich-Marshal falls in about 40% of
battles, mostly once the host is already down to 0.6 of the enemy's strength: a consequence, not
the cause. So the price of never routing was re-set: DEAD_HP 0.71 (0.66), about 2.5 points of win
rate a hundredth. The samurai still gain some 10 points from 250 to 1000 a side against both
(katana samurai and yari ashigaru take a larger share of the kills in big battles); left as it
is, inside the band.


## Palettes

FactionDef palette shape (`sprites.ts` adds metalDark, leatherDark, wood and team colours).

| Key | Samurai | Undead | Notes |
|---|---|---|---|
| cloth | `#2c3550` | `#2e2b2a` | Samurai: indigo-black lacquer/lacing. Undead: grave-black rags. |
| clothShade | `#1a2034` | `#1a1817` | |
| trim | `#b5372b` | `#5f8f4e` | Samurai vermilion odoshi lacing; Undead corpse-light green (eyes, runes, glow). |
| metal | `#7d7a73` | `#6c6f68` | Samurai warm dark iron/lacquer; Undead dull, rust-greyed iron. |
| metalShade | `#45423d` | `#3a3c38` | |
| leather | `#4b2c1d` | `#3d3128` | Samurai lacquered brown; Undead rotted leather. |
| skin | `#d6b089` | `#d8d0b4` | Undead "skin" is **bone**: painters use it for skulls, ribs and limbs. |

Extra colours a painter may hard-code per faction (outside FactionDef): Samurai gold for mon and
crest `#c9a43a`, white sash/cowl `#e6e0d0`; Undead bright glow `#a8e07a` (1 px max per figure,
eyes), eye-socket black = outline colour, bone shade `#9c947a`.

## Visual briefs

Scale: figures 12–20 px tall on foot, horses ~16 px long; isometric, 4 facings (contract.ts
`Dir`). Shared conventions with the Templars: 1-px dark outline, light from the upper left, the
same animation timings. Poses named after `Anim` in contract.ts.

### The Samurai Clans

**Faction read.** Dark figures with bright horizontal stripes of lacing, a flared skirt
(kusazuri) making the hips the widest point, and above every soldier a **sashimono**: a 2×4 px
team-hue rectangle on a 1-px pole rising 3–4 px above the head (refs: Kawanakajima print,
Met armours). Ashigaru wear the flat **jingasa** cone hat; samurai wear the tall **kabuto** with
flared side-wings and a gold crest. A regiment from afar = a field of coloured flags over dark
bodies and slanting spears.

1. **Katana Samurai** (HeavyInfantry, ~16 px). Kabuto: 5 px wide, wings 1 px each side, gold
   crest pixel (or 2-px maedate). Dark menpō face (no skin showing but 1 px). Torso metal with 2
   rows of vermilion trim lacing; sode as 2-px blocks off the shoulders; kusazuri flared 6 px wide.
   Katana: 1-px pale steel arc, 5 px, held two-handed; no shield (the shield-hue goes to the
   sashimono). *Brace*: katana held high at the right shoulder (hassō stance), knees bent.
   *Attack*: diagonal downward cut across 3 frames, blade a bright streak on frame 2.
   *Die*: drops to one knee, then forward; sashimono falls flat beside him.
2. **Yari Ashigaru** (Spearmen, ~15 px). Jingasa (7 px wide flat cone, 1 gold mon pixel). Simple
   dark okegawa dō, leather sleeves, bare shins with white wrap pixels. Yari: very long (12–14 px)
   straight shaft, wood colour, steel tip. *Brace (pikewall)*: spear levelled at chest height,
   points forming a hedge; jingasa brims make an even row. *Attack*: short thrust, shaft slides
   2 px. *Die*: falls backward, spear clatters across.
3. **Nage-yari Skirmishers** (~14 px). No armour: dark-indigo hakama and short jacket, headband
   (hachimaki, 1 white pixel row), 2–3 short throwing spears in the left hand. Sashimono smaller
   (2×3). *Shoot*: overarm throw, body twisting. *Brace*: crouched. *Die*: spins and drops.
4. **Yumi Ashigaru** (Archers, ~15 px). Jingasa, light dō. Yumi is **asymmetric**: 9–10 px tall
   with the grip in the lower third, so the bow rises well above the hat (the defining shape).
   Quiver (ebira) on the right hip. *Shoot*: draw to the ear, bow upright. *Die*: crumples,
   bow standing up for a frame.
5. **Teppō Ashigaru** (Crossbowmen, ~15 px). Jingasa, dark dō, cartridge belt (1 px row of
   light dots). Teppō: 7–8 px straight dark line, held level at the cheek, 1 gold pixel at the pan.
   *Shoot*: 1 bright muzzle pixel + a 2–3 px grey smoke puff drifting up for 2 frames (volley lines
   look great in grey smoke). *Brace*: kneeling behind a wooden **tate** board (team-hue mon dot):
   the pavise equivalent. *Die*: falls sideways, gun across the body.
6. **Yari Cavalry** (LightCavalry). Bay horse, no barding. Rider in light dō with a jingasa or
   simple kabuto, sashimono streaming back. Yari carried diagonally, couched in the charge.
   *Attack*: thrust from the saddle. *Die*: rider slides off; horse bolts (or falls with him).
7. **Yabusame Archers** (HorseArchers). Light rider, **tall yumi** (rises 4 px above the head) as
   the silhouette key, no sashimono but a small **horo** cloak bubble in team hue at the back
   (2–3 px). Horse at a gallop, rider standing in the stirrups. *Shoot*: draws across the horse's
   neck to the side. *Die*: thrown backward.
8. **Hatamoto Horse** (Knights). The daimyō's guard: large dark horse with a red tassel harness
   (trim pixels on the chest), rider in full lacquer with tall kabuto and gold crest, sode
   prominent, **large sashimono** (3×5) or a horo. Yari levelled in the charge (Brace = yari couched
   at the trot). *Die*: horse rears and falls; crest flashes gold as it goes down.
9. **Sōhei Warrior Monks** (Shock, ~18 px, the biggest foot). White hooded cowl (katō) wrapping
   head and face, only eyes dark: a bright white head cluster. Dark robe over lamellar (metal
   showing at chest), wooden geta (2 px tall feet). **Naginata**: 10 px shaft with a 3-px curved
   pale blade. No sashimono; a team-hue prayer streamer at the waist. *Brace*: naginata held low
   and level, wide stance. *Attack*: big overhead sweep, two-handed (ref: Kuniyoshi's gate-smasher).
   *Die*: kneels, then topples sideways; white cowl stays visible on the ground.
10. **Ōzutsu Bombard** (Artillery). A short fat bronze/dark iron barrel (6 px) on a low wooden
    sledge, 3 ashigaru crew in jingasa, one with a slow-match (1 orange pixel). *Shoot*: big
    muzzle flash (2 frames), recoil 1 px back, a large grey smoke cloud. *Die*: barrel tips, crew
    scatter. (A Chinese-style traction trebuchet is the alternative if the renderer prefers the
    throwing arc shared with the Mangonel; keep the name *Ōzutsu*.)
11. **Commander: Daimyō.** Mounted, or on foot before a **maku** camp curtain (renderer's choice). Tall
    kabuto with a large gold crest (crescent maedate, 5 px), red-laced armour, **jinbaori** (sleeveless
    surcoat) in team hue, and a **saihai** (baton with a white paper tassel). A bearer behind him
    carries a tall **nobori** banner (2×8 px, team hue, the clan mon as a gold pixel ring).

### The Hollow Host

**Faction read.** The dead dressed as the soldiers they were: skull heads (big, 1/3 of the height,
ref: OGA skeletons), dark eye sockets with **one green glow pixel** in the officers and cavalry,
ribs as alternating bone/black rows, 1-px bone limbs with gaps between them, scraps of black rag
and rusty mail (ref: Holbein, Hollar). Team hue on the shields and on tattered banners with ragged
lower edges. Grim and quiet; no blood, no exposed organs: the Ghouls are the only "flesh" and they
are grey-green, gaunt, never gory. Death animation: they do not bleed, they **collapse into a heap
of bones** (the corpse frame is a small bone pile with the skull on top, plus a 1-frame green wisp
rising for the glowing units).

1. **Grave Legionaries** (HeavyInfantry, ~16 px). Skeleton in rusted mail and a battered
   open-faced helm, large rectangular or kite shield in team hue (cracked: one dark diagonal
   pixel line), short rusty sword. Shield covers most of the torso, so the silhouette matches the
   Sergeant-Brothers (fair readability). *Brace*: shields locked, skulls just visible over the
   rims. *Attack*: stiff, jerky stab (hold the windup frame one tick longer than the Templars).
   *Die*: falls apart in 2 frames: helm rolls off, bones drop.
2. **Ghoul Spears** (Spearmen, ~15 px). Hunched, gaunt grey-green figures (use `skin` darkened,
   or `#8f9a80`), bald heads, rag loincloths, holding long rough spears. The **hunch** (head forward
   of the shoulders) is the key silhouette difference from the skeletons. *Brace*: crouched low,
   spears levelled. *Die*: sprawl face down.
3. **Bone-Throwers** (Skirmishers, ~14 px). Bare skeletons, no armour, a sack of bones;
   they throw sharpened femurs and jawbones (projectile = a 2-px bone-white tumbling stick).
   *Shoot*: sidearm throw. *Die*: burst into scattered bones.
4. **Wraith Bows** (Archers, ~15 px). Hooded dark shapes, robe dissolving at the hem into 1-px
   gaps (ref: Kuniyoshi's ghosts), a pale skull face in the hood with green eye pixels, a black
   longbow. Their arrows leave a 1-px green trail. *Shoot*: draw; the robe flutters. *Die*: the
   robe collapses empty, a green wisp rises (no bones: wraiths).
5. **Revenant Arbalests** (Crossbowmen, ~15 px). Skeletons in kettle helms and padded rags,
   heavy crossbow, a team-hue pavise on the back (Brace = behind the planted pavise, as the
   Genoese). *Shoot*: stiff recoil. *Die*: bones drop behind the pavise.
6. **Black Riders** (LightCavalry). Skeletal horse (dark grey bone horse, ribcage visible, green
   eye pixel) with a rag saddle-cloth; rider a skeleton in a hood with a lance. Thin and fast;
   the light gaps between the horse's ribs and legs distinguish it from living horses.
7. **Barrow Horse Archers** (HorseArchers). Same skeletal horse, rider with a short recurve bow and
   a tattered team-hue pennon on the quiver. *Shoot*: turns in the saddle. *Die*: horse and rider
   collapse together into one bone heap.
8. **Death Knights** (Knights). The heaviest rider: a black-barded horse (barding `clothShade`
   with ragged edge, horse skull chanfron in bone), rider in **blackened full plate** (metalShade)
   with a great helm whose visor slit glows green (2 px), a team-hue shield with a skull mark
   (3 bone pixels), couched lance. *Brace*: lance couched at the trot. *Die*: horse falls,
   armour collapses empty (the helm rolls; the green goes out).
9. **Bone Colossus** (Shock, the "elephant", ~24–28 px, the biggest figure in the game). A giant
   built of fused bones: hunched, arms longer than the legs, knuckles near the ground, a cluster of
   several skulls as the head, a great **bone club** or a ship's anchor-sized cleaver. Bone
   palette with dark gaps; a ring of green glow in the chest (2–3 px). A team-hue banner rag
   nailed to its back. *Brace*: hunched, club across the body. *Attack*: overhead two-handed slam
   (2-px dust puff at the impact). *Die*: topples forward over 3 frames and breaks into a long
   heap of bones; the chest glow fades.
10. **Corpse Trebuchet** (Artillery). A traction trebuchet of black timber lashed with sinew,
    the throwing arm tipped with a bone sling; crew of 3 skeletons. Projectile: a dark bundle
    (1-px bone pixels) trailing a green wisp. *Shoot*: arm whips up, crew pull down. *Die*:
    frame splinters, crew fall to bones.
11. **Commander: Lich-Marshal.** Tall (~20 px), black ragged robe widening to the ground (ref:
    OGA Gate Keeper), skull with an iron crown, **staff topped by a green-glowing skull or lantern**
    (the brightest green on the field, 2–3 px), a team-hue tattered standard carried by a skeletal
    bearer behind. Optionally mounted on a death horse. When he falls: the staff light goes out and,
    if the no-rout rule lands, the host starts to crumble.

## Not done here

- No sprites were painted: `src/client/render/sprites.ts` is being rewritten by another agent.
  Until it reads these briefs, the new factions render with Templar shapes in their own palette.
- No `game.test.ts` balance case was added (out of this task's file scope); design.md §4 asks for
  one: each faction vs Templars, 40 seeds, 40–60% wins. Use both sides of the field per seed.
