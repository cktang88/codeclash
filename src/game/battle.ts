// The battle: two armies on an open field, fought to a rout.
//
// Deterministic (see rng.ts): the server fights it once to decide the day, and every browser
// fights it again from the same setup to show it, tick for tick. Soldiers are individual
// figures; when an army is too large to draw, each figure stands for several men (`scale`).
//
// Each side deploys the way a Total War army does: a skirmish screen, a first line of heavy
// foot with spears on its ends, the archers behind it, a second line in support, cavalry on
// the wings, engines and the general at the rear. Regiments are rigid blocks: an anchor (the
// middle of the front rank) walks and wheels, and every man keeps his slot in the files. When
// two blocks meet, the front ranks fight the men opposite them and the files close up as they
// fall; the rear ranks wait. Every regiment of the line is given a place against the enemy
// line (a front to fight, or an open flank to wrap), archers loose volleys at blocks that are
// not locked with friends, cavalry rides round the wings to charge archers and the rear and
// then pulls out to charge again, spears brace, and broken regiments run, rallying once if
// nobody chases them and something to rally on is near (their fugitives may also fall in with a
// formed regiment of their kind). Morale settles toward what a regiment's situation is worth (losses,
// the rate of loss, being taken in flank or rear, the general nearby) and charges shock it.
//
// Hot per-soldier data lives in typed arrays (struct of arrays); the `Soldier` objects are
// views onto them, so a renderer can keep reading `s.x`, `s.hp` and the rest.

import { factionStats, type FactionId } from './factions.ts';
import { mixSeed, Rng } from './rng.ts';
import { Ground, Terrain, TERRAIN, type TerrainKind } from './terrain.ts';
import { emptyCounts, STATS, U, UNIT_COUNT, type Counts, type Role, type UnitStats } from './units.ts';
import { COHESION, DOCTRINE, FATIGUE, MORALE, newOrder, REGROUP, PERSONALITIES, PLANS, UNDEAD, type CommanderTrait, type Doctrine, type MoraleState, type Order, type OrderKind, type Personality, type Plan } from './command.ts';

export type { CommanderTrait, MoraleState, Order, OrderKind, Personality, Plan } from './command.ts';
export { COHESION, DOCTRINE, MORALE, REGROUP, UNDEAD } from './command.ts';

/**
 * v17: men and riders think for themselves, on a field of real size
 * (docs/art-references/battle-cohesion.md section 7, battle-scale.md).
 * - Horse: a rider with no foe in reach while his block fights finds his own within 40, rides
 *   round slower friends, rides round the end of an engaged foot block to its flank, pulls out
 *   of spears when his charge is spent and he is hurt, and withdraws by his own path to his own
 *   spot at the rally point (the block no longer wheels as one). Free horse takes another
 *   target or the flank rather than charging braced spears head-on.
 * - Scale: field 2400 x 2400, armies 1300 apart, blocks, lines and wings two to three times
 *   further apart, missile ranges about 0.7 of Total War's (bows 590, crossbows 470, horse
 *   archers 420, javelins 140, engines 1100), MAX_TICKS 6000.
 * - Reloads at the new ranges (docs/art-references/missile-drill.md, "Rates of fire"): a volley
 *   of bows every 5 s (was 2.1), crossbows 12 s (4.4), teppō 17.7 s (5.7; each ball 1.45x, was
 *   1.3x), horse archers 5.5 s (2.6), javelins 3 s (2.6), engines 30 s (14); at will bows shoot
 *   at the burst rate (BOW_BURST, 0.6 of the reload). Arrows 36 a man (24), horse archers 30
 *   (22), javelins 4 (5). A shot at a target faster than a jog (25 a second) scatters with the way it goes in
 *   the shot's flight (LEAD_ERR): galloping horse is hard to hit at long range.
 * - Horse against shooters (`horseStrike`): outshot by bows and crossbows that stand off
 *   (STRIKE_OUTSHOT) before the lines meet, a General forms all his horse up just out of their
 *   reach and sends it in together, the knights with it (T1: on the Marshal's signal, again at the
 *   next shooters as soon as the last are gone). The light horse used to ride at the archers alone
 *   from the start while the Templar knights waited for a clash of lines that never came: horse
 *   beat bows at equal value in 5 battles of 30 (2 of 12 before the foot work), now 28 of 30.
 *   T1 knights whose enemy horse is gone no longer ride on at the shooters behind it unbidden.
 *   Measured on the merged branch (250 a side, 200 battles a pair): mirror 49.5% at 250, 51.8% at
 *   120 (600 seeds); undead-templar 37.0% -> 33-36%, undead-samurai 32.5% -> 31-32%,
 *   samurai-templar 54.5% -> 55%: within the noise (3.5 points) but for undead-templar, left
 *   to the balance pass. Battles run about a fifth longer (median 205 s against 175).
 * - Foot (battle-cohesion.md section 8; scripts/battle-sanity.ts audits it): each man keeps
 *   station on the men beside and ahead of him (35% his place, `station`), so a line on the move
 *   bends and dresses itself, and steps up into the hole of a fallen man ahead. He fights a foe at
 *   hand wherever he stands, before any other; men spread along the enemy front (`crowd`); idle
 *   past his patience he looks 5.5 files about him for a foot enemy at most one of ours fights and
 *   whom he can get at (`open`), round the flank or through a gap. A man swinging round a flank
 *   keeps his leash from where he is (he walked past the enemy he was sent for). A reserve block
 *   takes an open enemy flank close by on its own (`initiative`). Spears brace against horse
 *   fighting someone else only within 40. Mounted is by class, not weight (`Store.mt`: shock foot,
 *   mass 2.4, were taken for horse).
 * - Foot facings (formations.md 2.5.1): a block turning far faces round man by man and re-forms
 *   (countermarching, with time) when that is quicker than its wheel, which is slow for a wide
 *   block (`turnFoot`, `faceAbout`). Until re-formed it has no front. With enemy horse within
 *   150 (not riding off) it faces in place instead (`faceInPlace`): every man turns where he
 *   stands at once, the block deep and narrow to its new front after a quarter turn, and it takes
 *   its frontage again once the horse has gone; horse charging or riding round at it is a threat
 *   to turn to from 150. A block locked to its front turns its rear ranks about on an enemy
 *   behind it (`rearUntil`). Horse locked in a fight with another block counts only within 40
 *   (COHESION.faceHorseNear, as spears brace): the line blocks beside such a fight faced it and
 *   stood deep and narrow, front turned from the enemy foot, through the whole melee (7.6% of
 *   their time, 4.8% after), the line came apart and the enemy got in among the archers (long
 *   shots 55% of a bowman's volleys, 65% after, 66% before facing in place).
 * - Reloads, slower still (missile-drill.md, "Review after the merge"): those above were the best
 *   men's bursts. Bows loose a volley every 7.5 s (the 6-8 a minute heavy war bows keep up), at
 *   will every 5 s (BOW_BURST 0.72), 24 arrows a man; teppō every 30 s (about 2 a minute), 9
 *   balls; the undead's Revenant Arbalests are heavy cranequin crossbows, every 29 s, each bolt
 *   1.6x and pierce 0.74, 9 bolts. Genoese crossbows (12 s), horse archers, javelins and engines
 *   as they were.
 * - Balance (docs/factions.md, v17): the dead lose the day in the melee, which runs a fifth
 *   longer at real scale (the living rally and re-form over it; the dead only fall), not on the
 *   approach (11-13% of the host lost before contact against 8-9%). Tide, raising and household
 *   levers changed nothing beyond the noise, so the price of never routing is reset: DEAD_HP 0.71
 *   (0.66). 400 battles a cell, 250 / 1000 a side: undead-templar 37.0 / 36.5 -> 53.3 / 49.8,
 *   undead-samurai 36.5 / 27.0 -> 53.0 / 48.3, samurai-templar 50.5 / 55.5 -> 44.8 / 55.0 (the
 *   last change from the merged friendly-crossing and firing-spot work; ±2.5).
 * - Friendly blocks keep out of each other (`giveWay`, `crowded`, `rightOfWay`; measured by
 *   scripts/battle-crossing.ts): a block about to march into a friend goes round toward its goal
 *   or halts; one standing in a friend with the right of way (engaged, standing, charging, then
 *   marching; the first in the order of battle between equals) backs out; wheels and facings that
 *   would sweep into a friend stop short; no two reserves stand behind the same block. Not
 *   skirmishers, shooters falling back through their line, chases, horse at the charge or riding
 *   out, or two bodies in open order (archers among archers). A block held up behind a friend
 *   makes for the ground beside him (`clearGoal`, `dodgeFor`). Two friendly blocks stood in each
 *   other a quarter deep or more 1.9 times a second sampled in grand battles; 0.15 now, mostly
 *   horse charging horse.
 * - Archers each take their own firing spot (`firingSpot`, `spotTaken`): on the ring of their
 *   range, before the enemy, then a block's width and an interval to either side, then behind an
 *   interval; one that stopped on top of another block of shooters steps off to its own. Blocks
 *   of shooters give way to each other like the rest (ten blocks used to stand five deep on two
 *   spots); horse in open order still passes through horse.
 * - Horse and the household ride round their friends (`rideRound`; battle-cohesion.md 8.5d): a
 *   mounted block's goal comes out of any friend it lies in, and a ride that would cross a friend
 *   goes round the nearer end of him, a half-width and a horse's length clear; foot is always
 *   ridden round, horse at the charge or riding out only by the block without the right of way.
 *   Riders riding out make for their spots about that point. The household deploys behind the
 *   archers and the second line. Pairs with horse a quarter deep in a friend: 0.157 a second
 *   sampled in grand battles, now 0.024; the charge lands as soon as before.
 * - Knights keep out of our own foot's ranks (battle-cohesion.md 8.5e): a rider behind our foot
 *   fighting an enemy block does not take a man at that foot's front (`covered`) but another
 *   stretch, a flank or the rear (`hunt`); one in our foot's ranks rides out of them, at the
 *   gallop too (`amongFoot`); horse with three in ten of its riders there breaks off and charges
 *   again (`inOurRanks`). The household keeping its place gives way like any block (`yields`).
 *   `blockCrossings` no longer counts the places of horse locked in a fight. Grand battles: pairs
 *   with horse 0.032 a second sampled, now 0.018 (a quarter deep: 0.010, now 0.009); knights in
 *   melee among our foot in melee, 56 samples, now none in the top pairs; the household, 11 now 2.
 *   Horse kills over 30 battles: 5,337 then 5,166 (losses 3,003, 2,989), length 232 s then 229 s.
 * - Rallies and regrouping (QA review #1, #12, #16; `scripts/qa/rally-check.ts`): a formed block
 *   is the men in its ranks (`survey`). Runners who ran on when it rallied are off its count,
 *   centre (where its standard is carried), reach and leash, and may come back to its colours
 *   like any fugitive; a man who falls in walks to his place first (`Store.jn`) and counts only
 *   once he is near it. Fugitives look for a block by its formation (`formRadius`), not by the
 *   spread of its men. The leash closes the anchor on its men at no more than their running
 *   pace. Routers run round an enemy between them and home (`fleeFrom`), never veer toward the
 *   enemy's side, and swerve round a standing enemy close ahead (`dodge`; not the man hunting
 *   them). Over 24 demo battles: standard over 40 u from its nearest man, in blocks that rallied
 *   or took men in, 2,495 samples then 19; blocks spread over 3x their formation 176 then 55
 *   (with runners 87 then 5); anchor faster than twice its men's run, out of re-forming, 642
 *   then 92; routers running at the enemy's edge 1.4% then 0.5%, into an enemy 0.6% then 0.3%;
 *   men who fled off the enemy's edge 30 then 0.
 * - Nobody shoots into his own men (QA review 2026-11-06, #2 #3 #5 #7 #11 #13). Danger close: a
 *   shot is held when one of our men stands, or will stand when it lands, inside its scatter
 *   and a man's width more (a stone's splash too: `friendsNear`, DANGER); the shooter tries
 *   other men of the target first, and a block that held most of its shots gives that target
 *   up for 6 s (`fouled`). Targets are picked clear of our men (`clearTarget`): bows lob over a
 *   melee only at rear ranks the scatter can reach without our men under it; engines lift onto
 *   the second line and the reserves, and hold with nothing clear. No flat shot at a block
 *   locked with ours, nor while a man of ours is about to walk across its line
 *   (`friendCrossing`); a bombard's ball holds if any man of ours is on its whole run. Direct
 *   fire strikes along its flight, the man on its line as it reaches him (`strikeAlong`; it was
 *   the whole line as it landed). Crossbows no longer loft a blocked bolt at four times the
 *   scatter: they stand before the line while the lines are apart (FLAT_SCREEN, the samurai's
 *   screen drill), fall back through it as the enemy closes (horse from 420), and behind it step
 *   along to a clear line (`clearLane`) or wait. Engines deploy 40 behind the second line, never
 *   within 80 of the field's edge, and come up behind the line when nothing is in range.
 *   Skirmishers go out again only with 1.5 javelins a man and keep a place behind the line that
 *   moves with it only past 30; missile blocks keep out of our own foot's ranks (`freeSpot`).
 *   Seeds 1-4 at 450 and seed 1 at 1200: own hits from engines 55 then 1 (of 150 and 138 hits),
 *   crossbows 179 then 6 (14.9% then 0.6%), archers 187 then 2 (4.8% then 0.1%), horse archers
 *   16 then 1; archers' hits on the enemy 3,684 then 2,477, engines' 95 then 137. Loaded shooters
 *   silent with a target in range (seeds 3,7,11,23 at 450): 10.6% then 20.4%, of which 8.5
 *   points hold their shot for our men in the way or under the scatter, 7.2 are on the move
 *   (the crossbow screen going out or back) and 3.6 (5.9) have no such reason. Spent
 *   skirmishers going out again: 9 sorties then 2. Faction pairs, 80 battles at 250 a side:
 *   undead v templar 53.8, undead v samurai 48.8, samurai v templar 51.3.
 * - Generals and their horse (docs/qa/battle-realism-review.md, findings 4, 6, 10, 14).
 *   The household (`thinkCommand`, HOUSEHOLD) weighs every enemy block within 90 before it
 *   takes one on, fights only with the odds (HOUSEHOLD_ODDS), not when down to a third of its
 *   riders nor past 10 s of one fight, and then breaks off toward its post for 15 s, whether or
 *   not its army still has a line (the draw-back used to need one, and with its line gone the
 *   Lich-Marshal's household fought to its last rider 300-440 u ahead of what was left of his
 *   army). Its post stands behind the blocks behind the middle of the line, eases after the
 *   line's front over some 6 s (POST_EASE) and moves only when 40 u off (POST_DEADBAND); the
 *   household turns its horses to ride there rather than backing (POST_REIN); its riders stray
 *   40 u from their places after a foe, not without limit; breaking off, they cut at a foe at
 *   hand. Over 72 battles a faction (seeds 1-4, 450/1200/2800, all pairings,
 *   scripts/qa/generals.ts): the Lich fell in 24% (18% before the break), now 1% (0%);
 *   the Templar and samurai generals 4% / 7%, now 0%. Riding backwards in guard 9.5% of samples,
 *   now 0.5%.
 *   The light horse goes out by the plan and the odds (`General.horse`, chosen with the plan):
 *   'contest' rides at the enemy's horse after the general's own delay (0-40 s, HORSE_DELAY);
 *   'screen' keeps its wing level with the line and meets horse coming within HORSE_SCREEN;
 *   'wait' keeps it back for the moment the lines meet. In 24 demo battles of 24 the light-horse
 *   wings met first at 17.6-18.3 s; now the first clash comes at 23-62 s, horse on horse, horse
 *   on horse archers, or the lines.
 *   Horse locked in a fight with half its riders standing 2 s with no foe they can get at breaks
 *   off to charge again (`idleRanks`); a rider breaking off with a foe at his horse's head on his
 *   way turns out round him first (`foeAt`); horse riding round to a flank keeps `rideRound`'s
 *   way past friends (the goal put back beside the friend halted knights for good).
 * - Weapon reach (`REACH`, `UnitStats.reach`; docs/art-references/weapon-reach.md, measured by
 *   scripts/reach-sanity.ts): a man strikes from his weapon's reach beyond the two bodies (Templar
 *   spear 16, yari 19.5, ghoul spear 13, naginata 9, other shock foot 4, everyone else 1.6, as
 *   before) and closes only that far; a spear stands its foe off at 0.75 of its reach. Spear on
 *   spear the walls stall at the points and fence (front to front a thrust lands 0.55 as often):
 *   the front ranks stood 4.8 apart in a melee of spears, now 16 (yari 19), and lost 15% in the
 *   first 10 s, now 1%. The yari's second rank strikes past the first (the third when close). A shorter arm
 *   (under 0.6 of the spear's) before the front of formed spears is held at the points (`held`):
 *   he comes no closer, strikes nothing, and a thrust at him lands 0.4 as often; a charge on foot
 *   stops there. He gets in by a gap beside his spearman (0.2 a look), rarely by luck (0.03 times
 *   one and his shield; the heaviest foot thrice), or freely where the wall is not formed
 *   (re-forming, in column, running, reeling) or from the flank and rear; inside 0.45 of the
 *   reach the spearman fights at -15 attack, -8 defence. Horse whose charge is spent is held too;
 *   a charge still meets the brace and pike-wall rules. Sergeants coming at spears' front: 95% of
 *   those fighting a spearman stood inside his point within the first minute, now 57%. Balance:
 *   the yari levy damage x0.8, defence x0.8 (docs/factions.md, v17 weapon reach); the pairs stay
 *   within the noise of before at 250 and 1000 a side but samurai-templar at 250 (49 -> 56).
 * - The general's presence reaches further in a bigger army (`auraK`, MORALE.auraMen): his aura's
 *   340 grows with the fourth root of the army's figures beyond 250, so he heartens about the
 *   same share of his engaged blocks at any size (3 in 4 at 250; at a fixed 340, 1 in 2 at 1000
 *   and 2 in 5 at 2000, now 4 in 5). The living, who need him, lost ground against the fearless
 *   dead as battles grew (undead-templar 44% at 250, 59% at 1000, 71% at 2000); samurai-templar
 *   56 -> 52 at 1000. With it the price of never routing is eased back: DEAD_HP 0.72 (0.71).
 *   300 battles a cell (docs/factions.md, v17 reach balance).
 * - Command steadied (QA review 2, #5 and #7; scripts/qa/command-probe.ts). A reserve keeps the
 *   friend it backs (RESERVE_KEEP, then until another is RESERVE_SWITCH nearer), stands behind
 *   him as seen from the enemy, and moves or turns only past a dead band, sidestepping short
 *   shifts facing front; one that has faced a threat close by keeps facing it (RESERVE_WARY).
 *   The household's post moves along the line only past POST_ALONG, stands POST_STAND after a
 *   move and keeps clear of the engines. Line foot deploys from column into line BOWSHOT_MARGIN
 *   short of the enemy foot shooters' reach (it kept column to 240 u of any foe), and a block
 *   holding for a flank slot faces the enemy, not along its line. Over 36 pairings at 450:
 *   reserves change friend 0.89 -> 0.30 times a minute and wheel on the spot 2.8 -> 0.9° a
 *   second; oscillate flags for the household 46 -> 17, for reserves of the line 62 -> 53; line
 *   foot in column inside bowshot 6.5% -> 0; blocks facing over 45° off the enemy at deployment
 *   45 of 441 -> 0. (The wider blocks on the march cost a little: oscillate flags for line foot
 *   marching to a flank 14 -> 32, stragglers 12 -> 43, all flags 416 -> 430.) The side gap the review
 *   saw in samurai-undead (team 0 +11) did not hold on fresh seeds (301-500 at 250: 49.0 / 49.5);
 *   a swapped pairing mirrors exactly until the men's own draws part it (side-fair.test.ts).
 * - Horse charges with sense (docs/qa/battle-realism-review-2.md #3, #4, #6, leftover 5;
 *   src/game/charge-sense.test.ts). A charge that closes on its prey by under 10 u in 2 s with no
 *   blow (the prey locked with our own men, the way to it through them) rides once for its open
 *   side, away from our men, then leaves it be 30 s and takes another (`chargeSpent`); one that
 *   cannot catch free horse (14 s past CHARGE_MISSED), or any charge 25 s without a blow, rides
 *   back to re-form. Idle riders in 'charge' at 450 (seeds 1-4, scripts/qa/cav-idle.ts): 26 of
 *   53 idle rider-seconds, now 1 of 28; charges of 20 s without contact in 36 pairings
 *   (realism-audit): 18, now 0. A rider after a fugitive rides at the man's pace and more, to
 *   inside his reach, and cuts at him as he goes: the knights-on-archers set piece (seeds 1-3,
 *   scripts/qa/pursuit.ts) cut down 27 routers, 9 a rider-minute at their heels at 45% of top
 *   speed, now 49, 89 a minute at 73%. Two blocks of our horse on one enemy horse from the same
 *   side aim apart (`besideFriends`): riders knee to knee with the other block in the set piece
 *   8%, now 1%; s1/450 C27+C29 23%, now 13%. Faction pairs, 80 battles at 450: undead v templar
 *   33.8 -> 37.5, undead v samurai 33.8 -> 42.5, samurai v templar 50.0 -> 51.3 (noise 5.6).
 * - The volley clock waits on the men, not the men on the clock (QA review 2 #2). A turn of
 *   formed missile foot within 30 degrees of the front it last stood to (following its target) is
 *   no move (`tracking`, WHEEL_STILL): it neither stops the men shooting nor restarts the clock.
 *   The word waits while fewer than half the men are loaded, and comes a beat from now when two
 *   in three are loaded well before it (a volley most men held back from, for danger close or
 *   friends on the line, or one called while they reloaded after shooting at will). Reloads are
 *   as before (bows 7.5 s, teppo 30 s, arbalests 29 s). Of the time a block of foot shooters
 *   had a loaded man and a foe in range (scripts/qa/missile-silence.ts, seeds 1-4 at 450), archers
 *   loosed in 67%, now 81-86% (waiting on the clock with most men loaded 7.5% -> under 0.5%;
 *   "shuffling" 10.7% -> 3-6%, what is left of it walks to a new firing spot), crossbows 75%,
 *   now 79-84% (waiting 9.4% -> 0.5%, shuffling 2.7% -> 0.4-1.8%).
 * - Foot shooters take cover from horse (QA review 2 #1, `takeCover`, COVER). Archers and
 *   crossbowmen who see enemy horse coming at them (charging or making for them, or riding their
 *   way at a trot or better, within 420) and have a formed block of our foot they can reach before
 *   the horse could (at 0.9 of their speed, against the horse's pace or 0.75 of its gallop) run for
 *   its far side, through our ranks if need be, 4 s before the last moment they still could: they
 *   keep shooting while the horse is far off. There they stand and shoot (the danger-close and
 *   clear-line rules as ever) until no horse is near. Behind their own stakes, or with no friend in
 *   reach, they stand and shoot, fire at will at the last, and no longer step out toward the horse.
 *   Not toward the enemy's foot. Set piece (cover.test.ts: 24 knights 400 off, 24 archers 150
 *   before 120 spears, six days): archers lost 88%, now 11%; knights lost 76%, now 72-83%.
 *   scripts/qa/caught-shooters.ts, 36 pairings at 450: shooters cut down by riders 909 -> 624
 *   (13-16% -> 9-11% of all shooters), blocks caught by horse 70 -> 64 of 234 (the rest: no friend
 *   in reach, horse never seen coming, or horse riding round the friend); demo seeds 1-4: 240 ->
 *   99 men, 14 -> 9 blocks. Horse beats bows (game-matchups, 60 days) 33 -> 37.
 * - A fallen man does not rise from under the feet of a living foe (`footOn`): he waits for the
 *   Lich-Marshal's next pulse. He got up where he lay, inside the enemy over him, and nothing
 *   shoves a riser (RISE_TICKS): nearly every deep overlap of foes in the collision battles was a
 *   man just risen. Collision battles (seeds 1-8, 320 against 340): foes' overlap p99 1.10 -> 0.45
 *   of a man's radius, p95 0.34 -> 0.27; as many risen (the cap, not the ground, sets how many).
 * - QA review 3 #1 (docs/qa/battle-realism-review-3.md; scripts/qa/soldier-sense.ts). The front
 *   rank fences with the front rank (`seek`): past a body's length, nobody takes as his foe a man
 *   standing behind his own front rank or file (`open`), unless that man is at him; nor do pikes
 *   striking past their own front. A spear's front rank reached over the enemy's at his second and
 *   third ranks, who (short of a pike) could not answer and stood stabbed at with no foe. Spear on
 *   spear (48 Templar spears v 48 yari, seeds 1-6): men struck at with no foe of their own 3.9% ->
 *   1.3% of their time; demo seeds 1-4 at 450: 0.05-0.36% -> 0.03-0.15%.
 * - QA review 3 #2 (scripts/qa/brace-idle.ts). Spears go in at enemy horse locked in a fight with
 *   a friend of theirs close by (`thinkLine`), unless other horse is coming at them: they stood
 *   braced against horse that was not coming, 30 u from knights hacking at the foot beside them.
 *   Demo seeds 1-4 at 450: spears braced with the horse fighting a friend 1,641 of 4,427
 *   man-seconds braced (37%, longest 14 s) -> 270 (8%, longest 8 s). Knights on 120 spears
 *   (game-matchups, three days): spears in line kill 17 riders (was 10) and lose 97 (was 88).
 * - QA review 3 #3. Skirmishers with no line of their own to fall back behind give ground before
 *   slower foot (`thinkSkirmish`, SKIRM.back): once its men are within 70 they run back (at 0.9 of
 *   their speed, `giving`) to 125 from them, halt, throw, and back again, while they have javelins
 *   and ground behind them. They stood and threw until the foot was on them. 30 skirmishers v 48
 *   undead spears, four days: cut down with javelins in hand 48 -> 0 of 120, javelins thrown
 *   357 -> 480, spears felled 18 -> 41. (Out of javelins they still go in: someone must end it.)
 * - QA review 3 #5 (scripts/qa/skirm-rest.ts). Retired skirmishers shot at where they rest behind
 *   the line (`thinkSkirmish`, SKIRM.shelter*) go back out of the enemy's bowshot (or 400 back),
 *   and come back to their place only once it is out of bowshot. The enemy's shooters, holding
 *   their arrows off the melee, picked the men standing clear behind it, and spent skirmishers
 *   were shot down there to the last man. Demo seeds 1-4 at 450 (with HORSE): shot dead while
 *   retired 19 -> 6, man-seconds under arrows 640 -> 367. Set piece (soldier-sense.test.ts):
 *   they broke under the arrows within 30 s on three days of four, now on none.
 * - QA review 3: the household weighs itself by what its riders have left (`thinkCommand`): a
 *   bloodied household of seven took on a block of 37 as if fresh, and (after #5, in s3/450
 *   undead v samurai) the Lich-Marshal fell with it 18 s before his host broke.
 * - Horse wounds (`HORSE`, `horseHit`, `dismount`, `afootAct`/`afootMove`; UnitStats `horse`,
 *   `barding`; docs/art-references/horse-wounds.md). Arrows soaked into a knight's armour and killed
 *   none; at Crécy and Agincourt it was the horses that went down. A missile striking a rider strikes
 *   his horse 72% of the time (his shield does not cover it); barding (knights 30, the hatamoto's
 *   9) turns some, half as much from the side; bows inside about 85 m shoot through more (the
 *   bodkin, up to +0.3 pierce, rider or horse). A wounded horse slows, loses its charge and may bolt;
 *   a horse down or bolted leaves its rider on foot (`Store.dm`, `Soldier.dismounted`: his class's
 *   stats on foot, `footOf`), hurt by the fall and dazed (2-6 s, a knight in plate longer; meanwhile
 *   daggers find the gaps: `downArmour`), and the riders at his heels are checked by the fallen
 *   horse. Spears put 35% of their blows into the horse; a pike wall impales it. On foot he fights
 *   his mates' fight within 45 while fit, else falls in with our nearest foot (`fallIn`) or goes
 *   back to the general or our rear. Duels (6 seeds, 20 Templar knights riding at archers who hold,
 *   600 off): 60 bows unhorse 3-12 knights (none before) and are still ridden down; 120 bows
 *   unhorse 13-17, and on four days of six a fifth of them still stand at 90 s (all six ridden
 *   down before). Light horse at 60 bows: 1-5 of 30 unhorsed; horse archers trading shots with 60
 *   bows: 11-16 of 30. Knights into samurai spears: 11-17 of 20 unhorsed, lost as before. Horse
 *   against bows at equal value (game-matchups): 39 of 120 days, 58 before.
 * - Horse wounds, round 2: archers kill knights. Bows standing to horse charging or riding at them
 *   loose at will inside 100 m (`threatTo(r, true)`, RAPID): every 4 s (15 a minute, against 12
 *   in a burst), and flat inside 50 m, where only the horse's pace across the line scatters the
 *   shot (not at horse come round on their flank). A horse falling at the gallop may pin or
 *   trample its rider (`crush`: 40%, a further 30-90% of his hit points), and one riding into it
 *   goes down on its knees too (`trip`). To a block of horse a rider unhorsed is a rider lost
 *   (`lossShare`), and a horse brought down heartens those who shot it. Foot with no foe go out to
 *   finish an enemy rider unhorsed within 100 while he is down, badly hurt or running (`fallen`):
 *   daggers find the gaps of a man down or caught running (`downArmour`), arrows those of a man
 *   lying dazed (`shotDown`, no shield); a knight unhorsed runs at 0.8 of a man's pace and defends
 *   at 0.85 more. A charge that has lost heart shocks half as much (`waverShock`), and other foot
 *   then go for its horses (`footShare`). Duels (8 seeds, 20 knights at bows that hold, 600 off),
 *   dead / unhorsed / bows dead, round 1 -> round 2: 120 bows 0 / 13-20 / 36-64 (knights won or
 *   held the field) -> 1-7 / 10-15 / 0-6 (the charge breaks every time); 60 bows 0 / 1-12 / 28-46
 *   (knights won 8 of 8) -> 0-5 / 6-13 / 0-45 (7 of 8). Bows locked with foot are still ridden
 *   down (17-27 of 60 dead). Horse against bows at equal value (game-matchups): 3 of 120 days.
 * - Horse wounds, round 3: horse with sense (SENSE; docs/art-references/horse-wounds.md). A ride
 *   is weighed by the fire of the formed, unengaged bows covering its end (`bowCover`: their
 *   arrows left, less from their flank and rear) against all the riders going in (`bowsDeadly`).
 *   The General no longer sends all his horse across bowshot together (`horseStrike` only stages
 *   it, further back when shot at there); outshot, it goes only for prey it can get at
 *   (`openPrey`: not spears standing to receive it, straight or round an open flank,
 *   `flankWay`), else waits for the bows to be locked in the fight or shot out. A block told to
 *   ride across massed fire goes round to the open flank or draws back out of reach
 *   (`outOfBowshot`; with nowhere to draw back to it goes in), and one that loses a quarter of its
 *   riders on the way in breaks off and leaves that prey be. Horse archers keep outside the
 *   reach of bows that outrange them and skirmish at its edge (`haEdge`). Foot shooters shoot
 *   worse off their front (ARC), and loose fast and flat only at horse before it (RAPID).
 *   Set pieces: 20 knights by a sensible general at 120 bows: 10-15 unhorsed -> 0-3 (they stay
 *   out); 30 horse archers against 60 bows: 11-15 unhorsed -> 0. Horse against bows at equal
 *   value: still 3 of 120 days (the horse army's 33 foot cannot pin the bows; they come on and
 *   shoot the horse where it waits).
 */
/**
 * v16: nothing grows with the size of the battle that should not (the undead won two thirds of
 * battles of 2800 a side). The field stays the same size, so a big battle is a crowded and a long
 * one, and four things the living felt (and the fearless dead did not) grew with it:
 * - Outnumbered counted every engaged enemy block touching a block against that block alone:
 *   in a crowded field two to three and a half times its strength, a steady 6-10 morale lost.
 *   It now weighs the enemy close by against ours close by (`friendNear`; MORALE.outnumbered).
 * - A friend's rout shook every friend within 150 by 7, and on a crowded field there are more
 *   of them (5 a rout at 2800 a side, 3.4 at 500): now by its share of the men about it.
 * - Fatigue grew by the clock for every block in a melee, and the deep blocks of a big battle
 *   fight half as long again: now by the share of its men at a foe's reach (`fightShare`).
 * - The general's household rode at whatever came within 40: on a crowded field the enemy's
 *   second line, and the Lich-Marshal fell in 59% of battles of 2800 a side. It now draws back
 *   from a block that outweighs it twice over while its army has a line (HOUSEHOLD_ODDS).
 * And U3 raises a share of the fallen (`toRaise`), not so many a pulse by the clock (longer battles
 * raised more); risers do not shove each other; late in the day shooters with no line of their
 * own left go in (`drawn`: big battles ended in archers trading arrows to the time limit).
 *
 * v15: fixes from a sweep of the sim.
 * - Horse locked in a melee breaks off to charge again (P4) by whom its men are fighting: sent
 *   at a block of the line but cutting down the shooters behind it, it rides them down (it went
 *   by its target alone, and broke off from archers it had caught).
 * - The general's household takes on an enemy whose men come within its reach (40), riding
 *   for the nearest of them. It went by the blocks' bounding circles and rode for the block's
 *   centre: against the big blocks of a big battle that drew the general from 100 and more away
 *   into the enemy's ranks. The fearless Lich-Marshal, whose household never breaks, fell in more
 *   than half of all battles (and the host crumbled), the living generals in up to 40% of big ones.
 * - Balance after it: the Lich-Marshal now lives through most battles, so his raising is capped at
 *   8 figures a pulse (DOCTRINE.undead.raiseCap, was 40, which never bit); the daimyō, too, so
 *   his aura is 1.35x (was 1.6x); the samurai's wrap and surges (DOCTRINE.samurai.loose curl,
 *   surge) are 1 (were 1.15, 1.3: since v14 they had won 57% of battles against the Templars).
 * - U3: a man the Lich-Marshal raises gets up where he fell before he moves or fights
 *   (`RISE_TICKS`, as long as the renderer's rise); nothing shoves him meanwhile. He walked off to
 *   his place on the tick he rose, so the get-up was hardly seen.
 *
 * v14: looser, livelier battles (docs/art-references/battle-cohesion.md, section 6; COHESION and
 * each faction's DOCTRINE.loose in command.ts). Per-man variation comes from a hash of his id and
 * the seed (`hashUnit`), waves from triangle waves, angles from tangents of half the angle.
 * - Room between blocks: 28 between regiments side by side (22 to 34 by the room the line has),
 *   26 between rows, 24 between the archers' blocks, and 60 out to the horse on the wings, which
 *   stands 16 before the line (were 18, 16, 14 and 36, level). The figures are drawn 2-3 times
 *   life size and the old gaps all but vanished on screen.
 * - P1 A ragged approach: each man of the line walks up to 4.6 ahead of or behind his slot (his
 *   eagerness, half shared with his file; 5 more as the enemy nears; at most 1.25 ranks), a slow
 *   wave runs along the files, a charge's pace spread is +-18% (was +-12%), riders at the charge
 *   have their own line. At will, bowmen shoot the nearest man they look at.
 * - P4 Horse breaks off, rallies and comes again: the melee clock no longer resets when a charge
 *   flickers out of the fight; horse breaks off from horse too (the weaker side first) and rides
 *   back 150-190 as a loose crowd to `rallyPoint` (T1: Templar knights from foot to the Marshal),
 *   closes up over 2-3 s and charges again, four times at most. Not against the dead, nor the dead.
 * - P2 + P6 Contact loosens the ranks and overlaps wrap: in contact the foot of the line look 15
 *   for a foe on a leash of 15 (outer files 30, preferring the outer side); files beyond the end
 *   of the enemy's front swing round it (`curl`), men out there close on their foes from the
 *   flank side (`wrapSide`), rear ranks lean on the front, and a block with nothing in front of
 *   it takes the flank of an enemy locked with a friend. Not against the dead: before the tide
 *   the living keep their ranks.
 * - P3 The melee breathes: a man steps out of measure between blows, 15 ticks in 97 in turn with
 *   his neighbours; a winning block surges a run of files forward; two tired blocks ease off
 *   together for a moment. The dead never breathe nor lull.
 * - P5 The wounded drop back through their file, the files of the line close up every 1.5-2.5 s
 *   (holes show), and a worn block of the line keeps its frontage down to 1.6 ranks of men.
 * - Balance: T2 may pull a wavering block back in contact if no locked enemy is near; Templar
 *   knights' eagerness to chase 0.08 (was 0.12); samurai katana attack x1.0 (was x1.06).
 * - P7 (a drift to the right) was tried and dropped: it gave team 0 an edge.
 *
 * v13: battle doctrines (docs/faction-doctrines.md; DOCTRINE in command.ts), and morale shocks
 * that do not grow with the battle.
 * - Shocks that came a man or a missile at a time (blows in flank and rear, charge impact,
 *   missiles falling, stones and cannonballs, fugitives taken in) counted per head, but a
 *   regiment's size grows with the battle (30-35 men at 250 a side, 116 at 2800): a big block
 *   took three times the shock from the same share of its men hit, and in big battles living
 *   armies broke with ever fewer losses. Against each other that cancelled out; against the
 *   fearless undead it did not, and they won 70% of battles of 1500 men a side and more. They
 *   now count for a block of MORALE.blockMen (35) men, and in proportion less for a bigger one.
 * - Three doctrines a faction (the numbers in DOCTRINE; event 'doctrine' for the ticker):
 *   Templar T1 the Marshal's charge (knights wait for his signal, ride at one target 1.2x as
 *   hard, back to his banner), T2 re-form on the banner (two withdrawals behind a banner, a
 *   second re-forming at any banner, shaken 25 s), T3 not while the Beauséant flies (knights and
 *   Iron Brethren do not rout while the Marshal lives). Samurai S1 the uma-jirushi (aura x1.6
 *   within 300; his death a 35 shock, -20 after, and the hatamoto's revenge charge), S2 first
 *   spear and long chase, S3 drilled teppō fire (guns before the line, a first volley that costs
 *   8 morale, then rank by rank). Undead U1 the tide (0.8 pace away from the Lich, no halting, a
 *   lurching charge), U2 unflinching (charges barely knock them back and stun nobody), U3 what
 *   falls, rises (the Lich raises 0.8% of the host a pulse every 10 s; Soldier.roseAt,
 *   SideResult.risen).
 * - Stats: undead hit points 66% (was 69%); samurai katana attack x1.06 and no spear armour
 *   malus; Templar knights lose their charge x1.1 and morale x1.05 (T1, T2 replace them).
 *
 * v12: the dead know no fear (UNDEAD in command.ts; the faction's rule in factions.ts).
 * - Undead regiments (`fearless`) never waver, rout or rally: their morale is 100 and stays
 *   there, and nothing that moves morale (losses, charges, missiles, routs nearby, the general's
 *   death) is reckoned for them, which also saves the work.
 * - In exchange every undead class has 69% of its hit points (the Bone Colossus 80%, the
 *   trebuchet unchanged): `DEAD_HP`, `COLOSSUS_HP` in factions.ts.
 * - When the Lich-Marshal falls the host crumbles (`crumbling`, event 'crumble'): every man
 *   standing loses 2% of his hit points a second, and fights at -4 attack, -3 defence.
 * - An undead army breaks (and so loses) when under 8% of it stands, or under 20% against
 *   twice as many; it does not run but crumbles where it stands until the pursuit window ends.
 *
 * v11: missile drill (docs/art-references/missile-drill.md). Foot stops to shoot: no man looses
 * while his block walks or wheels, nor for 0.3 s after it halts (horse archers still shoot on
 * the move). Bows, crossbows and guns loose volleys on the word: the loaded men within half a
 * second, a reload and a 0.6 s "make ready, present" beat apart, and a beat after the block
 * halts (until v10 each man reloaded on his own and the fire soon drifted into a steady patter).
 * Reloads: bows 15 ticks (a volley every 2.1 s), crossbows 38 (4.4 s), teppō 51 (5.7 s, each
 * ball 1.3x), engines 140: about as many arrows in a battle as before. An enemy within 50 units,
 * or charging from 100, makes them fire at will, bows flat at point-blank; an enemy at their
 * front (8 units) or a melee makes them sling bows and fight, and a man with a foe at hand draws
 * in 0.6 s whatever his reload (until v10 they drew swords as soon as an enemy block's bounding
 * circle came within a few units, often 30 or more short of contact, and stood idle). They stand
 * 24 behind their line's rear rank, wheel only for a target more than 25 degrees off their
 * front, look for targets along the line after 15 s idle, and bows lob over a melee into a deep
 * block's rear ranks. Blocked guns step clear of the block in the way in one move, at the double.
 * Skirmishers and shooters fall back by an about-turn instead of wheeling the block round
 * (javelin men pirouetted).
 *
 * v10: routs recover as they did in history
 * (docs/art-references/rout-recovery.md, rally.md; numbers in REGROUP, command.ts).
 * - Fugitives fall in with a formed regiment of their own side and class (Templars: of their
 *   family, foot line, missile foot or horse) that is steady, not engaged, standing (hold,
 *   advance, reserve, guard, shoot, brace) and short of its starting strength, when they pass
 *   within 120 of its edge: each running man is looked at every 0.5 s, at half his class's
 *   rally odds, less with an enemy close or badly hurt. He moves to its roll and to the back of
 *   its shortest file, keeps his own class, stats and wounds; it loses 0.6 morale a man.
 *   Event 'joins'. `Soldier.reg` now reads the live roll.
 * - A broken regiment rallies on a check every 2 s, once out of contact, with odds by class
 *   (knights 0.35, horse and shock troops 0.2, trained foot 0.15, levies and missile men 0.05,
 *   veterans at least 0.2 + 0.05), lifted by the commander within 160 (+0.2, samurai +0.4), its
 *   own standard standing (+0.15: at least 30% of its start within 110 of its centre; -0.15 if
 *   not), a formed reserve within 240 (+0.1), for Templars any banner within 200 (+0.2), and
 *   lowered by enemy horse within 200 (-0.2) or the commander dead (-0.15). It needs one of
 *   those anchors. Only men within 160 of its centre stop; stragglers run on. Once, for every
 *   regiment (was twice for veterans and high-morale cities): a second rout is final. Shaken
 *   (fights as wavering, may balk at going forward) for 40 s (was 4 s). Undead never rally.
 * - REGROUP.extra (0) allows further re-formings behind the line at lower odds ('reform').
 *
 * v8: a charge that misses closes. A handful of horse against horse (a knight against a knight,
 * a few knights against one light horseman) rode round each other at about 40 units until the
 * time limit: the charge aimed 40 past its target, and at a canter the v6 turning circle was
 * wider than the gap. A charge that has run 4 s without a blow now makes straight for its
 * target, and a charging block whose goal lies inside its turning circle pulls up to a walk,
 * which turns on the spot. Large blocks wheeling to a far goal are unchanged.
 *
 * v7: bug fixes. A crossbow bolt no longer strikes a man of its own regiment at landing (it was
 * aimed past its own ranks, but landed on the first man along its line, comrade or not: some
 * 30% of a crossbow block's hits were in its own front rank). A regiment that breaks while
 * chasing fugitives stops chasing (it kept the chase, and ran on after it once it rallied).
 * Shock troops march at the drill's 11 units a second like all formed foot (0.6 of their speed,
 * 10.8, left them trailing the line).
 *
 * v6: formations at game scale and horse that cannot turn on a dime. Regiments stand further
 * apart (18 between blocks), ranks a little deeper than files (horse much deeper: a horse is
 * longer than it is broad), light horse looser. Blocks wheel at a capped rate: foot about its
 * middle (some 10 degrees a second for a block 80 wide), horse the slower the faster it rides
 * (50 degrees a second at a stand, 20 at the gallop), riding where it faces, so it wheels in arcs
 * and turns about only at a walk; it gathers speed and reins in over seconds, and each rider at
 * speed swings round at most about 115 degrees a second. Foot marches at the drill's 11 units a
 * second (was its speed x 0.6, 13 for most), horse rides round at a canter; charges keep their
 * speed. See docs/art-references/formations.md.
 *
 * v5: no side bias. Both sides' regiments think and their men look for foes on the same ticks
 * (they were out of step by the first army's size), which side goes first on even ticks is drawn
 * from the seed, and the horse rides round a line and kites the same way on both sides. Until v4
 * one side won 60-75% of mirror matches, which side depending on the armies' size (see
 * `pnpm fairness`).
 */
export const BATTLE_VERSION = 17;
/**
 * Mixed into every battle's seed. It was BATTLE_VERSION until v3, which kept v2's salt: a
 * version bump refuses old setups (BattleVersionError) but does not re-seed battles by itself.
 */
const SEED_SALT = 2;

/** Thrown for a setup fought under another BATTLE_VERSION (see docs/replays.md). */
export class BattleVersionError extends Error {
  constructor(readonly version: number) {
    super(`battle recorded under rules v${version}; this build fights v${BATTLE_VERSION}`);
  }
}
/**
 * The field, in world units (a man is about five across, 0.19 m a unit): about 455 m square, room
 * for two armies deployed beyond bowshot and for the horse to go round a flank, while a broken
 * block still has about as far to run to its own edge as before (where it rallies or flees: a
 * longer field let the living rally far more often, and the dead never rally). Until the scale
 * rework it was 1600 x 1200; see docs/art-references/battle-scale.md. Armies face each other along x.
 */
export const FIELD_W = 2400;
export const FIELD_H = 2400;
export const TICK_S = 0.1;
export const TICKS_PER_SECOND = 10;
/**
 * Battles end here at the latest, decided on the strength left (ten minutes: the armies now
 * deploy twice as far apart and shoot from three times as far, so the approach alone takes about
 * a minute; it was six minutes, see docs/art-references/battle-scale.md).
 */
export const MAX_TICKS = 6000;
/** Figures per side at most; bigger armies are drawn with each figure standing for several men. */
export const MAX_FIGURES = 2800;

export interface ArmySpec {
  name: string;
  faction: FactionId;
  /** Heraldic hue 0..359 of shields and banners. */
  hue: number;
  counts: Counts;
  veterans: Counts;
  moraleBonus: number;
  /** Share of missile damage turned by pavises, 0..0.4. */
  pavise: number;
  stakes: boolean;
  /** NPC armies (brigands) have no commander. */
  commander: boolean;
}

export interface BattleSetup {
  version: number;
  seed: number;
  kind: 'daily' | 'grand';
  armies: [ArmySpec, ArmySpec];
  /**
   * The ground (battle v17, terrain.ts): 'field' generates hills, woods, a stream and soft
   * ground from the seed; 'flat' (or none given: set pieces, tests, battles recorded before it)
   * is the bare field.
   */
  terrain?: TerrainKind;
}

export const enum State {
  Fighting = 0,
  Routing = 1,
  Dead = 2,
  Fled = 3,
}

/** Per-soldier hot data, struct of arrays. Index = soldier id. */
class Store {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly hp: Float64Array;
  /** Charge impetus 0..1. */
  readonly imp: Float64Array;
  /** Last tick's separation push (units per second): `move` does not walk back into it. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  /** Slot offset in the regiment: across the front (sx) and along the facing (sy, 0 = front rank). */
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  /** File (column, may be fractional for a centred short rank) and rank. */
  readonly col: Float64Array;
  readonly row: Int32Array;
  readonly rad: Float64Array;
  readonly mass: Float64Array;
  readonly spd: Float64Array;
  readonly state: Uint8Array;
  readonly team: Uint8Array;
  readonly reg: Int32Array;
  readonly target: Int32Array;
  readonly cd: Int32Array;
  readonly ammo: Int32Array;
  readonly acted: Int32Array;
  readonly hit: Int32Array;
  readonly died: Int32Array;
  /** Tick the Lich-Marshal raised him (U3), or -1. */
  readonly rose: Int32Array;
  readonly kills: Int32Array;
  readonly stun: Int32Array;
  /** A running man's own heading (unit vector) and pace (share of his speed). */
  readonly hx: Float64Array;
  readonly hy: Float64Array;
  readonly hs: Float64Array;
  /** Elevation of his last shot: 0 level (a gun, a bolt at close range) to 1 (a high lob). */
  readonly aim: Float64Array;
  /** His own eagerness, -1 (a laggard) to 1 (the first to close): see COHESION. */
  readonly ea: Float64Array;
  /** 1 while he swings round the enemy's flank, away from his slot (P6: see `Battle.curl`). */
  readonly cu: Uint8Array;
  /**
   * 1 while a man who has just fallen in with a formed block (see `fallIn`) walks to his place in
   * it: until he is near it he is not in its ranks, so its anchor, standard and reach (`survey`)
   * do not follow him.
   */
  readonly jn: Uint8Array;
  /** P5: badly hurt, he makes his way to the rear of his file until this tick, and fights nobody meanwhile (not even a foe at hand). */
  readonly wd: Int32Array;
  /** 1 for a man on a horse (by his class, not his weight: the heaviest foot outweigh light horse). */
  readonly mt: Uint8Array;
  /** How many enemy men have him as their foe (counted each tick before blows: see `step`). */
  readonly att: Int32Array;
  /** Foot in contact without a foe: the tick he last had one (or came into contact), 0 while he has one. See `seek`. */
  readonly idl: Int32Array;
  /** His weapon's reach beyond the two bodies (UnitStats.reach): he strikes from there and stands there. */
  readonly rc: Float64Array;
  /** REACH: the tick until which he is through the points of a spear wall (got inside), else 0. See `held`. */
  readonly ps: Int32Array;
  /** HORSE: his horse's hit points (0 on foot; see `horseHit`). */
  readonly hh: Float64Array;
  /**
   * HORSE: 1 for a rider left on foot (his horse shot or cut down under him, or bolted and threw
   * him) who is still with his horse's block and makes his own way (`afoot`); 2 once he has
   * fallen in with a block of foot. 0 for everyone else.
   */
  readonly dm: Uint8Array;
  constructor(n: number) {
    const f = () => new Float64Array(n);
    const i = () => new Int32Array(n);
    this.x = f(); this.y = f(); this.vx = f(); this.vy = f(); this.hp = f(); this.imp = f();
    this.px = f(); this.py = f(); this.sx = f(); this.sy = f(); this.col = f(); this.row = i();
    this.rad = f(); this.mass = f(); this.spd = f(); this.hx = f(); this.hy = f(); this.hs = f(); this.aim = f(); this.ea = f();
    this.state = new Uint8Array(n); this.team = new Uint8Array(n); this.cu = new Uint8Array(n); this.jn = new Uint8Array(n); this.mt = new Uint8Array(n);
    this.reg = i(); this.target = i(); this.cd = i(); this.ammo = i();
    this.acted = i(); this.hit = i(); this.died = i(); this.kills = i(); this.stun = i(); this.rose = i(); this.wd = i(); this.att = i(); this.idl = i();
    this.rc = f(); this.ps = i(); this.hh = f(); this.dm = new Uint8Array(n);
  }
}

/**
 * One figure: a view onto the battle's arrays. The setters exist for tools (perf harnesses that
 * clone figures); the simulation owns these values, so a renderer should only read them.
 */
export class Soldier {
  constructor(
    private readonly d: Store,
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    /** His stats: his class's, or, once unhorsed (`dismounted`), his class's on foot (see `Battle.dismount`). */
    public s: UnitStats,
    readonly vet: boolean,
    readonly commander: boolean,
  ) {}
  /**
   * His regiment's id. Not fixed: a fugitive may fall in with another regiment of his side (see
   * `Battle.regroup`), keeping his own class and stats.
   */
  get reg(): number { return this.d.reg[this.id]!; }
  get x(): number { return this.d.x[this.id]!; }
  set x(v: number) { this.d.x[this.id] = v; }
  get y(): number { return this.d.y[this.id]!; }
  set y(v: number) { this.d.y[this.id] = v; }
  get vx(): number { return this.d.vx[this.id]!; }
  set vx(v: number) { this.d.vx[this.id] = v; }
  get vy(): number { return this.d.vy[this.id]!; }
  set vy(v: number) { this.d.vy[this.id] = v; }
  get hp(): number { return this.d.hp[this.id]!; }
  set hp(v: number) { this.d.hp[this.id] = v; }
  get state(): State { return this.d.state[this.id]! as State; }
  set state(v: State) { this.d.state[this.id] = v; }
  /** Soldier id it is fighting, or -1. */
  get target(): number { return this.d.target[this.id]!; }
  set target(v: number) { this.d.target[this.id] = v; }
  get cooldown(): number { return this.d.cd[this.id]!; }
  get ammo(): number { return this.d.ammo[this.id]!; }
  /** Charge impetus 0..1 (a galloping horseman about to hit). */
  get impetus(): number { return this.d.imp[this.id]!; }
  /** Tick of the last blow or shot, for animation. */
  get actedAt(): number { return this.d.acted[this.id]!; }
  set actedAt(v: number) { this.d.acted[this.id] = v; }
  /** Tick it was last hurt (blow, missile, stakes, impact), -100 before. */
  get hitAt(): number { return this.d.hit[this.id]!; }
  set hitAt(v: number) { this.d.hit[this.id] = v; }
  /** Tick it fell, or -1. */
  get diedAt(): number { return this.d.died[this.id]!; }
  set diedAt(v: number) { this.d.died[this.id] = v; }
  /**
   * Tick the Lich-Marshal raised him from the dead (U3 What falls, rises), or -1: a man raised
   * stands again (state Fighting) where he fell, at `diedAt`; the renderer plays his fall
   * backwards from here. A man rises once at most.
   */
  get roseAt(): number { return this.d.rose[this.id]!; }
  set roseAt(v: number) { this.d.rose[this.id] = v; }
  /** Knocked down or reeling from a charge: ticks left. */
  get stunned(): number { return this.d.stun[this.id]!; }
  get kills(): number { return this.d.kills[this.id]!; }
  /**
   * Elevation of his last shot, 0..1: bows lob (higher for a longer shot), crossbows shoot
   * nearly flat, guns level; for the Shoot pose.
   */
  get aim(): number { return this.d.aim[this.id]!; }
  /** Slot offset within the regiment: across the front and in depth (0 = front rank, negative behind). */
  get sx(): number { return this.d.sx[this.id]!; }
  get sy(): number { return this.d.sy[this.id]!; }
  /** His rank in the block (0 = front rank). Read-only, for the renderer (see `facesRear`). */
  get row(): number { return this.d.row[this.id]!; }
  /** On a horse (by his class). Read-only, for the renderer. */
  get mounted(): boolean { return this.d.mt[this.id] === 1; }
  /** P6: swinging round the enemy's flank, away from his slot (see `Battle.curl`). Read-only, for the renderer. */
  get curling(): boolean { return this.d.cu[this.id] === 1; }
  /**
   * HORSE: a rider whose horse is down or gone, fighting on foot (`s` is then his stats on foot,
   * `mounted` false). Read-only, for the renderer: drawn as a man of the faction's foot.
   */
  get dismounted(): boolean { return this.d.dm[this.id]! > 0; }
  /**
   * His weapon's reach beyond the two bodies, world units (UnitStats.reach): a man strikes a foe
   * within `radius + foe's radius + reach`. Read-only, for the renderer.
   */
  get reach(): number { return this.d.rc[this.id]!; }
}

/**
 * Whether a man of rank `row` (`mounted` or not) of block `r` is one of its rear half that faces
 * about at `tick` against an enemy at its back while the block is locked to its front: the rule
 * `Battle.seek` applies (`Regiment.rearUntil`). Read-only, for the renderer: he faces the block's
 * rear, not its front.
 */
export function facesRear(r: Regiment, row: number, mounted: boolean, tick: number): boolean {
  return r.rearUntil > tick && !mounted && row >= Math.max(1, r.rows >> 1);
}

/**
 * What a regiment is doing. 'skirmish' is skirmishers falling back through their own line;
 * 'brace' is spears set against horse; 'withdraw' is cavalry pulling out to charge again;
 * 'rally' is a regiment that ran and has come back.
 */
export type Mode =
  | 'hold' | 'advance' | 'charge' | 'melee' | 'shoot' | 'skirmish' | 'flank' | 'kite' | 'rout' | 'reserve' | 'guard'
  | 'brace' | 'withdraw' | 'pursue' | 'rally';

/**
 * How a block stands and moves. Must match `Stance` in src/client/render/contract.ts (redeclared
 * here so the game never imports from the client).
 *
 * - line: the default block, files and ranks.
 * - column: narrow and deep, for long marches: 10% faster, turns quickly, but -8 defence.
 * - loose: wide gaps (archers, skirmishers, horse archers, light horse harassing): arrows and
 *   stones find fewer men (missile damage x0.65, stones x0.5, and the gaps let shots fall
 *   harmlessly), -6 melee defence, charges knock fewer men about.
 * - shieldwall: heavy foot locks shields: tight files, front shields stop +35% more missiles
 *   and missile damage x0.7, +12 melee defence, -4 attack, half pace, slow to turn.
 * - pikewall: spears levelled, deep and tight: a horseman charging its front is impaled (and
 *   stopped dead), +40% damage against horse, +6 defence from the front but -10 from flank and
 *   rear, a third of the pace and very slow to turn.
 * - wedge: knights in a triangle, point forward: the charge hits 25% harder, knocks men half
 *   as far again and carries deeper (impetus lasts nearly twice as long through the ranks).
 * - braced: shock troops planted to receive: +10 defence, a charge into its front loses most of
 *   its force and knocks nobody back; it barely moves.
 */
export type Stance = 'line' | 'column' | 'loose' | 'shieldwall' | 'pikewall' | 'wedge' | 'braced';

interface StanceDef {
  /** Multiplies the role's gap between men; `add` widens it further. */
  gap: number;
  add: number;
  /** Files per rank: a fixed ratio, or the role's ratio times `ratioMul`. */
  ratio: number;
  ratioMul: number;
  pace: number;
  turn: number;
  /** Melee defence and attack bonuses (the pikewall's defence is -10 from flank and rear). */
  defence: number;
  attack: number;
  /** Missile and stone damage taken. */
  missile: number;
  stones: number;
}

export const STANCES: Record<Stance, StanceDef> = {
  line: { gap: 1, add: 0, ratio: 0, ratioMul: 1, pace: 1, turn: 1, defence: 0, attack: 0, missile: 1, stones: 1 },
  column: { gap: 1, add: 0, ratio: 0.45, ratioMul: 1, pace: 1.1, turn: 1.3, defence: -8, attack: 0, missile: 1.15, stones: 1.2 },
  loose: { gap: 1, add: 3.5, ratio: 0, ratioMul: 1.15, pace: 1, turn: 1, defence: -6, attack: 0, missile: 0.65, stones: 0.5 },
  shieldwall: { gap: 0.2, add: 0, ratio: 0, ratioMul: 1.1, pace: 0.5, turn: 0.7, defence: 12, attack: -4, missile: 0.7, stones: 0.9 },
  pikewall: { gap: 0.3, add: 0, ratio: 1.3, ratioMul: 1, pace: 0.35, turn: 0.35, defence: 6, attack: 0, missile: 1, stones: 1.1 },
  wedge: { gap: 1, add: 0, ratio: 0, ratioMul: 1, pace: 1.05, turn: 1, defence: -3, attack: 2, missile: 1, stones: 1 },
  braced: { gap: 0.6, add: 0, ratio: 0, ratioMul: 1, pace: 0.3, turn: 0.6, defence: 10, attack: 0, missile: 1, stones: 1 },
};
/** Stances worth a line in the ticker. */
const NOTABLE: Partial<Record<Stance, boolean>> = { shieldwall: true, pikewall: true, wedge: true, braced: true };

export class Regiment {
  members: number[] = [];
  stance: Stance = 'line';
  stanceAt = -1000;
  /** Pinned by a test or tool: the regiment keeps this stance. */
  pinned: Stance | null = null;
  /** Missiles falling on it lately (decaying). */
  arrows = 0;
  /** Its men's collision radius. */
  rad = 2.4;
  /**
   * Who stands where: the man in rank `row` and half-file `round(col * 2)` at
   * `nb[row * nbK + round(col * 2)]` (-1: nobody), as at the last re-forming (see `slotOffsets`).
   * A man keeps station on the men beside and ahead of him (see `station`).
   */
  nb = new Int32Array(0);
  nbK = 1;
  private told: Partial<Record<Stance, number>> = {};
  /** Whether a stance change is news (once per stance in a while). */
  tell(s: Stance, tick: number): boolean {
    if (!NOTABLE[s]) return false;
    const t = this.told[s];
    if (t !== undefined && tick - t < 300) return false;
    this.told[s] = tick;
    return true;
  }
  /** Centre of its living men. */
  cx = 0;
  cy = 0;
  /**
   * Its place in its own army's order of battle (0, 1, 2, ...): it thinks on the ticks where
   * (tick + phase) % 5 === 0, the same ticks as the enemy's regiment with the same place.
   */
  phase = 0;
  /** Formation anchor (middle of the front rank) and facing (unit vector). */
  ax = 0;
  ay = 0;
  fx = 1;
  fy = 0;
  /** Facing it is wheeling toward. */
  dfx = 1;
  dfy = 0;
  /** Where the anchor is walking. */
  tx = 0;
  ty = 0;
  /** Where its captain sent the anchor (horse may make for a point on the way round a friend first: see `rideRound`). */
  gx0 = 0;
  gy0 = 0;
  rideX = NaN;
  rideY = NaN;
  /** Anchor movement this tick, world units. */
  vax = 0;
  vay = 0;
  /** Horse: the block's pace, units a second (it gathers speed and reins in over time, see `moveAnchor`). */
  aspd = 0;
  mode: Mode = 'hold';
  modeAt = 0;
  morale = 50;
  baseMorale = 50;
  alive = 0;
  start = 0;
  targetReg = -1;
  /** Place against the target: 0 its front, 1 and 2 its flanks, 3 its rear. */
  slot = 0;
  /** Men locked in melee: at least a few in reach of a foe. */
  engaged = false;
  /** An enemy block is close: its men look for foes. */
  contact = false;
  /** 0..1: how near the nearest enemy block is (1 within reach): the eager pull ahead (COHESION.leadNear). */
  closeIn = 0;
  routed = false;
  routAt = -1;
  quietSince = 0;
  /** 0..1: how readily its men break ranks to chase a beaten enemy (levies, horse, ghouls high; the Templars' Rule low). */
  eager = 0.4;
  /** Chasing fugitives on its own: since when (-1: not), from where, and when it was last called back. */
  chaseAt = -1;
  chaseX = 0;
  chaseY = 0;
  recallAt = -1000;
  /** T1: a charge on the Marshal's signal (it hits harder), and a withdrawal back to his banner. */
  held = false;
  toBanner = false;
  /** Charging: since when, and whether it ran so far the ranks have come apart. */
  chargeAt = -1;
  /**
   * Horse (QA round 2 #3, #4): a block it gave up charging (it could not get at it, or could not
   * catch it) and until when it leaves it be; the nearest it has got to its prey in a charge, and
   * since when (or since its last blow); the block whose open side (away from our men fighting it) it rides
   * for.
   */
  spurnReg = -1;
  spurnUntil = 0;
  /** HORSE (round 3): the block it is riding in at, and its riders when it set out (`thinkCav`). */
  approachReg = -1;
  approachN = 0;
  stallGap = Infinity;
  stallAt = 0;
  openFor = -1;
  ragged = false;
  spacing = 5;
  speed = 20;
  cols = 1;
  rows = 1;
  /** Formation frontage and depth, world units. */
  width = 0;
  depth = 0;
  /** Spread of its men about the centre. */
  radius = 0;
  /** 1: first line, 2: second line, 0: elsewhere. */
  line = 0;
  /** Recent losses and kills (shares of its start, decaying) and shock from flank and rear blows. */
  recent = 0;
  recentKills = 0;
  flankShock = 0;
  meleeTicks = 0;
  /** Last tick it was locked in melee (P4: its melee clock survives a flicker out of it). */
  meleeAt = -1000;
  charges = 0;
  /** P4: times it has broken off a melee to charge again, and re-forming (closing up) until this tick. */
  cycles = 0;
  reformUntil = -1;
  /**
   * Foot (battle v17): when it last faced round (each man turning where he stands, the block
   * re-forming to the new front: see `turnFoot`), and until when the rear ranks of a block locked
   * to its front turn about against an enemy at its back (see `seek`).
   */
  facedAt = -1000;
  /** Faced in place against horse (see `turnFoot`): it stands as it turned, to re-form later. */
  inPlace = false;
  /** Held up by a friend in its way (`giveWay`): when last, and by whom. */
  blockedAt = -1000;
  blockedBy = -1;
  /** ...and the way round it: an offset to its goal, kept until `dodgeUntil`. */
  dodgeX = 0;
  dodgeY = 0;
  dodgeUntil = -1;
  /** When a block that faced round stands re-formed (its shooters loose only then). */
  formedAt = -1000;
  rearUntil = -1;
  /** P3: a run of `surgeN` files from file `surgeCol` presses forward until `surgeUntil`; a lull until `lullUntil`, the last at `lullAt`. */
  surgeCol = 0;
  surgeN = 0;
  surgeUntil = -1;
  lullUntil = -1;
  lullAt = -1000;
  /** P5: when its files last closed up on the fallen. */
  reflowAt = -1000;
  ammoLeft = 0;
  homeY = 0;
  /** Withdrawal point for cycle charges. */
  wx = 0;
  wy = 0;
  reflow = false;
  everEngaged = false;
  /** Morale state for the renderer and the ticker (see MORALE in command.ts). */
  moraleState: MoraleState = 'steady';
  rallies = 0;
  rallyAt = -1000;
  /** Fugitives of other regiments it has taken in (figures), and those not yet told in the ticker (and from whom, last). */
  absorbed = 0;
  joinPending = 0;
  joinFrom = -1;
  joinTold = -1000;
  /** Last rally check while broken (see REGROUP.check). */
  rallyCheckAt = -1000;
  /** 0..1: running and fighting tire men; rest restores them. */
  fatigue = 0;
  /** Share of its men at a foe's reach at the last think (see `fatigue`). */
  fightShare = 0;
  /** The General's current order (kind, for overlays) and its details. */
  order: OrderKind = 'hold';
  ord: Order = newOrder();
  /** Second line thrown in by the General. */
  committed = false;
  /** Since when a reserve has backed the friend it backs now (`reserveOrder`), and the spot behind him it last made for. */
  friendAt = -1;
  resX = NaN;
  resY = NaN;
  /** TERRAIN: the crest a holding block stepped up to (`standGround`), NaN none chosen yet. */
  hillX = NaN;
  hillY = NaN;
  /** TERRAIN: the spot at a wood's edge a block of shooters holding took (`standGround`), NaN none. */
  edgeX = NaN;
  edgeY = NaN;
  /** When a reserve last turned to face a threat close by (`thinkLine`). */
  threatAt = -1000;
  /** Times the General has pulled it out of the line (see Doctrine.withdrawals). */
  withdrawals = 0;
  /** Skirmishers that have fallen back behind the line. */
  retired = false;
  /** Retired skirmishers last shot at where they rested (QA3 #5: see `thinkSkirmish`). */
  shelterAt = -1000;
  /** Skirmishers with no line of their own giving ground before foot (QA3 #3: see `thinkSkirmish`). */
  giving = false;
  refuseUntil = -100;
  waverTold = -1000;
  /** Last ticker line for its standing fast (T3). */
  standTold = -1000;
  /** Enemy in contact, in men of this regiment's worth, for being outnumbered. */
  enemyNear = 0;
  /** Friends fighting close by, in men of this regiment's worth (see `survey`). */
  friendNear = 0;
  veteran = false;
  /** Green troops fear missiles more. */
  green = false;
  homeX = 0;
  /** Shots tried since the last think: out of range, and loosed. */
  short = 0;
  loosed = 0;
  /** Direct-fire shots held for friends in the line since the last think, and whose men they were. */
  blockedShots = 0;
  blocker = -1;
  /**
   * Shots held since the last think because they would have come down among our own men
   * (danger close, see `friendsNear`), or a flat shot at a block locked with ours. A block that
   * held most of its shots gives that target up for a while (`fouled`, until `fouledUntil`).
   */
  dangerShots = 0;
  /** Skirmishers: their place behind the line (see `thinkSkirmish`), and when it was set (-1 not yet). */
  restX = 0;
  restAt = -1;
  /** Shots loosed since the last think (against `dangerShots`). */
  fired = 0;
  fouled = -1;
  fouledUntil = -1;
  /**
   * Formed missile foot: the volley clock. The next volley is ordered at `volleyAt`; the loaded
   * men loose together over the next VOLLEY_SPREAD ticks, and the next comes `volleyEvery` later
   * (the reload and the "make ready, present" beat). See `moveAnchor` and `mayLoose`.
   */
  volleyAt = 0;
  volleyEvery = 0;
  /** Within reach of its own living general (U1: the dead march at full pace only near the Lich-Marshal). */
  nearLord = true;
  /**
   * S3 Drilled teppō fire: shots loosed in the volley under way, whether its first volley has
   * been fired, and whether it now fires rank by rank (`volleyN`: rank volleys since).
   */
  volleyShots = 0;
  firstVolley = false;
  rippling = false;
  volleyN = 0;
  /** S3: guns out before the line (`screened`: they got there), and passing through their own line (`slip`, like skirmishers). */
  screened = false;
  slip = false;
  /** Fire at will: an enemy is charging it or close (it drops volley discipline). */
  atWill = false;
  /** Last tick the anchor moved or the block wheeled. Foot shooters loose only standing still. */
  movedAt = -100;
  /**
   * Formed missile foot (v17, QA2 #2): the front it last stood to. A small turn from that front,
   * a few degrees to follow the target, is not a move (`tracking`).
   */
  restFx = 1;
  restFy = 0;
  /**
   * Formed missile foot taking cover from enemy horse (v17, QA2 #1; see `takeCover`): the friendly
   * block it falls back on (-1 none), and the horse it saw coming (-1 none).
   */
  coverReg = -1;
  horseFrom = -1;
  /** Stepping sideways to open a line of fire (see `sidestep`) until this tick. */
  stepUntil = -1;
  /** Last tick it had something to shoot at (long idle, it goes looking along the line). */
  aimedAt = -100;
  constructor(
    readonly id: number,
    readonly team: number,
    readonly cls: number,
    readonly role: Role | 'command',
  ) {
    // Fields that will hold fractions get one first and then their starting value back, so the
    // engine lays them out as doubles from the start. Otherwise each one's first fraction, in
    // mid-battle, changes every regiment's hidden class and throws the hot code that reads
    // regiments back to the interpreter. (Values are unchanged; this is only for speed.)
    const self = this as unknown as Record<string, number>;
    for (const k of DOUBLE_FIELDS) {
      const v = self[k]!;
      self[k] = 0.5;
      self[k] = v;
    }
  }
  get firing(): boolean {
    return (this.mode === 'shoot' || this.mode === 'kite') && this.targetReg >= 0;
  }
}

/** Regiment fields that hold fractions (see the Regiment constructor). */
const DOUBLE_FIELDS = [
  'arrows', 'cx', 'cy', 'ax', 'ay', 'fx', 'fy', 'dfx', 'dfy', 'tx', 'ty', 'gx0', 'gy0', 'rideX', 'rideY', 'vax', 'vay', 'aspd', 'morale', 'baseMorale', 'chaseX', 'chaseY', 'spacing', 'speed',
  'dodgeX', 'dodgeY', 'hillX', 'hillY', 'edgeX', 'edgeY', 'width', 'depth', 'radius', 'recent', 'recentKills', 'flankShock', 'homeX', 'homeY', 'wx', 'wy', 'fatigue', 'fightShare', 'enemyNear', 'friendNear', 'closeIn', 'restX',
] as const;

export interface Projectile {
  team: number;
  /** Class of the shooter, which sets the missile's look and effect. */
  cls: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  lands: number;
  damage: number;
  pierce: number;
  splash: number;
  shooter: number;
  /** Height of the flight's apex above the ground, world units (0: a flat shot). */
  arc: number;
  /** Direct fire: it strikes the first man along its line (friend or foe), not where it lands. */
  direct: boolean;
  /** Men a cannonball can pass through (0 for anything else). */
  pen: number;
  /**
   * Direct fire, resolved along its flight (v17): the share of the way it has gone, and the men
   * it may still strike (and with what share of its force).
   */
  flown: number;
  left: number;
  force: number;
}

/**
 * How a class shoots. 'lob': bows, javelins and slings arc over the heads of anyone in between,
 * less accurate the longer the shot. 'flat': crossbows shoot nearly flat (a short arc) and need a
 * clear line past other regiments (their own ranks kneel or take turns); blocked, they hold
 * and step aside (until v17 they lofted the bolt over at a quarter of the accuracy). 'gun': matchlocks shoot level with a clear line or not at all,
 * and the ball strikes the first man on its line. 'cannon': a bombard's ball flies flat, then
 * bounds on along the ground through several men. 'siege': mangonels and trebuchets throw high.
 */
export type Ballistics = 'lob' | 'flat' | 'gun' | 'cannon' | 'siege';
export function ballisticsOf(faction: FactionId, cls: number): Ballistics {
  if (cls === U.Crossbowmen) return faction === 'samurai' ? 'gun' : 'flat';
  if (cls === U.Artillery) return faction === 'samurai' ? 'cannon' : 'siege';
  return 'lob';
}

export interface Stake {
  team: number;
  x: number;
  y0: number;
  y1: number;
}

export interface SideResult {
  /** Men, not figures. dead + fled + alive = start, a man raised from the dead counted where he ended. */
  start: Counts;
  dead: Counts;
  fled: Counts;
  alive: Counts;
  /** Men the Lich-Marshal raised (U3), whatever became of them after (absent before v13 and for armies that do not raise). */
  risen?: Counts;
  kills: number;
  commanderFell: boolean;
}

export interface BattleResult {
  winner: 0 | 1;
  reason: 'rout' | 'time';
  ticks: number;
  scale: number;
  sides: [SideResult, SideResult];
}

/**
 * The doctrine moments the ticker tells (event 'doctrine', in `note`): the Marshal's signal (T1),
 * a Templar block falling back on a banner (T2), the brothers standing fast at breaking point
 * (T3), the daimyō's hatamoto charging to avenge him (S1), the first spear (S2), the dead rising
 * (U3, `count` figures).
 */
export type DoctrineNote = 'marshal-charge' | 'banner' | 'stand-fast' | 'revenge' | 'first-spear' | 'raise';

/** Things worth narrating as they happen: the viewer and the summary read these. */
export interface BattleEvent {
  tick: number;
  team: number;
  /**
   * 'contact': a side's line first meets the enemy; 'break': a whole army gives way;
   * 'waver', 'rout', 'rally', 'shattered': a regiment's morale; 'stance': a regiment takes a
   * notable stance; 'general-order': the General's plan or a big order (see `note`); 'chase':
   * a regiment breaks ranks on its own to chase fugitives; 'reform': a broken regiment rallied
   * as often as it may re-forms behind its line; 'joins': fugitives of regiment `from` (class
   * `fromCls`) fall in with regiment `reg` (`count` figures since its last 'joins'); 'crumble':
   * an undead host starts to crumble (`note` 'commander': its Lich-Marshal fell; 'spent': the
   * army broke); 'doctrine': a faction's doctrine shows (`note` says which: see `DoctrineNote`).
   */
  kind: 'rout' | 'commander' | 'charge' | 'contact' | 'rally' | 'break' | 'stance' | 'waver' | 'shattered' | 'general-order' | 'chase' | 'reform' | 'joins' | 'crumble' | 'doctrine';
  cls: number;
  /** The regiment concerned (-1 for the whole army). */
  reg?: number;
  /** 'joins': the regiment the men came from, its class, and how many figures. */
  from?: number;
  fromCls?: number;
  count?: number;
  stance?: Stance;
  order?: OrderKind;
  plan?: Plan;
  /** Wing, as that side sees it. */
  side?: 'left' | 'centre' | 'right';
  /** A short phrase for the ticker, after the General's title ("commits the reserve to the left"); for 'crumble', why. */
  note?: string;
}

type HorsePlan = 'contest' | 'screen' | 'wait';

interface Forces {
  value: number;
  foot: number;
  cav: number;
  knights: number;
  missile: number;
  routing: number;
  all: number;
  wingLow: number;
  wingHigh: number;
}

/**
 * A side's General: a plan for the day, read from the field and from its own temperament, and
 * orders for every regiment. It can misjudge the field and choose a poor plan (less often the
 * more skilled it is), which is what lets a smaller army win now and then.
 */
export class General {
  plan: Plan = 'advance';
  planAt = -1;
  readonly personality: Personality;
  /** 0.55..0.95: how well it reads the field and how rarely it blunders. */
  readonly skill: number;
  /** Hook for the player's Commander trait (not set by the game yet). */
  trait: CommanderTrait | null = null;
  /** Switches for tests and tools: forbid the horse to leave the wings, or the reserve to be committed. */
  useCavalry = true;
  useReserve = true;
  /** Forces a plan. */
  fixedPlan: Plan | null = null;
  /** The wing it masses on (-1 low y, 1 high y). */
  strong: -1 | 1 = 1;
  holdUntil = 0;
  haltUntil = 0;
  dueled = false;
  committed = 0;
  /** When it ordered the general charge (-1: not yet). */
  chargedAt = -1;
  /** T1 The Marshal's charge: when he last gave the knights the signal (-1: not yet), and at whom. */
  signalAt = -1;
  signalTarget = -1;
  /**
   * Outshot, before the lines meet: when it first formed its horse up out of bowshot (-1: not
   * yet), and when it sent it all in at the shooters together (-1: not yet). See `horseStrike`.
   */
  stageAt = -1;
  strikeAt = -1;
  /** HORSE (round 3): how much further back than the edge of bowshot his horse forms up, after it was shot at there. */
  stageBack = 0;
  /** S3: when its guns first opened fire from before the line (-1: not yet). */
  gunsAt = -1;
  /** S2: when the first block of its line reached the enemy (-1: not yet). */
  firstSpearAt = -1;
  /** S1: when the general fell and his horse rode to avenge him (-1: not). */
  revengeAt = -1;
  /**
   * The household (battle v17, QA review #4 and #6): where it keeps behind the line, eased over
   * some six seconds (`post`), and the spot it rides to, moved only when that drifts more
   * than POST_DEADBAND off (`guard`); since when it has been locked in its present fight, and
   * until when, having broken off, it does not take on again (-1: not). `lastStand`: his army
   * is gone, and he fights to the end.
   */
  postX = NaN;
  postY = NaN;
  guardX = NaN;
  guardY = NaN;
  /** When the household's spot last moved (QA review 2 #5). */
  guardAt = -1000;
  fightFrom = -1;
  offUntil = -1;
  lastStand = false;
  /**
   * QA review #10: how it uses its light horse before the lines meet, by the plan and the odds
   * (`choosePlan`): 'contest' rides at the enemy's horse (or round at his shooters) from
   * `horseFrom`; 'screen' keeps it on its wing level with the line and meets horse that comes
   * at it (HORSE_SCREEN); 'wait' keeps it back for when the lines have met. `horseDelay`: how
   * long (ticks, 0-40 s, from its own rng) it lets the day open before it sends horse out.
   */
  horse: HorsePlan = 'contest';
  horseFrom = 0;
  readonly horseDelay: number;
  /** The army's spirits on the day (from the general's rng): added to every regiment's morale. */
  readonly mood: number;
  /** A blunder: the knights go in before the lines meet. */
  rashKnights: boolean;
  readonly rng: Rng;
  constructor(readonly team: number, seed: number) {
    this.rng = new Rng(mixSeed(seed, SEED_SALT, 7001 + team));
    this.personality = PERSONALITIES[this.rng.int(PERSONALITIES.length)]!;
    this.skill = 0.55 + this.rng.next() * 0.4;
    this.rashKnights = this.rng.next() < (1 - this.skill) * 0.4;
    this.mood = (this.rng.next() - 0.5) * 2 * MORALE.mood;
    // (Its own stream, so the draws above and the plan's stay as they were.)
    this.horseDelay = new Rng(mixSeed(seed, SEED_SALT, 7101 + team)).int(HORSE_DELAY);
  }
}

interface TeamState {
  contactAt: number;
  /** Share of the army's value dead, fled or running. */
  loss: number;
  /** Mean anchor x of the fighting line, its depth and lateral span. */
  frontX: number;
  lineDepth: number;
  minY: number;
  maxY: number;
  midY: number;
  hasLine: boolean;
  engaged: boolean;
  contacted: boolean;
  missile: number;
}

const sqrt = Math.sqrt;
const CELL = 8;
const GW = FIELD_W / CELL;
const GH = FIELD_H / CELL;
/**
 * Front-to-front distance between the armies at deployment (about 250 m): beyond the reach of
 * the bows behind either line (ARCHER_RANGE), so the battle opens with an advance into bowshot.
 */
const GAP = 1300;
/** The archers' range: the General's sense of "bowshot" (see `generalThink`). */
const ARCHER_RANGE = STATS[U.Archers]!.range;
/** Global lethality: tuned so a clash of equal lines lasts about a minute. */
const MELEE_K = 2.0;
const MISSILE_K = 1.5;
const FRIENDLY_FIRE = 0.25;
const RATIO: Record<string, number> = { line: 3.6, missile: 5, skirmish: 6, flank: 2.4, 'shock-cav': 2.2, 'horse-archer': 2.6, siege: 99, command: 2 };
/**
 * Room between men across the front, beyond their own breadth (see `spacingFor`). Close-order foot
 * stands about a metre a file (5.3 units at about 0.19 m a unit); horse knee to knee with a little
 * play, light horse looser (horse and missile foot a little looser since the scale rework:
 * docs/art-references/formations.md, section 7.2, and battle-scale.md).
 */
const GAP_IN_RANK: Record<string, number> = { line: 0.5, missile: 1.4, skirmish: 3.5, flank: 3, 'shock-cav': 1.8, 'horse-archer': 2.8, siege: 10, command: 2 };
/**
 * Ranks stand further apart than files: a little for foot, so the ranks read, and much more for
 * horse, which is longer than it is broad (knights: files 9 apart, ranks 13).
 */
const RANK_STEP: Record<string, number> = { line: 1.1, missile: 1.05, skirmish: 1, flank: 1.4, 'shock-cav': 1.45, 'horse-archer': 1.15, siege: 1, command: 1.3 };
/**
 * Room between regiments side by side in a line (each army's own: REG_GAP where the line has
 * room, closing to REG_GAP_MIN as a big army fills the field, and up to REG_GAP_MAX for a line
 * of two or three blocks: see `deploy`), between one row of regiments and the next
 * behind it, between the blocks of the archers' row, and from the line out to the horse on the
 * wings. The figures are drawn 2-3 times life size, so a gap sized in metres all but vanishes on
 * screen: these are sized to the drawn figure, two figures' width of ground between blocks
 * (docs/art-references/battle-cohesion.md, section 3.5). Until v13: 18, 16, 14 and 36; until the
 * scale rework 28 (22..34), 26, 24 and 60, which read as blocks shoulder to shoulder. Now about
 * three quarters of a block's front between blocks (12 m: room to wheel and for a fleeing block
 * to pass), a second line 15 m behind the first, the horse 30 m out on the wings
 * (docs/art-references/battle-scale.md).
 */
const REG_GAP = 64;
const REG_GAP_MIN = 44;
const REG_GAP_MAX = 80;
const ROW_GAP = 80;
const MISSILE_GAP = 56;
const WING_GAP = 150;
/** The horse on the wings stands this far before the line ("slightly forward", as at Agincourt). */
const WING_FORWARD = 30;
/** Skirmishers stand this far before the line, engines this far behind the last row. */
const SKIRMISH_AHEAD = 80;
const SIEGE_BEHIND = 80;
/** Engines deploy this far behind the second line's rear rank, and never nearer the field's edge than SIEGE_EDGE. */
const SIEGE_GAP = 40;
const SIEGE_EDGE = 80;
/**
 * Pace in each mode, a share of the men's speed. Formed foot marches at FOOT_MARCH, 11 units a
 * second (about 2 m/s: a brisk march, faster than life so a battle is not all approach), whatever
 * its share here (see `moveAnchor`), and keeps its full speed,
 * and the run, for the charge; horse approaches at a trot, rides round at a canter and gallops
 * only in the charge. See docs/art-references/formations.md, section 7.3.
 */
const PACE: Record<Mode, number> = {
  hold: 0, advance: 0.6, charge: 1, melee: 0.1, shoot: 0, skirmish: 0.65, flank: 0.85, kite: 0.9, rout: 0, reserve: 0.6, guard: 0.5,
  brace: 0, withdraw: 0.75, pursue: 1, rally: 0,
};
/** Modes in which a far goal turns the block toward its line of march. */
const MARCH: Record<Mode, boolean> = {
  hold: false, advance: true, charge: true, melee: false, shoot: false, skirmish: true, flank: true, kite: true, rout: false, reserve: true, guard: true,
  brace: false, withdraw: true, pursue: true, rally: false,
};

function scaleFor(a: Counts, b: Counts): number {
  const n = Math.max(
    a.reduce((x, y) => x + y, 0),
    b.reduce((x, y) => x + y, 0),
  );
  return Math.max(1, Math.ceil(n / MAX_FIGURES));
}

/** Men in a regiment of the line, for an army of `figures` figures: a big battle has big blocks, not a swarm of small ones. */
function blockSize(figures: number): number {
  return Math.max(30, Math.min(120, Math.round(2.2 * sqrt(figures))));
}

function figures(count: number, scale: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round(count / scale));
}

/** A block of the fearless is as good as shaken (for the General sending a reserve at it) with fewer than this share of its men. */
const SPENT_BLOCK = 0.6;
/**
 * Late in the day (ticks): every regiment left goes in (see `generalThink`, `drawn`). Two thirds
 * of MAX_TICKS (2400 of 3600 until the scale rework).
 */
const LATE = 4000;
/** A refused wing holds back until this tick at most (1200 until the scale rework: the approach now takes twice as long). */
const REFUSE_UNTIL = 2000;
/** The general's household draws back from enemies close by worth more than this many times itself (see `thinkCommand`). */
const HOUSEHOLD_ODDS = 2;
/**
 * The household (battle v17, QA review #4): how near an enemy it weighs before it is upon it;
 * how long it fights one fight before it breaks off (ticks), and how long after it does not
 * take on again; at what share of its riders it is spent (it fights no more); how far ahead of
 * its post it rides back at the canter rather than walks; how far each rider strays from his
 * place after a foe.
 */
const HOUSEHOLD = { wary: 90, fight: 100, off: 150, spent: 1 / 3, ahead: 120, leash: 40 };
/** How fast the household's post follows the line (a share of the gap each half second: about 6 s), and how far it drifts before the household moves (QA review #6). */
const POST_EASE = 0.08;
const POST_DEADBAND = 40;
/** How far the household's post drifts along the line before it moves, and how long it stands after a move (ticks: QA review 2 #5). */
const POST_ALONG = 80;
const POST_STAND = 60;
/** The household's post keeps this clear of the engines (QA review 2 #5). */
const POST_CLEAR = 60;
/** Within this of its spot (and the spot not just moved) the household stands where it is. */
const POST_STEADY = 25;
/** A household spent to a handful falls back at most this far to keep out of bowshot. */
const POST_SHY = 400;
/** The household turns its horse to ride a goal farther than this, rather than back (horse otherwise needs HORSE_REIN). */
const POST_REIN = 8;
/** The household's post stands behind the blocks behind the middle of the line, but never further than this behind its front. */
const POST_BACK = 320;
/**
 * QA review #10, the light horse before the lines meet (`General.horse`): the most a general lets
 * the day open before sending it out (ticks); how near enemy horse must come for horse screening
 * a wing, or held back, to ride at it; how far behind the line's front it keeps on its wing.
 */
const HORSE_DELAY = 400;
const HORSE_SCREEN = 320;
const HORSE_MEET = 220;
const HORSE_WING = 40;
/** A block locked in melee that bows may still shoot over the fight into: deep enough to have rear ranks well clear of it. */
const overMelee = (o: Regiment) => o.depth >= 14;
const isCav = (r: Regiment) => r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer';
/** Mounted blocks: the horse and the general's household. */
const isMounted = (r: Regiment) => isCav(r) || r.role === 'command';
/**
 * Who may fall in with whom (REGROUP): 1 foot of the line, 2 foot that shoots (archers,
 * crossbows, skirmishers), 3 horse; 0 never (engines, the general's household).
 */
const family = (r: Regiment): number =>
  r.role === 'line' ? 1 : r.role === 'missile' || r.role === 'skirmish' ? 2 : r.role === 'flank' || r.role === 'shock-cav' || r.role === 'horse-archer' ? 3 : 0;
/** Modes in which a steady regiment stands formed enough to take fugitives in. */
const TAKE_IN: Record<Mode, boolean> = {
  hold: true, advance: true, charge: false, melee: false, shoot: true, skirmish: false, flank: false, kite: false, rout: false, reserve: true, guard: true,
  brace: true, withdraw: false, pursue: false, rally: false,
};
/** U3: the classes the Lich-Marshal raises: foot of the line and skirmishers (no horse, Colossus, archers or engines). */
const RISES: readonly boolean[] = Array.from({ length: UNIT_COUNT }, (_, c) => c === U.HeavyInfantry || c === U.Spearmen || c === U.Skirmishers);
const isFoot = (r: Regiment) => r.role === 'line' || r.role === 'missile' || r.role === 'skirmish';
const clampX = (x: number) => Math.max(4, Math.min(FIELD_W - 4, x));
const clampY = (y: number) => Math.max(4, Math.min(FIELD_H - 4, y));

export class Battle {
  readonly rng: Rng;
  readonly soldiers: Soldier[] = [];
  readonly regiments: Regiment[] = [];
  readonly projectiles: Projectile[] = [];
  readonly stakes: Stake[] = [];
  readonly events: BattleEvent[] = [];
  readonly scale: number;
  readonly stats: [UnitStats[], UnitStats[]];
  /** Figures per class at the start, per team. */
  readonly startFigures: [Counts, Counts] = [emptyCounts(), emptyCounts()];
  /** Figures per class the Lich-Marshal has raised (U3), per team. */
  readonly risen: [Counts, Counts] = [emptyCounts(), emptyCounts()];
  /** U3: how many of the fallen the Lich-Marshal may yet raise, per team (`raiseShare` of each who falls). */
  private readonly toRaise: [number, number] = [0, 0];
  tick = 0;
  /**
   * Which side goes first on even ticks (0: team 0), drawn from the seed. The sides take turns
   * to go first, tick by tick; but two equal armies march in step, so the lines meet on a tick
   * of the same parity every time for the same armies, and whoever went first on it struck the
   * first blows. With a fixed order that handed one side (which one depended on the armies'
   * size) up to two thirds of equal fights.
   */
  readonly parity: number;
  result: BattleResult | null = null;
  commander: [number, number] = [-1, -1];
  commanderFell: [boolean, boolean] = [false, false];
  /**
   * Sides that know no fear (the undead): their regiments never waver, rout or rally; morale
   * rules pass them by and their morale reads 100 (see `UNDEAD`).
   */
  readonly fearless: [boolean, boolean];
  /** Sides whose host is crumbling (undead whose Lich-Marshal fell, or whose army is spent): see `crumble`. */
  crumbling: [boolean, boolean] = [false, false];
  /** Whether each side waits for the enemy (it outshoots them) or presses the attack. */
  stance: ['hold' | 'press', 'hold' | 'press'] = ['press', 'press'];
  /** A side whose army has broken, and when (the pursuit runs on a little before the end). */
  broken: [boolean, boolean] = [false, false];
  brokenAt = -1;
  /** Each side's General. */
  readonly generals: [General, General];
  /** Each side's battle doctrine (DOCTRINE in command.ts, by faction). */
  readonly doc: [Doctrine, Doctrine];
  /** Missiles each side has landed on its own men (direct-fire strikes and stray arrows). */
  readonly ownGoals: [number, number] = [0, 0];
  private readonly d: Store;
  private readonly n: number;
  private readonly teamRegs: [Regiment[], Regiment[]] = [[], []];
  /** Each side's first soldier id: a man's place in his own army is his id less this. */
  private readonly firstId: [number, number] = [0, 0];
  private readonly ts: [TeamState, TeamState];
  private readonly startTotal: [number, number] = [0, 0];
  private readonly startValue: [number, number] = [0, 0];
  private readonly figureScale: number;
  /** Mixed into the hash that gives each man his eagerness (see `addSoldier`). */
  private readonly salt: number;
  /**
   * Per-man morale shocks (MORALE.blockMen) scaled to the battle's block size: 1 up to blocks of
   * `blockMen`, less for the bigger blocks of a big battle, so a regiment feels the same share of
   * its men hit the same, whatever the size of the battle.
   */
  private readonly shockK: number;
  /** MORALE.auraMen: how much further the general's presence reaches in a bigger army, per team. */
  private readonly auraK: [number, number] = [1, 1];
  /**
   * Per cell, where its men start and end in `items` (sorted by cell, then id). Only the cells
   * holding anyone (`busy`) are set; every other cell reads start = end = 0.
   */
  private readonly grid = new Int32Array(GW * GH);
  private readonly gridEnd = new Int32Array(GW * GH);
  /** Men in the grid this tick. */
  private gridTotal = 0;
  private readonly fill = new Int32Array(GW * GH);
  /**
   * Per cell, how many of its men are of team 0. A cell's men are in id order, and team 0's ids
   * come first, so team 0's are the first this many of the cell and team 1's the rest.
   */
  private readonly ofTeam0 = new Int32Array(GW * GH);
  private readonly items: Int32Array;
  /** Per grid slot (sorted by cell): position, radius, mass, team, loose (routing or skirmisher), and push. */
  private readonly kx: Float64Array;
  private readonly ky: Float64Array;
  private readonly kr: Float64Array;
  private readonly km: Float64Array;
  private readonly kt: Uint8Array;
  private readonly kl: Uint8Array;
  private readonly kpx: Float64Array;
  private readonly kpy: Float64Array;
  /** Bow wave: how far ahead a galloping rider shoves enemy foot aside (0 for everyone else). */
  private readonly kw: Float64Array;
  /** Whether anyone is galloping in this tick (most ticks nobody is). */
  private bowWave = false;
  private regFlags = new Uint8Array(0);
  /** Per regiment, its `rankStep` for this tick's moves (see `step`). */
  private regStep = new Float64Array(0);
  /** Per regiment, during `regroup`: the family of fugitives it would take in (see `family`), 0 none. */
  private takeIn = new Uint8Array(0);
  /** Per team, during `regroup`: the regiments taking fugitives in. */
  private readonly takers: [Regiment[], Regiment[]] = [[], []];
  /** Cells holding anyone, in index order. */
  private readonly busy: Int32Array;
  private busyN = 0;
  /** Scratch for sorting `busy`. */
  private readonly busyTmp: Int32Array;
  private readonly busyCount = new Int32Array(Math.max(GW, GH) + 1);
  private readonly cellOf: Int32Array;
  private readonly tmp = new Float64Array(4);
  /** HORSE: riders' stats on foot, by team * UNIT_COUNT + class (`footOf`). */
  private readonly footStats = new Map<number, UnitStats>();
  /** HORSE: riders left on foot so far, by side (horse shot or cut down under them, or bolted). */
  readonly unhorsed: [number, number] = [0, 0];
  /** Scratch list for `hunt`. */
  private readonly footNear: Regiment[] = [];
  /** `crowded`: the axis to back out along, and from whom. */
  private gx = 0;
  private gy = 0;
  private gWho = 0;
  /** Scratch for re-forming a regiment (see `assignSlots`). */
  private slotLat = new Float64Array(256);
  private slotFwd = new Float64Array(256);
  /** How each class shoots, per team. */
  private readonly fire: [Ballistics[], Ballistics[]];
  /** Scratch for `lineHits`: men along a line and how far along. */
  private readonly lineIds = new Int32Array(16);
  private readonly lineT = new Float64Array(16);
  private readonly cellSeen: Int32Array = new Int32Array(GW * GH);
  private cellStamp = 0;

  /** The setup as fought: counts made whole men (see `sanitize`). */
  readonly setup: BattleSetup;
  /** The ground (terrain.ts; the renderer reads it from here). */
  readonly terrain: Terrain;
  /** Bare, level ground: every terrain rule is skipped (and the battle is as before terrain). */
  private readonly flat: boolean;

  constructor(given: BattleSetup) {
    // A setup recorded under another version of the rules would replay as a different battle.
    if (given.version !== BATTLE_VERSION) throw new BattleVersionError(given.version);
    const setup = (this.setup = sanitize(given));
    this.rng = new Rng(mixSeed(setup.seed, SEED_SALT));
    this.parity = mixSeed(setup.seed, SEED_SALT, 9001) & 1;
    this.salt = mixSeed(setup.seed, SEED_SALT, 4242);
    this.generals = [new General(0, setup.seed), new General(1, setup.seed)];
    this.terrain = new Terrain(setup.terrain === 'field' ? 'field' : 'flat', FIELD_W, FIELD_H, setup.seed);
    this.flat = this.terrain.flat;
    this.scale = scaleFor(setup.armies[0].counts, setup.armies[1].counts);
    this.stats = [factionStats(setup.armies[0].faction), factionStats(setup.armies[1].faction)];
    this.fearless = [setup.armies[0].faction === 'undead', setup.armies[1].faction === 'undead'];
    this.doc = [DOCTRINE[setup.armies[0].faction], DOCTRINE[setup.armies[1].faction]];
    // T1: nobody charges without the Marshal's leave.
    for (const t of [0, 1]) if (this.doc[t]!.signal) this.generals[t]!.rashKnights = false;
    this.fire = [0, 1].map((t) => Array.from({ length: UNIT_COUNT }, (_, c) => ballisticsOf(setup.armies[t]!.faction, c))) as [Ballistics[], Ballistics[]];
    let n = 0;
    let most = 0;
    for (let t = 0; t < 2; t++) {
      const army = setup.armies[t]!;
      let m = 0;
      for (let c = 0; c < UNIT_COUNT; c++) m += figures(army.counts[c] ?? 0, this.scale);
      most = Math.max(most, m);
      this.auraK[t] = Math.max(1, sqrt(sqrt(m / MORALE.auraMen)));
      n += m + (army.commander ? 7 : 0);
    }
    this.n = n;
    this.figureScale = most;
    this.shockK = Math.min(1, MORALE.blockMen / blockSize(most));
    this.d = new Store(n);
    this.items = new Int32Array(n);
    this.kx = new Float64Array(n);
    this.ky = new Float64Array(n);
    this.kr = new Float64Array(n);
    this.km = new Float64Array(n);
    this.kt = new Uint8Array(n);
    this.kl = new Uint8Array(n);
    this.kpx = new Float64Array(n);
    this.kpy = new Float64Array(n);
    this.kw = new Float64Array(n);
    this.busy = new Int32Array(Math.min(n, GW * GH) + 1);
    this.busyTmp = new Int32Array(this.busy.length);
    this.cellOf = new Int32Array(n);
    const team = (): TeamState => ({ contactAt: -1, loss: 0, frontX: 0, lineDepth: 0, minY: 0, maxY: 0, midY: FIELD_H / 2, hasLine: false, engaged: false, contacted: false, missile: 0 });
    this.ts = [team(), team()];
    this.deploy(0);
    this.firstId[1] = this.soldiers.length;
    this.deploy(1);
    for (let t = 0; t < 2; t++) {
      let p = 0;
      for (let i = 0; i < n; i++) {
        const s = this.soldiers[i]!;
        if (s.team === t && s.s.range > 0 && s.s.role !== 'siege') p += s.s.missileDamage / fireEvery(s.s);
        if (s.team === t) this.startTotal[t]!++;
      }
      this.ts[t]!.missile = p;
    }
    const m0 = this.ts[0].missile;
    const m1 = this.ts[1].missile;
    this.stance = [m0 > m1 * 1.25 ? 'hold' : 'press', m1 > m0 * 1.25 ? 'hold' : 'press'];
    this.regFlags = new Uint8Array(this.regiments.length);
    this.regStep = new Float64Array(this.regiments.length);
    this.takeIn = new Uint8Array(this.regiments.length);
    for (const r of this.regiments) this.survey(r);
    this.updateFront(0);
    this.updateFront(1);
  }

  // ------------------------------------------------------------------ deployment

  private addSoldier(team: number, cls: number, reg: Regiment, st: UnitStats, vet: boolean, commander: boolean, hp: number): void {
    const id = this.soldiers.length;
    const d = this.d;
    d.hp[id] = hp;
    d.ammo[id] = st.ammo;
    d.rad[id] = st.radius;
    d.rc[id] = st.reach;
    d.mass[id] = st.mass;
    d.mt[id] = st.mounted ? 1 : 0;
    d.hh[id] = st.mounted ? st.horse : 0;
    d.spd[id] = st.speed;
    d.team[id] = team;
    d.reg[id] = reg.id;
    d.target[id] = -1;
    d.acted[id] = -100;
    d.hit[id] = -100;
    d.died[id] = -1;
    d.rose[id] = -1;
    d.ea[id] = hashUnit(id ^ this.salt);
    this.soldiers.push(new Soldier(d, id, team, cls, st, vet, commander));
    reg.members.push(id);
  }

  private deploy(team: number): void {
    const army = this.setup.armies[team]!;
    const stats = this.stats[team]!;
    const dir = team === 0 ? 1 : -1;
    const frontX = FIELD_W / 2 - (dir * GAP) / 2;
    const X = (depth: number) => frontX - dir * depth;
    const midY = FIELD_H / 2;
    const regs: Regiment[] = [];
    const vetLeft = army.veterans.slice();
    // Regiment size grows with the armies, so a big battle has big blocks, not a swarm of small ones.
    const base = blockSize(this.figureScale);
    // Engines go four to a battery, but never more than 32 batteries a side: an army of engines
    // would otherwise be hundreds of tiny regiments (slow to fight, deployed far off the field).
    const sizeOf = (role: Role, n: number): number =>
      role === 'line' ? base
        : role === 'missile' ? Math.round(base * 0.8)
          : role === 'skirmish' ? Math.max(16, Math.round(base * 0.55))
            : role === 'siege' ? Math.max(4, Math.ceil(n / 32))
              : role === 'horse-archer' ? Math.max(10, Math.round(base * 0.36))
                : Math.max(10, Math.round(base * 0.4));
    for (let cls = 0; cls < UNIT_COUNT; cls++) {
      const n = figures(army.counts[cls] ?? 0, this.scale);
      this.startFigures[team]![cls] = n;
      if (n <= 0) continue;
      const st = stats[cls]!;
      const count = Math.ceil(n / sizeOf(st.role, n));
      for (let r = 0; r < count; r++) {
        const m = Math.round(((r + 1) * n) / count) - Math.round((r * n) / count);
        if (m <= 0) continue;
        const reg = new Regiment(this.regiments.length, team, cls, st.role);
        reg.rad = st.radius;
        reg.stance = defaultStance(reg);
        reg.spacing = spacingFor(reg, reg.stance);
        reg.speed = st.speed;
        reg.fx = reg.dfx = dir;
        reg.phase = this.teamRegs[team]!.length;
        reg.volleyEvery = fireEvery(st);
        this.regiments.push(reg);
        this.teamRegs[team]!.push(reg);
        regs.push(reg);
        let vets = 0;
        for (let i = 0; i < m; i++) {
          const vet = (vetLeft[cls] ?? 0) > 0;
          if (vet) {
            vetLeft[cls]! -= this.scale;
            vets++;
          }
          this.addSoldier(team, cls, reg, st, vet, false, st.hp * (vet ? 1.1 : 1));
        }
        reg.start = reg.alive = m;
        reg.veteran = vets > m / 2;
        reg.green = !reg.veteran && st.morale < 60;
        reg.eager = eagerness(army.faction, cls, reg.veteran, reg.green);
        reg.baseMorale = reg.morale =
          st.morale + army.moraleBonus + (reg.veteran ? MORALE.veteran : vets > 0 ? MORALE.veteran / 2 : 0) + (st.morale >= 80 ? MORALE.elite : st.morale < 55 ? MORALE.levy : 0);
        if (this.fearless[team]) reg.baseMorale = reg.morale = 100;
        shape(reg, m);
      }
    }

    const byRole = (role: Role) => regs.filter((r) => r.role === role);
    // The line: shock troops and heavy foot in the middle of the first line, spears on its ends,
    // the rest in a second line behind.
    const line = byRole('line');
    const heavy = line.filter((r) => r.cls !== U.Spearmen).sort((a, b) => lineOrder(a.cls) - lineOrder(b.cls) || a.id - b.id);
    const spears = line.filter((r) => r.cls === U.Spearmen);
    const maxFront = FIELD_H * 0.52;
    let k = line.length <= 3 ? line.length : Math.ceil(line.length * 0.6);
    while (k > 1 && rowWidth(line.slice(0, k), REG_GAP_MIN) > maxFront) k--;
    const ends = Math.min(2, spears.length, k >= 3 ? 2 : 0);
    const centre = heavy.slice(0, k - ends);
    const spearUsed = spears.slice(0, ends + Math.max(0, k - ends - centre.length));
    const centreAll = [...centre, ...spearUsed.slice(ends)];
    const first = centreOut(centreAll);
    if (ends >= 1) first.unshift(spearUsed[0]!);
    if (ends >= 2) first.push(spearUsed[1]!);
    const second = centreOut([...heavy.slice(centre.length), ...spears.slice(spearUsed.length)]);
    for (const r of first) r.line = 1;
    for (const r of second) r.line = 2;

    // Keeps a regiment's back rank on the field: a deep overflow row (an army of horse, archers
    // or engines) stands against the back edge instead of beyond it.
    const onField = (reg: Regiment, x: number): number => (dir > 0 ? Math.max(8 + reg.depth, x) : Math.min(FIELD_W - 8 - reg.depth, x));
    // The gap between the blocks of the line: half the room the first line leaves, within
    // [REG_GAP_MIN, REG_GAP] (REG_GAP_MAX for a line of two or three blocks): a big army that
    // fills the field closes up, and a small one stands well apart.
    const firstW = first.reduce((w, r) => w + r.width, 0);
    const regGap = first.length > 1 ? Math.max(REG_GAP_MIN, Math.min(first.length <= 3 ? REG_GAP_MAX : REG_GAP, ((maxFront - firstW) / (first.length - 1)) * 0.5)) : REG_GAP_MAX;
    const place = (list: Regiment[], depth: number, y0: number, y1: number, gap = regGap): number => {
      // Lay regiments across the band between y0 and y1; overflow goes to further rows behind.
      let rank = 0;
      let i = 0;
      while (i < list.length) {
        const row: Regiment[] = [];
        let width = 0;
        while (i < list.length) {
          const w = list[i]!.width;
          // (`width` counts the gap after each block in the row: the last one needs none. Until
          // the scale rework this counted it, which with a gap over the band's 40 of slack sent
          // the last block of the line to a row of its own behind.)
          if (row.length > 0 && width + w > y1 - y0) break;
          row.push(list[i]!);
          width += w + gap;
          i++;
        }
        let y = (y0 + y1) / 2 - (width - gap) / 2;
        let deepest = 0;
        for (const reg of row) {
          const half = reg.width / 2 + 4;
          const ry = half * 2 >= FIELD_H ? FIELD_H / 2 : Math.max(half, Math.min(FIELD_H - half, y + reg.width / 2));
          this.formUp(reg, onField(reg, X(depth + rank)), ry);
          reg.homeY = reg.ay;
          reg.homeX = reg.ax;
          deepest = Math.max(deepest, reg.depth);
          y += reg.width + gap;
        }
        rank += deepest + ROW_GAP;
      }
      return rank;
    };
    const half = Math.max(rowWidth(first, regGap), 160) / 2;
    const firstDepth = first.length ? place(first, 0, midY - half - 20, midY + half + 20) : 0;
    const missile = byRole('missile');
    const missileDepth = place(missile, Math.max(14, firstDepth), midY - half - 120, midY + half + 120, MISSILE_GAP);
    const behind = Math.max(14, firstDepth) + missileDepth;
    const secondDepth = place(second, behind, midY - half - 20, midY + half + 20);
    const skirm = byRole('skirmish');
    if (skirm.length) {
      const sd = Math.max(...skirm.map((r) => r.depth));
      place(skirm, -SKIRMISH_AHEAD - sd, midY - half - 80, midY + half + 80, 50);
    }
    // The engines: just behind the second line, before the general (v17, QA #7: until then
    // SIEGE_BEHIND behind the general, which in a big battle was the back edge of the field), and
    // never nearer that edge than SIEGE_EDGE.
    const engines = byRole('siege');
    place(engines, secondDepth > 0 ? behind + secondDepth - ROW_GAP + SIEGE_GAP : behind + SIEGE_BEHIND, midY - half, midY + half, 60);
    for (const reg of engines) {
      const x = dir > 0 ? Math.max(SIEGE_EDGE + reg.depth, reg.ax) : Math.min(FIELD_W - SIEGE_EDGE - reg.depth, reg.ax);
      if (x !== reg.ax) {
        this.formUp(reg, x, reg.ay);
        reg.homeX = reg.ax;
      }
    }

    // Wings: cavalry split above and below the line; knights at the back of each wing.
    const wings = [...byRole('flank'), ...byRole('horse-archer'), ...byRole('shock-cav')];
    const top: Regiment[] = [];
    const bottom: Regiment[] = [];
    wings.forEach((r, i) => (i % 2 === 0 ? top : bottom).push(r));
    const wingW = (list: Regiment[]) => Math.min(400, list.reduce((w, r) => Math.max(w, r.width), 0) * 2 + 50);
    const tw = wingW(top);
    const bw = wingW(bottom);
    place(top, -WING_FORWARD, Math.max(20, midY - half - WING_GAP - tw), midY - half - WING_GAP, 50);
    place(bottom, -WING_FORWARD, midY + half + WING_GAP, Math.min(FIELD_H - 20, midY + half + WING_GAP + bw), 50);

    // The commander and a bodyguard of knights behind the centre.
    if (army.commander) {
      const reg = new Regiment(this.regiments.length, team, U.Knights, 'command');
      const st = stats[U.Knights]!;
      reg.rad = st.radius;
      reg.spacing = spacingFor(reg, reg.stance);
      reg.speed = st.speed;
      reg.fx = reg.dfx = dir;
      reg.phase = this.teamRegs[team]!.length;
      this.regiments.push(reg);
      this.teamRegs[team]!.push(reg);
      for (let i = 0; i <= 6; i++) {
        if (i === 0) this.commander[team] = this.soldiers.length;
        this.addSoldier(team, U.Knights, reg, st, true, i === 0, i === 0 ? 360 : st.hp * 1.2);
      }
      reg.start = reg.alive = reg.members.length;
      reg.baseMorale = reg.morale = this.fearless[team] ? 100 : 95 + army.moraleBonus;
      shape(reg, reg.members.length);
      // (Behind the archers and the second line, a horse's length clear of them, before the
      // engines: until v17 it stood in the middle of the archers' row, and rode out through them
      // and the second line at the start.)
      this.formUp(reg, onField(reg, X(behind + secondDepth + (missileDepth + secondDepth > 0 ? RIDER.room : 4))), midY);
      reg.homeY = midY;
      reg.homeX = reg.ax;
      reg.veteran = true;
    }

    // Stakes before the archers.
    if (army.stakes) {
      for (const r of missile) {
        this.stakes.push({ team, x: r.ax + dir * 8, y0: r.ay - r.width / 2 - 4, y1: r.ay + r.width / 2 + 4 });
      }
    }
  }

  /** Stands a regiment up with its front rank's middle at (x, y). */
  private formUp(reg: Regiment, x: number, y: number): void {
    reg.ax = reg.tx = x;
    reg.ay = reg.ty = y;
    this.assignSlots(reg, false);
    const d = this.d;
    for (const id of reg.members) {
      d.x[id] = reg.ax + reg.fx * d.sy[id]! - reg.fy * d.sx[id]!;
      d.y[id] = reg.ay + reg.fy * d.sy[id]! + reg.fx * d.sx[id]!;
    }
    reg.cx = reg.ax - reg.fx * reg.depth * 0.5;
    reg.cy = reg.ay - reg.fy * reg.depth * 0.5;
  }

  /**
   * Gives each living man a file and rank, row by row; a short last rank is centred. With
   * `keepOrder` the men are taken front rank first (so the order they stood in is kept).
   */
  private assignSlots(reg: Regiment, keepOrder: boolean, byRank = false): void {
    const d = this.d;
    const ids: number[] = [];
    for (const id of reg.members) if (d.state[id] === State.Fighting) ids.push(id);
    if (keepOrder) ids.sort((a, b) => d.row[a]! - d.row[b]! || d.col[a]! - d.col[b]! || a - b);
    shape(reg, ids.length);
    const cols = reg.cols;
    if (reg.stance === 'wedge') {
      // A triangle, point forward: rank r holds r + 1 men, each rank offset by half a file.
      let i = 0;
      for (let row = 0; i < ids.length; row++) {
        for (let j = 0; j <= row && i < ids.length; j++, i++) {
          const id = ids[i]!;
          d.row[id] = row;
          d.col[id] = (cols - 1) / 2 + j - row / 2;
        }
      }
    } else if (keepOrder && ids.length > cols) {
      // Re-forming: each man takes the nearest file to where he stands (the left of the old
      // front makes the left files of the new one), and within a file the man furthest forward
      // takes the front rank, so men do not have to walk through each other to their new places.
      const n = ids.length;
      if (this.slotLat.length < n) {
        this.slotLat = new Float64Array(n * 2);
        this.slotFwd = new Float64Array(n * 2);
      }
      const lr = this.slotLat;
      const fr = this.slotFwd;
      // Men in order across the front (positions in `ids`).
      const men: number[] = [];
      for (let i = 0; i < n; i++) {
        const id = ids[i]!;
        const dx = d.x[id]! - reg.ax;
        const dy = d.y[id]! - reg.ay;
        lr[i] = -dx * reg.fy + dy * reg.fx;
        fr[i] = dx * reg.fx + dy * reg.fy;
        men.push(i);
      }
      men.sort((p, q) => lr[p]! - lr[q]! || p - q);
      // Slots in row-major order are already grouped file by file once sorted by file then rank:
      // file c (whole files first, the short last rank's files interleaved) — walk the files.
      const rows = Math.ceil(n / cols);
      const last = n - (rows - 1) * cols;
      const off = (cols - last) / 2;
      // File positions, left to right: whole files 0..cols-1, and the short rank's men at
      // (j + off); a file at position f holds rows-1 men, plus one if a short-rank man sits on it.
      const files: number[] = [];
      for (let c = 0; c < cols; c++) files.push(c);
      if (last < cols) for (let j = 0; j < last; j++) if (off % 1 !== 0) files.push(j + off);
      files.sort((p, q) => p - q);
      let k = 0;
      const file: number[] = [];
      for (const f of files) {
        const whole = f % 1 === 0;
        // Ranks in this file: whole files have rows-1 (or rows if the last rank is full or
        // lands on this file), half files only the last rank.
        const onLast = last === cols || (off % 1 === 0 && f >= off && f < off + last);
        const deep = whole ? rows - 1 + (onLast ? 1 : 0) : 1;
        file.length = 0;
        for (let j = 0; j < deep && k < n; j++) file.push(men[k++]!);
        // (Countermarching, `byRank`: the front-rankers keep the front, wherever they stand now.)
        if (byRank) file.sort((p, q) => d.row[ids[p]!]! - d.row[ids[q]!]! || fr[q]! - fr[p]! || p - q);
        else file.sort((p, q) => fr[q]! - fr[p]! || p - q);
        for (let j = 0; j < file.length; j++) {
          const id = ids[file[j]!]!;
          d.row[id] = whole ? j : rows - 1;
          d.col[id] = f;
        }
      }
    } else {
      if (keepOrder) {
        // (A single rank: left to right as they stand toward the front, which may be a new one.)
        const lat = (id: number) => -(d.x[id]! - reg.ax) * reg.fy + (d.y[id]! - reg.ay) * reg.fx;
        ids.sort((a, b) => lat(a) - lat(b) || a - b);
      }
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, ids.length - row * cols);
        d.row[id] = row;
        d.col[id] = (i % cols) + (cols - inRow) / 2;
      }
    }
    this.slotOffsets(reg);
  }

  private slotOffsets(reg: Regiment): void {
    const d = this.d;
    const mid = (reg.cols - 1) / 2;
    const step = rankStep(reg);
    let rows = 0;
    for (const id of reg.members) {
      if (d.state[id] !== State.Fighting) continue;
      d.sx[id] = (d.col[id]! - mid) * reg.spacing;
      d.sy[id] = -d.row[id]! * step;
      if (d.row[id]! + 1 > rows) rows = d.row[id]! + 1;
    }
    reg.rows = Math.max(1, rows);
    reg.depth = (reg.rows - 1) * step + 4;
    const K = 2 * Math.ceil(reg.cols) + 3;
    const size = reg.rows * K;
    if (reg.nb.length < size) reg.nb = new Int32Array(size * 2);
    reg.nbK = K;
    reg.nb.fill(-1, 0, size);
    for (const id of reg.members) {
      if (d.state[id] !== State.Fighting) continue;
      const k = Math.round(d.col[id]! * 2);
      if (k >= 0 && k < K) reg.nb[d.row[id]! * K + k] = id;
    }
  }

  /** Files close up: in each file the men step forward into the ranks of the fallen. */
  private closeRanks(reg: Regiment): void {
    reg.reflow = false;
    const d = this.d;
    let alive = 0;
    for (const id of reg.members) if (d.state[id] === State.Fighting) alive++;
    if (alive === 0) return;
    // Too few left for the frontage: re-form narrower.
    // (P5: a worn block of the line keeps its frontage, its files ragged, down to COHESION.narrowAt ranks.)
    if (reg.stance === 'wedge' || (reg.role !== 'siege' && reg.cols > 3 && alive < reg.cols * (reg.role === 'line' ? COHESION.narrowAt : 2.2) && reg.stance !== 'column')) {
      this.assignSlots(reg, true);
      return;
    }
    this.compactFiles(reg);
  }

  /** In each file the men take the ranks in order from the front (closing up on the fallen). */
  private compactFiles(reg: Regiment): void {
    const d = this.d;
    const keys = 2 * reg.cols + 2;
    const files: number[][] = [];
    for (let k = 0; k < keys; k++) files.push([]);
    for (const id of reg.members) {
      if (d.state[id] !== State.Fighting) continue;
      const k = Math.max(0, Math.min(keys - 1, Math.round(d.col[id]! * 2)));
      files[k]!.push(id);
    }
    for (const f of files) {
      if (f.length === 0) continue;
      f.sort((a, b) => d.row[a]! - d.row[b]! || a - b);
      for (let r = 0; r < f.length; r++) d.row[f[r]!] = r;
    }
    this.slotOffsets(reg);
  }

  // ------------------------------------------------------------------ the tick

  done(): boolean {
    return this.result !== null;
  }

  step(): void {
    if (this.result) return;
    this.rebuildGrid();
    if (this.tick % 5 === 0) {
      this.updateFront(0);
      this.updateFront(1);
    }
    // Both sides think on the same ticks, and take turns to go first: each General every 1.5 s,
    // each regiment every 0.5 s on the same tick as the enemy regiment with the same place in its
    // order of battle (see `Regiment.phase`). (Until v4 a regiment's tick came from its id, so
    // the second army's regiments were out of step with the first's by however many regiments
    // the first had, and the Generals were 0.7 s apart: one side reacted to the other's moves
    // sooner, and it won equal fights 60-75% of the time.)
    if (this.tick % 15 === 0) {
      const first = (this.tick / 15 + this.parity) % 2;
      this.generalThink(first);
      this.generalThink(1 - first);
    }
    const regs = this.regiments;
    const up = (this.tick + this.parity) % 2 === 0;
    for (let q = 0; q < regs.length; q++) {
      const r = regs[up ? q : regs.length - 1 - q]!;
      if ((this.tick + r.phase) % 5 === 0) this.think(r);
    }
    if ((this.tick + 2) % REGROUP.every === 0) this.regroup();
    for (let i = 0; i < regs.length; i++) {
      const r = regs[i]!;
      const fx = r.fx;
      const fy = r.fy;
      this.moveAnchor(r);
      const turned = r.fx !== fx || r.fy !== fy;
      if (r.vax !== 0 || r.vay !== 0 || (turned && !this.tracking(r))) r.movedAt = this.tick;
      if (!turned) {
        r.restFx = r.fx;
        r.restFy = r.fy;
      }
      if (r.role === 'missile' && r.alive > 0) this.volleyClock(r);
    }
    const d = this.d;
    const n = this.n;
    // Who is fighting whom, for men choosing a foe (see `seek`).
    const att = d.att;
    att.fill(0);
    for (let i = 0; i < n; i++) {
      const t = d.target[i]!;
      if (t >= 0 && d.state[i]! === State.Fighting) att[t]!++;
    }
    // Blows land in turn: alternate which side's men act first, so neither strikes first every
    // tick (and which goes first on even ticks is drawn: see `parity`).
    if ((this.tick + this.parity) % 2 === 0) {
      for (let i = 0; i < n; i++) if (d.state[i]! <= State.Routing) this.act(i);
    } else {
      for (let i = n - 1; i >= 0; i--) if (d.state[i]! <= State.Routing) this.act(i);
    }
    // (Each regiment's rank step, for `lead` and `station`: nothing in the moves changes it.)
    const regStep = this.regStep;
    for (let j = 0; j < regs.length; j++) regStep[j] = rankStep(regs[j]!);
    if ((this.tick + this.parity) % 2 === 0) {
      for (let i = 0; i < n; i++) if (d.state[i]! <= State.Routing) this.move(i);
    } else {
      for (let i = n - 1; i >= 0; i--) if (d.state[i]! <= State.Routing) this.move(i);
    }
    this.separate();
    this.flyProjectiles();
    this.tick++;
    if (this.tick % 10 === 0) {
      if (this.crumbling[0] || this.crumbling[1]) this.crumble();
      // U3: the Lich-Marshal's lantern pulses, and the fallen near him rise.
      for (const t of [0, 1]) if (this.doc[t]!.raiseEvery > 0 && this.tick % this.doc[t]!.raiseEvery === 0) this.raise(t);
      this.checkEnd();
    }
  }

  /** A crumbling host (see UNDEAD): every man still standing loses a share of his hit points, each second. */
  private crumble(): void {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      if (d.state[i] !== State.Fighting || !this.crumbling[d.team[i]!]) continue;
      this.hurt(i, this.soldiers[i]!.s.hp * UNDEAD.crumble, -1);
    }
  }

  /**
   * U3 What falls, rises: the Lich-Marshal raises his own fallen foot (heavy foot, spears,
   * skirmishers: no horse, Colossus or engines) lying within Doctrine.raiseRange of him, dead at
   * least `raiseAfter` ticks, never raised before, whose regiment still stands: in id order, as
   * many as he has in hand (`toRaise`: `raiseShare` of every man of those classes who has fallen
   * while he stood). Each stands up where he fell with `raiseHp` of his hit points and goes
   * back into the files of his regiment. Not once he has fallen, nor once the host is crumbling
   * or broken. (Until v16 each pulse raised a share of the host's start, at most 8: so many a
   * pulse, however fast the host was falling, and a longer battle, a bigger one, raised a greater
   * share of it.)
   */
  private raise(t: number): void {
    const doc = this.doc[t]!;
    if (this.crumbling[t] || this.broken[t] || !this.lordAlive(t)) return;
    const d = this.d;
    const cmd = this.commander[t]!;
    const lx = d.x[cmd]!;
    const ly = d.y[cmd]!;
    const R2 = doc.raiseRange * doc.raiseRange;
    const cap = Math.floor(this.toRaise[t]!);
    const end = t === 0 ? this.firstId[1] : this.n;
    let n = 0;
    for (let i = this.firstId[t]!; i < end && n < cap; i++) {
      if (d.state[i] !== State.Dead || d.rose[i]! >= 0 || this.tick - d.died[i]! < doc.raiseAfter) continue;
      const s = this.soldiers[i]!;
      if (!RISES[s.cls] || s.commander) continue;
      const dx = d.x[i]! - lx;
      const dy = d.y[i]! - ly;
      if (dx * dx + dy * dy > R2) continue;
      const r = this.regiments[d.reg[i]!]!;
      if (r.alive === 0) continue;
      // (Not from under the feet of the living foe: until v17 a man rose where he lay, inside
      // the enemy standing over him, and was shoved out again over the next ticks. Such deep
      // overlaps of foes were nearly all men just risen. He waits for the next pulse.)
      if (this.footOn(i)) continue;
      d.state[i] = State.Fighting;
      d.hp[i] = s.s.hp * doc.raiseHp;
      d.rose[i] = this.tick;
      d.target[i] = -1;
      d.imp[i] = 0;
      d.stun[i] = 0;
      d.cd[i] = 0;
      d.vx[i] = 0;
      d.vy[i] = 0;
      r.alive++;
      r.reflow = true;
      this.risen[t]![s.cls]!++;
      n++;
    }
    this.toRaise[t]! -= n;
    if (n > 0) this.events.push({ tick: this.tick, team: t, kind: 'doctrine', cls: U.HeavyInfantry, note: 'raise', count: n * this.scale });
  }

  /** Whether a living enemy stands on fallen man `i` (their bodies overlap). */
  private footOn(i: number): boolean {
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const team = d.team[i]!;
    // (The grid is from the start of this tick: a cell more for the men's steps since.)
    const R = d.rad[i]! + 6 + CELL;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.gridEnd[c]!; k++) {
          const j = this.items[k]!;
          if (d.team[j] === team || d.state[j]! > State.Routing) continue;
          const dx = d.x[j]! - x;
          const dy = d.y[j]! - y;
          const m = d.rad[i]! + d.rad[j]!;
          if (dx * dx + dy * dy < m * m) return true;
        }
      }
    }
    return false;
  }

  /**
   * Whether fallen man `id` may yet be raised (U3): of a raising army whose Lich-Marshal still
   * stands and whose host holds, of a class that rises, never raised before, and whose regiment
   * still has men standing (`raise` puts him back in it). For the
   * renderer, which keeps such a corpse off the ground until it can no longer get up.
   */
  mayRise(id: number): boolean {
    const d = this.d;
    const t = d.team[id]!;
    if (this.doc[t]!.raiseEvery <= 0 || d.state[id] !== State.Dead || d.rose[id]! >= 0) return false;
    const s = this.soldiers[id]!;
    // (A man rises back into his own regiment: once it has nobody left standing it never will.)
    if (s.commander || !RISES[s.cls] || this.regiments[d.reg[id]!]!.alive === 0) return false;
    return !this.crumbling[t] && !this.broken[t] && !this.result && this.lordAlive(t);
  }

  /** A blow to a regiment's morale; the fearless take none. */
  private shake(r: Regiment, by: number): void {
    if (!this.fearless[r.team]) r.morale -= by;
  }

  /** Runs to the end (or `maxTicks` more) without drawing. */
  run(maxTicks = MAX_TICKS): BattleResult {
    const stop = this.tick + maxTicks;
    while (!this.result && this.tick < stop) this.step();
    return this.result ?? this.decide('time');
  }

  /** Strikes a soldier down at once (for tests and tools: the general falls to a stray bolt). */
  kill(id: number): void {
    const d = this.d;
    if (d.state[id]! >= State.Dead) return;
    this.hurt(id, d.hp[id]! + 1, -1);
  }

  private rebuildGrid(): void {
    const g = this.grid;
    const ge = this.gridEnd;
    const d = this.d;
    const n = this.n;
    const cellOf = this.cellOf;
    const of0 = this.ofTeam0;
    const busy = this.busy;
    // Only last tick's cells need clearing: every other cell is already empty (start = end = 0).
    for (let b = 0; b < this.busyN; b++) {
      const c = busy[b]!;
      g[c] = 0;
      ge[c] = 0;
      of0[c] = 0;
    }
    const first1 = this.firstId[1];
    let nb = 0;
    // Count each cell's men (in `gridEnd` for now), noting each cell as it fills.
    for (let i = 0; i < n; i++) {
      if (d.state[i]! > State.Routing) {
        cellOf[i] = -1;
        continue;
      }
      const c = cellIndex(d.x[i]!, d.y[i]!);
      cellOf[i] = c;
      if (ge[c]!++ === 0) busy[nb++] = c;
      if (i < first1) of0[c]!++;
    }
    this.busyN = nb;
    this.sortBusy(nb);
    // Lay the cells out in cell order, each one's men contiguous (as a running total over every
    // cell would, without walking the empty ones).
    const fill = this.fill;
    let off = 0;
    for (let b = 0; b < nb; b++) {
      const c = busy[b]!;
      g[c] = off;
      fill[c] = off;
      off += ge[c]!;
      ge[c] = off;
    }
    this.gridTotal = off;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const kr = this.kr;
    const km = this.km;
    const kt = this.kt;
    const kl = this.kl;
    const kw = this.kw;
    // Per regiment, for its standing men. Bit 0: skirmishers (they slip through their own lines).
    // Bit 1: planted foot (braced or a pike wall) that a charge does not shove aside.
    const regs = this.regiments;
    const rf = this.regFlags;
    for (let j = 0; j < regs.length; j++) {
      const r = regs[j]!;
      rf[j] = (r.role === 'skirmish' || r.slip ? 1 : 0) | (r.stance === 'braced' || r.stance === 'pikewall' ? 2 : 0);
    }
    let bow = false;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i]!;
      if (c < 0) continue;
      const k = fill[c]!++;
      items[k] = i;
      kx[k] = d.x[i]!;
      ky[k] = d.y[i]!;
      kr[k] = d.rad[i]!;
      const m = d.mass[i]!;
      // (A man getting up from the dead is not shoved about: the press goes round him. Two
      // getting up side by side leave each other be: see `separate`.)
      km[k] = d.rose[i]! >= 0 && this.tick - d.rose[i]! < RISE_TICKS ? RISING_MASS : m;
      kt[k] = d.team[i]!;
      const fighting = d.state[i] === State.Fighting;
      kl[k] = fighting ? rf[d.reg[i]!]! : 0;
      // A galloping rider's bow wave; light horse shoulders men aside far less than destriers.
      const imp = d.imp[i]!;
      if (fighting && imp > 0.3 && d.mt[i]) {
        kw[k] = imp * d.spd[i]! * TICK_S * (m >= 4 ? 1 : 0.35);
        bow = true;
      } else kw[k] = 0;
    }
    this.bowWave = bow;
  }

  /** Sorts the first `nb` busy cells into index order: a radix sort, by column and then by row. */
  private sortBusy(nb: number): void {
    const busy = this.busy;
    const tmp = this.busyTmp;
    const cnt = this.busyCount;
    cnt.fill(0);
    for (let b = 0; b < nb; b++) cnt[(busy[b]! % GW) + 1]!++;
    for (let k = 0; k < GW; k++) cnt[k + 1]! += cnt[k]!;
    for (let b = 0; b < nb; b++) {
      const c = busy[b]!;
      tmp[cnt[c % GW]!++] = c;
    }
    cnt.fill(0);
    for (let b = 0; b < nb; b++) cnt[((tmp[b]! / GW) | 0) + 1]!++;
    for (let k = 0; k < GH; k++) cnt[k + 1]! += cnt[k]!;
    for (let b = 0; b < nb; b++) {
      const c = tmp[b]!;
      busy[cnt[(c / GW) | 0]!++] = c;
    }
  }

  /** Calls `f` for each living soldier within `r` of (x, y); stop by returning true. */
  near(x: number, y: number, r: number, f: (s: Soldier, d2: number) => boolean | void): void {
    const x0 = Math.max(0, Math.floor((x - r) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.gridEnd[c]!; k++) {
          const i = this.items[k]!;
          if (this.d.state[i]! > State.Routing) continue;
          const dx = this.d.x[i]! - x;
          const dy = this.d.y[i]! - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && f(this.soldiers[i]!, d2) === true) return;
        }
      }
    }
  }

  // ------------------------------------------------------------------ the generals

  /** Where each side's fighting line stands: its front, depth and lateral span. */
  private updateFront(t: number): void {
    const ts = this.ts[t]!;
    const regs = this.teamRegs[t]!;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let depth = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let engaged = false;
    for (let pass = 1; pass <= 2 && n === 0; pass++) {
      for (const r of regs) {
        if (r.role !== 'line' || r.alive === 0 || r.routed) continue;
        if (pass === 1 && r.line !== 1 && !r.committed) continue;
        n += r.alive;
        sx += r.ax * r.alive;
        sy += r.ay * r.alive;
        depth = Math.max(depth, r.depth);
        minY = Math.min(minY, r.ay - r.width / 2);
        maxY = Math.max(maxY, r.ay + r.width / 2);
      }
    }
    for (const r of regs) if (r.role === 'line' && r.engaged && !r.routed) engaged = true;
    ts.hasLine = n > 0;
    if (n > 0) {
      ts.frontX = sx / n;
      ts.midY = sy / n;
      ts.lineDepth = depth;
      ts.minY = minY;
      ts.maxY = maxY;
    } else {
      // No line left: the army's centre stands in for it.
      let k = 0;
      let x = 0;
      let y = 0;
      for (const r of regs) {
        if (r.alive === 0 || r.routed) continue;
        k += r.alive;
        x += r.cx * r.alive;
        y += r.cy * r.alive;
      }
      if (k > 0) {
        ts.frontX = x / k;
        ts.midY = y / k;
      }
      ts.minY = ts.midY;
      ts.maxY = ts.midY;
      ts.lineDepth = 0;
    }
    ts.engaged = engaged;
    if (engaged && !ts.contacted) {
      ts.contacted = true;
      ts.contactAt = this.tick;
      this.events.push({ tick: this.tick, team: t, kind: 'contact', cls: U.HeavyInfantry });
    }
  }

  /** What a side still has in the field. */
  private forces(t: number): Forces {
    const f: Forces = { value: 0, foot: 0, cav: 0, knights: 0, missile: 0, routing: 0, all: 0, wingLow: 0, wingHigh: 0 };
    const mid = this.ts[t]!.midY;
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0) continue;
      const st = this.stats[t]![r.cls]!;
      const v = r.alive * st.value;
      f.all += v;
      if (r.routed) {
        f.routing += v;
        continue;
      }
      f.value += v;
      if (isCav(r)) f.cav += v;
      else if (r.role !== 'siege' && r.role !== 'command') f.foot += v;
      if (r.role === 'shock-cav') f.knights += v;
      if ((r.role === 'missile' || r.role === 'horse-archer' || r.role === 'skirmish') && r.ammoLeft > 0) f.missile += (r.alive * st.missileDamage) / fireEvery(st);
      if (r.cy < mid) f.wingLow += v;
      else f.wingHigh += v;
    }
    return f;
  }

  /** Which wing a point is on, as the side's men see it. */
  private sideName(t: number, y: number): 'left' | 'centre' | 'right' {
    const dir = t === 0 ? 1 : -1;
    const off = (y - this.ts[t]!.midY) * dir;
    return off < -70 ? 'left' : off > 70 ? 'right' : 'centre';
  }

  private announce(t: number, r: Regiment | null, order: OrderKind, note: string): void {
    this.events.push({ tick: this.tick, team: t, kind: 'general-order', cls: r ? r.cls : U.Knights, reg: r ? r.id : -1, order, side: r ? this.sideName(t, r.cy) : undefined, note });
  }

  private give(r: Regiment, kind: OrderKind, target = -1, side = 0, friend = -1, x = NaN, y = NaN): void {
    const o = r.ord;
    if (o.kind !== kind || o.target !== target || o.side !== side) o.at = this.tick;
    o.kind = kind;
    o.target = target;
    o.side = side;
    o.friend = friend;
    o.x = x;
    o.y = y;
    r.order = kind;
  }

  /** The General reads the field, keeps (or changes) its plan, and gives every regiment its order. */
  private generalThink(t: number): void {
    const g = this.generals[t]!;
    const doc = this.doc[t]!;
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    const dir = t === 0 ? 1 : -1;
    const ours = this.forces(t);
    const theirs = this.forces(1 - t);
    if (this.startValue[t] === 0) this.startValue[t] = ours.value;
    ts.loss = 1 - ours.value / Math.max(1, this.startValue[t]!);
    if (ours.value === 0) return;
    if (!ts.contacted && this.tick >= 10 && (g.planAt < 0 || this.tick - g.planAt >= 150)) this.choosePlan(t, ours, theirs);
    const plan = g.plan;
    const gap = (es.frontX - ts.frontX) * dir;
    const won = this.broken[1 - t] || theirs.routing > theirs.all * 0.55;
    const regs = this.teamRegs[t]!;

    // When to go forward.
    let waiting = this.tick < 30;
    if (plan === 'hold' && !ts.engaged && ts.hasLine) {
      // (Until the scale rework 1100, 650 and 900: the enemy now has twice as far to come.)
      if (g.holdUntil === 0) g.holdUntil = g.personality === 'cautious' ? 1900 : g.personality === 'aggressive' ? 1150 : 1550;
      if (this.tick < g.holdUntil && gap > 140) waiting = true;
    } else if (!g.dueled && !doc.unhalting && ours.missile > 0 && ours.missile >= theirs.missile * 0.5 && gap < ARCHER_RANGE * 0.72 && gap > ARCHER_RANGE * 0.34 && g.personality !== 'aggressive') {
      // Halt in bow range and trade volleys for a while: our archers, a row behind our line, reach
      // the enemy's front. (Until the scale rework 60 < gap < 125, with bows of 175.)
      g.dueled = true;
      g.haltUntil = this.tick + (g.personality === 'cautious' ? 170 : 120);
    }
    if (ts.engaged) g.haltUntil = 0;
    if (this.tick < g.haltUntil) waiting = true;
    // S3: the line waits behind its guns while they fire before it (for `screenHold` at most).
    if (doc.screen > 0 && !ts.engaged) {
      const firing = this.teamRegs[t]!.some((r) => r.screened && !r.retired && r.mode === 'shoot' && r.alive > 0);
      if (firing && g.gunsAt < 0) g.gunsAt = this.tick;
      if (firing && this.tick - g.gunsAt < doc.screenHold) waiting = true;
    }
    this.stance[t] = plan === 'hold' ? 'hold' : 'press';

    // Reserves: the second line stands behind the first until the General commits it.
    const pool: Regiment[] = [];
    // Late in the day, or with the first line gone, everyone left goes in.
    let firstLine = 0;
    for (const r of regs) if (r.role === 'line' && r.alive > 0 && !r.routed && (r.line !== 2 || r.committed)) firstLine++;
    const allIn = firstLine === 0 || this.tick > LATE;
    for (const r of regs) {
      if (r.alive === 0 || r.routed) continue;
      const lineLike = r.role === 'line' || this.drawn(r);
      if (!lineLike) continue;
      if (won && !r.engaged) {
        this.give(r, 'pursue');
        continue;
      }
      // Pull a wavering regiment out of the line once, if it can still get away and has men to save.
      // (T2: a Templar block, not locked in the fight, may be pulled back even with the enemy
      // close: since v14 a block in the line is seldom out of contact for long.)
      if (!allIn && r.withdrawals < doc.withdrawals && r.moraleState === 'wavering' && !r.engaged && (!r.contact || (doc.withdrawBehind > 0 && r.enemyNear === 0)) && ts.contacted && r.alive > r.start * 0.4) {
        r.withdrawals++;
        // T2 Re-form on the banner: a Templar block falls back behind the nearest banner (the
        // Marshal, or a steady block of its own kind) rather than straight back.
        const tmp = this.tmp;
        if (doc.withdrawBehind > 0 && this.bannerFor(t, r, doc.withdrawBanner, tmp)) {
          this.events.push({ tick: this.tick, team: t, kind: 'doctrine', cls: r.cls, reg: r.id, note: 'banner' });
          this.give(r, 'withdraw', -1, 0, -1, clampX(tmp[0]! - dir * doc.withdrawBehind), clampY(tmp[1]!));
        } else {
          this.announce(t, r, 'withdraw', 'pulls a wavering regiment back to re-form');
          this.give(r, 'withdraw', -1, 0, -1, r.cx - dir * 90, r.cy);
        }
        continue;
      }
      if (r.order === 'withdraw' && r.moraleState !== 'steady' && this.tick - r.ord.at < 200 && !allIn) continue;
      if (r.order === 'support' && r.ord.target >= 0) {
        const e = this.regiments[r.ord.target]!;
        if (e.alive > 0 && !e.routed) continue;
      }
      if (allIn && r.line === 2 && g.useReserve) r.committed = true;
      if (r.line === 2 && !r.committed && r.role === 'line') {
        if (g.useReserve && this.initiative(t, r)) {
          // (The flank is its place now: `assignLines` sends it there, the P6 cost favouring it.)
          r.committed = true;
          g.committed++;
          this.announce(t, r, 'flank', `sees a reserve on the ${this.sideName(t, r.cy)} go for an open flank on its own`);
        } else {
          this.reserveOrder(t, r);
          continue;
        }
      }
      pool.push(r);
    }
    if (g.useReserve) this.commitReserves(t, ours);
    this.assignLines(t, pool);
    // The general charge: when the enemy line wavers (many of its blocks shaken or running),
    // every block of ours that is not already locked goes in at a run.
    let shaken = 0;
    let line = 0;
    for (const e of this.teamRegs[1 - t]!) {
      if (e.alive === 0 || e.role !== 'line') continue;
      line++;
      if (e.routed || e.moraleState === 'wavering') shaken++;
    }
    const generalCharge = ts.contacted && line > 0 && shaken >= Math.max(2, line * 0.45) && g.personality !== 'cautious';
    if (generalCharge && g.chargedAt < 0) {
      g.chargedAt = this.tick;
      this.announce(t, null, 'charge', 'orders a general charge as the enemy line wavers');
    }
    for (const r of pool) {
      if (r.targetReg < 0) {
        this.give(r, 'reserve');
        continue;
      }
      let hold = waiting && !r.engaged;
      if (plan === 'refuse' && !r.engaged && !r.committed && (r.homeY - FIELD_H / 2) * g.strong < -20 && this.tick < REFUSE_UNTIL) {
        // The refused wing stays back until the enemy comes to it.
        const near = this.nearestFoe(r, 0, 130);
        if (!near) hold = true;
      }
      if (hold) this.give(r, 'hold', r.targetReg, r.slot);
      else if (!r.engaged && this.shouldCharge(t, r, generalCharge)) this.give(r, 'charge', r.targetReg, r.slot);
      else this.give(r, r.slot === 0 ? 'attack' : 'flank', r.targetReg, r.slot);
    }

    // Missiles, skirmishers, engines, the bodyguard.
    for (const r of regs) {
      if (r.alive === 0 || r.routed) continue;
      if (r.role === 'missile' && !this.drawn(r)) this.give(r, plan === 'hold' && waiting ? 'hold' : 'advance');
      else if (r.role === 'skirmish' && !this.drawn(r)) this.give(r, won ? 'pursue' : 'skirmish');
      else if (r.role === 'horse-archer' && r.ammoLeft > 0) this.give(r, won ? 'pursue' : 'skirmish');
      else if (r.role === 'siege') this.give(r, 'hold');
      else if (r.role === 'command') this.give(r, 'support');
    }
    this.cavalryOrders(t, ours, theirs, won);
  }

  /**
   * Whether a block of the line should charge its target rather than walk into it: the general
   * charge, a target that is wavering, or archers and skirmishers caught in the open close by
   * (with nothing of theirs in between). Not when it is spent, or shaken itself.
   */
  private shouldCharge(t: number, r: Regiment, general: boolean): boolean {
    if (r.fatigue > 0.6 || r.moraleState !== 'steady' || r.targetReg < 0) return false;
    const e = this.regiments[r.targetReg]!;
    if (e.alive === 0 || e.routed) return false;
    const dx = e.cx - r.cx;
    const dy = e.cy - r.cy;
    const gap = sqrt(dx * dx + dy * dy) - e.radius - r.radius;
    if (gap > 160) return false;
    if (general) return true;
    // S2: samurai heavy foot runs in at any enemy close enough.
    const keen = this.doc[t]!.keenCharge;
    if (keen > 0 && r.cls === U.HeavyInfantry && gap < keen) return true;
    if (e.moraleState === 'wavering' || e.moraleState === 'rallying') return true;
    if ((e.role === 'missile' || e.role === 'skirmish') && !e.engaged && gap < 110) {
      // Caught in the open: none of their line between us.
      for (const o of this.teamRegs[1 - t]!) {
        if (o === e || o.alive === 0 || o.routed || o.role !== 'line') continue;
        const ox = o.cx - r.cx;
        const oy = o.cy - r.cy;
        const along = (ox * dx + oy * dy) / (dx * dx + dy * dy || 1);
        if (along <= 0 || along >= 1) continue;
        const px = ox - dx * along;
        const py = oy - dy * along;
        if (px * px + py * py < (o.radius + 10) * (o.radius + 10)) return false;
      }
      return true;
    }
    return false;
  }

  private choosePlan(t: number, ours: Forces, theirs: Forces): void {
    const g = this.generals[t]!;
    const keen = g.trait === 'hawk-eyed' ? 0 : 0.6 * (1.1 - g.skill);
    const noise = () => 1 + (g.rng.next() - 0.5) * keen;
    const S = (ours.value / Math.max(1, theirs.value)) * noise();
    const M = ((ours.missile + 0.5) / (theirs.missile + 0.5)) * noise();
    const C = ((ours.cav + 1) / (theirs.cav + 1)) * noise();
    const p = g.personality;
    const score: Record<Plan, number> = {
      hold: (M > 1.25 ? 1 : 0.15) + (S < 0.9 ? 0.3 : 0) + (p === 'cautious' ? 0.3 : p === 'aggressive' ? -0.3 : 0),
      advance: 0.55 + (S > 1.1 ? 0.25 : 0) + (p === 'aggressive' ? 0.25 : 0) + (M < 0.8 ? 0.2 : 0),
      envelop: ours.cav > ours.value * 0.12 ? (C > 1.3 ? 0.9 : 0.35) + (p === 'cunning' ? 0.15 : 0) : 0,
      hammer: ours.knights > 0 && ours.foot > theirs.foot * 0.7 ? 0.7 + (p === 'aggressive' ? 0.1 : 0) : 0,
      refuse: 0.3 + (p === 'cunning' ? 0.45 : 0) + (S < 1 ? 0.15 : 0),
    };
    // U1 The tide: the dead neither stand and wait nor hold a wing back.
    if (this.doc[t]!.unhalting) score.hold = score.refuse = 0;
    if (g.planAt >= 0) score[g.plan] += 0.3;
    let best: Plan = 'advance';
    for (const k of PLANS) if (score[k] > score[best]) best = k;
    // A general can misread the day and pick a poor plan.
    if (g.trait !== 'old-fox' && g.rng.next() < (1 - g.skill) * 0.5) {
      const ok = PLANS.filter((k) => score[k] > 0);
      best = ok[g.rng.int(ok.length)]!;
    }
    if (g.fixedPlan) best = g.fixedPlan;
    // QA review #10: the light horse by the plan and the odds. (Until v17 it rode at the enemy's
    // horse on its wing from the first moment, whatever the plan: in 24 battles of 24 the first
    // blow of the day was the two light-horse wings meeting at 18 s.) Sweeping round the wings,
    // or with the better horse, it goes out to drive the enemy's off; outshooting him, or keeping
    // the knights for the hammer, it waits to exploit; standing to let the archers work, or with
    // the weaker horse, it screens its wing. Each general lets the day open his own while first.
    const horse: HorsePlan =
      best === 'envelop' ? 'contest'
      : best === 'hold' ? (C > 1.4 ? 'contest' : 'screen')
      : best === 'hammer' ? (C > 1.4 ? 'contest' : 'wait')
      : M > 1.25 ? 'wait'
      : C < 0.8 ? 'screen'
      : p === 'cautious' && C < 1.2 ? 'screen'
      : 'contest';
    if (horse !== g.horse || g.planAt < 0) {
      g.horse = horse;
      const k = best === 'envelop' ? 0.25 : p === 'aggressive' ? 0.4 : p === 'cautious' ? 1.5 : 1;
      g.horseFrom = this.tick + Math.round(g.horseDelay * k);
    }
    // Overload the wing where the enemy is weaker.
    const low = theirs.wingLow * noise();
    const high = theirs.wingHigh * noise();
    g.strong = low < high ? -1 : 1;
    const changed = best !== g.plan || g.planAt < 0;
    g.plan = best;
    g.planAt = this.tick;
    if (changed) {
      const what: Record<Plan, string> = {
        hold: 'holds his ground and lets the archers work',
        advance: 'orders the whole line forward',
        refuse: `refuses his ${g.strong * (t === 0 ? 1 : -1) < 0 ? 'right' : 'left'} and masses on the other wing`,
        envelop: 'sends the horse round both wings',
        hammer: 'will pin them with the foot and hammer them with the knights',
      };
      this.events.push({ tick: this.tick, team: t, kind: 'general-order', cls: U.Knights, reg: -1, plan: best, note: what[best] });
    }
  }

  /** A second-line regiment waits behind the first, on the strong wing when the plan says so. */
  /**
   * A captain's initiative (battle v17): a block of the reserve, steady and not shaken, standing
   * by while an enemy block of foot is locked with ours and the open flank of that block lies
   * within COHESION.initiative of its own width (and a little) of it, with nobody of ours already
   * on its way there, goes in on its own. A real captain does not stand and watch an enemy flank
   * open a few strides off.
   */
  private initiative(t: number, r: Regiment): boolean {
    if (!this.ts[t]!.contacted || r.moraleState !== 'steady' || r.fatigue > 0.6 || r.engaged) return false;
    const reach = COHESION.initiative * (r.width + r.depth) + 20;
    const tmp = this.tmp;
    for (const e of this.teamRegs[1 - t]!) {
      if (e.alive === 0 || e.routed || !e.engaged || isCav(e) || e.role === 'command') continue;
      const dx = e.cx - r.cx;
      const dy = e.cy - r.cy;
      const far = reach + e.radius + r.radius;
      if (dx * dx + dy * dy > far * far) continue;
      for (let k = 1; k <= 2; k++) {
        slotPos(e, k, r.depth, tmp);
        const px = tmp[0]!;
        const py = tmp[1]!;
        const qx = px - r.ax;
        const qy = py - r.ay;
        if (qx * qx + qy * qy > reach * reach) continue;
        if (px < 10 || px > FIELD_W - 10 || py < 10 || py > FIELD_H - 10 || this.blocked(px, py, e, r.depth)) continue;
        let taken = false;
        for (const o of this.teamRegs[t]!) if (o !== r && o.alive > 0 && !o.routed && o.targetReg === e.id && o.slot === k) taken = true;
        if (!taken) return true;
      }
    }
    return false;
  }

  private reserveOrder(t: number, r: Regiment): void {
    const g = this.generals[t]!;
    let best: Regiment | null = null;
    let bd = Infinity;
    // QA review 2 #5: the friend it already backs, and what that costs. (Until then it took the
    // nearest friend at every order, 1.5 s apart: as the line shifted in the fight its goal jumped
    // 100-300 u every few seconds, and two reserves passing each other swapped friends.)
    const cur = r.ord.kind === 'reserve' && r.ord.friend >= 0 ? this.regiments[r.ord.friend]! : null;
    let cd = Infinity;
    for (const o of this.teamRegs[t]!) {
      if (o === r || o.role !== 'line' || o.alive === 0 || o.routed || (o.line === 2 && !o.committed)) continue;
      let q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
      if (g.plan === 'refuse') q -= (o.homeY - FIELD_H / 2) * g.strong * 400;
      // (Not behind a block another reserve already stands behind: two would stand in one place.)
      if (o !== cur) for (const x of this.teamRegs[t]!) if (x !== r && x.order === 'reserve' && x.ord.friend === o.id && x.alive > 0 && !x.routed) q += 1e6;
      if (o === cur) cd = q;
      if (q < bd) {
        bd = q;
        best = o;
      }
    }
    // It keeps its friend while that stands, for RESERVE_KEEP at least, and after that unless
    // another is a good deal nearer (RESERVE_SWITCH of the distance).
    if (cur && cd < Infinity && best !== cur && (this.tick - r.friendAt < RESERVE_KEEP || bd > cd * RESERVE_SWITCH * RESERVE_SWITCH)) best = cur;
    const id = best ? best.id : -1;
    if (id !== r.ord.friend || r.ord.kind !== 'reserve') r.friendAt = this.tick;
    this.give(r, 'reserve', -1, 0, id);
  }

  /**
   * Throws the reserve in: round the open flank of an enemy block that is locked with our line
   * and wavering (to break it), or into the gap where one of ours has just broken (to plug it).
   * It does not feed fresh men into a frontal grind: that only spends them.
   */
  private commitReserves(t: number, ours: Forces): void {
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    void ours;
    if (!ts.contacted) return;
    const tmp = this.tmp;
    let foe: Regiment | null = null;
    let friend: Regiment | null = null;
    let side = 0;
    let why = '';
    // Plug: a block of ours has just broken and the enemy that broke it is coming on.
    for (const o of this.teamRegs[t]!) {
      if (o.role !== 'line' || o.alive === 0 || !o.routed || this.tick - o.routAt > 80) continue;
      const e = this.nearestFoe(o, 0, 80);
      if (!e || e.engaged || isCav(e)) continue;
      foe = e;
      friend = o;
      side = 0;
      why = `plugs the gap on the ${this.sideName(t, o.cy)} with the reserve`;
      break;
    }
    // Exploit: an enemy block locked with ours, shaken, its flank open.
    const wait = g.personality === 'aggressive' || g.trait === 'reckless-valour' ? 20 : g.personality === 'cautious' ? 140 : 60;
    if (!foe && g.personality !== 'cautious' && this.tick - ts.contactAt > wait) {
      let worst = Infinity;
      for (const e of this.teamRegs[1 - t]!) {
        if (e.alive === 0 || e.routed || !e.engaged || isCav(e) || e.role === 'command') continue;
        // (The fearless never waver: a block of theirs is as good as shaken once it is down to
        // SPENT_BLOCK of its men. Until v16 the living never sent their reserve round the dead's
        // flanks, only to plug a gap once a block of theirs had broken; in a big battle, with most
        // of the line in the second row, the dead's reserve came in fresh and theirs did not.)
        const morale = this.fearless[e.team] ? (e.alive < e.start * SPENT_BLOCK ? 50 : 100) : e.morale;
        const shaky = morale + (g.personality === 'aggressive' ? -10 : 0) + (g.plan === 'refuse' && (e.cy - FIELD_H / 2) * g.strong > 0 ? -15 : 0);
        if (shaky > 55 || shaky >= worst) continue;
        for (const k of [1, 2]) {
          slotPos(e, k, 30, tmp);
          if (tmp[0]! < 10 || tmp[0]! > FIELD_W - 10 || tmp[1]! < 10 || tmp[1]! > FIELD_H - 10 || this.blocked(tmp[0]!, tmp[1]!, e, 30)) continue;
          let taken = false;
          for (const r of this.teamRegs[t]!) if (r.alive > 0 && !r.routed && r.targetReg === e.id && r.slot === k && r.role === 'line') taken = true;
          if (taken) continue;
          worst = shaky;
          foe = e;
          side = k;
        }
      }
      if (foe) why = `sends the reserve round the ${this.sideName(t, foe.cy)} flank`;
    }
    if (!foe) return;
    let reserve: Regiment | null = null;
    let bd = Infinity;
    for (const r of this.teamRegs[t]!) {
      if (r.role !== 'line' || r.line !== 2 || r.committed || r.alive === 0 || r.routed) continue;
      const q = (r.cx - foe.cx) * (r.cx - foe.cx) + (r.cy - foe.cy) * (r.cy - foe.cy);
      if (q < bd) {
        bd = q;
        reserve = r;
      }
    }
    if (!reserve) return;
    reserve.committed = true;
    g.committed++;
    reserve.targetReg = foe.id;
    reserve.slot = side;
    this.give(reserve, 'support', foe.id, side, friend ? friend.id : -1);
    this.announce(t, reserve, 'support', why);
  }

  private cavalryOrders(t: number, ours: Forces, theirs: Forces, won: boolean): void {
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    void ours;
    void theirs;
    const plan = g.plan;
    const early = g.personality === 'aggressive' || g.trait === 'reckless-valour';
    const doc = this.doc[t]!;
    // T1 The Marshal's charge: while he lives the knights go only on his signal, all at one target.
    const marshal = doc.signal && this.lordAlive(t);
    const dir = t === 0 ? 1 : -1;
    const strike = won ? null : this.horseStrike(t);
    const signal = marshal ? this.marshalSignal(t, won) : null;
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0 || r.routed) continue;
      if (!(r.role === 'flank' || r.role === 'shock-cav' || (r.role === 'horse-archer' && r.ammoLeft === 0))) continue;
      const before = r.order;
      if (!g.useCavalry) {
        this.give(r, 'hold', -1, 0, -1, r.homeX, r.homeY);
        continue;
      }
      if (won) {
        this.give(r, 'pursue');
        if (before !== 'pursue') this.announce(t, r, 'pursue', 'lets the horse loose on the fugitives');
        continue;
      }
      // S1: the daimyō has fallen; his hatamoto charge the nearest enemy to avenge him.
      if (g.revengeAt >= 0 && this.tick - g.revengeAt < doc.revengeFor && r.role === 'shock-cav') {
        const foe = this.nearestFoe(r, 0, Infinity);
        if (foe) {
          this.give(r, 'charge', foe.id);
          continue;
        }
      }
      // Our wing: enemy horse on it comes first.
      const wing = r.homeY < FIELD_H / 2 ? -1 : 1;
      const refused = plan === 'refuse' && wing !== g.strong;
      let enemyCav: Regiment | null = null;
      let bd = Infinity;
      for (const o of this.teamRegs[1 - t]!) {
        if (o.alive === 0 || o.routed || !isCav(o)) continue;
        if ((o.cy - FIELD_H / 2) * wing < -80) continue;
        const q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
        if (q < bd) {
          bd = q;
          enemyCav = o;
        }
      }
      const shooters = this.nearestFoe(r, 1, Infinity);
      const locked = this.nearestFoe(r, 3, Infinity);
      // An enemy with no line has no clash of lines to wait for (the knights would wait all day).
      const linesMet = ts.engaged || es.engaged || !es.hasLine;
      const open = strike === 'stage' && r.role !== 'horse-archer' && !(enemyCav && sqrt(bd) < 220) ? this.openPrey(r) : null;
      if (open) {
        // HORSE (round 3): outshot, but there is prey it can get at without riding into the bows'
        // massed fire (round to a flank, or bows on the march): it goes for that.
        this.give(r, 'flank', open.id, 1);
      } else if (strike === 'stage' && r.role !== 'horse-archer' && !(enemyCav && sqrt(bd) < 220)) {
        // Outshot: form up just out of bowshot, all the horse together, and wait for the word.
        this.stagePoint(t, r);
        this.give(r, 'reserve', -1, 0, -1, this.tmp[0]!, this.tmp[1]!);
      } else if (marshal && (r.role === 'shock-cav' || (signal && r.role === 'flank'))) {
        const cmd = this.commander[t]!;
        if (enemyCav && sqrt(bd) < 220) this.give(r, 'attack', enemyCav.id);
        else if (signal) {
          // The light horse goes with them, at the target's flank.
          // (Squares as products: `**` is Math.pow, which the spec lets each engine approximate.)
          const sx = signal.cx - r.cx;
          const sy = signal.cy - r.cy;
          const q = sqrt(sx * sx + sy * sy) - signal.radius - r.radius;
          // (Shooters caught in the open are ridden straight down, not taken in the rear.)
          const open = signal.role === 'missile' || signal.role === 'skirmish' || signal.role === 'siege';
          if (r.role === 'flank') this.give(r, 'flank', signal.id, open ? 0 : 1);
          else this.give(r, q < 160 ? 'charge' : 'flank', signal.id, open ? 0 : 3);
        } else if (g.signalAt >= 0) this.give(r, 'reserve', -1, 0, -1, clampX(this.d.x[cmd]! + dir * doc.recallTo), clampY(this.d.y[cmd]! + (r.homeY < FIELD_H / 2 ? -1 : 1) * 40));
        else this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
      } else if (r.role === 'shock-cav') {
        const go = linesMet || strike === 'go' || (plan === 'envelop' && this.tick > 200) || (early && this.tick > 320) || g.rashKnights;
        if (enemyCav && sqrt(bd) < 220) this.give(r, 'attack', enemyCav.id);
        else if (!go || (refused && !linesMet)) this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
        else if (locked && !(strike === 'go' && shooters && !linesMet)) this.give(r, 'flank', locked.id, 3);
        else if (shooters) this.give(r, 'flank', shooters.id, 0);
        else {
          const any = this.nearestFoe(r, 0, Infinity);
          this.give(r, any ? 'charge' : 'reserve', any ? any.id : -1);
        }
      } else {
        // (QA review #10: before the lines meet, by the general's use of his horse.)
        const free = linesMet || (g.horse === 'contest' && this.tick >= g.horseFrom);
        const meet = enemyCav !== null && sqrt(bd) < (g.horse === 'screen' ? HORSE_SCREEN : HORSE_MEET);
        if (refused && !(enemyCav && sqrt(bd) < 200)) this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
        else if (!free && !meet) {
          // On its wing, level with the line (a little behind its front), not left at the start.
          const x = ts.hasLine && (ts.frontX - dir * HORSE_WING - r.homeX) * dir > 0 ? ts.frontX - dir * HORSE_WING : r.homeX;
          this.give(r, 'reserve', -1, 0, -1, clampX(x), r.homeY);
        } else if (enemyCav) this.give(r, 'attack', enemyCav.id);
        else if (shooters) this.give(r, 'flank', shooters.id, 0);
        else if (locked) this.give(r, 'flank', locked.id, 3);
        else {
          const any = this.nearestFoe(r, 0, Infinity);
          this.give(r, any ? 'charge' : 'reserve', any ? any.id : -1);
        }
      }
      if (r.order === 'flank' && before !== 'flank') {
        const tg = this.regiments[r.ord.target]!;
        this.announce(t, r, 'flank', r.ord.side === 3 ? `sends the ${r.role === 'shock-cav' ? 'knights' : 'horse'} into the enemy's rear on the ${this.sideName(t, tg.cy)}` : `sends the horse after the enemy's ${tg.role === 'siege' ? 'engines' : 'archers'}`);
      }
    }
  }

  /**
   * Outshot by an enemy that stands off (its bows and crossbows worth more than STRIKE_OUTSHOT times ours)
   * before the lines meet, a General does not feed his horse into the arrows a block at a time,
   * nor leave it standing under them: he forms it up just out of their reach (`stagePoint`), and
   * when it is all there (or STRIKE_WAIT after he gave the order, or as soon as any of it is shot
   * at) sends it all in at once, the knights with it (T1: on the Marshal's signal), so it crosses
   * the beaten zone at the gallop in some ten seconds. 'stage', 'go', or null (not outshot, or
   * the lines have met first).
   */
  private horseStrike(t: number): 'stage' | 'go' | null {
    const g = this.generals[t]!;
    if (g.strikeAt >= 0) return 'go';
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    if (ts.engaged || es.engaged || !es.hasLine || this.tick < 20) return null;
    // (Their bows and crossbows against ours: javelins and horse archers do not keep horse at bay.)
    const mine = this.volleyFire(t);
    const foe = this.volleyFire(1 - t);
    if (foe < 1 || foe < STRIKE_OUTSHOT * mine) return null;
    // (Bows shot nearly out are no wall: SENSE.spent.)
    let horse = 0;
    let there = 0;
    let shot = false;
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0 || r.routed || (r.role !== 'flank' && r.role !== 'shock-cav')) continue;
      horse++;
      if (!this.stagePoint(t, r)) return null;
      const dx = this.tmp[0]! - r.cx;
      const dy = this.tmp[1]! - r.cy;
      if (dx * dx + dy * dy < STRIKE_THERE * STRIKE_THERE) there++;
      for (const e of this.teamRegs[1 - t]!) {
        if (e.alive === 0 || e.routed || e.role !== 'missile' || e.ammoLeft === 0) continue;
        const ex = e.cx - r.cx;
        const ey = e.cy - r.cy;
        const reach = this.stats[1 - t]![e.cls]!.range + e.radius + r.radius;
        if (ex * ex + ey * ey < reach * reach) shot = true;
      }
    }
    if (horse === 0) return null;
    if (g.stageAt < 0) {
      g.stageAt = this.tick;
      this.announce(t, null, 'reserve', 'forms his horse up out of bowshot');
    }
    // HORSE (round 3): he no longer sends it all across the open at the bows together (Crécy):
    // shot at where it stands, it draws back further; it waits there until the bows are locked in
    // a fight (the lines have met), have shot themselves out, or are no longer worth the ride
    // (`bowsDeadly`), or the enemy's horse comes. (Until then `cavalryOrders` keeps it there.)
    if (shot) g.stageBack = Math.min(SENSE.stageBackMax, g.stageBack + SENSE.stageBackStep);
    void there;
    return 'stage';
  }

  /** A side's formed shooters with shot left (bows, crossbows, guns): damage a tick, as `forces` reckons it. */
  private volleyFire(t: number): number {
    let f = 0;
    for (const r of this.teamRegs[t]!) {
      if (r.alive === 0 || r.routed || r.role !== 'missile' || r.ammoLeft === 0) continue;
      const st = this.stats[t]![r.cls]!;
      f += ((r.alive * st.missileDamage) / fireEvery(st)) * this.arrowsLeft(r, st);
    }
    return f;
  }

  /** HORSE (round 3): how much of its fire a block of shooters still has, by its arrows left: 1 down to SENSE.spent of a full quiver, less below. */
  private arrowsLeft(r: Regiment, st: UnitStats): number {
    if (st.ammo <= 0 || r.alive === 0) return 0;
    return Math.min(1, r.ammoLeft / (r.alive * st.ammo * SENSE.spent));
  }

  /**
   * HORSE (round 3): the fire (as `volleyFire` reckons it) of side `1 - t`'s formed shooters
   * not locked in a fight, with arrows left, whose reach (and `pad` more) covers (x, y), of those
   * that shoot at least `minRange`.
   */
  private bowCover(t: number, x: number, y: number, pad = 0, minRange = 0, fromX = NaN, fromY = NaN): number {
    let f = 0;
    const arc = !Number.isNaN(fromX);
    for (const e of this.teamRegs[1 - t]!) {
      if (e.alive === 0 || e.routed || e.role !== 'missile' || e.ammoLeft === 0 || e.engaged) continue;
      const st = this.stats[1 - t]![e.cls]!;
      if (st.range < minRange) continue;
      const R = st.range + e.radius + pad;
      const dx = e.cx - x;
      const dy = e.cy - y;
      if (dx * dx + dy * dy > R * R) continue;
      // (From `from`: before its front its whole fire, from its flank less, from its rear least:
      // the men must turn about in their ranks, and shoot no faster nor flat: RAPID.)
      let k = 1;
      if (arc) {
        const ax = fromX - e.cx;
        const ay = fromY - e.cy;
        const aq = sqrt(ax * ax + ay * ay) || 1;
        const dot = (ax * e.fx + ay * e.fy) / aq;
        k = dot > 0.3 ? 1 : dot > -0.3 ? SENSE.sideK : SENSE.rearK;
      }
      // (Bows on the march must halt and loose: horse that catches them so gets in under fewer arrows.)
      if (e.mode === 'advance' || e.mode === 'reserve') k *= SENSE.marching;
      f += ((e.alive * st.missileDamage) / fireEvery(st)) * this.arrowsLeft(e, st) * k;
    }
    return f;
  }

  /**
   * HORSE (round 3): the enemy foot block nearest horse block `r` that it can get at without riding
   * into massed fire (`bowsDeadly`), straight or round its open flank (`flankWay`); shooters first.
   */
  private openPrey(r: Regiment): Regiment | null {
    let best: Regiment | null = null;
    let bs = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || isCav(o) || o.role === 'command') continue;
      // (Not spears standing to receive horse: see RIDER.)
      if (!o.engaged && this.stats[1 - r.team]![o.cls]!.antiCav > 1.5) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const sc = sqrt(dx * dx + dy * dy) - (o.role === 'missile' || o.role === 'siege' ? 400 : 0);
      if (sc >= bs) continue;
      if (this.bowsDeadly(r, o.cx, o.cy, r.cx, r.cy, o) && !this.flankWay(r, o)) continue;
      bs = sc;
      best = o;
    }
    return best;
  }

  /** HORSE (round 3): riders of block `r` still on their horses. */
  private riders(r: Regiment): number {
    let n = 0;
    for (const id of r.members) if (this.d.state[id] === State.Fighting && this.d.mt[id]) n++;
    return n;
  }

  /**
   * HORSE (round 3): whether a ride by horse block `r` to (x, y) would be a ride into the bows' massed
   * fire: the shooters covering it shoot more than SENSE.deadly a tick for each rider it has.
   */
  private bowsDeadly(r: Regiment, x: number, y: number, fromX = r.cx, fromY = r.cy, prey: Regiment | null = null): boolean {
    // (The bows' fire is shared among all the horse that goes in: the General sends it together.)
    let force = 0;
    for (const o of this.teamRegs[r.team]!) if (o !== r && o.alive > 0 && !o.routed && (o.role === 'flank' || o.role === 'shock-cav')) force += this.riders(o);
    const riders = this.riders(r);
    // (Foot that is not shooters: once the horse is in among it, the bows behind it must hold
    // their shot for their own men (danger close), so only the ride in is under their fire.)
    const foot = prey && prey.role !== 'missile' && prey.role !== 'siege' ? SENSE.footPrey : 1;
    return this.bowCover(r.team, x, y, SENSE.pad, 0, fromX, fromY) > SENSE.deadly * foot * Math.max(1, riders + force * SENSE.together);
  }

  /**
   * HORSE (round 3): a way round to the open flank of `prey` (into tmp) from which a ride in at it
   * is not into massed fire (`bowsDeadly` from there), `wide` beyond its end and `behind` back
   * from its front, with no other enemy foot standing there; the nearer of the two sides. False
   * if neither side is open.
   */
  private flankWay(r: Regiment, prey: Regiment): boolean {
    const lx = -prey.fy;
    const ly = prey.fx;
    let best = Infinity;
    let bx = 0;
    let by = 0;
    for (const sg of [-1, 1]) {
      const px = prey.cx + lx * sg * (prey.width * 0.5 + SENSE.wide) - prey.fx * (prey.depth * 0.5 + SENSE.behind);
      const py = prey.cy + ly * sg * (prey.width * 0.5 + SENSE.wide) - prey.fy * (prey.depth * 0.5 + SENSE.behind);
      if (px < 40 || px > FIELD_W - 40 || py < 40 || py > FIELD_H - 40) continue;
      if (this.bowsDeadly(r, prey.cx, prey.cy, px, py, prey)) continue;
      let blocked = false;
      for (const o of this.teamRegs[1 - r.team]!) {
        if (o === prey || o.alive === 0 || o.routed || isCav(o)) continue;
        const ox = o.cx - px;
        const oy = o.cy - py;
        const R = o.radius + SENSE.wide * 0.75;
        if (ox * ox + oy * oy < R * R) blocked = true;
      }
      if (blocked) continue;
      const q = (px - r.cx) * (px - r.cx) + (py - r.cy) * (py - r.cy);
      if (q < best) {
        best = q;
        bx = px;
        by = py;
      }
    }
    if (best === Infinity) return false;
    this.tmp[0] = bx;
    this.tmp[1] = by;
    return true;
  }

  /**
   * HORSE (round 3): a spot (into tmp) out of the reach of the bows about `from`, back the way
   * block `r` came (away from `from`, toward its own side): the first of a few steps there where
   * no formed bow covers it (true), else the furthest (false: nowhere to draw back to).
   */
  private outOfBowshot(r: Regiment, from: Regiment): boolean {
    const dir = r.team === 0 ? 1 : -1;
    let ux = r.cx - from.cx;
    let uy = r.cy - from.cy;
    const q = sqrt(ux * ux + uy * uy) || 1;
    // (Back toward our own side, more than straight away from it.)
    ux = ux / q - dir;
    uy = uy / q;
    const m = sqrt(ux * ux + uy * uy) || 1;
    ux /= m;
    uy /= m;
    let x = r.cx;
    let y = r.cy;
    let clear = false;
    for (let k = 1; k <= 8 && !clear; k++) {
      x = clampX(r.cx + ux * 100 * k);
      y = clampY(r.cy + uy * 100 * k);
      clear = this.bowCover(r.team, x, y, SENSE.pad + 20) === 0;
    }
    this.tmp[0] = x;
    this.tmp[1] = y;
    return clear;
  }

  /**
   * Where block `r` of horse forms up out of bowshot (into tmp): STRIKE_MARGIN beyond the reach of
   * the enemy's foremost shooters, level with its own place in the line (knights a length
   * behind the light horse), never back behind that place. False if they have no shooters.
   */
  private stagePoint(t: number, r: Regiment): boolean {
    const dir = t === 0 ? 1 : -1;
    let front = Infinity;
    for (const e of this.teamRegs[1 - t]!) {
      if (e.alive === 0 || e.routed || e.role !== 'missile' || e.ammoLeft === 0) continue;
      // Its reach toward us, along the axis of the field.
      const x = (e.cx * dir - e.radius) - this.stats[1 - t]![e.cls]!.range;
      if (x < front) front = x;
    }
    if (front === Infinity) return false;
    const back = this.generals[t]!.stageBack;
    let x = front * dir - dir * (STRIKE_MARGIN + back + r.radius + (r.role === 'shock-cav' ? 50 : 0));
    // (Never back behind its own place, unless shot at there: HORSE round 3, `stageBack`.)
    if ((x - r.homeX) * dir < 0 && back === 0) x = r.homeX;
    x = t === 0 ? Math.max(SENSE.edge, x) : Math.min(FIELD_W - SENSE.edge, x);
    this.tmp[0] = clampX(x);
    this.tmp[1] = r.homeY;
    return true;
  }

  /**
   * T1: the Marshal's signal. Once the lines are locked, when an enemy block locked with ours
   * falters (its morale under Doctrine.signalMorale; the fearless, when it is under
   * `signalSpent` of its men), or at the general charge, or `signalLate` after contact, and his
   * knights have re-formed, he unfurls the Beauséant: every knight rides at that one block (the
   * weakest locked with our line, else the nearest archers). The signal holds `signalHold`
   * ticks or until the block is gone or runs; then they rally to him for the next, at most
   * every `signalEvery`. Returns the signal's target, or null.
   */
  private marshalSignal(t: number, won: boolean): Regiment | null {
    const g = this.generals[t]!;
    const doc = this.doc[t]!;
    if (g.signalTarget >= 0) {
      const e = this.regiments[g.signalTarget]!;
      if (e.alive > 0 && !e.routed && this.tick - g.signalAt < doc.signalHold) return e;
      g.signalTarget = -1;
    }
    const ts = this.ts[t]!;
    const es = this.ts[1 - t]!;
    // (Outshot, the horse sent in together at the shooters: he gives the signal with it, and
    // again at the next shooters as soon as the last are gone.)
    const strike = g.strikeAt >= 0 && !(ts.engaged || es.engaged);
    if (won || !(ts.engaged || es.engaged || !es.hasLine || g.strikeAt >= 0)) return null;
    if (!strike && g.signalAt >= 0 && this.tick - g.signalAt < doc.signalEvery) return null;
    let ready: Regiment | null = null;
    for (const r of this.teamRegs[t]!) {
      if (r.role !== 'shock-cav' || r.alive === 0 || r.routed || r.engaged || r.mode === 'withdraw' || r.mode === 'charge') continue;
      ready = r;
      break;
    }
    if (!ready) return null;
    let best: Regiment | null = null;
    let bs = Infinity;
    for (const e of this.teamRegs[1 - t]!) {
      if (e.alive === 0 || e.routed || !e.engaged || !(isFoot(e) || e.role === 'command')) continue;
      const score = e.morale + 40 * (e.alive / e.start);
      if (score < bs) {
        bs = score;
        best = e;
      }
    }
    const faltering = best !== null && (this.fearless[1 - t] ? best.alive < best.start * doc.signalSpent : best.morale < doc.signalMorale);
    const late = ts.contactAt >= 0 && this.tick - ts.contactAt > doc.signalLate;
    if (!faltering && g.chargedAt < 0 && !late && g.strikeAt < 0) return null;
    const target = best ?? this.nearestFoe(ready, 1, Infinity) ?? this.nearestFoe(ready, 0, Infinity);
    if (!target) return null;
    g.signalAt = this.tick;
    g.signalTarget = target.id;
    this.events.push({ tick: this.tick, team: t, kind: 'doctrine', cls: U.Knights, reg: target.id, note: 'marshal-charge', side: this.sideName(t, target.cy) });
    return target;
  }

  /** Every regiment of the line in the pool gets a place against the enemy line: a front, a flank or a rear. */
  private assignLines(t: number, ours: Regiment[]): void {
    if (ours.length === 0) return;
    const foes: Regiment[] = [];
    for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed && o.role === 'line') foes.push(o);
    if (foes.length === 0) for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed && !isCav(o)) foes.push(o);
    // Only horse left: go at them all the same (standing in reserve would never end the day).
    if (foes.length === 0) for (const o of this.teamRegs[1 - t]!) if (o.alive > 0 && !o.routed) foes.push(o);
    if (foes.length === 0) {
      for (const r of ours) r.targetReg = -1;
      return;
    }
    const E = foes.length;
    const taken = new Uint8Array(E * 4);
    const done = new Uint8Array(ours.length);
    // Locked in melee: keep the enemy in hand.
    for (let i = 0; i < ours.length; i++) {
      const r = ours[i]!;
      if (!r.engaged || r.targetReg < 0) continue;
      const e = foes.indexOf(this.regiments[r.targetReg]!);
      if (e < 0) continue;
      taken[e * 4 + r.slot] = 1;
      done[i] = 1;
    }
    // Places already taken by regiments supporting a friend.
    for (const o of this.teamRegs[t]!) {
      if (o.order !== 'support' || o.ord.target < 0) continue;
      const e = foes.indexOf(this.regiments[o.ord.target]!);
      if (e >= 0) taken[e * 4 + o.ord.side] = 1;
    }
    const cost = new Float64Array(ours.length * E * 4);
    const tmp = this.tmp;
    const C = COHESION;
    const curl = this.fearless[1 - t] ? 0 : this.doc[t]!.loose.curl;
    for (let i = 0; i < ours.length; i++) {
      const r = ours[i]!;
      for (let e = 0; e < E; e++) {
        const o = foes[e]!;
        for (let k = 0; k < 4; k++) {
          let c = Infinity;
          if (!(k === 3 && foes.length > 1 && ours.length <= E * 2)) {
            slotPos(o, k, r.depth, tmp);
            const px = tmp[0]!;
            const py = tmp[1]!;
            // A front can always be reached (the goal is clamped to the field); a flank or rear
            // against the edge of the field cannot.
            if (k === 0 || (px > 10 && px < FIELD_W - 10 && py > 10 && py < FIELD_H - 10 && !this.blocked(px, py, o, r.depth))) {
              const dx = px - r.ax;
              const dy = py - r.ay;
              // P6: the flank of an enemy block already locked with one of ours is the place to
              // go for a block with nothing in front of it (more so for those who wrap: the
              // faction's `loose.curl`).
              const flank = o.engaged && k !== 3 ? Math.max(C.flankEngaged, 90 - 110 * Math.min(1, curl)) : 90;
              c = sqrt(dx * dx + dy * dy) + (k === 0 ? 0 : k === 3 ? 170 : r.committed ? Math.min(20, flank) : flank);
              if (r.targetReg === o.id && r.slot === k) c -= 60;
            }
          }
          cost[(i * E + e) * 4 + k] = c;
        }
      }
    }
    for (;;) {
      let best = Infinity;
      let bi = -1;
      let bj = -1;
      for (let i = 0; i < ours.length; i++) {
        if (done[i]) continue;
        const row = i * E * 4;
        for (let j = 0; j < E * 4; j++) {
          if (taken[j]) continue;
          const c = cost[row + j]!;
          if (c < best) {
            best = c;
            bi = i;
            bj = j;
          }
        }
      }
      if (bi < 0) break;
      const r = ours[bi]!;
      done[bi] = 1;
      taken[bj] = 1;
      r.targetReg = foes[(bj / 4) | 0]!.id;
      r.slot = bj % 4;
    }
    for (let i = 0; i < ours.length; i++) if (!done[i]) ours[i]!.targetReg = -1;
  }

  /** Whether a flank or rear place is filled by another enemy block. */
  private blocked(px: number, py: number, owner: Regiment, depth: number): boolean {
    for (const o of this.teamRegs[owner.team]!) {
      if (o === owner || o.alive === 0 || o.routed) continue;
      const dx = px - o.cx;
      const dy = py - o.cy;
      const rr = o.radius * 0.85 + depth * 0.5 + 4;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ the captains

  /** Recounts a regiment: its living men, centre, spread, ammunition and whether it is in contact. */
  private survey(r: Regiment): void {
    const d = this.d;
    // A formed block is the men in its ranks. Runners who did not stop when it rallied, and men
    // who have fallen in and are still on their way to their places (`jn`), are not: its centre
    // (where its standard is carried), its reach and its anchor keep to the men who stand.
    // (Until v17 they counted, and a rallied block's standard hung over empty grass, it took in
    // fugitives from across the field, and it marched to its own rear to fetch them.)
    const formed = !r.routed;
    const atPlace = Math.max(12, r.spacing * 3);
    // HORSE: riders on foot with a mounted block are not in its ranks (they go their own way).
    const afoot = formed && isMounted(r);
    let n = 0;
    let ammo = 0;
    let fighting = 0;
    let msx = 0;
    let msy = 0;
    let mx = 0;
    let my = 0;
    let rn = 0;
    let sx = 0;
    let sy = 0;
    for (const id of r.members) {
      const st = d.state[id]!;
      if (st > State.Routing || (formed && st === State.Routing)) continue;
      n++;
      ammo += d.ammo[id]!;
      if (afoot && d.dm[id] === 1) continue;
      if (d.jn[id]) {
        // Near his place now, or fighting: he is in the ranks.
        const gx = r.ax + r.fx * d.sy[id]! - r.fy * d.sx[id]! - d.x[id]!;
        const gy = r.ay + r.fy * d.sy[id]! + r.fx * d.sx[id]! - d.y[id]!;
        if (st !== State.Fighting || d.target[id]! >= 0 || gx * gx + gy * gy < atPlace * atPlace) d.jn[id] = 0;
        else continue;
      }
      rn++;
      sx += d.x[id]!;
      sy += d.y[id]!;
      if (st === State.Fighting && !d.cu[id]) {
        // (Men swinging round the enemy's flank are out of their places by design: the anchor
        // keeps to the rest.)
        fighting++;
        msx += d.sx[id]!;
        msy += d.sy[id]!;
        mx += d.x[id]!;
        my += d.y[id]!;
      }
    }
    r.alive = n;
    r.ammoLeft = ammo;
    if (n === 0) {
      r.engaged = false;
      r.contact = false;
      return;
    }
    // (All of them on their way to their places: they gather where they are.)
    const all = rn === 0;
    if (all) {
      for (const id of r.members) {
        if (d.state[id]! !== State.Fighting) continue;
        rn++;
        sx += d.x[id]!;
        sy += d.y[id]!;
      }
    }
    r.cx = sx / rn;
    r.cy = sy / rn;
    let far = 0;
    let engaged = 0;
    for (const id of r.members) {
      const st = d.state[id]!;
      if (st > State.Routing || (formed && st === State.Routing)) continue;
      if (afoot && d.dm[id] === 1) continue;
      const t = d.target[id]!;
      // (A man finishing a rider on the ground is not his block's fight: see `fallen`.)
      if (t >= 0 && !(d.dm[t]! > 0 && d.stun[t]! > 0 && !isMounted(r))) {
        const ex = d.x[t]! - d.x[id]!;
        const ey = d.y[t]! - d.y[id]!;
        // (In the fight: within his own reach or his foe's: a man held at the points is fighting.)
        const reach = d.rad[id]! + d.rad[t]! + Math.max(d.rc[id]!, d.rc[t]!) + 1.4;
        if (ex * ex + ey * ey <= reach * reach) engaged++;
      }
      if (d.jn[id] && !all) continue;
      const dx = d.x[id]! - r.cx;
      const dy = d.y[id]! - r.cy;
      const q = dx * dx + dy * dy;
      if (q > far) far = q;
    }
    r.radius = sqrt(far) + 3;
    r.engaged = engaged >= Math.max(2, n * 0.06) || (n < 8 && engaged > 0);
    r.fightShare = engaged / n;
    if (r.engaged) r.everEngaged = true;
    // Keep the anchor with the men: a block held by the enemy does not walk on without them.
    if (fighting > 0 && !r.routed) {
      msx /= fighting;
      msy /= fighting;
      const ix = mx / fighting - (r.fx * msy - r.fy * msx);
      const iy = my / fighting - (r.fy * msy + r.fx * msx);
      const dx = r.ax - ix;
      const dy = r.ay - iy;
      const q = sqrt(dx * dx + dy * dy);
      // Locked in melee the anchor stays with the men: run ahead of them, it would have the rear
      // ranks shove the front through the enemy.
      const leash = r.engaged ? 1.5 : Math.max(8, r.speed * PACE[r.mode] * 0.6);
      if (q > leash) {
        // It closes on them no faster than they can run (over the ticks since the last look): the
        // men's mean place jumps when one falls or the files close up, and the anchor (and the
        // slots, and the standard) used to jump with it, at twice a man's running pace and more.
        const step = Math.min(q - leash, r.speed * TICK_S * 5);
        r.ax -= (dx * step) / q;
        r.ay -= (dy * step) / q;
        // (A block pulled after its men has moved: its shooters do not loose this moment.)
        r.movedAt = this.tick;
      }
    }
    // In contact: an enemy block close enough that its men should look for foes. Count the
    // enemy close by, for being outnumbered.
    let contact = false;
    let near = 0;
    let gap = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + 24;
      const q = dx * dx + dy * dy;
      if (!o.routed && q < (rr + COHESION.nearFrom) * (rr + COHESION.nearFrom)) gap = Math.min(gap, sqrt(q) - rr);
      if (q < rr * rr) {
        contact = true;
        if (!o.routed && o.engaged) near += o.alive * this.stats[o.team]![o.cls]!.value;
      }
    }
    r.contact = contact;
    r.closeIn = contact ? 1 : gap < COHESION.nearFrom ? 1 - gap / COHESION.nearFrom : 0;
    const own = this.stats[r.team]![r.cls]!.value;
    r.enemyNear = near / own;
    // And the friends fighting alongside it, by the same measure: outnumbered is the enemy
    // close by against ours close by, not against this block alone.
    let friends = 0;
    if (near > 0 && !this.fearless[r.team]) {
      for (const o of this.teamRegs[r.team]!) {
        if (o === r || o.alive === 0 || o.routed || !o.engaged) continue;
        const dx = o.cx - r.cx;
        const dy = o.cy - r.cy;
        const rr = o.radius + r.radius + 24;
        if (dx * dx + dy * dy < rr * rr) friends += o.alive * this.stats[o.team]![o.cls]!.value;
      }
    }
    r.friendNear = friends / own;
  }

  private setMode(r: Regiment, m: Mode): void {
    if (r.mode === m) return;
    if (m !== 'charge') r.held = false;
    if (m === 'shoot' && r.role !== 'missile') {
      // Skirmishers, horse archers and engines open up together, then each shoots as he can.
      const d = this.d;
      for (const id of r.members) if (d.cd[id]! > 5) d.cd[id] = this.rng.int(6);
    } else if (m === 'shoot' && r.volleyAt < this.tick + VOLLEY_BEAT) {
      // Formed shooters: "make ready... present..." before the first volley.
      r.volleyAt = this.tick + VOLLEY_BEAT;
    }
    r.mode = m;
    r.modeAt = this.tick;
  }

  /** Points the regiment's wheel at (x, y). */
  private faceToward(r: Regiment, x: number, y: number): void {
    const dx = x - r.ax;
    const dy = y - r.ay;
    const q = sqrt(dx * dx + dy * dy);
    if (q > 1) {
      r.dfx = dx / q;
      r.dfy = dy / q;
    }
  }

  private goal(r: Regiment, x: number, y: number): void {
    r.tx = clampX(x);
    r.ty = clampY(y);
  }

  /**
   * RIDER (battle v17): horse and the general's household ride round friendly blocks, not through
   * them. A goal inside a friend's footprint (and a rider's room about it) is moved out of it, to
   * the side of him the block stands on, by the shorter way; a straight ride to the goal that
   * would cross a friend makes for the end of that friend nearer the line of the ride, a rider's
   * room clear of it, and on from there (up to three friends deep). Foot is
   * always ridden round; another block of horse only by the one without the right of way
   * (`rightOfWay`), so two lines of horse do not both swerve. Rewrites the anchor's goal (tx, ty)
   * at each word, keeping the captain's in (gx0, gy0): whatever set tx, ty since the last rewrite
   * (`rideX`, `rideY`) is his.
   */
  private rideRound(r: Regiment): void {
    if (r.alive === 0 || r.routed || r.engaged || r.mode === 'pursue' || r.mode === 'melee' || r.mode === 'rout') return;
    if (r.tx !== r.rideX || r.ty !== r.rideY) {
      r.gx0 = r.tx;
      r.gy0 = r.ty;
    }
    // (Room for its half-width, more for riders spread out as they ride out, see `move`.)
    const room = r.width * 0.5 * (r.mode === 'withdraw' ? RIDER.rallySpread : 1) + RIDER.room;
    const friends = this.teamRegs[r.team]!;
    const obstacle = (o: Regiment): boolean => {
      if (o === r || o.alive === 0 || o.routed || o.role === 'skirmish' || o.role === 'siege' || o.slip || o.mode === 'skirmish' || o.mode === 'pursue' || o.mode === 'rout') return false;
      if (isMounted(o) && (o.mode === 'charge' || o.mode === 'withdraw' || o.mode === 'flank') && this.rightOfWay(r, o)) return false;
      return true;
    };
    let gx = r.gx0;
    let gy = r.gy0;
    // The point out of any friend it lies in, on the side of him the block stands on (so it need
    // not ride round him to get there), across or along him, whichever is the shorter.
    const out = (): void => {
      for (const o of friends) {
        if (!obstacle(o)) continue;
        const ocx = o.ax - o.fx * o.depth * 0.5;
        const ocy = o.ay - o.fy * o.depth * 0.5;
        const ex = gx - ocx;
        const ey = gy - ocy;
        const lat = ex * -o.fy + ey * o.fx;
        const fwd = ex * o.fx + ey * o.fy;
        if ((lat < 0 ? -lat : lat) >= o.width * 0.5 + room || (fwd < 0 ? -fwd : fwd) >= o.depth * 0.5 + room) continue;
        const rx = r.cx - ocx;
        const ry = r.cy - ocy;
        const sl = rx * -o.fy + ry * o.fx >= 0 ? 1 : -1;
        const sf = rx * o.fx + ry * o.fy >= 0 ? 1 : -1;
        const pl = o.width * 0.5 + room - lat * sl;
        const pf = o.depth * 0.5 + room - fwd * sf;
        if (pl < pf) {
          gx += -o.fy * sl * pl;
          gy += o.fx * sl * pl;
        } else {
          gx += o.fx * sf * pf;
          gy += o.fy * sf * pf;
        }
      }
    };
    out();
    // The ride there round the first friend in the way: past his end nearer the line of the ride
    // (level with his far side), a rider's room off; and that point clear of the others.
    for (let k = 0; k < 3; k++) {
      const dx = gx - r.ax;
      const dy = gy - r.ay;
      const L = sqrt(dx * dx + dy * dy);
      if (L <= 1) break;
      const ux = dx / L;
      const uy = dy / L;
      const px = -uy;
      const py = ux;
      let best = Infinity;
      let wx = gx;
      let wy = gy;
      for (const o of friends) {
        if (!obstacle(o)) continue;
        const ocx = o.ax - o.fx * o.depth * 0.5;
        const ocy = o.ay - o.fy * o.depth * 0.5;
        const t = (ocx - r.ax) * ux + (ocy - r.ay) * uy;
        const l = (ocx - r.ax) * px + (ocy - r.ay) * py;
        const lox = -o.fy;
        const loy = o.fx;
        const eu = o.width * 0.5 * Math.abs(lox * ux + loy * uy) + o.depth * 0.5 * Math.abs(o.fx * ux + o.fy * uy);
        const ep = o.width * 0.5 * Math.abs(lox * px + loy * py) + o.depth * 0.5 * Math.abs(o.fx * px + o.fy * py);
        if (t + eu < 0 || t - eu > L || (l < 0 ? -l : l) >= ep + room || t >= best) continue;
        best = t;
        const sg = l > 0 ? -1 : l < 0 ? 1 : (FIELD_H / 2 - r.ay) * py + (FIELD_W / 2 - r.ax) * px >= 0 ? 1 : -1;
        const along = Math.max(0, Math.min(L, t + eu));
        wx = r.ax + ux * along + px * (l + sg * (ep + room));
        wy = r.ay + uy * along + py * (l + sg * (ep + room));
      }
      if (best === Infinity) break;
      gx = wx;
      gy = wy;
      out();
    }
    r.tx = r.rideX = clampX(gx);
    r.ty = r.rideY = clampY(gy);
  }


  /** The regiment's captain: carries out its order with what it sees, picks its stance. */
  private think(r: Regiment): void {
    this.survey(r);
    if (r.alive === 0) return;
    const doc = this.doc[r.team]!;
    if (doc.tide !== 1) r.nearLord = this.lordWithin(r.team, r.cx, r.cy, doc.tideNear);
    if (doc.firstSpear > 0 && r.engaged && r.role === 'line' && !r.routed) this.firstSpear(r);
    // P5: the files of the line close up on the fallen every 1.5-2.5 s (the regiment's own beat),
    // not every think, so a hole in the front shows a moment before the man behind steps up.
    if (r.reflow && !r.routed && (r.role !== 'line' || this.tick - r.reflowAt >= COHESION.reflow + ((r.id * 7) % COHESION.reflowSpread))) {
      r.reflowAt = this.tick;
      this.closeRanks(r);
    }
    this.fatigue(r);
    if (r.routed) {
      this.thinkRouted(r);
      return;
    }
    // Runners who did not stop when it rallied run on, round any enemy in their way.
    if (r.rallies > 0) {
      const edge = r.team === 0 ? -1 : 1;
      for (const id of r.members) if (this.d.state[id] === State.Routing) this.dodge(id, edge);
    }
    this.morale(r);
    if (r.routed) return;
    if (r.dangerShots > 0) {
      // Most of its shots held for our own men near the target: shift to another for a while.
      if (r.dangerShots > r.fired && r.targetReg >= 0) {
        r.fouled = r.targetReg;
        r.fouledUntil = this.tick + DANGER.foul;
      }
      r.dangerShots = 0;
    }
    r.fired = 0;
    switch (r.role) {
      case 'line':
        this.thinkLine(r);
        break;
      case 'missile':
        if (this.drawn(r)) this.thinkLine(r);
        else this.thinkMissile(r);
        break;
      case 'skirmish':
        if (this.drawn(r)) this.thinkLine(r);
        else this.thinkSkirmish(r);
        break;
      case 'flank':
        this.thinkCav(r, false);
        break;
      case 'shock-cav':
        this.thinkCav(r, true);
        break;
      case 'horse-archer':
        if (r.ammoLeft === 0) this.thinkCav(r, false);
        else this.thinkHorseArcher(r);
        break;
      case 'siege':
        this.thinkSiege(r);
        break;
      case 'command':
        this.thinkCommand(r);
        break;
    }
    if (isMounted(r)) this.rideRound(r);
    this.chooseStance(r);
  }

  /**
   * Shooters and skirmishers who fight as foot of the line: shooters out of shot; and late in the
   * day (LATE), with no line of their own left before them, or idle (shooters with nothing to
   * shoot at for MISSILE_SEEK, skirmishers fallen back behind the line). (Until v16 they kept
   * their shot to the end: in the biggest battles, which run long, the last of both armies were
   * often blocks of archers trading arrows at long range, or standing idle behind a melee of a
   * few blocks, until the time limit.)
   */
  private drawn(r: Regiment): boolean {
    if (r.role === 'missile' && r.ammoLeft === 0) return true;
    if (this.tick <= LATE || (r.role !== 'missile' && r.role !== 'skirmish')) return false;
    if (!this.ts[r.team]!.hasLine) return true;
    return r.role === 'missile' ? this.tick - r.aimedAt > MISSILE_SEEK : r.retired;
  }

  /** S2: the first samurai block of the line to strike claims the first spear: heart for it and for those near it. */
  private firstSpear(r: Regiment): void {
    const g = this.generals[r.team]!;
    if (g.firstSpearAt >= 0) return;
    g.firstSpearAt = this.tick;
    const doc = this.doc[r.team]!;
    r.morale = Math.min(100, r.morale + doc.firstSpear);
    for (const o of this.teamRegs[r.team]!) {
      if (o === r || o.alive === 0 || o.routed) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < doc.firstSpearNear * doc.firstSpearNear) o.morale = Math.min(100, o.morale + doc.firstSpearLift);
    }
    this.events.push({ tick: this.tick, team: r.team, kind: 'doctrine', cls: r.cls, reg: r.id, note: 'first-spear' });
  }

  private fatigue(r: Regiment): void {
    const m = r.mode;
    const run = m === 'charge' || m === 'withdraw' || m === 'pursue' || m === 'flank' || m === 'kite' || m === 'skirmish' || m === 'rout';
    const k = run ? FATIGUE.run * (isCav(r) ? 0.6 : 1) : r.engaged ? FATIGUE.fight * Math.min(1, r.fightShare / FATIGUE.fightShare) : m === 'advance' || m === 'reserve' ? 0.001 : FATIGUE.rest;
    let climb = 0;
    // TERRAIN: climbing tires, the more at a run.
    if (!this.flat && (r.vax !== 0 || r.vay !== 0)) {
      const v = sqrt(r.vax * r.vax + r.vay * r.vay);
      const g = this.terrain.grade(this.terrain.index(r.ax, r.ay), r.vax / v, r.vay / v);
      if (g > 0) climb = g * (run ? TERRAIN.climbRunTire : TERRAIN.climbTire);
    }
    r.fatigue = Math.max(0, Math.min(1, r.fatigue + k + climb + (m === 'charge' && r.ragged ? FATIGUE.run * 1.5 : 0)));
  }

  /** Morale settles toward what the regiment's plight is worth (see MORALE); shocks knock it down at once. */
  private morale(r: Regiment): void {
    const M = MORALE;
    r.recent *= 0.9;
    r.recentKills *= 0.9;
    r.arrows *= 0.8;
    const team = r.team;
    // The dead know no fear: nothing to weigh (`arrows` still sets their stance).
    if (this.fearless[team]) return;
    r.flankShock = Math.min(M.flankCap, r.flankShock * 0.9);
    // HORSE: to a block of horse a rider unhorsed is half a rider lost.
    let up = r.alive;
    if (isMounted(r) && !r.routed) for (const id of r.members) if (this.d.dm[id] === 1 && this.d.state[id] === State.Fighting) up -= HORSE.lossShare;
    let target = r.baseMorale - M.casualtiesTotal * (1 - up / r.start) - M.casualtyRate * r.recent - r.flankShock;
    target += Math.min(M.winning, Math.max(-6, (r.recentKills - r.recent) * 120));
    target -= Math.min(M.outnumberedCap, Math.max(0, r.enemyNear / Math.max(1, r.alive + r.friendNear) - M.outnumberedFrom) * M.outnumbered);
    target -= Math.min(20, r.arrows * M.missileFear * (r.green ? M.greenFear : 1));
    target -= r.fatigue * M.fatigue;
    const cmd = this.commander[team]!;
    if (cmd >= 0 && this.d.state[cmd] === State.Fighting) {
      const dx = this.d.x[cmd]! - r.cx;
      const dy = this.d.y[cmd]! - r.cy;
      // S1: the daimyō's uma-jirushi is seen further and heartens more (Doctrine.aura).
      const doc = this.doc[team]!;
      const range = M.auraRange * doc.auraRange * this.auraK[team]!;
      if (dx * dx + dy * dy < range * range) target += M.aura * doc.aura * (0.5 + this.generals[team]!.skill * 0.6);
    }
    if (this.commanderFell[team]) target -= M.generalDead * this.doc[team]!.generalDead;
    // The whole army's fortunes: a losing army loses heart, a winning one takes it.
    target -= Math.max(0, this.ts[team]!.loss - M.armyLossFrom) * M.armyLoss;
    target += Math.max(0, this.ts[1 - team]!.loss - M.armyLossFrom) * M.armyLoss * 0.5;
    if (this.broken[1 - team]) target += M.enemyBroken;
    if (this.generals[team]!.trait === 'iron-discipline') target += 8;
    target += this.generals[team]!.mood;
    r.morale += (target - r.morale) * M.recover;
    if (r.morale > 100) r.morale = 100;
    if (r.morale < M.breakAt) {
      // T3 Not while the Beauséant flies: the professed brothers do not leave the field while the
      // Marshal lives. They hold at breaking point, wavering (and fighting worse), and die there.
      if (this.doc[team]!.standFast && (r.cls === U.Knights || r.cls === U.Shock) && r.role !== 'command' && this.commander[team]! >= 0 && !this.commanderFell[team]) {
        r.morale = M.breakAt;
        if (r.moraleState !== 'wavering') r.moraleState = 'wavering';
        if (this.tick - r.standTold > 300) {
          r.standTold = this.tick;
          this.events.push({ tick: this.tick, team, kind: 'doctrine', cls: r.cls, reg: r.id, note: 'stand-fast' });
        }
        return;
      }
      this.rout(r);
      return;
    }
    if (r.moraleState === 'steady' && r.morale < M.waverAt) {
      r.moraleState = 'wavering';
      if (this.tick - r.waverTold > 200) {
        r.waverTold = this.tick;
        this.events.push({ tick: this.tick, team, kind: 'waver', cls: r.cls, reg: r.id });
      }
    } else if (r.moraleState === 'wavering' && r.morale > M.waverAt + 8) r.moraleState = 'steady';
    else if (r.moraleState === 'rallying' && this.tick - r.rallyAt >= this.doc[team]!.shaken) r.moraleState = r.morale > M.waverAt + 8 ? 'steady' : 'wavering';
  }

  private thinkRouted(r: Regiment): void {
    r.mode = 'rout';
    // Panic: now and then a man veers, but they all bend toward their own edge.
    const dm = this.d;
    const edge = r.team === 0 ? -1 : 1;
    for (const id of r.members) {
      if (dm.state[id] !== State.Routing) continue;
      if (this.rng.chance(0.3)) {
        const sw = (this.rng.next() - 0.5) * 0.9;
        let x = dm.hx[id]! - dm.hy[id]! * sw + edge * 0.18;
        let y = dm.hy[id]! + dm.hx[id]! * sw;
        // (A veer is a swerve, not a turn back toward the enemy's side of the field.)
        if (x * edge < 0.15) x = edge * 0.15;
        const m = sqrt(x * x + y * y) || 1;
        x /= m;
        y /= m;
        dm.hx[id] = x;
        dm.hy[id] = y;
      }
      this.dodge(id, edge);
    }
    if (this.broken[r.team] || r.moraleState === 'shattered') return;
    // Pursued? Anyone of the enemy close behind keeps them running.
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + 90;
      if (dx * dx + dy * dy < rr * rr) {
        r.quietSince = this.tick;
        return;
      }
    }
    if (this.tick - r.routAt < 60 || this.tick - r.quietSince < 40) return;
    if (r.alive < Math.max(REGROUP.minMen, r.start * MORALE.shatterBelow)) return;
    // Out of contact, a check every few seconds (REGROUP.check).
    if (this.tick - r.rallyCheckAt < REGROUP.check) return;
    r.rallyCheckAt = this.tick;
    // Rallied as often as it may (a second rout is final): only an `extra` re-forming, with its
    // standard standing behind its own line, and at lower odds.
    const doc = this.doc[r.team]!;
    const reform = r.rallies >= REGROUP.rallies;
    const standard = this.together(r, REGROUP.standardRange) >= Math.max(REGROUP.minMen, r.start * REGROUP.share);
    // Too scattered for even a handful to stop together.
    if (!standard && this.together(r, REGROUP.gather) < REGROUP.minMen) return;
    if (reform) {
      // T2: a Templar block may re-form at any friendly banner, not only its own standard.
      if (r.rallies >= REGROUP.rallies + REGROUP.extra + doc.reforms || !(standard || (doc.reformAtBanner && this.bannerNear(r.team, r.cx, r.cy)))) return;
      const ts = this.ts[r.team]!;
      const dir = r.team === 0 ? 1 : -1;
      if (ts.hasLine && (r.cx - ts.frontX) * dir > -30) return;
    }
    let p = this.rallyOdds(r.team, r.cls, r.veteran, r.cx, r.cy, standard, false);
    if (p < 0) return;
    if (reform) p *= REGROUP.extraOdds;
    if (!this.rng.chance(p)) return;
    // They stop, turn and form up about their centre; stragglers further off run on.
    const army = this.setup.armies[r.team]!;
    const d = this.d;
    const far2 = REGROUP.gather * REGROUP.gather;
    const ox = r.cx;
    const oy = r.cy;
    r.routed = false;
    r.rallies++;
    r.rallyAt = this.tick;
    r.moraleState = 'rallying';
    r.morale = MORALE.rallyMorale + army.moraleBonus * 0.5;
    r.recent = 0;
    r.flankShock = 0;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const id of r.members) {
      if (d.state[id] === State.Routing) {
        const dx = d.x[id]! - ox;
        const dy = d.y[id]! - oy;
        if (dx * dx + dy * dy > far2) continue;
        d.state[id] = State.Fighting;
      }
      d.target[id] = -1;
      if (d.state[id] === State.Fighting) {
        n++;
        sx += d.x[id]!;
        sy += d.y[id]!;
      }
    }
    if (n > 0) {
      r.cx = sx / n;
      r.cy = sy / n;
    }
    const e = this.ts[1 - r.team]!;
    const fx = e.frontX - r.cx >= 0 ? 1 : -1;
    r.fx = r.dfx = fx;
    r.fy = r.dfy = 0;
    r.stance = defaultStance(r);
    r.spacing = spacingFor(r, r.stance);
    r.ax = r.tx = r.cx + fx * r.depth * 0.5;
    r.ay = r.ty = r.cy;
    // Each man takes the place nearest him, and they drift back into ranks (see `move`).
    this.assignSlots(r, true);
    r.targetReg = -1;
    this.give(r, 'hold');
    this.setMode(r, 'rally');
    this.events.push({ tick: this.tick, team: r.team, kind: reform ? 'reform' : 'rally', cls: r.cls, reg: r.id });
  }

  /**
   * Odds per check (REGROUP) that men of class `cls` at (x, y) rally: by class and veterancy,
   * with the anchors and threats about them (rout-recovery.md 8.4). `standard`: whether their
   * own regiment's standard still stands (null: they are joining another regiment, whose
   * standard is close when `atStandard`). -1: they cannot rally (no anchor, or undead).
   */
  private rallyOdds(team: number, cls: number, vet: boolean, x: number, y: number, standard: boolean | null, atStandard: boolean): number {
    const R = REGROUP;
    const army = this.setup.armies[team]!;
    if (this.fearless[team]) return -1;
    let p = R.odds[cls] ?? 0;
    if (vet) p = Math.max(p, R.veteranFloor) + R.veteranAdd;
    p += army.moraleBonus * R.perBonus;
    // Joining: the regiment they join is their anchor.
    let anchor = standard !== false;
    if (standard === true || atStandard) p += R.standard;
    else if (standard === false) p += R.standardLost;
    const d = this.d;
    const cmd = this.commander[team]!;
    if (cmd >= 0 && d.state[cmd] === State.Fighting) {
      const dx = d.x[cmd]! - x;
      const dy = d.y[cmd]! - y;
      if (dx * dx + dy * dy < R.commanderRange * R.commanderRange) {
        p += R.commander + (army.faction === 'samurai' ? R.samuraiLord : 0);
        anchor = true;
      }
    } else if (this.commanderFell[team]) p += R.commanderDead;
    // A formed regiment of their own side near (a reserve); for Templars, any banner standing.
    let reserve = false;
    let banner = false;
    for (const o of this.teamRegs[team]!) {
      if (o.alive < 4 || o.routed || o.role === 'siege' || o.role === 'skirmish') continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      const q = dx * dx + dy * dy;
      if (q < R.banner * R.banner) banner = true;
      if (o.role !== 'command' && !o.engaged && o.moraleState === 'steady' && q < R.reserveRange * R.reserveRange) reserve = true;
    }
    if (reserve && standard !== null) {
      p += R.reserve;
      anchor = true;
    }
    if (banner && army.faction === 'templar') {
      p += R.templarBanner;
      anchor = true;
    }
    if (!anchor) return -1;
    for (const o of this.teamRegs[1 - team]!) {
      if (o.alive === 0 || o.routed || !isCav(o)) continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      const rr = R.enemyHorseRange + o.radius;
      if (dx * dx + dy * dy < rr * rr) {
        p += R.enemyHorse;
        break;
      }
    }
    return p;
  }

  /** Whether `team`'s general is alive. */
  private lordAlive(team: number): boolean {
    const cmd = this.commander[team]!;
    return cmd >= 0 && this.d.state[cmd] === State.Fighting;
  }

  /** Whether `team`'s general is alive and within `R` of (x, y). */
  private lordWithin(team: number, x: number, y: number, R: number): boolean {
    const d = this.d;
    const cmd = this.commander[team]!;
    if (cmd < 0 || d.state[cmd] !== State.Fighting) return false;
    const dx = d.x[cmd]! - x;
    const dy = d.y[cmd]! - y;
    return dx * dx + dy * dy < R * R;
  }

  /**
   * The nearest banner within `R` of regiment `r` (T2): the general, or a steady, unengaged
   * regiment of `r`'s family; where it stands (a regiment's rear rank) to out[0], out[1].
   * Whether there was one.
   */
  private bannerFor(team: number, r: Regiment, R: number, out: Float64Array): boolean {
    let bd = R * R;
    let found = false;
    const d = this.d;
    const cmd = this.commander[team]!;
    if (cmd >= 0 && d.state[cmd] === State.Fighting) {
      const dx = d.x[cmd]! - r.cx;
      const dy = d.y[cmd]! - r.cy;
      const q = dx * dx + dy * dy;
      if (q < bd) {
        bd = q;
        out[0] = d.x[cmd]!;
        out[1] = d.y[cmd]!;
        found = true;
      }
    }
    const f = family(r);
    for (const o of this.teamRegs[team]!) {
      if (o === r || o.alive < 4 || o.routed || o.engaged || o.moraleState !== 'steady' || family(o) !== f) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const q = dx * dx + dy * dy;
      if (q < bd) {
        bd = q;
        // Behind its rear rank.
        out[0] = o.cx - (team === 0 ? 1 : -1) * o.depth * 0.5;
        out[1] = o.cy;
        found = true;
      }
    }
    return found;
  }

  /** Whether a banner of `team` stands within REGROUP.banner of (x, y): a formed regiment (not skirmishers or engines), or the general's. */
  private bannerNear(team: number, x: number, y: number): boolean {
    const R = REGROUP.banner;
    for (const o of this.teamRegs[team]!) {
      if (o.alive < 4 || o.routed || o.role === 'siege' || o.role === 'skirmish') continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      if (dx * dx + dy * dy < R * R) return true;
    }
    return false;
  }

  /**
   * Which fugitives a regiment of class `cls` and role family `f` takes in (REGROUP.sameClass):
   * men of its own class; for Templars (the Beauséant rule), of its family. 0: none.
   */
  private takerKey(team: number, cls: number, f: number): number {
    if (f === 0) return 0;
    return !REGROUP.sameClass || this.setup.armies[team]!.faction === 'templar' ? 32 + f : 1 + cls;
  }

  /**
   * Fugitives fall in with a formed friend of their own kind (REGROUP): each running man, once
   * every few ticks, looks for a steady, unengaged regiment of his class with room in it within
   * reach of him. Found, he may stop and join it, at the back of its files, at half the odds of
   * rallying (rout-recovery.md 8.6).
   */
  private regroup(): void {
    const regs = this.regiments;
    const ok = this.takeIn;
    const takers = this.takers;
    takers[0].length = 0;
    takers[1].length = 0;
    for (let j = 0; j < regs.length; j++) {
      const o = regs[j]!;
      const can = !o.routed && o.alive > 0 && o.alive < o.start * REGROUP.room && !o.engaged && o.moraleState === 'steady' && TAKE_IN[o.mode] && !this.broken[o.team];
      ok[j] = can ? this.takerKey(o.team, o.cls, family(o)) : 0;
      if (ok[j]! > 0) takers[o.team]!.push(o);
    }
    if (takers[0].length === 0 && takers[1].length === 0) return;
    const d = this.d;
    const n = this.n;
    const up = (this.tick + this.parity) % 2 === 0;
    const per = (REGROUP.joinOdds * REGROUP.every) / REGROUP.check;
    for (let q = 0; q < n; q++) {
      const i = up ? q : n - 1 - q;
      if (d.state[i] !== State.Routing) continue;
      const team = d.team[i]!;
      if (this.broken[team] || takers[team]!.length === 0) continue;
      const r = regs[d.reg[i]!]!;
      if (this.tick - r.routAt < REGROUP.minRun) continue;
      const S = this.soldiers[i]!;
      const key = this.takerKey(team, S.cls, family(r));
      if (key === 0) continue;
      const x = d.x[i]!;
      const y = d.y[i]!;
      // (A runner who ran on when his own block rallied may come back to its colours.)
      const o = this.friendNear(takers[team]!, key, r.routed ? r.id : -1, x, y);
      if (!o) continue;
      const sx = o.cx - x;
      const sy = o.cy - y;
      const sr = this.formRadius(o) * REGROUP.standardNear;
      let p = this.rallyOdds(team, S.cls, S.vet, x, y, null, sx * sx + sy * sy < sr * sr);
      if (p <= 0) continue;
      p *= per;
      if (this.enemyWithin(x, y, team, REGROUP.enemyNear)) p *= REGROUP.enemyNearMul;
      if (d.hp[i]! < S.s.hp * REGROUP.hurt) p *= REGROUP.hurtMul;
      if (r.moraleState === 'shattered') p *= REGROUP.shatteredMul;
      if (!this.rng.chance(p)) continue;
      this.fallIn(i, r, o);
      // Full now (or no longer steady): it takes no more this round.
      if (o.alive >= o.start * REGROUP.room || o.moraleState !== 'steady') ok[o.id] = 0;
    }
    for (let j = 0; j < regs.length; j++) {
      const o = regs[j]!;
      if (o.joinPending === 0 || this.tick - o.joinTold < REGROUP.tellEvery) continue;
      const from = regs[o.joinFrom]!;
      this.events.push({ tick: this.tick, team: o.team, kind: 'joins', cls: o.cls, reg: o.id, from: from.id, fromCls: from.cls, count: o.joinPending });
      o.joinPending = 0;
      o.joinTold = this.tick;
    }
  }

  /**
   * How far a block's formation reaches from its centre: its men's spread, but no more than its
   * frontage and depth allow (half the diagonal, and a few paces), so a block with a man or two
   * off on their own does not reach across the field.
   */
  private formRadius(o: Regiment): number {
    const half = sqrt(o.width * o.width + o.depth * o.depth) * 0.5 + 3 * Math.max(3, o.spacing);
    return o.radius < half ? o.radius : half;
  }

  /** Of `list`, the regiment taking `key` (see `takeIn`) whose formation's edge is nearest (x, y), within REGROUP.reach; never `own`. */
  private friendNear(list: Regiment[], key: number, own: number, x: number, y: number): Regiment | null {
    const ok = this.takeIn;
    let best: Regiment | null = null;
    let bd: number = REGROUP.reach;
    for (const o of list) {
      if (o.id === own || ok[o.id] !== key) continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      const orad = this.formRadius(o);
      const far = orad + bd;
      if (dx * dx + dy * dy >= far * far) continue;
      const q = sqrt(dx * dx + dy * dy) - orad;
      if (q < bd) {
        bd = q;
        best = o;
      }
    }
    return best;
  }

  /**
   * A running man with a standing enemy close ahead (not one hunting him) swerves round him, on
   * the side he is already off to, still bending for home: he does not run into him (finding #16).
   */
  private dodge(i: number, edge: number, R = 36): void {
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const team = d.team[i]!;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const hx = d.hx[i]!;
    const hy = d.hy[i]!;
    // The nearest of those ahead of him (a pursuer at his back only drives him on).
    let bd = R * R;
    let ex = 0;
    let ey = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.gridEnd[c]!; k++) {
          const j = this.items[k]!;
          // (Not the man hunting him: from him he runs, he does not dance round him.)
          if (d.team[j] === team || d.state[j] !== State.Fighting || d.target[j] === i) continue;
          const dx = d.x[j]! - x;
          const dy = d.y[j]! - y;
          const q = dx * dx + dy * dy;
          const a = dx * hx + dy * hy;
          if (q < bd && a > 0 && a * a > 0.04 * q) {
            bd = q;
            ex = dx;
            ey = dy;
          }
        }
      }
    }
    if (bd >= R * R) return;
    const q = sqrt(bd) || 1;
    ex /= q;
    ey /= q;
    // Across his line: on round the way he was going, unless that way leads off toward the
    // enemy's side of the field; then back round the other side of him.
    let s = hx * ey - hy * ex > 0 ? 1 : -1;
    if (ey * s * edge < -0.3) s = -s;
    let nx = ey * s - ex * 0.6 + edge * 0.3;
    let ny = -ex * s - ey * 0.6;
    if (nx * edge < -0.25) nx = -0.25 * edge;
    const m = sqrt(nx * nx + ny * ny) || 1;
    nx /= m;
    ny /= m;
    d.hx[i] = nx;
    d.hy[i] = ny;
  }

  /** Whether a standing enemy of `team` is within `R` of (x, y). */
  private enemyWithin(x: number, y: number, team: number, R: number): boolean {
    const d = this.d;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const R2 = R * R;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.gridEnd[c]!; k++) {
          const j = this.items[k]!;
          if (d.team[j] === team || d.state[j] !== State.Fighting) continue;
          const dx = d.x[j]! - x;
          const dy = d.y[j]! - y;
          if (dx * dx + dy * dy <= R2) return true;
        }
      }
    }
    return false;
  }

  /**
   * Man `i`, running from `from`, falls in with `o`: he leaves `from`'s roll for `o`'s (keeping
   * his own class, stats, wounds and ammunition) and takes a place at the back of its shortest
   * file, the one nearest him. The regiment's spirits dip a little. A rider unhorsed (`afootMove`,
   * not `fugitive`) is no runner: he brings no fear with him and is not told as one who 'joins'.
   */
  private fallIn(i: number, from: Regiment, o: Regiment, fugitive = true): void {
    const d = this.d;
    if (from !== o) {
      const k = from.members.indexOf(i);
      if (k >= 0) from.members.splice(k, 1);
      // (A runner of a block that has rallied without him was not counted in it: see `survey`.
      // A man standing, such as a rider on foot, was.)
      if (from.routed || d.state[i] !== State.Routing) from.alive--;
      d.reg[i] = o.id;
      o.members.push(i);
      if (fugitive) {
        this.shake(o, REGROUP.moraleCost * this.shockK);
        o.absorbed++;
        o.joinPending++;
        o.joinFrom = from.id;
      }
    }
    o.alive++;
    d.state[i] = State.Fighting;
    d.target[i] = -1;
    d.imp[i] = 0;
    // He walks to his place before he is one of its ranks.
    d.jn[i] = 1;
    if (o.stance === 'wedge') {
      this.assignSlots(o, true);
      return;
    }
    const cols = Math.max(1, o.cols);
    const counts = new Int32Array(cols);
    for (const id of o.members) {
      if (id === i || d.state[id] !== State.Fighting) continue;
      counts[Math.max(0, Math.min(cols - 1, Math.round(d.col[id]!)))]!++;
    }
    const lat = -(d.x[i]! - o.ax) * o.fy + (d.y[i]! - o.ay) * o.fx;
    const near = lat / Math.max(1, o.spacing) + (cols - 1) / 2;
    let best = 0;
    let bs = Infinity;
    for (let c = 0; c < cols; c++) {
      const s = counts[c]! * 1000 + Math.abs(c - near);
      if (s < bs) {
        bs = s;
        best = c;
      }
    }
    d.col[i] = best;
    d.row[i] = counts[best]!;
    this.slotOffsets(o);
    // Short last ranks sit between files: let the files close up and settle any doubled place.
    o.reflow = true;
  }

  /** A broken regiment's running men within `range` of their centre. */
  private together(r: Regiment, range: number): number {
    const d = this.d;
    const far2 = range * range;
    let n = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Routing) continue;
      const dx = d.x[id]! - r.cx;
      const dy = d.y[id]! - r.cy;
      if (dx * dx + dy * dy <= far2) n++;
    }
    return n;
  }

  /** A wavering captain may balk at an order to go forward. */
  private balks(r: Regiment): boolean {
    if ((r.moraleState !== 'wavering' && r.moraleState !== 'rallying') || this.generals[r.team]!.trait === 'iron-discipline') return false;
    const k = r.ord.kind;
    if (k !== 'attack' && k !== 'flank' && k !== 'charge' && k !== 'support' && k !== 'advance') return false;
    if (this.tick < r.refuseUntil) return true;
    if (this.tick - r.refuseUntil > 30 && this.rng.chance(MORALE.refuse)) {
      r.refuseUntil = this.tick + 40;
      return true;
    }
    return false;
  }

  private thinkLine(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    const o = r.ord;
    if (this.chase(r)) return;
    if (r.engaged) {
      if (r.mode !== 'melee') r.meleeTicks = 0;
      r.meleeTicks += 5;
      this.setMode(r, 'melee');
      this.pulse(r);
      // Locked to its front, it does not face about for an enemy at its back: its rear ranks do.
      const back = this.nearestFoe(r, 0, COHESION.rearTurn);
      if (back && back.id !== r.targetReg && (back.cx - r.cx) * r.fx + (back.cy - r.cy) * r.fy < -r.depth * 0.25) r.rearUntil = this.tick + 10;
      // Press: lean into the fight, never turn while locked.
      r.dfx = r.fx;
      r.dfy = r.fy;
      this.goal(r, r.ax + r.fx * 3, r.ay + r.fy * 3);
      return;
    }
    if (r.mode === 'rally' && this.tick - r.modeAt < 30) return;
    // Spears set against horse.
    if (st.antiCav > 1.5) {
      const cav = this.nearestFoe(r, 2, 150);
      // (Horse locked in a fight with someone else, out of a few strides, is no threat to brace
      // against: spears stand braced while the whole fight goes on beside them otherwise.)
      if (cav && (cav.mode === 'charge' || cav.mode === 'flank' || (cav.mode === 'melee' && (cav.targetReg === r.id || this.nearestFoe(r, 2, 40) !== null)))) {
        // QA3 #2: horse locked in a fight with a friend of ours close by, and no other coming at
        // us: the spears go in at it (horse at a stand among foot is what spears are for), not
        // stand braced against horse that is not coming. (Until then 39 spears stood braced 14 s
        // 30 u from knights hacking at the heavy foot beside them: over a third of all the time
        // spears stood braced in the demo battles.)
        if (cav.mode === 'melee' && cav.engaged && cav.targetReg !== r.id && o.kind !== 'withdraw' && !this.horseComing(r, 150, false)) {
          this.startCharge(r);
          this.goal(r, cav.cx, cav.cy);
          this.faceToward(r, cav.cx, cav.cy);
          return;
        }
        this.setMode(r, 'brace');
        this.goal(r, r.ax, r.ay);
        this.faceToward(r, cav.cx, cav.cy);
        return;
      }
    }
    // A threat on the flank or rear: wheel to meet it (or face it: see `turnFoot`). Horse
    // charging or riding round at this block is a threat from further off.
    const horse = this.horseNear(r);
    // (A reserve that has faced a threat keeps facing it while it stays near, RESERVE_WARY: until
    // QA review 2 #5 it faced it at 45, back toward its spot at 46, and round again.)
    const wary = o.kind === 'reserve' && this.tick - r.threatAt < RESERVE_WARY_FOR ? RESERVE_WARY : 45;
    const threat = (horse && (horse.mode === 'charge' || horse.mode === 'flank') && horse.targetReg === r.id ? horse : null) ?? this.nearestFoe(r, 0, wary);
    if (threat && threat.id !== o.target && o.kind !== 'withdraw') {
      const dx = threat.cx - r.cx;
      const dy = threat.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      if ((wary > 45 || (dx * r.fx + dy * r.fy) / q < 0.2) && (threat.mode === 'charge' || threat.mode === 'melee' || threat.mode === 'flank' || threat.mode === 'advance')) {
        if (wary === 45) r.threatAt = this.tick;
        this.setMode(r, 'hold');
        this.goal(r, r.ax, r.ay);
        this.faceToward(r, threat.cx, threat.cy);
        return;
      }
    }
    if (this.balks(r)) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    switch (o.kind) {
      case 'withdraw': {
        const x = Number.isNaN(o.x) ? r.ax : o.x;
        const y = Number.isNaN(o.y) ? r.ay : o.y;
        const dx = x - r.ax;
        const dy = y - r.ay;
        if (dx * dx + dy * dy < 15 * 15) {
          this.setMode(r, 'hold');
          r.dfx = r.team === 0 ? 1 : -1;
          r.dfy = 0;
        } else this.setMode(r, 'reserve');
        this.goal(r, x, y);
        return;
      }
      case 'pursue': {
        const prey = this.nearestFoe(r, 4, 300) ?? this.nearestFoe(r, 0, 300);
        if (prey) {
          if (r.mode !== 'pursue') for (const id of r.members) this.d.hs[id] = 0.8 + this.rng.next() * 0.4;
          this.setMode(r, 'pursue');
          this.goal(r, prey.cx, prey.cy);
          this.faceToward(r, prey.cx, prey.cy);
        } else this.setMode(r, 'hold');
        return;
      }
      case 'hold':
      case 'attack':
      case 'flank':
      case 'support':
      case 'charge': {
        const tgt = o.target >= 0 ? this.regiments[o.target]! : null;
        if (!tgt || tgt.alive === 0 || tgt.routed) break;
        const tmp = this.tmp;
        slotPos(tgt, o.side, r.depth, tmp);
        const px = tmp[0]!;
        const py = tmp[1]!;
        const dx = px - r.ax;
        const dy = py - r.ay;
        const q = sqrt(dx * dx + dy * dy);
        r.dfx = tmp[2]!;
        r.dfy = tmp[3]!;
        // The last stretch at a run: further when ordered to charge (a wavering enemy, archers
        // caught in the open, the general charge), and not when already spent.
        const launch = (o.kind === 'charge' ? 75 : 45) * (r.fatigue > 0.7 ? 0.5 : 1);
        if (o.kind === 'hold' && q > 50) {
          this.setMode(r, 'hold');
          this.goal(r, r.ax, r.ay);
          // (Standing, it faces the enemy whatever its slot: QA review 2 #7. Until then a block
          // told off for a flank faced the way it would take that flank, along its own line,
          // until it moved. Far off, it faces his edge, square with the line.)
          if (o.side === 0 || q < HOLD_SQUARE) this.faceToward(r, tgt.cx, tgt.cy);
          else {
            r.dfx = r.team === 0 ? 1 : -1;
            r.dfy = 0;
          }
          // Counter-charge whatever comes close.
          const close = this.nearestFoe(r, 0, 35);
          if (close && !isCav(close)) {
            this.startCharge(r);
            this.goal(r, close.cx, close.cy);
            this.faceToward(r, close.cx, close.cy);
          }
        } else if (q < launch || (r.mode === 'charge' && q < launch * 1.6)) {
          this.startCharge(r);
          this.goal(r, px + tmp[2]! * 12, py + tmp[3]! * 12);
        } else {
          this.setMode(r, 'advance');
          this.goal(r, px, py);
        }
        return;
      }
      default:
        break;
    }
    // In reserve: follow behind a block of the first line.
    const f = o.friend >= 0 ? this.regiments[o.friend]! : null;
    let best: Regiment | null = f && f.alive > 0 && !f.routed ? f : null;
    if (!best) {
      let bd = Infinity;
      for (const x of this.teamRegs[r.team]!) {
        if (x === r || x.role !== 'line' || x.alive === 0 || x.routed || (x.line === 2 && !x.committed)) continue;
        const q = (x.cx - r.cx) * (x.cx - r.cx) + (x.cy - r.cy) * (x.cy - r.cy);
        if (q < bd) {
          bd = q;
          best = x;
        }
      }
    }
    if (best) {
      // QA review 2 #5: behind its friend as seen from the enemy, the friend's front eased toward
      // our own (a friend wheeled about in its fight swung its reserve round its rear, ±70°),
      // and it moves and turns only once that spot and that front have drifted well off.
      const dir = r.team === 0 ? 1 : -1;
      let bx = best.dfx + dir * 3;
      let by = best.dfy;
      const bq = sqrt(bx * bx + by * by) || 1;
      bx /= bq;
      by /= bq;
      const gx = best.ax - bx * (best.depth + RESERVE_BEHIND);
      const gy = best.ay - by * (best.depth + RESERVE_BEHIND);
      // (Against the spot it last made for, not its goal: `clearGoal` moves that aside of friends.)
      const steady = (r.mode === 'reserve' || r.mode === 'hold') && !Number.isNaN(r.resX);
      const ox = gx - r.resX;
      const oy = gy - r.resY;
      this.setMode(r, 'reserve');
      if (!steady || ox * ox + oy * oy > RESERVE_DEADBAND * RESERVE_DEADBAND) {
        r.resX = gx;
        r.resY = gy;
      }
      this.goal(r, r.resX, r.resY);
      if (!steady || r.dfx * bx + r.dfy * by < RESERVE_TURN) {
        r.dfx = bx;
        r.dfy = by;
      }
      return;
    }
    // Nobody to stand behind: a reserve holds its ground (and fights what comes to it); anyone
    // else goes for the nearest enemy.
    const any = this.nearestFoe(r, 0, o.kind === 'reserve' ? 60 : Infinity);
    if (any) {
      this.setMode(r, 'advance');
      this.goal(r, any.cx, any.cy);
      this.faceToward(r, any.cx, any.cy);
    } else {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
    }
  }

  /**
   * P3: the melee breathes. A block winning its fight locally (killing faster than it loses), in
   * good heart, now and then sends a run of 3-6 front files surging forward for 2-3 s (the
   * faction's `loose.surge`); two tired blocks locked front to front fall back out of measure
   * together for 1.5-2.5 s, a lull, at most every `lullEvery` ticks (never the dead).
   */
  private pulse(r: Regiment): void {
    const C = COHESION;
    const L = this.doc[r.team]!.loose;
    const t = this.tick;
    if (r.surgeUntil <= t && L.surge > 0 && r.recentKills > r.recent && r.morale > C.surgeMorale && r.cols >= 4 && this.rng.chance(C.surgeChance * L.surge)) {
      r.surgeN = 3 + this.rng.int(4);
      r.surgeCol = this.rng.int(Math.max(1, r.cols - r.surgeN + 1));
      r.surgeUntil = t + C.surgeFor + this.rng.int(C.surgeSpread);
    }
    const o = r.targetReg >= 0 ? this.regiments[r.targetReg]! : null;
    if (!o || !o.engaged || o.routed || !L.lull || !this.doc[o.team]!.loose.lull || r.lullUntil > t) return;
    if (t - r.lullAt < C.lullEvery || t - o.lullAt < C.lullEvery || r.fatigue < C.lullTired || o.fatigue < C.lullTired) return;
    if (!this.rng.chance(C.lullChance)) return;
    r.lullAt = o.lullAt = t;
    r.lullUntil = o.lullUntil = t + C.lullFor + this.rng.int(C.lullSpread);
  }

  /** Foot breaks into a run for the last stretch (the cavalry's charge is in `thinkCav`). */
  private startCharge(r: Regiment): void {
    if (r.mode === 'charge') {
      // Run too far and the ranks come apart and the men tire.
      if (!r.ragged && this.tick - r.chargeAt > RUN_IN) r.ragged = true;
      return;
    }
    this.setMode(r, 'charge');
    r.chargeAt = this.tick;
    r.ragged = false;
    r.charges++;
    // Not every man runs as fast, and the eager run fastest (COHESION.chargePace).
    const d = this.d;
    const lead = this.doc[r.team]!.loose.lead;
    for (const id of r.members) d.hs[id] = 1 + COHESION.chargePace * Math.max(-1, Math.min(1, (0.55 * d.ea[id]! + 0.45 * (this.rng.next() * 2 - 1)) * Math.min(1.2, lead)));
    if (r.charges === 1 || this.tick - r.modeAt > 100) this.events.push({ tick: this.tick, team: r.team, kind: 'charge', cls: r.cls, reg: r.id });
  }

  /**
   * Breaking ranks to chase: a regiment not locked with a formed enemy, in good heart, with
   * fugitives close by may go after them on its own (eager troops readily, disciplined ones
   * seldom), loose, cutting down the stragglers. It comes back when the chase has run its
   * course (time or distance, by its eagerness), when formed enemy comes near, or when the
   * fugitives are gone or near their own edge. Returns whether it is chasing.
   */
  private chase(r: Regiment): boolean {
    const won = r.ord.kind === 'pursue';
    const formed = this.nearestFoe(r, 0, 30);
    if (r.chaseAt >= 0) {
      const prey = this.nearestFoe(r, 4, 220);
      const dx = r.ax - r.chaseX;
      const dy = r.ay - r.chaseY;
      // S2: the samurai chase further and longer.
      const doc = this.doc[r.team]!;
      const far = (120 + 260 * r.eager) * doc.chaseFar;
      const edge = prey ? (r.team === 0 ? FIELD_W - prey.cx : prey.cx) : 0;
      const tired = this.tick - r.chaseAt > (80 + 220 * r.eager) * doc.chaseTired;
      if (!prey || formed || tired || edge < 70 || (!won && dx * dx + dy * dy > far * far) || r.fatigue > 0.8) {
        r.chaseAt = -1;
        r.recallAt = this.tick;
        return false;
      }
      this.setMode(r, 'pursue');
      this.goal(r, prey.cx, prey.cy);
      this.faceToward(r, prey.cx, prey.cy);
      return true;
    }
    if (won || formed || r.engaged || this.tick - r.recallAt < this.doc[r.team]!.recall) return false;
    if (r.moraleState !== 'steady' || r.morale < 55 || r.fatigue > 0.5 || r.ord.kind === 'withdraw') return false;
    if ((r.role === 'missile' && r.ammoLeft > 0) || r.role === 'siege' || r.role === 'command') return false;
    if (r.line === 2 && !r.committed && r.eager < 0.7) return false;
    const prey = this.nearestFoe(r, 4, isCav(r) ? 200 : 100);
    if (!prey || prey.alive < 3) return false;
    const discipline = this.generals[r.team]!.trait === 'iron-discipline' ? 0.3 : 1;
    if (!this.rng.chance(r.eager * 0.3 * discipline)) return false;
    this.events.push({ tick: this.tick, team: r.team, kind: 'chase', cls: r.cls, reg: r.id });
    r.chaseAt = this.tick;
    r.chaseX = r.ax;
    r.chaseY = r.ay;
    const d = this.d;
    for (const id of r.members) d.hs[id] = 0.8 + this.rng.next() * 0.4;
    this.setMode(r, 'pursue');
    this.goal(r, prey.cx, prey.cy);
    this.faceToward(r, prey.cx, prey.cy);
    return true;
  }

  /**
   * Bows, crossbows and guns stand well back and shoot volleys: behind their own line, from long
   * range, over the heads of the line (bows lob over a melee into the enemy's rear ranks). They
   * stop to shoot, and when long idle go looking for a target along the line. An enemy close
   * or charging makes them fire at will (`threatTo`); at contact they sling bows and fight.
   */
  private thinkMissile(r: Regiment): void {
    const ts = this.ts[r.team]!;
    const st = this.stats[r.team]![r.cls]!;
    const dir = r.team === 0 ? 1 : -1;
    if (r.engaged || this.nearGap(r, CONTACT_GAP, false)) {
      r.atWill = false;
      r.slip = false;
      this.setMode(r, 'melee');
      this.goal(r, r.ax, r.ay);
      return;
    }
    if (this.screen(r)) return;
    if (this.takeCover(r, st)) return;
    const threat = this.threatTo(r, true);
    if (threat) {
      // No time for the word: every man shoots as he can at the nearest foe (and the men he
      // reaches fight him: see `act`). They stand: no wheeling, a man shoots where he must.
      r.atWill = true;
      r.targetReg = threat.id;
      r.aimedAt = this.tick;
      this.setMode(r, 'shoot');
      this.goal(r, r.ax, r.ay);
      r.dfx = r.fx;
      r.dfy = r.fy;
      return;
    }
    r.atWill = false;
    // Finish a step sideways before standing to shoot again.
    if (this.tick < r.stepUntil) return;
    // Targets of opportunity, the General's pick first.
    const best = this.shootable(r, st.range * 0.95, false, this.fire[r.team]![r.cls] === 'lob');
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      r.aimedAt = this.tick;
      if (this.sidestep(r)) {
        this.faceToward(r, best.cx, best.cy);
        return;
      }
      // (Horse coming at it: it stands, and does not step out to meet it: `takeCover`.)
      if (r.horseFrom >= 0) {
        this.goal(r, r.ax, r.ay);
        r.short = 0;
        r.loosed = 0;
      } else this.closeToShoot(r, best);
      // Standing on top of another block of shooters (both stopped where they came into range):
      // the later in the order of battle steps off to its own spot, as near as it stands now.
      {
        const dx = best.cx - r.ax;
        const dy = best.cy - r.ay;
        const q = sqrt(dx * dx + dy * dy) || 1;
        if (this.spotTaken(r, r.ax, r.ay, -dy / q, dx / q, dx / q, dy / q, true)) {
          this.firingSpot(r, best, Math.min(q, st.range * 0.9));
          this.freeSpot(r, this.tmp[0]!, this.tmp[1]!);
          this.goal(r, this.tmp[0]!, this.tmp[1]!);
        } else if (this.inFriends(r, r.ax, r.ay) >= 0) {
          // Standing in the ranks of a block of our foot (QA #11): out of them, along the line.
          this.freeSpot(r, r.ax, r.ay);
          this.goal(r, this.tmp[0]!, this.tmp[1]!);
        }
      }
      this.aimAt(r, best);
      return;
    }
    r.targetReg = -1;
    if (r.ord.kind === 'hold' || this.tick < 30) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    // Keep well behind the line: step up only when far behind it, and back when it falls back.
    if (ts.hasLine) {
      const back = ts.lineDepth + MISSILE_BEHIND;
      let x = ts.frontX - dir * back;
      let y = r.homeY + (ts.midY - FIELD_H / 2);
      const near = this.tick - r.aimedAt > MISSILE_SEEK ? this.nearestFoe(r, 0, Infinity) : null;
      if (near) {
        // Idle a long while (the fight has moved off along the line): go to bow range of the
        // nearest enemy, but never past their usual place behind the line.
        // (Its own spot: see `firingSpot`.)
        this.firingSpot(r, near, st.range * 0.85);
        x = dir * Math.min(this.tmp[0]! * dir, x * dir);
        y = this.tmp[1]!;
      }
      // Never in the ranks of our own foot (the second line comes up behind the first): along the
      // line to a free spot.
      this.freeSpot(r, x, y);
      x = this.tmp[0]!;
      y = this.tmp[1]!;
      const behind = (x - r.ax) * dir;
      const move = behind > 20 || behind < -6 || (near !== null && Math.abs(y - r.ay) > 20);
      this.setMode(r, move ? 'advance' : 'hold');
      this.goal(r, move ? x : r.ax, move ? y : r.ay);
      r.dfx = dir;
      r.dfy = 0;
      return;
    }
    const near = this.nearestFoe(r, 0, Infinity);
    if (near) {
      this.setMode(r, 'advance');
      this.firingSpot(r, near, st.range * 0.8);
      this.goal(r, this.tmp[0]!, this.tmp[1]!);
      this.faceToward(r, near.cx, near.cy);
    }
  }

  /**
   * S3: samurai guns go out before their line and fire from there, standing (as behind the
   * fence at Nagashino: behind their own line a block of matchlocks, which needs a clear line of
   * fire, has nothing it may shoot at in a big battle), and fall back through the line, at the
   * double, when the enemy comes within `screenBack` (horse twice that) or their own line comes
   * up to them. Returns whether it gave the block its orders.
   */
  private screen(r: Regiment): boolean {
    const doc = this.doc[r.team]!;
    const kind = this.fire[r.team]![r.cls];
    // (v17, QA #3: crossbows too, as the Genoese stood before the line at Crécy. A flat shot
    // cannot go over our own ranks, and from behind the line a block of crossbows had only the
    // gaps of the line to shoot through: until v17 it lofted its bolts over at four times the
    // scatter, and they came down among our own men.)
    const gun = doc.screen > 0 && kind === 'gun';
    if (!gun && kind !== 'flat') return false;
    const scr = gun ? doc.screen : FLAT_SCREEN.screen;
    const back = gun ? doc.screenBack : FLAT_SCREEN.back;
    const ts = this.ts[r.team]!;
    const es = this.ts[1 - r.team]!;
    const dir = r.team === 0 ? 1 : -1;
    const home = ts.frontX - dir * (ts.lineDepth + MISSILE_BEHIND);
    if (r.mode === 'skirmish') {
      // Falling back through the line.
      this.goal(r, home, r.ay);
      r.dfx = dir;
      r.dfy = 0;
      if ((r.ax - home) * dir < 8 || !ts.hasLine) {
        r.slip = false;
        this.setMode(r, 'hold');
      }
      return true;
    }
    if (r.retired || !ts.hasLine || !es.hasLine || (ts.engaged && !r.screened) || r.ammoLeft === 0 || this.tick < 30 || r.ord.kind === 'pursue') return false;
    const ahead = (r.ax - ts.frontX) * dir;
    if (ahead > r.depth + scr) r.screened = true;
    // Skirmishers are a target, not a threat: a formed block coming on, or horse, sends them back.
    let threat = false;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.role === 'skirmish') continue;
      const R = isCav(o) ? (gun ? back * 2 : FLAT_SCREEN.horse) : back;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + R;
      if (dx * dx + dy * dy < rr * rr && this.gapTo(r, o) < R) {
        threat = true;
        break;
      }
    }
    if (threat || ts.engaged || (r.screened && ahead < r.depth * 0.6)) {
      r.retired = true;
      r.slip = true;
      r.atWill = false;
      this.setMode(r, 'skirmish');
      this.goal(r, home, r.ay);
      r.dfx = dir;
      r.dfy = 0;
      return true;
    }
    r.slip = true;
    r.atWill = false;
    const st = this.stats[r.team]![r.cls]!;
    const best = r.screened ? this.shootable(r, st.range * 0.95) : null;
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      r.aimedAt = this.tick;
      this.goal(r, r.ax, r.ay);
      this.aimAt(r, best);
      return true;
    }
    // Out before the line, keeping pace with it.
    r.targetReg = -1;
    this.setMode(r, 'advance');
    // (A goal well ahead keeps them marching: one close by is walked to slowly.)
    this.goal(r, ts.frontX + dir * (r.depth + scr + 40), r.homeY + (ts.midY - FIELD_H / 2));
    r.dfx = dir;
    r.dfy = 0;
    return true;
  }

  /**
   * Foot shooters and horse (v17, QA review 2 #1). Archers and crossbowmen did not wait in the
   * open for horse they saw coming: they fell back behind or among their own foot (at Crecy and
   * Agincourt they stood beside the men-at-arms and behind stakes), and shot from there. With
   * enemy horse coming at the block (`horseComing`) and a formed friendly block near enough to
   * reach before the horse can (`coverSpot`), the block keeps shooting while the horse is still
   * far off, and runs for the far side of the friend when the horse is about COVER.slack seconds
   * of its gallop from the last moment it could still get there. It stands and shoots there,
   * keeping its friend between it and the horse, until no enemy horse is within COVER.release.
   * Behind its own stakes, or with no friend in reach, it stands and shoots, and fires at will at
   * the last (`threatTo`); it does not step out toward the horse. Returns whether it gave the
   * block its orders. Until v17 any threat meant "stand and shoot": a block of archers was caught
   * in the open, hand to hand, by horse it had seen 5-10 s off, with its own spearmen 150 away.
   */
  private takeCover(r: Regiment, st: UnitStats): boolean {
    const horse = this.horseComing(r, r.coverReg >= 0 ? COVER.release : COVER.warn, r.coverReg >= 0);
    r.horseFrom = horse ? horse.id : -1;
    const leave = (): boolean => {
      if (r.coverReg >= 0) {
        r.coverReg = -1;
        r.slip = false;
      }
      return false;
    };
    if (!horse || this.behindStakes(r, horse)) return leave();
    // At hand already: no time to run, every man shoots as he can (and the men it reaches fight).
    if (this.threatTo(r) === horse && r.coverReg < 0) return leave();
    // (The horse's time to it: at the pace it rides now, or most of a gallop if it is gathering speed.)
    let f = r.coverReg >= 0 ? this.regiments[r.coverReg]! : null;
    if (f && (f.alive === 0 || f.routed || !this.coverSpot(r, f, horse))) f = null;
    if (!f) {
      // The friend it can reach soonest, and before the horse could get there: its run to the
      // spot against the horse's (at the pace it rides now, or most of a gallop if it is
      // gathering speed).
      const hs = Math.max(horse.aspd, horse.speed * COVER.pace);
      let bt = Infinity;
      let spare = 0;
      for (const o of this.teamRegs[r.team]!) {
        if (!this.coverSpot(r, o, horse)) continue;
        const x = this.tmp[0]!;
        const y = this.tmp[1]!;
        const t = sqrt((x - r.ax) * (x - r.ax) + (y - r.ay) * (y - r.ay)) / (r.speed * COVER.run);
        const th = Math.max(0, sqrt((x - horse.cx) * (x - horse.cx) + (y - horse.cy) * (y - horse.cy)) - horse.radius - COVER.closeIn) / hs;
        if (t <= th && t < bt) {
          bt = t;
          spare = th - t;
          f = o;
        }
      }
      // None it would reach before the horse: it stands. Time in hand: it shoots on.
      if (!f) return leave();
      if (spare > COVER.slack) return false;
      this.coverSpot(r, f, horse);
    }
    // (In cover already, it stays where it stands while its spot shifts a little with the
    // friend and the horse: shuffling after it, it would never shoot.)
    const there = r.coverReg === f.id && r.mode !== 'advance' ? COVER.stay : COVER.there;
    r.coverReg = f.id;
    const x = this.tmp[0]!;
    const y = this.tmp[1]!;
    const dx = x - r.ax;
    const dy = y - r.ay;
    r.atWill = false;
    if (dx * dx + dy * dy > there * there) {
      // Running for it, through our own ranks if need be, facing the horse.
      r.slip = true;
      r.targetReg = -1;
      this.setMode(r, 'advance');
      this.goal(r, x, y);
      const hx = horse.cx - r.cx;
      const hy = horse.cy - r.cy;
      const q = sqrt(hx * hx + hy * hy) || 1;
      r.dfx = hx / q;
      r.dfy = hy / q;
      return true;
    }
    // There: it stands and shoots over or past its friend (the danger-close rules hold its shots
    // when the horse is in among our men).
    r.slip = false;
    if (this.threatTo(r)) return false;
    if (there === COVER.there) this.goal(r, x, y);
    else this.goal(r, r.ax, r.ay);
    const best = this.shootable(r, st.range * 0.95, false, this.fire[r.team]![r.cls] === 'lob');
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      r.aimedAt = this.tick;
      this.aimAt(r, best);
    } else {
      this.setMode(r, 'hold');
      r.targetReg = -1;
      this.faceToward(r, horse.cx, horse.cy);
    }
    return true;
  }

  /**
   * The nearest enemy horse (not horse archers, unless charging it) within `warn` of block `r`'s
   * front that is coming at it: charging it or making for it, or riding toward it at a trot or
   * better, whatever it is about (`any`: any horse within `warn`).
   */
  private horseComing(r: Regiment, warn: number, any: boolean): Regiment | null {
    let best: Regiment | null = null;
    let bd = warn;
    for (const o of this.teamRegs[1 - r.team]!) {
      // (Horse riding off to re-form, or after fugitives, counts too if it rides this way: until v17
      // light horse falling back rode down archers standing in its road.)
      if (o.alive === 0 || o.routed || !isCav(o) || o.mode === 'rally') continue;
      const mine = o.targetReg === r.id && o.mode !== 'pursue' && o.mode !== 'withdraw';
      if (o.role === 'horse-archer' && !(mine && o.mode === 'charge')) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const c = sqrt(dx * dx + dy * dy) || 1;
      if (c - o.radius - r.radius > bd) continue;
      if (!any && !mine && o.engaged) continue;
      // (Closing: its pace toward the block, units a second.)
      const closing = -(o.vax * dx + o.vay * dy) / c / TICK_S;
      if (!any && !mine && closing < o.speed * COVER.closing) continue;
      // (Riding off, it is no reason to stay in cover, unless still close.)
      if (any && !mine && closing < -o.speed * COVER.closing && c - o.radius - r.radius > COVER.near) continue;
      const g = this.gapTo(r, o);
      if (g < bd) {
        bd = g;
        best = o;
      }
    }
    return best;
  }

  /** Whether a formed block of foot of the enemy of `team` (not running) is within `range` of (x, y). */
  private enemyFootNear(team: number, x: number, y: number, range: number): boolean {
    for (const o of this.teamRegs[1 - team]!) {
      if (o.alive === 0 || o.routed || !isFoot(o)) continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      const rr = o.radius + range;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
  }

  /** Whether block `r` stands just behind a row of its own stakes, `horse` beyond them, before its front. */
  private behindStakes(r: Regiment, horse: Regiment): boolean {
    for (const k of this.stakes) {
      if (k.team !== r.team || r.ay < k.y0 || r.ay > k.y1) continue;
      const ahead = k.x - r.ax;
      const far = horse.cx - r.ax;
      if (Math.abs(ahead) < COVER.stakes && ahead * far > 0 && Math.abs(far) > Math.abs(ahead) && Math.abs(horse.cy - r.ay) < Math.abs(far)) return true;
    }
    return false;
  }

  /**
   * Where block `r` takes cover from `horse` behind friend `f` (see `takeCover`): the side of
   * f's block away from the horse (its rear, front or a flank, whichever faces most away), its
   * own front COVER.gap from f's edge, beside any other block of shooters already there. Puts it
   * in tmp[0], tmp[1]; false if f is no cover: not formed foot of the line, too small, out of
   * reach (COVER.reach), out toward the enemy's foot (COVER.fwd), with other enemies
   * close by the spot, or the way there past the horse.
   */
  private coverSpot(r: Regiment, f: Regiment, horse: Regiment): boolean {
    if (f === r || f.alive < COVER.men || f.routed || f.role !== 'line' || f.mode === 'pursue' || f.mode === 'rout' || f.stance === 'column') return false;
    const ux0 = f.cx - horse.cx;
    const uy0 = f.cy - horse.cy;
    const uq = sqrt(ux0 * ux0 + uy0 * uy0) || 1;
    const ux = ux0 / uq;
    const uy = uy0 / uq;
    const lx = -f.fy;
    const ly = f.fx;
    const a = ux * f.fx + uy * f.fy;
    const l = ux * lx + uy * ly;
    // The side away from the horse, in f's own frame (so the spot holds still as the horse rides about).
    const side = (a < 0 ? -a : a) >= (l < 0 ? -l : l);
    const sx = side ? (a < 0 ? -f.fx : f.fx) : l < 0 ? -lx : lx;
    const sy = side ? (a < 0 ? -f.fy : f.fy) : l < 0 ? -ly : ly;
    // (Further back from a friend locked in a fight: out of the riders' reach over his ranks.)
    const ext = (side ? f.depth : f.width) * 0.5 + (f.engaged ? COVER.gapFight : COVER.gap);
    const dir = r.team === 0 ? 1 : -1;
    const along = (side ? f.width : f.depth) * 0.5;
    // Along that side: the middle first, then a block's width either way (one beside the next,
    // the outer ones half covered: wide blocks of archers behind a narrow one of spears).
    const step = r.width + MISSILE_GAP;
    for (let k = 0; k < 5; k++) {
      const n = (k + 1) >> 1;
      const off = ((k & 1) === 1 ? n : -n) * step;
      if (k > 0 && (off < 0 ? -off : off) > along + step) continue;
      const x = f.cx + sx * ext - sy * off;
      const y = f.cy + sy * ext + sx * off;
      if (x < 10 || x > FIELD_W - 10 || y < 10 || y > FIELD_H - 10) continue;
      const dx = x - r.ax;
      const dy = y - r.ay;
      const d = sqrt(dx * dx + dy * dy);
      if (d > COVER.reach) continue;
      // Back toward our own side, or along it: not out toward the enemy's foot (with none near,
      // any side of the friend, wherever the horse rides).
      if ((x - r.ax) * dir > COVER.fwd && this.enemyFootNear(r.team, x, y, COVER.foot)) continue;
      if (d > COVER.there && this.spotTaken(r, x, y, -sy, sx, -sx, -sy)) continue;
      // Not toward the horse: the way there passes no nearer it than the block stands now.
      if (d > COVER.there) {
        const hx = horse.cx - r.ax;
        const hy = horse.cy - r.ay;
        const t = Math.max(0, Math.min(1, (hx * dx + hy * dy) / (d * d)));
        const px = hx - dx * t;
        const py = hy - dy * t;
        if (px * px + py * py < (hx * hx + hy * hy) * 0.5) continue;
      }
      // No other enemy close by it.
      let clear = true;
      for (const o of this.teamRegs[1 - r.team]!) {
        if (o === horse || o.alive === 0 || o.routed) continue;
        const ex = o.cx - x;
        const ey = o.cy - y;
        const rr = o.radius + COVER.clear;
        if (ex * ex + ey * ey < rr * rr) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      this.tmp[0] = x;
      this.tmp[1] = y;
      return true;
    }
    return false;
  }

  /**
   * The enemy that makes a block of shooters fire at will: the nearest one not locked with our
   * men whose men are within AT_WILL_GAP of its front, or one charging it from twice as far.
   */
  private threatTo(r: Regiment, rapid = false): Regiment | null {
    let best: Regiment | null = null;
    let bd = Infinity;
    const bows = rapid && this.fire[r.team]![r.cls] === 'lob';
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.engaged) continue;
      // HORSE (RAPID, `rapid`): bows standing to it loose as fast as they can draw at horse coming
      // on at them within 100 m.
      // (Before its front: horse come round its flank gets no such storm: ARC.)
      const ox = o.cx - r.cx;
      const oy = o.cy - r.cy;
      const coming = bows && isCav(o) && (o.mode === 'charge' || o.mode === 'flank') && (o.targetReg === r.id || o.vax * -ox + o.vay * -oy > 0) && ox * r.fx + oy * r.fy > 0.3 * sqrt(ox * ox + oy * oy);
      const reach = coming ? RAPID.range : o.mode === 'charge' && o.targetReg === r.id ? AT_WILL_GAP * 2 : AT_WILL_GAP;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + reach;
      if (dx * dx + dy * dy > rr * rr) continue;
      const g = this.gapTo(r, o);
      if (g < reach && g < bd) {
        bd = g;
        best = o;
      }
    }
    return best;
  }

  /** Wheels a block of shooters to face `o` only when it is well off its front (men shoot a little to either side). */
  private aimAt(r: Regiment, o: Regiment): void {
    const dx = o.cx - r.ax;
    const dy = o.cy - r.ay;
    const q = sqrt(dx * dx + dy * dy);
    if (q < 1) return;
    if ((dx * r.fx + dy * r.fy) / q < 0.9) this.faceToward(r, o.cx, o.cy);
    else {
      // Close enough to its front: stop any wheel toward an old target where it is.
      r.dfx = r.fx;
      r.dfy = r.fy;
    }
  }

  /**
   * Guns (and bombards) with friends in their line of fire: most of the shots since the last
   * think were held, so the block steps sideways, away from the friends in the way, to open a
   * line. Returns whether it moved.
   */
  private sidestep(r: Regiment): boolean {
    const held = r.blockedShots;
    const loosed = r.loosed;
    r.blockedShots = 0;
    if (held === 0 || held < loosed || r.blocker < 0) return false;
    const b = this.regiments[r.blocker]!;
    r.blocker = -1;
    const lx = -r.fy;
    const ly = r.fx;
    const tgt = r.targetReg >= 0 ? this.regiments[r.targetReg]! : null;
    if (r.role === 'missile' && tgt) {
      // (v17, QA #3/#13) Crossbows and guns behind our own line: along it to the nearest spot with
      // a clear line to the target (an interval of the line, or past its end), up to LANE_SEARCH
      // away; with none, they stand and wait for one.
      r.short = 0;
      r.loosed = 0;
      if (!this.clearLane(r, tgt)) return false;
      const sx = this.tmp[0]! - r.ax;
      const sy = this.tmp[1]! - r.ay;
      const step = sqrt(sx * sx + sy * sy);
      this.setMode(r, 'advance');
      this.goal(r, this.tmp[0]!, this.tmp[1]!);
      r.stepUntil = this.tick + Math.ceil((step / (FOOT_MARCH * FOOT_RUN)) * TICKS_PER_SECOND);
      return true;
    }
    const off = (r.cx - b.cx) * lx + (r.cy - b.cy) * ly;
    const side = off >= 0 ? 1 : -1;
    // Engines edge along; shooters step clear of the block in the way in one move (they shoot
    // only standing, in volleys: a step at a time between volleys would take all day).
    const clear = (b.width + r.width) / 2 + 4 - (off < 0 ? -off : off);
    const step = r.role === 'siege' ? 6 : Math.max(14, Math.min(60, clear));
    this.setMode(r, 'advance');
    this.goal(r, r.ax + lx * side * step, r.ay + ly * side * step);
    r.stepUntil = this.tick + Math.ceil((step / (FOOT_MARCH * FOOT_RUN)) * TICKS_PER_SECOND);
    r.short = 0;
    r.loosed = 0;
    return true;
  }

  /**
   * The nearest spot along the line (either way, LANE_STEP at a time, LANE_SEARCH at most) from
   * which a block of direct-fire shooters has a clear line to `tgt` past our own men: from the
   * middle of its front and from either half of it, each at the part of `tgt` before it. Puts it in
   * tmp[0], tmp[1]; false if there is none.
   */
  private clearLane(r: Regiment, tgt: Regiment): boolean {
    const d = this.d;
    const st = this.stats[r.team]![r.cls]!;
    const lx = -r.fy;
    const ly = r.fx;
    // (Each file shoots at the part of the target before it: the target's men in line with it.)
    const half = tgt.width * 0.4;
    const clearFrom = (x: number, y: number): boolean => {
      let ok = 0;
      for (let k = -1; k <= 1; k++) {
        const fx = x + lx * k * r.width * 0.3;
        const fy = y + ly * k * r.width * 0.3;
        const o = Math.max(-half, Math.min(half, (fx - tgt.cx) * lx + (fy - tgt.cy) * ly));
        const n = this.lineHits(fx, fy, tgt.cx + lx * o, tgt.cy + ly * o, -1, r.id, 1);
        if (n === 0 || d.team[this.lineIds[0]!] !== r.team) ok++;
      }
      return ok === 3;
    };
    for (let k = 1; k <= LANE_SEARCH / LANE_STEP; k++) {
      for (const sg of [1, -1]) {
        const x = r.ax + lx * sg * k * LANE_STEP;
        const y = r.ay + ly * sg * k * LANE_STEP;
        if (x < 10 || x > FIELD_W - 10 || y < r.width * 0.5 || y > FIELD_H - r.width * 0.5) continue;
        const q = sqrt((tgt.cx - x) * (tgt.cx - x) + (tgt.cy - y) * (tgt.cy - y));
        if (q > st.range * 0.95) continue;
        if (this.inFriends(r, x, y) >= 0 || this.spotTaken(r, x, y, lx, ly, r.fx, r.fy)) continue;
        if (!clearFrom(x, y)) continue;
        this.tmp[0] = x;
        this.tmp[1] = y;
        return true;
      }
    }
    return false;
  }

  /**
   * Stands to shoot at `tgt`. With no line of its own to bring it on, if most of the men found
   * it out of their reach since the last think, it steps toward it. (A regiment's centre can be
   * in range while its men are not: two armies of archers would otherwise stand just out of
   * reach of each other all day.)
   */
  /**
   * Where a block of shooters makes for to shoot at `o` from `range` (battle v17): its own spot
   * on that ring, not the same spot as every other block sent at the same enemy. The spot straight
   * before the enemy first, then one block's width and an interval to either side in turn (on the
   * ring, so still in range), and if the ring's front is full, a spot behind an interval of those
   * already placed. A spot is taken when another block of shooters of its side stands there or is
   * making for it. Puts it in tmp[0], tmp[1].
   */
  private firingSpot(r: Regiment, o: Regiment, range: number): void {
    let ux = o.cx - r.cx;
    let uy = o.cy - r.cy;
    const q = sqrt(ux * ux + uy * uy) || 1;
    ux /= q;
    uy /= q;
    const lx = -uy;
    const ly = ux;
    const lane = r.width + MISSILE_GAP;
    let bx = o.cx - ux * range;
    let by = o.cy - uy * range;
    for (let row = 0; row < 3; row++) {
      const back = row * (r.depth + MISSILE_GAP * 0.5);
      const half = row % 2 === 1 ? 0.5 : 0;
      for (let k = 0; k < 13; k++) {
        const n = (k + 1) >> 1;
        const off = ((k & 1) === 1 ? n : -n) * lane + half * lane;
        const rr = range - back;
        if (off * off > rr * rr * 0.6) continue;
        const fwd = sqrt(rr * rr - off * off);
        const x = o.cx - ux * fwd + lx * off;
        const y = o.cy - uy * fwd + ly * off;
        if (!this.spotTaken(r, x, y, lx, ly, ux, uy)) {
          this.tmp[0] = x;
          this.tmp[1] = y;
          return;
        }
        if (k === 0 && row === 0) {
          bx = x;
          by = y;
        }
      }
    }
    this.tmp[0] = bx;
    this.tmp[1] = by;
  }

  /**
   * Whether another block of shooters of `r`'s side stands at, or is making for, a spot near
   * (x, y) (`prior`: one before `r` in the order of battle, standing there).
   */
  private spotTaken(r: Regiment, x: number, y: number, lx: number, ly: number, ux: number, uy: number, prior = false): boolean {
    for (const o of this.teamRegs[r.team]!) {
      if (o === r || o.alive === 0 || o.routed || (o.role !== 'missile' && o.role !== 'siege')) continue;
      if (prior && o.phase > r.phase) continue;
      for (let k = 0; k < 2; k++) {
        const ex = (k === 0 ? o.tx : o.ax) - x;
        const ey = (k === 0 ? o.ty : o.ay) - y;
        const lat = ex * lx + ey * ly;
        const fwd = ex * ux + ey * uy;
        if (Math.abs(lat) < (r.width + o.width) * 0.5 + MISSILE_GAP * 0.5 && Math.abs(fwd) < (r.depth + o.depth) * 0.5 + MISSILE_GAP * 0.25) return true;
      }
    }
    return false;
  }

  /**
   * The friendly block of foot (or the general's household) whose ranks a block of shooters `r`
   * would stand in with its front's middle at (x, y), where it stands or where it is going; -1
   * none. (Skirmishers and engines are passed through; other shooters: `spotTaken`.)
   */
  private inFriends(r: Regiment, x: number, y: number): number {
    const dir = r.team === 0 ? 1 : -1;
    for (const o of this.teamRegs[r.team]!) {
      if (o === r || o.alive === 0 || o.routed || (o.role !== 'line' && o.role !== 'command')) continue;
      for (let k = 0; k < 2; k++) {
        const ex = (k === 0 ? o.tx : o.ax) - x;
        const ey = (k === 0 ? o.ty : o.ay) - y;
        // (Lines of the same army face the same way, near enough: their frames are r's.)
        if (Math.abs(ey) < (r.width + o.width) * 0.5 + 6 && Math.abs(ex * dir + (r.depth - o.depth) * 0.5) < (r.depth + o.depth) * 0.5 + 6) return o.id;
      }
    }
    return -1;
  }

  /**
   * A spot for a block of shooters near (x, y) out of our own foot's ranks (`inFriends`) and off
   * other shooters' spots: (x, y) itself if free, else the nearest free one along the line
   * (QA #11). Puts it in tmp[0], tmp[1].
   */
  private freeSpot(r: Regiment, x: number, y: number): void {
    const b = this.inFriends(r, x, y);
    if (b < 0) {
      this.tmp[0] = x;
      this.tmp[1] = y;
      return;
    }
    const pref = r.ay >= this.regiments[b]!.ay ? 1 : -1;
    for (let k = 1; k <= 12; k++) {
      for (const sg of [pref, -pref]) {
        const ty = clampY(y + sg * k * 20);
        if (this.inFriends(r, x, ty) >= 0 || this.spotTaken(r, x, ty, 0, 1, r.team === 0 ? 1 : -1, 0)) continue;
        this.tmp[0] = x;
        this.tmp[1] = ty;
        return;
      }
    }
    this.tmp[0] = x;
    this.tmp[1] = y;
  }

  private closeToShoot(r: Regiment, tgt: Regiment, always = false): void {
    if (r.short > r.loosed && (always || !this.ts[r.team]!.hasLine)) {
      const dx = tgt.cx - r.cx;
      const dy = tgt.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      this.goal(r, r.ax + (dx / q) * 10, r.ay + (dy / q) * 10);
    } else this.goal(r, r.ax, r.ay);
    r.short = 0;
    r.loosed = 0;
  }

  /**
   * Distance from the middle of `r`'s front to the nearest living man of `o`; that man's
   * position goes to tmp[0], tmp[1]. (Wide blocks are poorly described by their bounding
   * circles: two lines facing each other can be far apart with their circles overlapping.)
   */
  private gapTo(r: Regiment, o: Regiment): number {
    const d = this.d;
    let bd = Infinity;
    // (A formed block's runners are not of it: see `survey`.)
    const top = o.routed ? State.Routing : State.Fighting;
    for (const id of o.members) {
      if (d.state[id]! > top) continue;
      const dx = d.x[id]! - r.ax;
      const dy = d.y[id]! - r.ay;
      const q = dx * dx + dy * dy;
      if (q < bd) {
        bd = q;
        this.tmp[0] = d.x[id]!;
        this.tmp[1] = d.y[id]!;
      }
    }
    return sqrt(bd);
  }

  /** The nearest enemy (not running; horse only with `cav`) whose men are within `range` of `r`'s front. */
  private nearGap(r: Regiment, range: number, cav: boolean): Regiment | null {
    let best: Regiment | null = null;
    let bd = range;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || (cav && !isCav(o))) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + range;
      if (dx * dx + dy * dy > rr * rr) continue;
      const g = this.gapTo(r, o);
      if (g < bd) {
        bd = g;
        best = o;
      }
    }
    return best;
  }

  /** Walks `r` to stand with its front `dist` from the nearest man of `o`. */
  private standOff(r: Regiment, o: Regiment, dist: number): void {
    const g = this.gapTo(r, o);
    const px = this.tmp[0]!;
    const py = this.tmp[1]!;
    const ux = g > 0.01 ? (px - r.ax) / g : r.fx;
    const uy = g > 0.01 ? (py - r.ay) / g : r.fy;
    this.goal(r, px - ux * dist, py - uy * dist);
    this.faceToward(r, o.cx, o.cy);
  }

  /**
   * The best block to shoot at within `range` of the regiment: not locked with our own men.
   * `reach`: measured from the regiment's front to the target's nearest man (skirmishers and
   * horse archers, who shoot at close range and must not stand inside their own retreat
   * distance); otherwise from centre to centre, less half the target's spread. `over`: bows may
   * lob over a melee into a deep block's rear ranks (`overMelee`), if nothing better offers.
   */
  private shootable(r: Regiment, range: number, reach = false, over = false): Regiment | null {
    let best: Regiment | null = null;
    let bs = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || (o.engaged && !(over && overMelee(o))) || (o.id === r.fouled && this.tick < r.fouledUntil)) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const c = sqrt(dx * dx + dy * dy);
      if (reach && c - o.radius - r.radius > range) continue;
      const q = reach ? this.gapTo(r, o) : c - o.radius * 0.5;
      // TERRAIN: further from above; and not a block hidden in a wood, or behind one.
      if (q > (this.flat ? range : range + this.reachAdd(r.cx, r.cy, o.cx, o.cy, range))) continue;
      if (!this.flat && !this.seen(r, o, c)) continue;
      // Danger close (v17, QA #3): not a block whose men stand among ours, nor one we cannot
      // reach over a melee without our own men under the scatter.
      if (!this.clearTarget(r, o, Math.max(1, c), this.fire[r.team]![r.cls]!, this.stats[r.team]![r.cls]!)) continue;
      // Big blocks and horse first; keep the same target when it's still good.
      let s = q - (isCav(o) ? 20 : 0) - (o.id === r.targetReg ? 30 : 0) - (o.id === r.ord.target ? 40 : 0) - Math.min(40, o.alive * 0.3);
      if (o.role === 'skirmish') s += 25;
      if (o.engaged) s += 60;
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    return best;
  }

  /** TERRAIN: the reach a shot from (x0, y0) gains on a target at (x1, y1) from the height between them. */
  private reachAdd(x0: number, y0: number, x1: number, y1: number, range: number): number {
    const T = this.terrain;
    const add = (T.height[T.index(x0, y0)]! - T.height[T.index(x1, y1)]!) * TERRAIN.reachPerHeight;
    const most = range * TERRAIN.reachShare;
    return add > most ? most : add < -most ? -most : add;
  }

  /**
   * TERRAIN: whether block `r` can see block `o` (`c` apart, centre to centre): not when `o` stands
   * deep in a wood (unless close), nor across a stretch of trees between them (their own edges
   * left out: men at a wood's edge see out of it and are seen).
   */
  private seen(r: Regiment, o: Regiment, c: number): boolean {
    const T = this.terrain;
    if (T.woods.length === 0) return true;
    const io = T.index(o.cx, o.cy);
    if (T.woodDepth[io]! > TERRAIN.hideDepth && c > TERRAIN.hideNear + o.radius) return false;
    return T.woodOnLine(r.cx, r.cy, o.cx, o.cy, r.radius * 0.5 + TERRAIN.hideDepth, o.radius * 0.5 + TERRAIN.hideDepth, TERRAIN.edge) <= TERRAIN.sightWood;
  }

  private thinkSkirmish(r: Regiment): void {
    const ts = this.ts[r.team]!;
    const st = this.stats[r.team]![r.cls]!;
    const dir = r.team === 0 ? 1 : -1;
    const e = this.ts[1 - r.team]!;
    const gap = (e.frontX - ts.frontX) * dir;
    const threat = this.nearGap(r, 25, false) ?? this.nearGap(r, 70, true);
    // With no line of our own there is nothing to fall back behind (and `frontX` is then the
    // army's centre, which runs away from them as they walk toward it): they fight it out.
    const noLine = !ts.hasLine;
    let retired = !noLine && (r.mode === 'skirmish' || r.mode === 'reserve' || r.retired);
    // (v17, QA #5) Out again only with a real sortie's worth of javelins: not the one or two of a
    // fugitive taken in. Until v17 any javelin at all sent the block 100-150 before the line, to
    // throw it and run back, over and over.
    const sortie = r.ammoLeft >= r.alive * SKIRM.out;
    if (retired && r.mode === 'reserve' && sortie && !threat && gap > 160 && e.hasLine && this.tick - r.modeAt > 50) {
      // Safe behind the line with javelins left and the lines still apart: go out again.
      retired = false;
      r.retired = false;
      this.setMode(r, 'advance');
    }
    // Their place behind the line, which follows the line only when it has moved SKIRM.deadband
    // (`frontX` jumps whenever a block of the line is committed, charges or falls back).
    let hx = ts.frontX - dir * (ts.lineDepth + 70);
    // QA3 #5: shot at where they rest (the enemy's shooters, holding their arrows off the melee,
    // pick the men standing clear behind it), they go back out of the enemy's bowshot, or as far
    // as SKIRM.shelterFar. Until then they stood 70 behind the line and were shot
    // down to the last man, out of javelins and with nothing to answer with.
    if (retired && (r.mode === 'reserve' || r.mode === 'shoot') && r.arrows > SKIRM.shot && !this.nearGap(r, 60, false)) r.shelterAt = this.tick;
    // (Once shot at, they do not come back into the arrows: back to their place only once it is
    // out of the enemy's bowshot, or after a while with their place clear of arrows.)
    if (this.tick - r.shelterAt < SKIRM.shelterFor || (r.shelterAt > -1000 && this.bowshotAt(r.team, hx, r.ay, r.radius))) {
      let back = SKIRM.shelterStep;
      while (back < SKIRM.shelterFar && this.bowshotAt(r.team, hx - dir * back, r.ay, r.radius)) back += SKIRM.shelterStep;
      hx = clampX(hx - dir * back);
    }
    if (r.restAt < 0 || Math.abs(hx - r.restX) > SKIRM.deadband) {
      r.restX = hx;
      r.restAt = this.tick;
    }
    const home = r.restX;
    const homeY = r.ay;
    if (r.ord.kind === 'pursue') {
      const prey = this.nearestFoe(r, 4, 300);
      if (prey && !this.nearestFoe(r, 0, 120)) {
        this.setMode(r, 'pursue');
        this.goal(r, prey.cx, prey.cy);
        return;
      }
    }
    if (noLine && r.ammoLeft === 0) {
      this.thinkLine(r);
      return;
    }
    if (!retired && !noLine && (r.ammoLeft < r.alive * SKIRM.spent || threat || (gap < 95 && ts.hasLine && e.hasLine))) {
      // Fall back through our own line (spent: a javelin or so a man left, kept for close work).
      this.setMode(r, 'skirmish');
      r.retired = true;
    }
    if (r.mode === 'skirmish' && !noLine) {
      this.goal(r, home, homeY);
      r.dfx = dir;
      r.dfy = 0;
      if ((r.ax - home) * dir < 8) this.setMode(r, 'reserve');
      return;
    }
    if (retired) {
      this.goal(r, home, homeY);
      r.dfx = dir;
      r.dfy = 0;
      const t = r.ammoLeft > 0 ? this.shootable(r, st.range * 0.9) : null;
      if (t) {
        // Loose at whatever comes in range from behind the line.
        r.targetReg = t.id;
        this.setMode(r, 'shoot');
      } else this.setMode(r, 'reserve');
      return;
    }
    if (this.tick < 30) return;
    // QA3 #3: with no line of their own to fall back behind, they give ground before slower foot
    // coming on (Lechaeum): back out of its reach at a run while it is still SKIRM.back off, halt
    // and throw, and back again; they fight only once out of javelins, or with no ground behind
    // them (the field's edge). Until then they stood and threw until the foot was on them, and
    // were cut down by men who could never have caught them.
    r.giving = false;
    if (noLine && r.ammoLeft > 0) {
      const foot = this.nearGap(r, SKIRM.back, false);
      if (foot && !isCav(foot) && foot.speed < r.speed * SKIRM.faster) {
        this.standOff(r, foot, SKIRM.backTo);
        const bx = r.tx - r.ax;
        const by = r.ty - r.ay;
        if (bx * bx + by * by > SKIRM.room * SKIRM.room) {
          this.setMode(r, 'skirmish');
          r.targetReg = foot.id;
          r.giving = true;
          return;
        }
      }
    }
    const best = this.shootable(r, st.range * 0.9, true);
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      this.closeToShoot(r, best, true);
      this.aimAt(r, best);
      return;
    }
    const near = this.nearestFoe(r, 0, Infinity);
    if (!near) return;
    this.setMode(r, 'advance');
    r.targetReg = near.id;
    // Within javelin range of its nearest men, outside the distance at which they fall back.
    this.standOff(r, near, st.range * 0.6);
  }

  private thinkCav(r: Regiment, shock: boolean, giving = false): void {
    const team = r.team;
    const e = this.ts[1 - team]!;
    const dir = team === 0 ? 1 : -1;
    const o = r.ord;
    // A chase that has turned into something else is over.
    if (r.chaseAt >= 0 && r.mode !== 'pursue') {
      r.chaseAt = -1;
      r.recallAt = this.tick;
    }
    if (this.tick < (shock ? 60 : 40)) {
      this.setMode(r, 'hold');
      return;
    }
    let prey0 = r.targetReg >= 0 ? this.regiments[r.targetReg]! : null;
    if (r.engaged && r.mode !== 'withdraw' && (!prey0 || prey0.alive === 0)) {
      // The block it rode into is gone: take on whoever it is fighting now.
      prey0 = this.nearestFoe(r, 0, 30);
      r.targetReg = prey0 ? prey0.id : -1;
    }
    if (r.engaged && r.mode !== 'withdraw') {
      // (A charge that rides through and back into the fight flickers between charge and melee
      // from one think to the next: the melee's clock runs on unless it has been out of the
      // fight a while. Until v14 every flicker reset it, and few cycle charges ever came.)
      if (r.mode !== 'melee' && this.tick - r.meleeAt > COHESION.meleeGone) r.meleeTicks = 0;
      r.meleeAt = this.tick;
      r.meleeTicks += 5;
      this.setMode(r, 'melee');
      if (prey0 && (this.breaksOff(r, prey0) || this.inOurRanks(r) || this.idleRanks(r))) {
        // Cycle charge: break off, ride back as a loose crowd to re-form on the rally point, and
        // come again (P4).
        this.rallyPoint(r, prey0, shock);
        this.rallyFacing(r, prey0.cx, prey0.cy);
        r.cycles++;
        r.meleeTicks = 0;
        for (const id of r.members) this.d.hs[id] = 0.85 + this.rng.next() * 0.3;
        this.setMode(r, 'withdraw');
        this.goal(r, r.wx, r.wy);
        return;
      }
      if (prey0) {
        // (Against horse, beside another block of ours on it, not into its riders: leftover 5.)
        if (isCav(prey0)) {
          this.besideFriends(r, prey0, prey0.cx, prey0.cy);
          this.goal(r, this.tmp[0]!, this.tmp[1]!);
        } else this.goal(r, prey0.cx, prey0.cy);
      }
      return;
    }
    if (r.mode === 'withdraw') {
      const dx = r.wx - r.ax;
      const dy = r.wy - r.ay;
      // (Its riders ride each for his own spot (see `move`): it is there when they are.)
      const cx = r.wx - r.cx;
      const cy = r.wy - r.cy;
      const there = r.role !== 'command' && cx * cx + cy * cy < RIDER.there * RIDER.there;
      if (!there && dx * dx + dy * dy > 18 * 18 && this.tick - r.modeAt < (r.toBanner ? 160 : COHESION.rideOut)) return;
      // There: rein in, close up knee to knee (see `move`), wheel and come again. (The riders
      // came in facing the fight, each to his own spot: the block is already about, and does
      // not wheel round its middle.)
      this.setMode(r, 'hold');
      if (r.role !== 'command') {
        // The block's frame is where its men are, facing the fight: its front half its depth
        // before their middle.
        r.fx = r.dfx;
        r.fy = r.dfy;
        r.ax = r.cx + r.fx * r.depth * 0.5;
        r.ay = r.cy + r.fy * r.depth * 0.5;
        r.aspd = 0;
      }
      r.reformUntil = this.tick + COHESION.reform + this.rng.int(COHESION.reformSpread);
      return;
    }
    // RIDER: horse coming at it while it re-forms it does not wait for: it meets it at the gallop.
    let rush: Regiment | null = null;
    if (r.mode === 'hold' && r.charges > 0 && this.tick < Math.max(r.reformUntil, r.modeAt + 15)) {
      rush = this.nearestFoe(r, 2, RIDER.meet);
      if (!rush || (rush.mode !== 'charge' && rush.mode !== 'pursue') || (rush.vax * (r.cx - rush.cx) + rush.vay * (r.cy - rush.cy) <= 0)) return;
      r.reformUntil = this.tick;
    }

    // The order's target, or one of opportunity.
    let prey: Regiment | null = null;
    // (Not one it has just given up on: see `giveUp`.)
    const skip = this.tick < r.spurnUntil ? r.spurnReg : -1;
    const given = o.target >= 0 && o.target !== skip ? this.regiments[o.target]! : null;
    // Fugitives close by tempt the horse out of its place (eager horse readily, the Templars
    // seldom); once off after them it keeps on until called back (see below).
    // (Not horse rallying to charge again (P4): it is re-forming, not looking for fugitives.)
    const fugitives = o.kind === 'pursue' || r.mode === 'charge' || r.engaged || (r.chaseAt < 0 && r.cycles > 0 && this.tick - r.meleeAt < COHESION.cycleBusy) ? null : this.nearestFoe(r, 4, r.chaseAt >= 0 ? 300 : 200);
    if (rush) prey = rush;
    else if (fugitives && fugitives.alive >= 3 && (r.chaseAt >= 0 || (this.tick - r.recallAt >= this.doc[team]!.recall && r.moraleState === 'steady' && this.rng.chance(r.eager * 0.3)))) prey = fugitives;
    else if (o.kind === 'hold' || o.kind === 'reserve') {
      // On the wing: counter-charge horse that comes close, fight foot that walks into us. (T1:
      // Templar knights held back by the Marshal ride back to their place from foot instead:
      // the Rule forbids a charge without his word.)
      prey = this.nearestFoe(r, 2, 90, skip) ?? (shock && this.doc[team]!.signal && this.lordAlive(team) ? null : this.nearestFoe(r, 0, 25));
      if (!prey) {
        const gx = Number.isNaN(o.x) ? r.ax : o.x;
        const gy = Number.isNaN(o.y) ? r.ay : o.y;
        // Forming up out of bowshot (`horseStrike`), it walks and trots to its place rather than drift there.
        const g = this.generals[team]!;
        const far = (gx - r.ax) * (gx - r.ax) + (gy - r.ay) * (gy - r.ay) > STRIKE_THERE * STRIKE_THERE;
        this.setMode(r, far && g.stageAt >= 0 && g.strikeAt < 0 ? 'advance' : 'hold');
        this.goal(r, gx, gy);
        r.dfx = dir;
        r.dfy = 0;
        return;
      }
    } else if (o.kind === 'pursue') prey = this.nearestFoe(r, 4, Infinity) ?? this.nearestFoe(r, 0, Infinity);
    else if (given && given.alive > 0 && !given.routed) prey = given;
    // (T1: knights whose horse is gone, with no signal given, look for more horse or wait for the
    // Marshal's word: they do not ride on at the shooters behind it on their own.)
    else if (shock && this.doc[team]!.signal && this.lordAlive(team) && this.generals[team]!.signalTarget < 0) prey = this.nearestFoe(r, 2, 300, skip);
    else prey = this.nearestFoe(r, 2, 300, skip) ?? this.nearestFoe(r, 1, Infinity, skip) ?? this.nearestFoe(r, 4, 260) ?? this.nearestFoe(r, 3, Infinity, skip) ?? this.nearestFoe(r, 0, Infinity, skip);
    if (!prey) {
      this.setMode(r, 'hold');
      this.goal(r, r.ax, r.ay);
      return;
    }
    if (prey.routed && o.kind !== 'pursue' && r.chaseAt < 0 && (this.tick - r.recallAt < this.doc[team]!.recall || (r.cycles > 0 && this.tick - r.meleeAt < COHESION.cycleBusy) || !this.rng.chance(0.05 + r.eager * 0.4))) {
      // Disciplined horse keeps to its work rather than chase fugitives on its own.
      prey = this.nearestFoe(r, 0, Infinity);
      if (!prey) {
        this.setMode(r, 'hold');
        this.goal(r, r.ax, r.ay);
        return;
      }
    }
    r.targetReg = prey.id;
    if (prey.routed) {
      // Run them down, but not off the field: disciplined horse is called back sooner.
      if (r.chaseAt < 0) {
        if (o.kind !== 'pursue') this.events.push({ tick: this.tick, team, kind: 'chase', cls: r.cls, reg: r.id });
        r.chaseAt = this.tick;
        r.chaseX = r.ax;
        r.chaseY = r.ay;
      }
      const edge = r.team === 0 ? FIELD_W - prey.cx : prey.cx;
      const dx = r.ax - r.chaseX;
      const dy = r.ay - r.chaseY;
      // T1: Templar knights barely leave the banner; S2: the samurai chase far.
      const doc = this.doc[team]!;
      const far = Math.min(shock ? doc.knightFar : Infinity, (200 + 400 * r.eager) * doc.chaseFar);
      const tired = Math.min(shock ? doc.knightTired : Infinity, (120 + 300 * r.eager) * doc.chaseTired);
      if (o.kind !== 'pursue' && (edge < 60 || dx * dx + dy * dy > far * far || this.tick - r.chaseAt > tired)) {
        r.chaseAt = -1;
        r.recallAt = this.tick;
        this.give(r, 'reserve', -1, 0, -1, r.homeX, r.homeY);
        this.setMode(r, 'withdraw');
        r.toBanner = false;
        r.wx = r.homeX;
        r.wy = r.homeY;
        this.rallyFacing(r, prey.cx, prey.cy);
        this.goal(r, r.homeX, r.homeY);
        return;
      }
      if (r.mode !== 'pursue') for (const id of r.members) this.d.hs[id] = 0.8 + this.rng.next() * 0.4;
      this.setMode(r, 'pursue');
      this.goal(r, prey.cx + prey.fx * 10, prey.cy + prey.fy * 10);
      return;
    }
    r.chaseAt = -1;
    // HORSE (round 3): not across massed bowshot. Foot standing under the cover of formed bows
    // with arrows to spare is left be (unless told to charge, or a rash general's knights): the
    // horse draws back out of their reach and looks for other prey or waits for the bows to be
    // locked in the fight or shot out. One that has lost a good share of its riders to them on the
    // way in breaks off and re-forms out of their reach, unless it is nearly there.
    const reach = prey.radius + r.radius + SENSE.breakNear * 1.5;
    const far = (prey.cx - r.cx) * (prey.cx - r.cx) + (prey.cy - r.cy) * (prey.cy - r.cy) > reach * reach;
    if (far && !isCav(prey) && !prey.engaged && r.mode !== 'charge' && o.kind !== 'charge' && !(shock && this.generals[team]!.rashKnights) && this.bowsDeadly(r, prey.cx, prey.cy, r.cx, r.cy, prey)) {
      // (A way round to its open flank, out of the worst of its fire, if there is one.)
      if (this.flankWay(r, prey)) {
        this.setMode(r, 'flank');
        this.goal(r, this.tmp[0]!, this.tmp[1]!);
        r.targetReg = prey.id;
        return;
      }
      // (Nowhere out of their reach to draw back to, the bows coming on, it goes in all the same.)
      if (this.outOfBowshot(r, prey)) {
        r.spurnReg = prey.id;
        r.spurnUntil = this.tick + SENSE.spurn;
        r.approachReg = -1;
        this.setMode(r, 'advance');
        this.goal(r, this.tmp[0]!, this.tmp[1]!);
        r.targetReg = -1;
        return;
      }
    }
    if (!isCav(prey) && !prey.engaged) {
      if (r.approachReg !== prey.id) {
        r.approachReg = prey.id;
        r.approachN = this.riders(r);
      }
      const lost = r.approachN - this.riders(r);
      const gx = prey.cx - r.cx;
      const gy = prey.cy - r.cy;
      const gap = sqrt(gx * gx + gy * gy) - prey.radius - r.radius;
      if (r.role !== 'command' && lost >= Math.max(SENSE.breakMin, r.approachN * SENSE.breakLoss) && gap > SENSE.breakNear && r.arrows > 0.2) {
        r.spurnReg = prey.id;
        r.spurnUntil = this.tick + SENSE.spurn;
        r.approachReg = -1;
        this.outOfBowshot(r, prey);
        r.wx = this.tmp[0]!;
        r.wy = this.tmp[1]!;
        r.toBanner = false;
        this.rallyFacing(r, prey.cx, prey.cy);
        for (const id of r.members) this.d.hs[id] = 0.85 + this.rng.next() * 0.3;
        this.setMode(r, 'withdraw');
        this.goal(r, r.wx, r.wy);
        this.events.push({ tick: this.tick, team, kind: 'doctrine', cls: r.cls, reg: r.id, note: 'breaks-off' });
        return;
      }
    } else r.approachReg = -1;
    // Ride round the enemy line rather than through it.
    // Prey behind the enemy line: out past the end of the line, then round behind it.
    const behindFront = (prey.cx - e.frontX) * dir > 15;
    const along = (r.cx - e.frontX) * dir;
    if (e.hasLine && behindFront && along < e.lineDepth + 25 && r.mode !== 'charge') {
      const up = r.cy - e.minY < e.maxY - r.cy;
      const wy = up ? e.minY - 70 : e.maxY + 70;
      const inSpan = r.cy > e.minY - 45 && r.cy < e.maxY + 45;
      this.setMode(r, 'flank');
      // Out to the side, no further than 120 from their front either way. (Until v4 this was
      // clamped to [front - dir * 120, front + 120], an empty range for the right-hand army,
      // whose horse first rode back to 120 short of the line on every pass.)
      if (inSpan) this.goal(r, Math.min(Math.max(r.cx, e.frontX - 120), e.frontX + 120), wy);
      else this.goal(r, e.frontX + dir * (e.lineDepth + 60), wy);
      return;
    }
    // RIDER: no horseman rides at the points of braced spears while there is a way round. Facing
    // the front of a block set against horse (not yet locked in a fight), horse free to choose
    // takes foot locked in the fight or shooters close by instead; failing those, it rides out round the
    // end of the spears and charges from the side. (Not a rash general's knights: they charge
    // headlong, as at Courtrai and Mansourah.)
    if (r.mode !== 'charge' && isFoot(prey) && !prey.engaged && (prey.stance === 'pikewall' || prey.stance === 'braced') && !(shock && this.generals[team]!.rashKnights)) {
      // (Horse held back, and the Templar knights, whose one target is the Marshal's, keep to
      // the one they have.)
      const free = o.kind !== 'hold' && o.kind !== 'reserve' && !this.doc[team]!.signal;
      const alt = free ? this.nearestFoe(r, 3, RIDER.spurn) ?? this.nearestFoe(r, 1, RIDER.spurn) : null;
      if (alt && alt !== prey && alt.stance !== 'pikewall' && alt.stance !== 'braced') {
        prey = alt;
        r.targetReg = prey.id;
      } else {
        const lox = -prey.fy;
        const loy = prey.fx;
        const ex = r.cx - prey.ax;
        const ey = r.cy - prey.ay;
        const ahead = ex * prey.fx + ey * prey.fy;
        const lat = ex * lox + ey * loy;
        if (ahead > -10 && (lat < 0 ? -lat : lat) < prey.width * 0.5 + r.width * 0.5 + 10) {
          const sg = lat < 0 ? -1 : 1;
          const out = prey.width * 0.5 + r.width * 0.5 + 40;
          this.setMode(r, 'flank');
          this.goal(r, clampX(prey.ax + lox * sg * out - prey.fx * prey.depth * 0.5), clampY(prey.ay + loy * sg * out - prey.fy * prey.depth * 0.5));
          return;
        }
      }
    }
    // Against foot locked in melee (or when told to): come at its rear.
    const rear = isFoot(prey) && (prey.engaged || (o.kind === 'flank' && o.side === 3));
    const dpx = prey.cx - r.cx;
    const dpy = prey.cy - r.cy;
    const dp = sqrt(dpx * dpx + dpy * dpy) || 1;
    if (rear) {
      const rx = prey.ax - prey.fx * (prey.depth + 45);
      const ry = prey.ay - prey.fy * (prey.depth + 45);
      // Already behind it (on the far side of its facing)?
      const side = (r.cx - prey.cx) * prey.fx + (r.cy - prey.cy) * prey.fy;
      const ex = rx - r.ax;
      const ey = ry - r.ay;
      if (side > -prey.depth * 0.5 - 10 && ex * ex + ey * ey > 30 * 30 && r.mode !== 'charge') {
        this.setMode(r, 'flank');
        // Swing out to its side first if we're in front of it.
        // (Once there, on round to the rear: until the sweep after v16 a block whose middle
        // was still level with the side of a deep block stood at that point for good.)
        const lx = -prey.fy;
        const ly = prey.fx;
        const s = (r.cx - prey.cx) * lx + (r.cy - prey.cy) * ly >= 0 ? 1 : -1;
        const sx = prey.cx + lx * s * (prey.width * 0.5 + 50) - prey.fx * 20;
        const sy = prey.cy + ly * s * (prey.width * 0.5 + 50) - prey.fy * 20;
        if (side > 0 && (sx - r.ax) * (sx - r.ax) + (sy - r.ay) * (sy - r.ay) > 25 * 25) this.goal(r, sx, sy);
        else this.goal(r, rx, ry);
        return;
      }
    }
    if (dp < 160 || r.mode === 'charge') {
      if (r.mode !== 'charge') {
        r.charges++;
        this.events.push({ tick: this.tick, team, kind: 'charge', cls: r.cls, reg: r.id });
        // T1: launched on the Marshal's signal, at his target: the held charge.
        r.held = shock && this.doc[team]!.signal && this.generals[team]!.signalTarget === prey.id;
        r.stallGap = Infinity;
        r.stallAt = this.tick;
        if (r.openFor !== prey.id) r.openFor = -1;
      } else if (this.chargeSpent(r, prey)) {
        if (!giving) return this.thinkCav(r, shock, true);
        this.setMode(r, 'hold');
        this.goal(r, r.ax, r.ay);
        return;
      }
      this.setMode(r, 'charge');
      // Aim through the target, so the charge carries into it; a charge that has run on without
      // a blow (it rode past or round its target) makes straight for it instead, or it rides
      // round it for good (see `moveAnchor`).
      const past = this.tick - r.modeAt > CHARGE_MISSED ? 0 : 40;
      let gx = prey.cx + (dpx / dp) * past;
      let gy = prey.cy + (dpy / dp) * past;
      // Its open side, away from our men fighting it, until the riders are round on that side.
      if (r.openFor === prey.id && this.openSide(r, prey)) {
        gx = this.tmp[0]!;
        gy = this.tmp[1]!;
      }
      this.besideFriends(r, prey, gx, gy);
      this.goal(r, this.tmp[0]!, this.tmp[1]!);
      this.faceToward(r, prey.cx, prey.cy);
      return;
    }
    this.setMode(r, 'flank');
    this.besideFriends(r, prey, prey.cx - (dpx / dp) * 90, prey.cy - (dpy / dp) * 90);
    this.goal(r, this.tmp[0]!, this.tmp[1]!);
  }

  /**
   * QA round 2 #3, #4: whether a charge that has not come to blows is over, and what then.
   *  - It cannot get at its prey (#3): no headway (the gap to it has not closed by
   *    `RIDER.stallBy` in `RIDER.stallFor`, and no rider has a foe), as when the prey is locked with our own men and the way to it runs
   *    through them (`rideRound` puts the goal beside them, where the horse already stands).
   *    Once a block, it rides for the prey's open side (`openSide`); if there is none, or it is
   *    stuck again, it leaves the prey be (`RIDER.spurnFor`) and takes another (the caller
   *    thinks again).
   *  - It cannot catch it (#4): a charge `RIDER.outrun` past `CHARGE_MISSED` without a blow at
   *    horse as fast as itself or riding away (horse archers kiting, light horse), or any charge
   *    `RIDER.chargeFor` without a blow: it gives up the chase, rides back to re-form
   *    (`rallyPoint`) and leaves that block be a while. (Until v17 a charge never gave up:
   *    knights rode 400 u circles after horse archers for a minute and more.)
   * True when the charge is over (and the caller should think again), the block set up for it.
   */
  private chargeSpent(r: Regiment, prey: Regiment): boolean {
    const t = this.tick;
    // (Headway: the gap to the prey's middle closed by `stallBy` since the best yet; or blows.)
    const gx = prey.cx - r.cx;
    const gy = prey.cy - r.cy;
    const gap = sqrt(gx * gx + gy * gy);
    if (gap < r.stallGap - RIDER.stallBy || this.blows(r)) {
      r.stallGap = gap;
      r.stallAt = t;
    }
    const run = t - r.modeAt;
    // (Fleet: horse riding free, not held in a fight, and as fast or riding away.)
    const fleet = isCav(prey) && !prey.engaged && prey.mode !== 'melee' && (prey.speed >= r.speed * 0.95 || prey.mode === 'kite' || prey.mode === 'skirmish' || prey.mode === 'withdraw');
    if ((fleet && run > CHARGE_MISSED + RIDER.outrun) || run > RIDER.chargeFor) {
      this.giveUp(r, prey, true);
      return true;
    }
    if (t - r.stallAt <= RIDER.stallFor || run <= RIDER.stallFor) return false;
    r.stallGap = gap;
    r.stallAt = t;
    if (r.openFor !== prey.id && prey.engaged && this.openSide(r, prey)) {
      r.openFor = prey.id;
      return false;
    }
    this.giveUp(r, prey, false);
    return true;
  }

  /** Whether any rider of `r` has a foe (in the fight, or about to strike). */
  private blows(r: Regiment): boolean {
    const d = this.d;
    for (const id of r.members) if (d.state[id] === State.Fighting && d.target[id]! >= 0) return true;
    return false;
  }

  /** Leaves `prey` be for `RIDER.spurnFor`: rides back to re-form (`back`), or turns to another target at once. */
  private giveUp(r: Regiment, prey: Regiment, back: boolean): void {
    r.spurnReg = prey.id;
    r.spurnUntil = this.tick + RIDER.spurnFor;
    r.openFor = -1;
    r.targetReg = -1;
    if (back) {
      this.rallyPoint(r, prey, r.role === 'shock-cav');
      this.rallyFacing(r, prey.cx, prey.cy);
      for (const id of r.members) this.d.hs[id] = 0.85 + this.rng.next() * 0.3;
      this.setMode(r, 'withdraw');
      this.goal(r, r.wx, r.wy);
    } else this.setMode(r, 'flank');
  }

  /**
   * QA round 2 #3: the far side of `prey` from our men fighting it, clear of every friend, as a
   * goal for horse in `tmp` (false: no such side, or the riders are on it already).
   */
  private openSide(r: Regiment, prey: Regiment): boolean {
    let ux = 0;
    let uy = 0;
    for (const f of this.teamRegs[r.team]!) {
      if (f === r || f.alive === 0 || f.routed || !f.engaged) continue;
      const fx = prey.cx - f.cx;
      const fy = prey.cy - f.cy;
      const q = sqrt(fx * fx + fy * fy);
      if (q < 1 || q > prey.radius + f.radius + 20) continue;
      ux += (fx / q) * f.alive;
      uy += (fy / q) * f.alive;
    }
    const m = sqrt(ux * ux + uy * uy);
    if (m < 1e-6) return false;
    ux /= m;
    uy /= m;
    // (Round on that side already: it charges straight in.)
    if ((r.cx - prey.cx) * ux + (r.cy - prey.cy) * uy > prey.radius * 0.5) return false;
    const off = prey.radius + r.depth * 0.5 + RIDER.room;
    const gx = clampX(prey.cx + ux * off);
    const gy = clampY(prey.cy + uy * off);
    for (const f of this.teamRegs[r.team]!) {
      if (f === r || f.alive === 0 || f.routed) continue;
      const fx = gx - f.cx;
      const fy = gy - f.cy;
      const q = f.radius + r.width * 0.5;
      if (fx * fx + fy * fy < q * q) return false;
    }
    this.tmp[0] = gx;
    this.tmp[1] = gy;
    return true;
  }

  /**
   * Leftover 5: two blocks of our horse on one enemy horse come at it side by side, not into
   * each other: a block going for enemy horse that another of ours is riding at, charging or
   * fighting from
   * about the same side (within RIDER.sameSide of its bearing from the prey), about as near it,
   * aims half the room
   * the two fronts need off the prey's middle, across the line of its ride, away from the friend
   * (the friend does the same the other way). (Until v17 both aimed at its middle and met there
   * as one crowd under two standards.) Into `tmp`.
   */
  private besideFriends(r: Regiment, prey: Regiment, gx: number, gy: number): void {
    this.tmp[0] = gx;
    this.tmp[1] = gy;
    if (!isCav(prey) || r.role === 'command') return;
    const dx = prey.cx - r.cx;
    const dy = prey.cy - r.cy;
    const L = sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / L;
    const py = dx / L;
    for (const o of this.teamRegs[r.team]!) {
      if (o === r || o.alive === 0 || o.routed || o.targetReg !== prey.id || !isMounted(o) || o.role === 'command') continue;
      if (o.mode !== 'charge' && o.mode !== 'melee' && o.mode !== 'flank') continue;
      const ox = prey.cx - o.cx;
      const oy = prey.cy - o.cy;
      const M = sqrt(ox * ox + oy * oy) || 1;
      if ((ox * dx + oy * dy) / (L * M) < RIDER.sameSide) continue;
      // (Level with it: one riding behind the other follows it in, round it, see `rideRound`.)
      const ahead = L - M;
      if ((ahead < 0 ? -ahead : ahead) > (r.depth + o.depth) * 0.5 + RIDER.room * 2) continue;
      let lat = (o.cx - r.cx) * px + (o.cy - r.cy) * py;
      if (lat === 0) lat = r.id < o.id ? 1 : -1;
      const sg = lat > 0 ? -1 : 1;
      const need = ((r.width + o.width) * 0.5 + RIDER.room) * RIDER.besideShare;
      this.tmp[0] = clampX(this.tmp[0]! + px * sg * need);
      this.tmp[1] = clampY(this.tmp[1]! + py * sg * need);
    }
  }

  /**
   * P4: whether horse locked in a melee breaks off to charge again. Against foot of the line
   * (and the general's household) after COHESION.footMelee ticks, braced spears sooner (shooters
   * caught in the open it rides down).
   * Against horse after `horseMelee`: the weaker side (by `cavWorth`) breaks off first, more
   * likely than not each think, and the stronger often enough rallies too rather than chase
   * deep. Never more than `cavCycles` times, nor blown (fatigue). Not against the dead, nor the
   * dead themselves: a fresh charge buys nothing from men who feel no fear and barely reel (U2),
   * so the horse stays and hacks; and the dead never give a step.
   */
  private breaksOff(r: Regiment, o: Regiment): boolean {
    const C = COHESION;
    if (o.routed || r.cycles >= C.cavCycles || r.fatigue > C.cavBlown || this.fearless[o.team] || !this.doc[r.team]!.loose.stepBack) return false;
    if (isCav(o)) {
      if (r.meleeTicks <= C.horseMelee) return false;
      return this.rng.chance(this.cavWorth(r) < this.cavWorth(o) ? C.breakWeaker : C.breakStronger);
    }
    if (o.role !== 'line' && o.role !== 'command') return false;
    const braced = o.stance === 'pikewall' || o.stance === 'braced';
    if (r.meleeTicks <= (braced ? C.footBraced : C.footMelee)) return false;
    // Its target is the block it was sent at; its men may be cutting down the shooters behind
    // it (or beside it) instead. Those it rides down: it breaks off only if most of its men
    // are fighting foot of the line or the household. (Until the sweep after v14 it went by the
    // target alone, and broke off from archers it had caught.)
    const d = this.d;
    let line = 0;
    let shooters = 0;
    for (const id of r.members) {
      const t = d.target[id]!;
      if (t < 0 || d.state[id] !== State.Fighting) continue;
      const role = this.regiments[d.reg[t]!]!.role;
      if (role === 'missile' || role === 'skirmish' || role === 'siege') shooters++;
      else line++;
    }
    return line >= shooters;
  }

  /**
   * RIDER: horse locked in a fight with many of its riders (`RIDER.ranksShare`) in the ranks of
   * our own foot fighting the same enemy breaks off to charge again elsewhere (its next charge
   * rides round that foot, `rideRound`), as often as a cycle charge may (not blown, not the dead).
   */
  private inOurRanks(r: Regiment): boolean {
    const C = COHESION;
    if (r.cycles >= C.cavCycles || r.fatigue > C.cavBlown || !this.doc[r.team]!.loose.stepBack) return false;
    const d = this.d;
    let n = 0;
    let among = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      n++;
      if (this.amongFoot(id)) among++;
    }
    return n > 0 && among >= n * RIDER.ranksShare;
  }

  /**
   * QA review #14: horse locked in a fight with half or more of its riders (RIDER.idleShare)
   * standing at the back of it with no foe they can get at for RIDER.idleFor (packed behind
   * their own front riders, or behind our foot) breaks off to charge again, as often as a cycle
   * charge may. (Until v17 the knights stood there for the rest of the melee: 6.7% of riders
   * idle over two seconds with an enemy within 40, 12.5% at 2800 a side.)
   */
  private idleRanks(r: Regiment): boolean {
    const C = COHESION;
    if (r.meleeTicks <= RIDER.idleFor || r.cycles >= C.cavCycles || r.fatigue > C.cavBlown || !this.doc[r.team]!.loose.stepBack) return false;
    const d = this.d;
    const slow = r.speed * 0.15;
    let n = 0;
    let idle = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      n++;
      // (Standing: not riding round to a flank of his own, see `flankPoint`.)
      if (d.target[id]! < 0 && d.idl[id]! > 0 && this.tick - d.idl[id]! > RIDER.idleFor && d.vx[id]! * d.vx[id]! + d.vy[id]! * d.vy[id]! < slow * slow) idle++;
    }
    return n > 0 && idle >= n * RIDER.idleShare;
  }

  /** What a block of horse is worth in a clash of horse: men, class, wind and losses (the fearless's morale says nothing). */
  private cavWorth(r: Regiment): number {
    const v = this.stats[r.team]![r.cls]!.value;
    return r.alive * v * (1 - 0.4 * r.fatigue) * Math.max(0.5, 1 - r.recent * 4);
  }

  /**
   * P4: where horse that breaks off re-forms (`wx`, `wy`): COHESION.rideOut... away from the
   * fight, bent back toward its own side. T1 overrides it: Templar knights within the Marshal's
   * `recallRange` ride back to his banner (`toBanner`).
   */
  private rallyPoint(r: Regiment, from: Regiment, shock: boolean): void {
    const team = r.team;
    const dir = team === 0 ? 1 : -1;
    const doc = this.doc[team]!;
    const C = COHESION;
    // (T1 is the Marshal's charge into foot: from a clash of horse the knights rally close by.)
    r.toBanner = shock && !isCav(from) && doc.recallTo > 0 && this.lordWithin(team, r.cx, r.cy, doc.recallRange);
    if (r.toBanner) {
      const cmd = this.commander[team]!;
      r.wx = clampX(this.d.x[cmd]! + dir * doc.recallTo);
      r.wy = clampY(this.d.y[cmd]! + (r.homeY < FIELD_H / 2 ? -1 : 1) * 40);
      return;
    }
    let dx = r.cx - from.cx;
    let dy = r.cy - from.cy;
    let q = sqrt(dx * dx + dy * dy) || 1;
    dx = dx / q - dir * C.homeward;
    dy = dy / q;
    q = sqrt(dx * dx + dy * dy) || 1;
    const far = C.rideFar + this.rng.int(C.rideFarSpread);
    r.wx = clampX(r.cx + (dx / q) * far);
    r.wy = Math.max(30, Math.min(FIELD_H - 30, r.cy + (dy / q) * far));
    // Against the edge of the field: back toward its own side and the middle instead.
    const gx = r.wx - r.cx;
    const gy = r.wy - r.cy;
    if (gx * gx + gy * gy < far * far * 0.36) {
      r.wx = clampX(r.cx - dir * far * 0.9);
      r.wy = Math.max(30, Math.min(FIELD_H - 30, r.cy + (FIELD_H / 2 - r.cy) * 0.25));
    }
  }

  /** RIDER: horse riding out faces, at its rally point, back toward (x, y): its `dfx`, `dfy`. */
  private rallyFacing(r: Regiment, x: number, y: number): void {
    const dx = x - r.wx;
    const dy = y - r.wy;
    const q = sqrt(dx * dx + dy * dy);
    if (q < 1) {
      r.dfx = r.team === 0 ? 1 : -1;
      r.dfy = 0;
      return;
    }
    r.dfx = dx / q;
    r.dfy = dy / q;
  }

  private thinkHorseArcher(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    if (this.tick < 40) {
      this.setMode(r, 'hold');
      return;
    }
    if (r.ord.kind === 'pursue') {
      this.thinkCav(r, false);
      return;
    }
    const threat = this.nearGap(r, RIDER.haFoot, false) ?? this.nearGap(r, 90, true);
    if (threat) {
      // Ride away from it, sideways along the field, loosing as they go. (The sideways turn is
      // taken the same way by both armies: until v4 it was not mirrored, so the right-hand army's
      // horse archers veered toward the edge where the left's veered toward the middle.)
      const dx = r.cx - threat.cx;
      const dy = r.cy - threat.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / q;
      const uy = dy / q;
      const s = (r.cy < FIELD_H / 2 ? -1 : 1) * (r.team === 0 ? 1 : -1);
      this.goal(r, r.cx + ux * 80 - uy * 30 * s, r.cy + uy * 80 + ux * 30 * s);
      const t = this.shootable(r, st.range * 0.95, true);
      r.targetReg = t ? t.id : -1;
      this.setMode(r, 'kite');
      return;
    }
    const best = this.shootable(r, st.range * 0.9, true);
    // HORSE (round 3): horse archers do not ride into the reach of bows that outshoot them: they
    // skirmish at its edge, shooting at whatever they reach from there.
    if (this.haEdge(r, st, best)) return;
    if (best) {
      this.setMode(r, 'shoot');
      r.targetReg = best.id;
      this.closeToShoot(r, best, true);
      this.faceToward(r, best.cx, best.cy);
      return;
    }
    let near: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.engaged) continue;
      const q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
      if (q < bd) {
        bd = q;
        near = o;
      }
    }
    if (!near) {
      this.setMode(r, 'hold');
      return;
    }
    this.setMode(r, 'advance');
    r.targetReg = near.id;
    // In bow range of its nearest men, well outside the distance at which they ride off.
    this.standOff(r, near, st.range * 0.6);
  }

  /**
   * HORSE (round 3): whether horse archers `r` keep out of the reach of formed bows that outrange
   * them (and gave the block its orders): when the spot they would shoot `best` from (or where they
   * stand) lies within that reach (SENSE.haPad more), they stand at its edge, away from the
   * nearest such bows, and shoot at whatever is in range from there.
   */
  private haEdge(r: Regiment, st: UnitStats, best: Regiment | null): boolean {
    let sx = r.cx;
    let sy = r.cy;
    if (best) {
      const dx = r.cx - best.cx;
      const dy = r.cy - best.cy;
      const q = sqrt(dx * dx + dy * dy) || 1;
      const k = Math.min(q, st.range * 0.85);
      sx = best.cx + (dx / q) * k;
      sy = best.cy + (dy / q) * k;
    }
    if (this.bowCover(r.team, sx, sy, SENSE.haPad + r.radius, st.range + 1) === 0 && this.bowCover(r.team, r.cx, r.cy, SENSE.haPad + r.radius, st.range + 1) === 0) return false;
    let e: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || o.role !== 'missile' || o.ammoLeft === 0 || o.engaged) continue;
      if (this.stats[1 - r.team]![o.cls]!.range <= st.range) continue;
      const q = (o.cx - r.cx) * (o.cx - r.cx) + (o.cy - r.cy) * (o.cy - r.cy);
      if (q < bd) {
        bd = q;
        e = o;
      }
    }
    if (!e) return false;
    const dx = r.cx - e.cx;
    const dy = r.cy - e.cy;
    const q = sqrt(dx * dx + dy * dy) || 1;
    const R = this.stats[1 - r.team]![e.cls]!.range + e.radius + r.radius + SENSE.haPad;
    this.goal(r, clampX(e.cx + (dx / q) * R), clampY(e.cy + (dy / q) * R));
    const t = this.shootable(r, st.range * 0.95, true);
    r.targetReg = t ? t.id : -1;
    this.setMode(r, t ? 'kite' : 'advance');
    if (t) this.faceToward(r, t.cx, t.cy);
    return true;
  }

  /**
   * Engines shoot at the biggest enemy block in range that they can hit without dropping stones
   * among our own men (v17, QA #2): danger close, a crew lifts its fire off the front, where the
   * lines are about to meet or have met, onto the blocks behind (the enemy's second line, its
   * reserves coming up), and holds when there is none. With no enemy in range at all they come
   * up behind our line (QA #7: until v17 they stood at the back edge of the field all day).
   */
  private thinkSiege(r: Regiment): void {
    const st = this.stats[r.team]![r.cls]!;
    const kind = this.fire[r.team]![r.cls]!;
    let best: Regiment | null = null;
    let bs = -Infinity;
    let inRange = false;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const q2 = dx * dx + dy * dy;
      if (q2 > st.range * st.range) continue;
      inRange = true;
      if (o.engaged || (o.id === r.fouled && this.tick < r.fouledUntil)) continue;
      const q = sqrt(q2);
      if (!this.clearTarget(r, o, q, kind, st)) continue;
      const sc = o.alive + (o.id === r.targetReg ? 10 : 0);
      if (sc > bs) {
        bs = sc;
        best = o;
      }
    }
    r.targetReg = best ? best.id : -1;
    const ts = this.ts[r.team]!;
    if (!best && !inRange && ts.hasLine && this.tick >= 30) {
      // Nothing within reach: come up behind the line (no nearer than the archers stand).
      const dir = r.team === 0 ? 1 : -1;
      const x = ts.frontX - dir * (ts.lineDepth + MISSILE_BEHIND + SIEGE_BEHIND + r.depth);
      if ((x - r.ax) * dir > 30) {
        this.setMode(r, 'advance');
        this.goal(r, x, r.ay);
        r.dfx = dir;
        r.dfy = 0;
        return;
      }
    }
    this.setMode(r, best ? 'shoot' : 'hold');
    if (!best || !this.sidestep(r)) this.goal(r, r.ax, r.ay);
    if (best) this.faceToward(r, best.cx, best.cy);
  }

  /**
   * Whether an engine (or shooter) of `r` can shoot at block `o`, `q` away, with its scatter clear
   * of our own men: aimed at its middle or at its far half.
   */
  private clearTarget(r: Regiment, o: Regiment, q: number, kind: Ballistics, st: UnitStats): boolean {
    const sp = spreadAt(kind, q, st.range, false);
    const h = sp + (kind === 'siege' ? SIEGE_SPLASH : kind === 'cannon' ? CANNON_BOUND * 0.5 : 0) + DANGER.margin;
    const fl = Math.max(3, Math.round((q / st.projectileSpeed) * TICKS_PER_SECOND));
    if (!this.friendsNear(r.team, o.cx, o.cy, h, fl)) return true;
    const ux = (o.cx - r.cx) / (q || 1);
    const uy = (o.cy - r.cy) / (q || 1);
    const back = Math.min(o.radius, o.depth * 0.5 + 4);
    return !this.friendsNear(r.team, o.cx + ux * back, o.cy + uy * back, h, fl);
  }

  private thinkCommand(r: Regiment): void {
    const t = r.team;
    const g = this.generals[t]!;
    const ts = this.ts[t]!;
    const dir = t === 0 ? 1 : -1;
    r.dfx = dir;
    r.dfy = 0;
    const reach = g.trait === 'reckless-valour' ? 90 : 40;
    // Where he keeps: behind the middle of our line, in sight of the men; with no line left,
    // behind the middle of what is left. (The army's centre leaves the general himself out, or
    // stepping back from it would walk him off the back of the field.)
    let px: number;
    let py: number;
    if (ts.hasLine) {
      // (Behind the blocks that stand behind the line there, too, the archers and the second
      // line: a post inside them had the household shoved to and fro about them.)
      py = ts.midY;
      let back = ts.lineDepth + 55;
      for (const o of this.teamRegs[t]!) {
        if (o === r || o.alive === 0 || o.routed || isCav(o) || o.role === 'skirmish' || o.role === 'siege') continue;
        if ((o.cy > py ? o.cy - py : py - o.cy) > o.radius + 30) continue;
        const behind = (ts.frontX - o.cx) * dir + o.radius + 35;
        if (behind > back && behind < POST_BACK) back = behind;
      }
      // (Nor on the engines' ground: QA review 2 #5. A post on an engine had the household riding
      // round it and back as it crept forward. It stands just behind the engine, or with no
      // room there, just before it.)
      for (const o of this.teamRegs[t]!) {
        if (o.role !== 'siege' || o.alive === 0 || o.routed || (o.cy > py ? o.cy - py : py - o.cy) > o.radius + POST_CLEAR) continue;
        const at = (ts.frontX - o.cx) * dir;
        if ((at > back ? at - back : back - at) >= o.radius + POST_CLEAR) continue;
        back = at + o.radius + POST_CLEAR < POST_BACK || at - o.radius - POST_CLEAR < ts.lineDepth + 40 ? at + o.radius + POST_CLEAR : at - o.radius - POST_CLEAR;
      }
      px = ts.frontX - dir * back;
    } else {
      let k = 0;
      let x = 0;
      let y = 0;
      for (const o of this.teamRegs[t]!) {
        if (o === r || o.alive === 0 || o.routed) continue;
        k += o.alive;
        x += o.cx * o.alive;
        y += o.cy * o.alive;
      }
      if (k === 0) {
        // His army is gone: he and his household ride at the enemy (standing still would
        // leave two lone generals facing each other until the time limit).
        g.lastStand = true;
        const foe = this.nearestFoe(r, 0, Infinity);
        if (foe) {
          this.setMode(r, 'advance');
          this.goal(r, foe.cx, foe.cy);
          this.faceToward(r, foe.cx, foe.cy);
        } else this.goal(r, r.ax, r.ay);
        return;
      }
      px = x / k - dir * 80;
      py = y / k;
    }
    g.lastStand = false;
    // (QA review #6: the line's front jumps tens of units whenever a block is committed,
    // charges, runs or is pulled out; until v17 the household followed every jump, backing its
    // horses to and fro behind the line. It eases after it, and moves only when its spot has
    // drifted POST_DEADBAND off; but a front gone back a long way at once, it follows at once.)
    if (Number.isNaN(g.postX) || (r.ax - px) * dir > HOUSEHOLD.ahead) {
      g.postX = px;
      g.postY = py;
    } else {
      g.postX += (px - g.postX) * POST_EASE;
      g.postY += (py - g.postY) * POST_EASE;
    }
    // (QA review 2 #5: the middle of the line shifts to and fro along it as blocks go in, and a
    // post that followed every shift had the household jigging. It moves along the line only
    // once its spot has drifted POST_ALONG off, and after a move it stands for POST_STAND unless
    // its spot has gone well off: HOUSEHOLD.ahead.)
    // (A household cut down to a handful keeps out of the enemy's bowshot: a lone general at his
    // post behind the line was shot down where he stood, the Lich-Marshal among them, before his
    // host broke. It falls back toward our edge, POST_SHY at most.)
    if (r.alive <= r.start * HOUSEHOLD.spent) {
      let back = 0;
      while (back < POST_SHY && this.bowshotAt(t, clampX(g.postX - dir * back), g.postY, r.radius + 20)) back += 40;
      if (back > 0) {
        g.postX = clampX(g.postX - dir * back);
        g.guardX = g.postX;
        g.guardY = g.postY;
        g.guardAt = this.tick;
      }
    }
    const gx = g.postX - g.guardX;
    const gy = g.postY - g.guardY;
    const off = (gx * gx) / (POST_DEADBAND * POST_DEADBAND) + (gy * gy) / (POST_ALONG * POST_ALONG);
    const far = gx * gx + gy * gy > HOUSEHOLD.ahead * HOUSEHOLD.ahead;
    if (Number.isNaN(g.guardX) || far || (off > 1 && this.tick - g.guardAt >= POST_STAND)) {
      g.guardX = g.postX;
      g.guardY = g.postY;
      g.guardAt = this.tick;
    }
    // Since when the household has been locked in this fight.
    if (r.engaged) {
      if (g.fightFrom < 0) g.fightFrom = this.tick;
    } else if (r.mode !== 'melee') g.fightFrom = -1;
    // QA review #4: a lord on whose life his army hangs (the dead crumble when the Lich-Marshal
    // falls) keeps behind his line and commits his household only with the odds on his side.
    // He weighs every enemy block within HOUSEHOLD.wary of it (a wavering one at half), and
    // fights what comes within `reach` only while they are worth no more than HOUSEHOLD_ODDS
    // times the household, it is not spent (HOUSEHOLD.spent of its riders), and it has not
    // fought this fight for HOUSEHOLD.fight; else he breaks off, toward his post and away from
    // them, and does not take on again for HOUSEHOLD.off. (Until v17 he drew back only from
    // a single block twice his worth, and only while his army had a line: with his line gone
    // the household fought to its last rider, 300-440 units ahead of what was left of his
    // army. The Lich-Marshal fell in a quarter of all battles, the other generals in 6-8%.)
    const val = (o: Regiment) => o.alive * this.stats[o.team]![o.cls]!.value;
    // (QA3: weighed by what its riders have left in them: a household of seven, three of them
    // bleeding, is not seven fresh riders. Until then a bloodied household took on a block of 37
    // as if fresh, and the Lich-Marshal fell with it before his host broke.)
    let left = 0;
    let riders = 0;
    const full = this.stats[t]![r.cls]!.hp;
    for (const id of r.members) {
      if (this.d.state[id] !== State.Fighting || this.soldiers[id]!.commander) continue;
      riders++;
      left += Math.min(1, this.d.hp[id]! / full);
    }
    const ours = val(r) * (riders > 0 ? left / riders : 1);
    const near = this.nearGap(r, reach, false);
    let threat = 0;
    let danger: Regiment | null = null;
    let dg = Infinity;
    // (Drawing back, it keeps on until they are a little further off: no to and fro at the edge.)
    const wary = HOUSEHOLD.wary * (r.mode === 'withdraw' ? 1.4 : 1);
    for (const o of this.teamRegs[1 - t]!) {
      if (o.alive === 0 || o.routed) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const rr = o.radius + r.radius + wary;
      if (dx * dx + dy * dy > rr * rr) continue;
      const q = this.gapTo(r, o);
      if (q > wary) continue;
      threat += val(o) * (o.moraleState === 'wavering' ? 0.5 : 1);
      if (q < dg) {
        dg = q;
        danger = o;
      }
    }
    const spent = r.alive <= r.start * HOUSEHOLD.spent;
    const long = g.fightFrom >= 0 && this.tick - g.fightFrom > HOUSEHOLD.fight;
    const odds = threat <= HOUSEHOLD_ODDS * ours;
    if ((near || r.engaged) && odds && !spent && !long && this.tick >= g.offUntil) {
      this.setMode(r, 'melee');
      r.targetReg = near ? near.id : r.targetReg;
      if (near) {
        this.gapTo(r, near);
        this.goal(r, this.tmp[0]!, this.tmp[1]!);
      }
      return;
    }
    if (danger && (near || r.engaged || !odds)) {
      // Break off: away from the nearest of them, and toward his post.
      if (near || r.engaged) g.offUntil = this.tick + HOUSEHOLD.off;
      g.fightFrom = -1;
      this.gapTo(r, danger);
      let ux = r.ax - this.tmp[0]!;
      let uy = r.ay - this.tmp[1]!;
      let q = sqrt(ux * ux + uy * uy) || 1;
      ux /= q;
      uy /= q;
      // (Toward his post, unless they stand by it: then back, toward our own edge.)
      const ex = g.guardX - this.tmp[0]!;
      const ey = g.guardY - this.tmp[1]!;
      const safe = ex * ex + ey * ey > HOUSEHOLD.wary * HOUSEHOLD.wary;
      const hx = safe ? g.guardX - r.ax : -dir * 100;
      const hy = safe ? g.guardY - r.ay : 0;
      const h = sqrt(hx * hx + hy * hy);
      if (h > 1) {
        ux += hx / h;
        uy += hy / h;
        q = sqrt(ux * ux + uy * uy);
        if (q < 0.1) {
          // (His post lies straight through them: he rides off to the side, toward our own edge.)
          ux = -dir * 0.6 - uy;
          uy = hx / h;
          q = sqrt(ux * ux + uy * uy) || 1;
        }
        ux /= q;
        uy /= q;
      }
      this.setMode(r, 'withdraw');
      this.goal(r, clampX(r.ax + ux * 2 * Math.max(reach, 60)), clampY(r.ay + uy * 2 * Math.max(reach, 60)));
      return;
    }
    // Keep the post: at a canter when well ahead of it (his front gone back a long way).
    this.setMode(r, (r.ax - g.guardX) * dir > HOUSEHOLD.ahead ? 'withdraw' : 'guard');
    // (Near enough its spot it stands where it is: nudged a few strides by friends going by, it
    // does not walk back and forth: QA review 2 #5.)
    const sx = g.guardX - r.ax;
    const sy = g.guardY - r.ay;
    if (r.mode === 'guard' && sx * sx + sy * sy < POST_STEADY * POST_STEADY && this.tick - g.guardAt > POST_STAND) this.goal(r, r.ax, r.ay);
    else this.goal(r, g.guardX, g.guardY);
  }

  /** Pins every regiment of a class on one side to a stance (tests and tools). */
  pinStance(team: number, cls: number, stance: Stance | null): void {
    for (const r of this.teamRegs[team]!) {
      if (r.cls !== cls || r.role === 'command') continue;
      r.pinned = stance;
      if (stance) this.setStance(r, stance);
    }
  }

  private setStance(r: Regiment, s: Stance): void {
    if (r.stance === s) return;
    r.stance = s;
    r.stanceAt = this.tick;
    r.spacing = spacingFor(r, s);
    // Re-form in the new shape, the front rank first so the men in front stay in front.
    this.assignSlots(r, true);
    if (r.tell(s, this.tick)) this.events.push({ tick: this.tick, team: r.team, kind: 'stance', cls: r.cls, reg: r.id, stance: s });
  }

  /** Each kind of regiment picks among its two or three stances for what it faces now. */
  private chooseStance(r: Regiment): void {
    if (r.pinned) {
      this.setStance(r, r.pinned);
      return;
    }
    let s: Stance = r.stance;
    let urgent = false;
    const cavThreat = (range: number) => {
      const c = this.nearestFoe(r, 2, range);
      return !!c && (c.mode === 'charge' || c.mode === 'flank' || c.mode === 'melee' || c.mode === 'pursue');
    };
    switch (r.role) {
      case 'line': {
        // (QA review 2 #7: it deploys from column into line before it comes into the enemy's
        // bowshot, BOWSHOT_MARGIN short of it, and forms column again only well out of it. Until
        // then it kept its column until a foe was within 240, and took the arrows in column.)
        const march = (r.mode === 'advance' || r.mode === 'reserve') && !r.engaged && !this.nearestFoe(r, 0, 240) && !this.inBowshot(r, BOWSHOT_MARGIN + (r.stance === 'column' ? 0 : BOWSHOT_REFORM));
        const dx = r.tx - r.ax;
        const dy = r.ty - r.ay;
        const far = dx * dx + dy * dy > 230 * 230;
        const base: Stance = march && far ? 'column' : 'line';
        if (r.cls === U.Spearmen) {
          if (r.mode === 'brace' || cavThreat(150)) {
            s = 'pikewall';
            urgent = true;
          } else s = r.engaged ? (r.stance === 'column' ? 'line' : r.stance) : base;
        } else if (r.cls === U.Shock) {
          if (r.engaged) s = r.stance === 'column' ? 'line' : r.stance;
          else if (cavThreat(130) || r.mode === 'hold') {
            s = 'braced';
            urgent = cavThreat(130);
          } else s = base;
        } else {
          if (r.engaged) s = r.stance === 'column' ? 'line' : r.stance;
          else if (r.arrows > 2.5 || cavThreat(120)) {
            s = 'shieldwall';
            urgent = true;
          } else if (r.stance === 'shieldwall' && r.arrows > 0.6) s = 'shieldwall';
          else s = base;
        }
        if (r.engaged && r.stance === 'column') urgent = true;
        break;
      }
      case 'missile':
        s = r.engaged || r.mode === 'melee' || this.drawn(r) ? 'line' : 'loose';
        urgent = r.engaged;
        break;
      case 'skirmish':
      case 'horse-archer':
        s = 'loose';
        break;
      case 'flank':
        s = r.mode === 'melee' || r.mode === 'pursue' ? 'loose' : 'line';
        break;
      case 'shock-cav':
        s = r.mode === 'charge' || r.mode === 'flank' ? 'wedge' : 'line';
        urgent = r.mode === 'charge';
        break;
      default:
        s = 'line';
    }
    if (s === r.stance) return;
    if (!urgent && this.tick - r.stanceAt < 25) return;
    this.setStance(r, s);
  }

  /** Whether a block stands within `margin` of the reach of an enemy block of foot shooters with arrows left (edge to edge). */
  private inBowshot(r: Regiment, margin: number): boolean {
    return this.bowshotAt(r.team, r.cx, r.cy, r.radius + margin);
  }

  /** Whether (x, y), and `pad` about it, lies within the reach of an enemy block of foot shooters (of team `t`'s enemy) with arrows left. */
  private bowshotAt(t: number, x: number, y: number, pad: number): boolean {
    const st = this.stats[1 - t]!;
    for (const o of this.teamRegs[1 - t]!) {
      if (o.alive === 0 || o.routed || o.role !== 'missile' || o.ammoLeft === 0) continue;
      const far = st[o.cls]!.range + pad + o.radius;
      const dx = o.cx - x;
      const dy = o.cy - y;
      if (dx * dx + dy * dy < far * far) return true;
    }
    return false;
  }

  /**
   * The nearest enemy regiment by edge distance within `range`, of a kind:
   * 0 any fighting, 1 missiles and engines, 2 horse, 3 foot locked in melee, 4 routed.
   */
  private nearestFoe(r: Regiment, kind: number, range: number, skip = -1): Regiment | null {
    let best: Regiment | null = null;
    let bd = Infinity;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.id === skip) continue;
      if (kind === 4 ? !o.routed : o.routed) continue;
      if (kind === 1 && o.role !== 'missile' && o.role !== 'siege') continue;
      if (kind === 2 && !isCav(o)) continue;
      if (kind === 3 && !(o.engaged && (isFoot(o) || o.role === 'command'))) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) - o.radius - r.radius;
      if (q < range && q < bd) {
        bd = q;
        best = o;
      }
    }
    return best;
  }

  private rout(r: Regiment): void {
    if (r.routed || this.fearless[r.team]) return;
    r.routed = true;
    r.mode = 'rout';
    r.modeAt = this.tick;
    r.routAt = this.tick;
    r.quietSince = this.tick;
    r.targetReg = -1;
    // A chase ends when the chasers break (else, rallied, they would run on after it at once).
    r.chaseAt = -1;
    // Broken once too often (a second rout is final unless REGROUP.extra allows a re-forming, and
    // then only with enough of it left), or too few left to stand again: shattered. (The undead
    // never rout: see `fearless`.)
    const spent = r.rallies >= REGROUP.rallies + REGROUP.extra + this.doc[r.team]!.reforms || (r.rallies >= REGROUP.rallies && r.alive < Math.max(REGROUP.minMen, r.start * REGROUP.share));
    const shattered = spent || r.alive < r.start * MORALE.shatterBelow || this.broken[r.team];
    r.moraleState = shattered ? 'shattered' : 'broken';
    this.events.push({ tick: this.tick, team: r.team, kind: shattered ? 'shattered' : 'rout', cls: r.cls, reg: r.id });
    const d = this.d;
    // Each man runs his own way: away from the enemy that broke them and toward his own edge,
    // in a fan, at his own pace (the strong outrun the wounded).
    const tmp = this.tmp;
    this.fleeFrom(r, tmp);
    const bx = tmp[0]!;
    const by = tmp[1]!;
    for (const id of r.members) {
      if (d.state[id] === State.Fighting) d.state[id] = State.Routing;
      d.target[id] = -1;
      d.imp[id] = 0;
      d.jn[id] = 0;
      const t = (this.rng.next() - 0.5) * 1.6;
      // (1, t) rotated onto the base heading.
      const q = sqrt(1 + t * t);
      d.hx[id] = (bx - by * t) / q;
      d.hy[id] = (by + bx * t) / q;
      d.hs[id] = 0.78 + this.rng.next() * 0.4;
    }
    // Panic spreads to neighbours, as hard as the share of the men about them that broke; the
    // enemy takes heart.
    const R2 = MORALE.friendRoutRange * MORALE.friendRoutRange;
    let about = r.alive;
    for (const o of this.teamRegs[r.team]!) {
      if (o.routed || o === r || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < R2) about += o.alive;
    }
    const panic = Math.min(MORALE.friendRoutCap, (MORALE.friendRout * r.alive) / Math.max(1, about));
    for (const o of this.teamRegs[r.team]!) {
      if (o.routed || o === r || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < R2) this.shake(o, o.role === 'command' ? 2 : panic);
    }
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.routed || o.alive === 0) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      if (dx * dx + dy * dy < MORALE.enemyRoutRange * MORALE.enemyRoutRange) o.morale = Math.min(100, o.morale + MORALE.enemyRout);
    }
  }
  /**
   * Which way a broken regiment runs (unit vector to out[0], out[1]): away from the nearest enemy,
   * toward its own edge. With that enemy between it and home, it runs round him, on the side
   * with the more room (until v17 the blend of the two pointed sideways or at the enemy's edge,
   * and light horse caught behind the enemy fled off the far side of the field).
   */
  private fleeFrom(r: Regiment, out: Float64Array): void {
    const edge = r.team === 0 ? -1 : 1;
    let ex = 0;
    let ey = 0;
    let bd = Infinity;
    let foe: Regiment | null = null;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed) continue;
      const dx = r.cx - o.cx;
      const dy = r.cy - o.cy;
      const q = dx * dx + dy * dy;
      if (q < bd) {
        bd = q;
        ex = dx;
        ey = dy;
        foe = o;
      }
    }
    let x = edge;
    let y = 0;
    if (bd < 250 * 250 && foe) {
      const q = sqrt(bd) || 1;
      x = (ex / q) * 0.6 + edge * 0.55;
      y = (ey / q) * 0.6;
      if ((ex / q) * edge < 0.3) {
        // He stands between them and home: round him, on their side of him unless the field's
        // edge is too close there.
        const reach = this.formRadius(foe) + 40;
        const up = foe.cy - reach;
        const down = FIELD_H - (foe.cy + reach);
        let side = ey > 8 ? 1 : ey < -8 ? -1 : down >= up ? 1 : -1;
        if ((side > 0 ? down : up) < 30 && (side > 0 ? up : down) > 30) side = -side;
        x = edge * 0.5;
        y = side * 0.87;
      }
    }
    const m = sqrt(x * x + y * y) || 1;
    out[0] = x / m;
    out[1] = y / m;
  }

  /** Walks each regiment's anchor toward its goal and wheels it toward its facing, once a tick. */
  private moveAnchor(r: Regiment): void {
    r.vax = 0;
    r.vay = 0;
    if (r.alive === 0 || r.routed) {
      r.aspd = 0;
      return;
    }
    const horse = isMounted(r);
    // A goal in a friend's place is taken: the block stands beside him instead (`clearGoal`).
    // (Not horse riding round to a flank: `rideRound` has its way past friends already, and
    // this put the goal back beside the friend it stood by, where the knights halted for good:
    // QA review #14.)
    if ((this.tick + r.phase) % 5 === 0 && !r.engaged && !r.slip && r.role !== 'skirmish' && r.mode !== 'pursue' && r.mode !== 'charge' && r.mode !== 'withdraw' && !(horse && r.mode === 'flank')) this.clearGoal(r);
    const dx = r.tx - r.ax;
    const dy = r.ty - r.ay;
    const q = sqrt(dx * dx + dy * dy);
    let wx = r.dfx;
    let wy = r.dfy;
    // Horse rides a far goal the way it faces, so it needs room to wheel: close in, it walks.
    // Shooters fall back by an about-turn, man by man: the block keeps its front toward the enemy
    // and does not wheel round. (Until v9 javelin men falling back behind their line wheeled the
    // whole loose block about, a slow pirouette, and back again when they halted.)
    // Likewise a block of shooters stepping sideways to open a line of fire sidles at the double, facing front.
    const aboutTurn = !horse && (r.role === 'skirmish' || r.role === 'missile') && q > 30 && MARCH[r.mode] && (dx * r.dfx + dy * r.dfy < -0.3 * q || this.tick < r.stepUntil);
    // (A reserve dressing on its friend a short way off sidesteps, facing front: QA review 2 #5.)
    const marching = !aboutTurn && q > (r.role === 'command' ? POST_REIN : horse ? HORSE_REIN : r.mode === 'reserve' && r.role === 'line' && r.ord.kind === 'reserve' ? RESERVE_SIDESTEP : 30) && MARCH[r.mode];
    if (marching) {
      wx = dx / q;
      wy = dy / q;
    }
    // Foot facing a big turn (or under threat close by) faces round, man by man, and re-forms,
    // when that is quicker than wheeling the whole block (see `turnFoot`).
    if (!horse && (this.tick + r.phase) % 5 === 0) this.turnFoot(r, wx, wy, marching);
    // A wheel that would sweep the block into a friend with the right of way stops short (`crowded`).
    const ofx = r.fx;
    const ofy = r.fy;
    const yields = this.yields(r, aboutTurn && this.tick >= r.stepUntil) && (!horse || (r.mode !== 'charge' && r.mode !== 'withdraw' && r.mode !== 'rally'));
    const before = yields && (wx !== ofx || wy !== ofy) ? this.crowded(r, r.ax, r.ay, ofx, ofy) : 0;
    this.wheel(r, wx, wy, horse);
    if (yields && (r.fx !== ofx || r.fy !== ofy)) {
      const after = this.crowded(r, r.ax, r.ay, r.fx, r.fy);
      if (after > 0 && after > before + 0.05) {
        r.fx = ofx;
        r.fy = ofy;
      }
    }
    if (q < 0.3) {
      r.aspd = 0;
      if (yields) this.giveWay(r, 0, 0, r.speed * 0.25);
      return;
    }
    const sd = STANCES[r.stance];
    let pace = r.speed * PACE[r.mode];
    if (pace === 0) pace = r.speed * 0.25; // drift onto the spot
    // Formed foot marches at the drill's pace, whatever the men's speed (the heavy keep up; nobody
    // hurries: shock troops, whose 0.6 of speed is 10.8, keep up too); skirmishers in open order
    // go at a jog, and engines at their crews' crawl.
    else if ((r.role === 'line' || r.role === 'missile') && (r.mode === 'advance' || r.mode === 'reserve')) pace = FOOT_MARCH * (r.nearLord ? 1 : this.doc[r.team]!.tide);
    // Foot breaks into a run for a charge or a chase.
    if ((r.mode === 'charge' || r.mode === 'pursue') && !isCav(r)) pace *= this.doc[r.team]!.footRun;
    // S3: guns going out through their line, or back through it, go at the double.
    if (r.slip && (r.mode === 'advance' || r.mode === 'skirmish')) pace = Math.max(pace, FOOT_MARCH * FOOT_RUN);
    // Skirmishers giving ground (QA3 #3) run as fast as they can keep together.
    if (r.giving && r.mode === 'skirmish') pace = Math.max(pace, r.speed * SKIRM.run);
    // Shooters running for cover from horse (`takeCover`) run as fast as they can keep together.
    if (r.slip && r.coverReg >= 0) pace = Math.max(pace, r.speed * COVER.run);
    pace *= sd.pace * (1 - FATIGUE.pace * r.fatigue);
    let ux = dx / q;
    let uy = dy / q;
    // TERRAIN: the block goes at the pace of the ground under its front (its middle and either
    // end), up or down the slope it is walking: its men there keep up, those on worse ground lag.
    if (!this.flat) pace *= this.groundPace(r, ux, uy, horse);
    const al = r.fx * ux + r.fy * uy;
    if (marching) {
      if (horse) {
        if (al > 0.3 || r.aspd > r.speed * HORSE_WALK) {
          // Horse goes where it faces and reins in to turn: it wheels in an arc, wider the faster
          // it rides, and cannot turn about at speed.
          pace *= al > 0.8 ? 1 : al > 0.3 ? 0.75 : 0.35;
          // A charge whose target lies inside its turning circle would ride round it for good
          // (until v8 two riders could circle each other to the time limit): pull up to a walk,
          // which turns on the spot. The circle at speed v has radius v / w; the goal at (dx, dy)
          // lies inside it when q^2 < 2 (v / w) |facing x (dx, dy)|.
          if (r.mode === 'charge' && al < 0.95) {
            const cr = r.fx * dy - r.fy * dx;
            if (q * q * turnRate(r, true) < 2 * r.aspd * TICK_S * (cr < 0 ? -cr : cr)) pace = Math.min(pace, r.speed * HORSE_WALK);
          }
          ux = r.fx;
          uy = r.fy;
        } else pace = r.role === 'command' && al < 0 ? 0 : Math.min(pace, r.speed * HORSE_WALK); // pulled up: it turns about at a walk (the household, keeping its post, turns its horses before it rides: QA review #6)
      } else {
        // March facing the way it goes; a block slows while it wheels.
        pace *= al > 0.8 ? 1 : al > 0.3 ? 0.5 : 0.25;
      }
    } else {
      // Skirmishers run back at their pace; a formed block of shooters steps back slowly, in order.
      // (Shooters running for cover from horse, `takeCover`, run.)
      if (aboutTurn) pace *= this.tick < r.stepUntil ? FOOT_RUN : r.role === 'skirmish' || r.coverReg >= 0 ? 1 : 0.5;
      else if (q > 3) pace *= 0.7;
      // Horse backs or sidles only at a walk.
      if (horse && al < 0.3) pace = Math.min(pace, r.speed * HORSE_WALK);
    }
    if (horse) {
      // Momentum: horse gathers speed and reins in over seconds (locked in a fight it is stopped).
      const v = r.aspd;
      r.aspd = r.engaged ? pace : pace > v ? Math.min(pace, v + HORSE_ACCEL * TICK_S) : Math.max(pace, v - HORSE_BRAKE * TICK_S);
      pace = r.aspd;
    }
    const step = Math.min(q, pace * TICK_S);
    if (yields) {
      this.giveWay(r, ux * step, uy * step, pace);
      return;
    }
    r.vax = ux * step;
    r.vay = uy * step;
    r.ax += r.vax;
    r.ay += r.vay;
  }

  /**
   * TERRAIN: a block's pace on its ground, going (ux, uy): the mean of the ground's pace (with
   * its slope that way) at the middle of its front and at either end.
   */
  private groundPace(r: Regiment, ux: number, uy: number, horse: boolean): number {
    const T = this.terrain;
    const h = r.width * 0.5;
    const lx = -r.fy * h;
    const ly = r.fx * h;
    const vx = ux * 10;
    const vy = uy * 10;
    return (T.pace(T.index(r.ax, r.ay), vx, vy, horse) + T.pace(T.index(r.ax + lx, r.ay + ly), vx, vy, horse) + T.pace(T.index(r.ax - lx, r.ay - ly), vx, vy, horse)) / 3;
  }

  /**
   * Whether a block gives way to friendly blocks (battle v17, `giveWay`): formed foot on the move
   * or standing, and the household keeping its place, not locked in a fight, not skirmishers or shooters falling back through their own
   * line (that is drill), nor a chase (a loose crowd).
   */
  private yields(r: Regiment, fallingBack: boolean): boolean {
    // (The general's household too, keeping its place behind the line: not drawing back from a
    // block too big for it, nor riding to fight.)
    return !r.engaged && !fallingBack && !r.slip && r.role !== 'skirmish' && r.role !== 'siege' && (r.role !== 'command' || r.mode === 'guard' || r.mode === 'hold') && r.mode !== 'pursue' && r.mode !== 'skirmish' && r.mode !== 'rout';
  }

  /** Which of two friendly blocks has the right of way: locked in a fight, then standing, then charging, then marching; the first in the order of battle between equals. */
  private rightOfWay(o: Regiment, r: Regiment): boolean {
    const rank = (x: Regiment) => (x.engaged ? 4 : x.mode === 'melee' || x.mode === 'hold' || x.mode === 'brace' || x.mode === 'guard' || x.mode === 'shoot' ? 3 : x.mode === 'charge' ? 2 : 1);
    const a = rank(o);
    const b = rank(r);
    return a > b || (a === b && o.phase < r.phase);
  }

  /**
   * How far block `r`, its front's middle at (ax, ay) and facing (fx, fy), would stand in a
   * friendly block that has the right of way over it (`any`: in any friendly block; its footprint
   * and a file's room about each),
   * the deepest such (0: clear); the axis to back out along (away from that friend) in gx, gy.
   */
  private crowded(r: Regiment, ax: number, ay: number, fx: number, fy: number, any = false): number {
    let worst = 0;
    const c1x = ax - fx * r.depth * 0.5;
    const c1y = ay - fy * r.depth * 0.5;
    for (const o of this.teamRegs[r.team]!) {
      if (o === r || o.alive === 0 || o.routed || o.role === 'skirmish' || o.slip || o.mode === 'skirmish' || o.mode === 'pursue') continue;
      // (Two bodies in open order pass through each other's files: archers among archers.)
      if (r.stance === 'loose' && o.stance === 'loose' && (isMounted(r) || isMounted(o))) continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const reach = o.radius + r.radius + r.spacing + 8;
      if (dx * dx + dy * dy > reach * reach || (!any && !this.rightOfWay(o, r))) continue;
      const g = Math.max(r.spacing, o.spacing) * 0.5;
      const a1 = r.width * 0.5 + g;
      const b1 = r.depth * 0.5 + g;
      const a2 = o.width * 0.5;
      const b2 = o.depth * 0.5;
      const c2x = o.ax - o.fx * o.depth * 0.5;
      const c2y = o.ay - o.fy * o.depth * 0.5;
      const ex = c1x - c2x;
      const ey = c1y - c2y;
      // Separating axes: each block's across and along.
      let pen = Infinity;
      let nx = 0;
      let ny = 0;
      for (let k = 0; k < 4; k++) {
        const ux = k === 0 ? -fy : k === 1 ? fx : k === 2 ? -o.fy : o.fx;
        const uy = k === 0 ? fx : k === 1 ? fy : k === 2 ? o.fx : o.fy;
        const ra = a1 * Math.abs(-fy * ux + fx * uy) + b1 * Math.abs(fx * ux + fy * uy);
        const rb = a2 * Math.abs(-o.fy * ux + o.fx * uy) + b2 * Math.abs(o.fx * ux + o.fy * uy);
        const along = ex * ux + ey * uy;
        const over = ra + rb - Math.abs(along);
        if (over < pen) {
          pen = over;
          nx = along >= 0 ? ux : -ux;
          ny = along >= 0 ? uy : -uy;
        }
      }
      if (pen > worst) {
        worst = pen;
        this.gx = nx;
        this.gy = ny;
        this.gWho = o.id;
      }
    }
    return worst;
  }

  /**
   * A block whose goal (its front's middle at tx, ty, facing dfx, dfy) would put it in the place
   * of a friend with the right of way moves its goal out sideways, along that friend's front, to
   * the side it stands on now: shooters sent to the same spot stand side by side, not five deep.
   */
  private clearGoal(r: Regiment): void {
    // Held up behind a friend on the way: make for the ground beside him, his flank on the side
    // it stands on (as far forward as its goal), and on from there.
    // (The way round holds for a while: its captain's orders put the goal back each word.)
    if (this.tick - r.blockedAt <= 5 && r.blockedBy >= 0) {
      const o = this.regiments[r.blockedBy]!;
      const lx = -o.fy;
      const ly = o.fx;
      const ocx = o.ax - o.fx * o.depth * 0.5;
      const ocy = o.ay - o.fy * o.depth * 0.5;
      const gl = (r.tx + r.dodgeX - ocx) * lx + (r.ty + r.dodgeY - ocy) * ly;
      const need = o.width * 0.5 + r.width * 0.5 + Math.max(r.spacing, o.spacing);
      if (Math.abs(gl) < need) {
        let side = (r.cx - ocx) * lx + (r.cy - ocy) * ly;
        if (side > -1e-6 && side < 1e-6) side = (FIELD_H / 2 - ocy) * ly + (FIELD_W / 2 - ocx) * lx;
        const shift = (side >= 0 ? need : -need) - gl;
        r.dodgeX += lx * shift;
        r.dodgeY += ly * shift;
      }
      r.dodgeUntil = this.tick + COHESION.dodgeFor;
    }
    if (this.tick < r.dodgeUntil) {
      r.tx = clampX(r.tx + r.dodgeX);
      r.ty = clampY(r.ty + r.dodgeY);
    } else r.dodgeX = r.dodgeY = 0;
    for (let k = 0; k < 3; k++) {
      let worst = 0;
      let shift = 0;
      let ux = 0;
      let uy = 0;
      const cx = r.tx - r.dfx * r.depth * 0.5;
      const cy = r.ty - r.dfy * r.depth * 0.5;
      for (const o of this.teamRegs[r.team]!) {
        if (o === r || o.alive === 0 || o.routed || o.role === 'skirmish' || o.slip || o.mode === 'pursue' || o.mode === 'skirmish' || !this.rightOfWay(o, r)) continue;
        if (r.stance === 'loose' && o.stance === 'loose' && (isMounted(r) || isMounted(o))) continue;
        const ocx = o.ax - o.fx * o.depth * 0.5;
        const ocy = o.ay - o.fy * o.depth * 0.5;
        const ex = cx - ocx;
        const ey = cy - ocy;
        const reach = o.radius + r.radius + r.spacing;
        if (ex * ex + ey * ey > reach * reach) continue;
        const g = Math.max(r.spacing, o.spacing);
        // Overlap along the friend's front and along his depth (r's extents projected on each).
        const lx = -o.fy;
        const ly = o.fx;
        const ra = r.width * 0.5 * Math.abs(-r.dfy * lx + r.dfx * ly) + r.depth * 0.5 * Math.abs(r.dfx * lx + r.dfy * ly);
        const rb = r.width * 0.5 * Math.abs(-r.dfy * o.fx + r.dfx * o.fy) + r.depth * 0.5 * Math.abs(r.dfx * o.fx + r.dfy * o.fy);
        const along = ex * lx + ey * ly;
        const across = ra + o.width * 0.5 + g - Math.abs(along);
        const deep = rb + o.depth * 0.5 + g * 0.5 - Math.abs(ex * o.fx + ey * o.fy);
        if (across <= 0 || deep <= 0) continue;
        if (across * deep > worst) {
          worst = across * deep;
          // To the side it stands on now (or, level with him, the side toward the field's middle).
          let side = (r.cx - ocx) * lx + (r.cy - ocy) * ly;
          if (side > -1e-6 && side < 1e-6) side = along !== 0 ? along : (FIELD_H / 2 - ocy) * ly + (FIELD_W / 2 - ocx) * lx;
          const sg = side >= 0 ? 1 : -1;
          shift = sg * (o.width * 0.5 + g + ra) - along;
          ux = lx;
          uy = ly;
        }
      }
      if (worst === 0) return;
      r.tx = clampX(r.tx + ux * shift);
      r.ty = clampY(r.ty + uy * shift);
    }
  }

  /**
   * Officers keep their blocks out of each other (battle v17): a block about to step (sx, sy) into a
   * friendly block drops the part of its step that goes into it and goes round toward its goal
   * instead (or halts); one already standing in a block with the right of way (`rightOfWay`: two
   * reserves sent behind the same block) backs out of it. Sets the anchor's move.
   */
  private giveWay(r: Regiment, sx: number, sy: number, pace: number): void {
    const s0 = sqrt(sx * sx + sy * sy);
    for (let pass = 0; pass < 2; pass++) {
      // (Nobody marches into a friend, whoever has the right of way: the one behind halts or goes round.)
      const pen = this.crowded(r, r.ax + sx, r.ay + sy, r.fx, r.fy, true);
      if (pen <= 0) break;
      const nx = this.gx;
      const ny = this.gy;
      const into = sx * nx + sy * ny;
      if (into < 0) {
        sx -= nx * into;
        sy -= ny * into;
        // Round the friend, toward the goal's side of him (or the side it already stands on).
        if (-into > 0.3 * s0) {
          const o = this.regiments[this.gWho]!;
          let side = (r.tx - r.ax) * -ny + (r.ty - r.ay) * nx;
          if (side > -1e-9 && side < 1e-9) side = (r.cx - o.cx) * -ny + (r.cy - o.cy) * nx;
          const sg = side >= 0 ? 1 : -1;
          sx += -ny * sg * -into;
          sy += nx * sg * -into;
        }
      }
      // Standing in one with the right of way already: back out.
      const now = this.crowded(r, r.ax, r.ay, r.fx, r.fy);
      if (now > 0 && pass === 0) {
        const out = Math.min(now, pace * TICK_S * 0.5);
        sx += this.gx * out;
        sy += this.gy * out;
      }
    }
    // Still going deeper into a friend: halt (and only back out of one with the right of way).
    if ((sx !== 0 || sy !== 0) && this.crowded(r, r.ax + sx, r.ay + sy, r.fx, r.fy, true) > this.crowded(r, r.ax, r.ay, r.fx, r.fy, true) + 0.01) {
      // (Held up by him: `clearGoal` looks for the way past at the next word.)
      r.blockedAt = this.tick;
      r.blockedBy = this.gWho;
      const now = this.crowded(r, r.ax, r.ay, r.fx, r.fy);
      const out = now > 0 ? Math.min(now, pace * TICK_S * 0.5) : 0;
      sx = this.gx * out;
      sy = this.gy * out;
    }
    r.vax = sx;
    r.vay = sy;
    r.ax += sx;
    r.ay += sy;
  }

  /**
   * Foot turning a long way: facing against wheeling (battle v17; formations.md, "Facings and
   * wheels"). A wheel pivots the whole block about the middle of its front, the outer files
   * walking the arc, so it takes the longer the wider the block (`turnRate`). A facing turns
   * every man where he stands at once (Aelian's klisis and metabole), then the block re-forms to
   * the new front, each man walking to the nearest place in it: it takes the longest of those
   * walks, plus a moment to dress. The block does whichever is quicker (a facing only when it
   * saves a good part of the wheel: `COHESION.faceMargin`); with an enemy close it faces for any
   * turn of `faceMinCos` and more. Under threat each man takes the place nearest him, so after an
   * about-turn the old rear rank is the front; with time to spare the front-rankers file through
   * to the new front (the countermarch), which adds to the walk. Never a block locked in a fight
   * to its front: its rear ranks turn about instead (`rearUntil`, see `seek`). Not wedges, columns
   * or engines.
   */
  private turnFoot(r: Regiment, wx: number, wy: number, marching: boolean): void {
    const C = COHESION;
    // (Not a chase: a loose crowd turns as it runs.)
    if (r.alive < 2 || r.engaged || r.routed || r.mode === 'pursue') return;
    if (r.role === 'siege' || r.role === 'command' || r.stance === 'wedge' || r.stance === 'column') return;
    const cav = this.horseNear(r);
    // Faced in place against horse, it takes its proper frontage again once the horse rides off.
    if (r.inPlace && !cav && this.tick - r.facedAt >= C.faceEvery && !this.reformCrowded(r)) {
      const width = r.width;
      this.faceAbout(r, r.fx, r.fy, false);
      r.inPlace = false;
      r.formedAt = this.tick + Math.ceil(C.faceDress + Math.abs(r.width - width) * 0.5 / (FOOT_MARCH * TICK_S));
      return;
    }
    const c = r.fx * wx + r.fy * wy;
    if (c > C.faceMinCos || this.tick - r.facedAt < C.faceEvery) return;
    const m = sqrt(wx * wx + wy * wy);
    if (m < 1e-9) return;
    wx /= m;
    wy /= m;
    // The wheel: as many steps of `turnRate` as the angle takes (stepped as `wheel` steps, no trig).
    const w = turnRate(r, false);
    const cw = 1 - w * w * 0.5;
    const sw = (r.fx * wy - r.fy * wx >= 0 ? 1 : -1) * w;
    let ux = r.fx;
    let uy = r.fy;
    let wheelTicks = 0;
    while (ux * wx + uy * wy < cw && wheelTicks < 1000) {
      const nx = ux * cw - uy * sw;
      uy = ux * sw + uy * cw;
      ux = nx;
      const q = sqrt(ux * ux + uy * uy);
      ux /= q;
      uy /= q;
      wheelTicks++;
    }
    // The facing: the longest walk from the block as it stands (half-width a, half-depth b about
    // its middle) to the nearest place in the same block turned to the new front.
    const a = r.width * 0.5;
    const b = r.depth * 0.5;
    let walk = 0;
    for (let k = 0; k < 4; k++) {
      const x = k & 1 ? a : -a;
      const y = k & 2 ? b : -b;
      // Corner in world terms (lateral x along (-fy, fx), forward y along (fx, fy)), then in the new frame.
      const px = -r.fy * x + r.fx * y;
      const py = r.fx * x + r.fy * y;
      const nx = -wy * px + wx * py;
      const ny = wx * px + wy * py;
      const ex = nx > a ? nx - a : nx < -a ? -a - nx : 0;
      const ey = ny > b ? ny - b : ny < -b ? -b - ny : 0;
      const q = sqrt(ex * ex + ey * ey);
      if (q > walk) walk = q;
    }
    // Enemy horse about: every man faces it where he stands, at once (Aelian's klisis), and the
    // block stands as it is, deep and narrow to its new front after a quarter turn: no walk to
    // new places with horse at hand. It re-forms its frontage when the horse has ridden off.
    if (cav) {
      if (C.faceDelay < wheelTicks) {
        this.faceInPlace(r, wx, wy);
        r.formedAt = this.tick + C.faceDelay;
      }
      return;
    }
    const threat = this.nearestFoe(r, 0, C.faceThreat) !== null;
    // On the march, with no enemy close, it wheels as it goes.
    if (marching && !threat) return;
    // The countermarch: turning away from the old front, the front-rankers walk through to the new one.
    if (!threat && c < 0) walk -= r.depth * c;
    const faceTicks = C.faceDelay + C.faceDress + walk / (FOOT_MARCH * TICK_S);
    if (threat ? faceTicks > wheelTicks || c > 0.5 : faceTicks * C.faceMargin > wheelTicks) return;
    // (Not if the block re-formed to its new front would stand in a friend: it wheels, which stops short.)
    const h = r.depth * 0.5;
    if (this.crowded(r, r.cx + wx * h, r.cy + wy * h, wx, wy, true) > this.crowded(r, r.ax, r.ay, r.fx, r.fy, true) + 0.05) return;
    this.faceAbout(r, wx, wy, !threat);
    r.formedAt = this.tick + Math.ceil(faceTicks);
  }

  /** Whether the block, re-formed to its proper frontage about where it stands, would stand in a friend (it stays as it is). */
  private reformCrowded(r: Regiment): boolean {
    const cols = r.cols;
    const rows = r.rows;
    const width = r.width;
    const depth = r.depth;
    const radius = r.radius;
    shape(r, r.alive);
    const h = r.depth * 0.5;
    const crowd = this.crowded(r, r.cx + r.fx * h, r.cy + r.fy * h, r.fx, r.fy, true);
    r.cols = cols;
    r.rows = rows;
    r.width = width;
    r.depth = depth;
    r.radius = radius;
    return crowd > this.crowded(r, r.ax, r.ay, r.fx, r.fy, true) + 0.05;
  }

  /**
   * The nearest enemy horse within COHESION.faceHorse of a block that threatens it (see
   * `turnFoot`): not riding off to rally, and not locked in a fight with another block unless it
   * is at hand (within COHESION.faceHorseNear), as spears brace (`thinkLine`). A block of the line
   * that faced in place toward horse busy with its neighbour stood deep and narrow, its front
   * turned from the enemy foot, all through the melee (it cannot re-form while engaged): its
   * neighbours were taken in flank and the line came apart, and the archers behind it found the
   * enemy in among them (behaviour.test.ts, archers shooting from long range).
   */
  private horseNear(r: Regiment): Regiment | null {
    const C = COHESION;
    let best: Regiment | null = null;
    let bd: number = C.faceHorse;
    for (const o of this.teamRegs[1 - r.team]!) {
      if (o.alive === 0 || o.routed || !isCav(o) || o.mode === 'withdraw' || o.mode === 'rally') continue;
      const dx = o.cx - r.cx;
      const dy = o.cy - r.cy;
      const q = sqrt(dx * dx + dy * dy) - o.radius - r.radius;
      if (q >= bd) continue;
      if (o.mode === 'melee' && o.targetReg !== r.id && q >= C.faceHorseNear) continue;
      bd = q;
      best = o;
    }
    return best;
  }

  /**
   * Every man of the block faces (wx, wy) where he stands and stays there: its places are where
   * its men stand, in the new frame, to the nearest file and rank (the old files become its ranks
   * after a quarter turn), so nobody walks. `turnFoot` re-forms it later.
   */
  private faceInPlace(r: Regiment, wx: number, wy: number): void {
    const d = this.d;
    const lx = -wy;
    const ly = wx;
    let minL = Infinity;
    let maxL = -Infinity;
    let maxF = -Infinity;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      const l = d.x[id]! * lx + d.y[id]! * ly;
      const f = d.x[id]! * wx + d.y[id]! * wy;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
      if (f > maxF) maxF = f;
    }
    if (minL > maxL) return;
    const sp = r.spacing;
    const step = rankStep(r);
    const cols = Math.max(1, Math.round((maxL - minL) / sp) + 1);
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      const l = d.x[id]! * lx + d.y[id]! * ly;
      const f = d.x[id]! * wx + d.y[id]! * wy;
      d.col[id] = Math.max(0, Math.min(cols - 1, Math.round((l - minL) / sp)));
      d.row[id] = Math.max(0, Math.round((maxF - f) / step));
    }
    r.fx = r.dfx = wx;
    r.fy = r.dfy = wy;
    r.cols = cols;
    r.width = (cols - 1) * sp + 4;
    const oax = r.ax;
    const oay = r.ay;
    // The front's middle, where the foremost men stand.
    const mid = (minL + maxL) * 0.5;
    r.ax = lx * mid + wx * maxF;
    r.ay = ly * mid + wy * maxF;
    // (Each file's men in rank order, two in one place moved one back: see `closeRanks`.)
    this.compactFiles(r);
    if ((r.tx - oax) * (r.tx - oax) + (r.ty - oay) * (r.ty - oay) < 4) {
      r.tx = r.ax;
      r.ty = r.ay;
    }
    r.inPlace = true;
    r.facedAt = this.tick;
    r.movedAt = this.tick;
    for (const id of r.members) d.cu[id] = 0;
  }

  /**
   * Every man of the block faces (wx, wy) where he stands, and the block's places are laid out
   * afresh about where its men stand, its frontage restored (see `turnFoot`): each man takes the
   * nearest file, and in it the place nearest the new front, or (`countermarch`) his old rank.
   */
  private faceAbout(r: Regiment, wx: number, wy: number, countermarch: boolean): void {
    const d = this.d;
    const oax = r.ax;
    const oay = r.ay;
    let n = 0;
    let cx = 0;
    let cy = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      n++;
      cx += d.x[id]!;
      cy += d.y[id]!;
    }
    if (n === 0) return;
    cx /= n;
    cy /= n;
    // The new front rank stands where the foremost man now stands toward the new front, not
    // beyond it: the block dresses back on him, nobody walks on into an enemy at that side.
    let front = 0;
    for (const id of r.members) {
      if (d.state[id] !== State.Fighting) continue;
      const f = (d.x[id]! - cx) * wx + (d.y[id]! - cy) * wy;
      if (f > front) front = f;
    }
    r.fx = r.dfx = wx;
    r.fy = r.dfy = wy;
    r.ax = cx;
    r.ay = cy;
    this.assignSlots(r, true, countermarch);
    const ahead = Math.min(front, (r.depth - 4) * 0.5);
    r.ax = cx + wx * ahead;
    r.ay = cy + wy * ahead;
    // A block standing where it was keeps standing (its goal moves with its front).
    const gx = r.tx - oax;
    const gy = r.ty - oay;
    if (gx * gx + gy * gy < 4) {
      r.tx = r.ax;
      r.ty = r.ay;
    }
    r.facedAt = this.tick;
    r.movedAt = this.tick;
    for (const id of r.members) d.cu[id] = 0;
  }

  /**
   * Turns the regiment's facing toward (wx, wy) at its rate: foot wheels about its middle, wider
   * blocks slower, horse the slower the faster it rides (see `turnRate`).
   */
  private wheel(r: Regiment, wx: number, wy: number, horse: boolean): void {
    const w = turnRate(r, horse);
    const dot = r.fx * wx + r.fy * wy;
    if (dot > 1 - w * w * 0.5) {
      r.fx = wx;
      r.fy = wy;
      return;
    }
    let cr = r.fx * wy - r.fy * wx;
    if (cr > -1e-9 && cr < 1e-9) {
      // Turning about: both armies turn the same way in the mirror (toward the middle of the
      // field, or toward the enemy when facing along it).
      const dir = r.team === 0 ? 1 : -1;
      cr = r.fx > 0.5 || r.fx < -0.5 ? r.fx * (FIELD_H / 2 - r.ay) : -r.fy * dir;
      if (cr === 0) cr = 1;
    }
    const s = cr >= 0 ? w : -w;
    const c = 1 - w * w * 0.5;
    let nx = r.fx * c - r.fy * s;
    let ny = r.fx * s + r.fy * c;
    const m = sqrt(nx * nx + ny * ny);
    nx /= m;
    ny /= m;
    r.fx = nx;
    r.fy = ny;
  }

  // ------------------------------------------------------------------ soldiers

  private act(i: number): void {
    const d = this.d;
    if (d.cd[i]! > 0) d.cd[i]!--;
    if (d.stun[i]! > 0) d.stun[i]!--;
    if (d.state[i] === State.Routing) return;
    // U3: getting up from the dead, he fights nobody yet (see RISE_TICKS).
    if (d.rose[i]! >= 0 && this.tick - d.rose[i]! < RISE_TICKS) {
      d.target[i] = -1;
      return;
    }
    const r = this.regiments[d.reg[i]!]!;
    // HORSE: a rider on foot, still with his horse, goes his own way.
    if (d.dm[i] === 1 && isMounted(r)) {
      this.afootAct(i, r);
      return;
    }
    const mode = r.mode;
    // (The household breaking off still cuts at a foe at hand, below: it rides out of reach.)
    if ((mode === 'withdraw' && r.role !== 'command') || mode === 'skirmish') {
      d.target[i] = -1;
      return;
    }
    let t = d.target[i]!;
    if (t >= 0 && d.state[t]! > State.Routing) t = -1;
    const was = t;
    if (!r.contact || this.tick < d.wd[i]!) {
      t = -1;
      d.idl[i] = 0;
    }
    // Look again every few ticks (staggered by his place in his own army, so that both sides
    // look on the same ticks): at once only for the men already fighting. (Until v4 this went
    // by id, which put the second army's men out of step with the first's by the first's size.)
    // (REACH: at the charge, a man with no foe yet looks every tick, or he runs onto the points
    // of spears between two looks.)
    else if (t < 0 && mode === 'charge' && !d.mt[i] ? true : (this.tick + i - this.firstId[d.team[i]!]!) % (t < 0 ? 3 : 6) === 0) {
      t = this.seek(i, r);
      // Falling back on the General's word, a man fights only a foe at hand.
      if (t >= 0 && ((mode === 'reserve' && r.ord.kind === 'withdraw') || mode === 'withdraw')) {
        const ex = d.x[t]! - d.x[i]!;
        const ey = d.y[t]! - d.y[i]!;
        const reach = d.rad[i]! + d.rad[t]! + d.rc[i]! + 1.4;
        if (ex * ex + ey * ey > reach * reach) t = -1;
      }
    }
    // HORSE: a man of the foot with no foe goes out to an enemy rider unhorsed close by, while he
    // is down or badly hurt (`fallen`).
    if (t < 0 && !d.mt[i] && d.dm[i] === 0 && this.tick >= d.wd[i]! && r.role !== 'siege' && r.role !== 'command') {
      t = this.fallen(i, was);
      // (Out of his place on his own errand: his block's anchor keeps to the rest, as for P6.)
      if (t >= 0) d.cu[i] = 1;
    }
    // REACH: a man held at a spear's points presses on them, and now and then gets in, by a gap
    // beside his spearman or by luck; once in, he stays in while he is inside the point.
    if (t >= 0 && d.rc[t]! >= REACH.long) {
      const ex = d.x[t]! - d.x[i]!;
      const ey = d.y[t]! - d.y[i]!;
      const line = this.pointLine(i, t);
      const q = ex * ex + ey * ey;
      if (d.ps[i]! > this.tick) {
        if (q < (line - 1) * (line - 1)) d.ps[i] = this.tick + REACH.through;
      } else if (t !== d.target[i] || (this.tick + i) % 6 === 0) {
        if (q <= (line + 2) * (line + 2) && this.held(i, t)) {
          const gap = this.gapBeside(t);
          const me = this.soldiers[i]!;
          if (this.rng.next() < (gap ? REACH.gap : REACH.luck * (1 + me.s.shield) * (me.cls === U.Shock ? REACH.breaker : 1))) {
            d.ps[i] = this.tick + REACH.through;
            (globalThis as any).__pass?.(gap);
          }
        }
      }
    }
    // (Since when he has stood in contact without a foe: see `seek`.)
    if (t >= 0) d.idl[i] = 0;
    else if (d.idl[i] === 0 && r.contact) d.idl[i] = this.tick || 1;
    // A shooter with a foe at hand drops his bow and draws (0.6 s), however long his reload.
    if (t >= 0 && d.target[i]! < 0 && this.soldiers[i]!.s.range > 0 && d.cd[i]! > 6) d.cd[i] = 6;
    d.target[i] = t;
    if (t >= 0) {
      const dx = d.x[t]! - d.x[i]!;
      const dy = d.y[t]! - d.y[i]!;
      // REACH: he strikes from his weapon's reach (a rank behind a long spear's front, past it).
      // (A rank behind a spear's front that does not strike past it, the Templar's or the ghoul's,
      // reaches only a foe come round to him or into a hole before him.)
      const back = d.row[i]! > 0 && d.rc[i]! >= REACH.long;
      const reach = d.rad[i]! + d.rad[t]! + (back && !this.supports(i, r) ? d.rc[i]! * REACH.inside : d.rc[i]! + (back ? REACH.lean : 0));
      const q = dx * dx + dy * dy;
      if (d.stun[i]! > 0) return;
      // (A charge lands body to body, a horse's or a short arm's; a spear's at its point.)
      const hit = d.mt[i] || d.rc[i]! < REACH.long ? d.rad[i]! + d.rad[t]! + 2.8 : reach + 1.2;
      if (d.imp[i]! > 0.3 && q <= hit * hit) {
        this.impact(i, t);
        return;
      }
      // RIDER: a rider stuck among spears, his charge spent and badly hurt, pulls his horse out
      // of it for a moment (and may come at them again) rather than stand and be gutted.
      if (d.mt[i] && r.role !== 'command' && d.imp[i]! <= 0.3 && this.soldiers[t]!.s.antiCav > 1.5 && d.hp[i]! < this.soldiers[i]!.s.hp * RIDER.spearHurt && this.tick - d.hit[i]! < 3) {
        d.wd[i] = this.tick + RIDER.spearOut;
        d.target[i] = -1;
        return;
      }
      if (q <= reach * reach && d.cd[i] === 0 && !this.outOfMeasure(i, r)) this.strike(i, t);
      return;
    }
    if (d.ammo[i]! > 0 && d.cd[i] === 0 && r.firing && this.mayLoose(i, r)) this.shoot(i, r, this.soldiers[i]!.s);
  }

  /**
   * Whether a loaded man may loose now. Horse archers shoot on the move. Foot stops to shoot:
   * not while the block walks or wheels, nor for a moment after it halts. Formed missile foot
   * then looses on the word: each loaded man in the volley's half second (in a fixed order, so
   * the volley ripples down the line), unless it fires at will.
   */
  private mayLoose(i: number, r: Regiment): boolean {
    if (isMounted(r)) return true;
    if (this.tick - r.movedAt < 3) return false;
    // (Faced round, the block shoots once it has re-formed: as soon as a wheel would, or sooner.)
    if (this.tick < r.formedAt) return false;
    if (r.role !== 'missile' || r.atWill) return true;
    const k = this.tick - r.volleyAt;
    if (r.rippling && this.d.row[i]! % this.ranksOf(r) !== r.volleyN % this.ranksOf(r)) return false;
    return k >= (i * 3) % VOLLEY_SPREAD && k < VOLLEY_SPREAD;
  }

  /**
   * Whether a block that turned this tick is only following its target (v17, QA2 #2): formed
   * missile foot within WHEEL_STILL of the front it last stood to. Its men keep their places, near
   * enough, and shoot a little to either side (`aimAt` wheels only for a target over 25 degrees
   * off): not a move that stops them shooting and restarts the volley clock. Until v17 any turn
   * of any size did, and archers tracking a target lost a tenth of their shooting time.
   */
  private tracking(r: Regiment): boolean {
    return r.role === 'missile' && !isMounted(r) && r.fx * r.restFx + r.fy * r.restFy >= WHEEL_STILL;
  }

  /**
   * The volley clock of a block of formed missile foot. While it is not standing to shoot in
   * order (moving, out of 'shoot', or firing at will), the next volley is a beat away: "make
   * ready, present" comes as soon as it halts, and whoever is loaded looses (a man who joined the
   * block, or reloaded while it walked, included). Standing, each volley follows the last by the
   * reload and the beat. The word waits for most of the men to be loaded, and comes a beat after
   * they are (v17, QA2 #2): the officer calls the volley on his men, not on the clock. Until v17
   * a volley most men held back from (danger close, friends on the line), or one called while
   * they were still reloading after shooting at will, left them loaded and silent a whole cycle
   * more (6 s for bows, 29 s for arbalests) with the target clear and in range.
   */
  private volleyClock(r: Regiment): void {
    const t = this.tick;
    if (r.mode !== 'shoot' || r.atWill || r.movedAt === t) {
      r.volleyAt = t + VOLLEY_BEAT;
    } else if (t >= r.volleyAt + VOLLEY_SPREAD) {
      if (r.rippling) {
        // S3: rank by rank, each rank's volley a share of the cycle after the last.
        r.volleyAt += Math.ceil(r.volleyEvery / this.ranksOf(r));
        r.volleyN++;
      } else r.volleyAt += r.volleyEvery;
    }
    if (!r.rippling && (t === r.volleyAt || r.volleyAt - t > VOLLEY_BEAT)) {
      const d = this.d;
      let armed = 0;
      let soon = 0;
      let loaded = 0;
      for (const id of r.members) {
        if (d.state[id] !== State.Fighting || d.ammo[id]! === 0) continue;
        armed++;
        if (d.cd[id]! < VOLLEY_SPREAD) soon++;
        if (d.cd[id] === 0) loaded++;
      }
      // Fewer than half loaded by the end of the volley at the word: it waits for them. Most
      // loaded well before it: it comes a beat from now.
      if (t === r.volleyAt) {
        if (soon * 2 < armed) r.volleyAt = t + 1;
        else r.volleyShots = 0;
      } else if (loaded * 3 >= armed * 2 && armed > 0) r.volleyAt = t + VOLLEY_BEAT;
    }
    if (t === r.volleyAt + VOLLEY_SPREAD - 1 && r.volleyShots > 0) {
      r.volleyShots = 0;
      if (!r.firstVolley) {
        r.firstVolley = true;
        // S3: the first volley of a block of guns, all together, shakes its target; then rank by rank.
        const doc = this.doc[r.team]!;
        if (this.fire[r.team]![r.cls] === 'gun') {
          if (doc.firstVolley > 0 && r.targetReg >= 0) this.shake(this.regiments[r.targetReg]!, doc.firstVolley);
          if (doc.ripple > 1) {
            r.rippling = true;
            r.volleyN = 0;
          }
        }
      }
    }
  }

  /** S3: ranks that fire in turn (no more than the block has). */
  private ranksOf(r: Regiment): number {
    return Math.max(1, Math.min(this.doc[r.team]!.ripple, r.rows));
  }

  /**
   * The foe this soldier should fight: near, in front of the block, within a short leash of his
   * slot. P2: in contact the foot look further and the leash grows (longer still for the outer
   * files, who also prefer foes on their outer side: they step out round the enemy's flank).
   */
  private seek(i: number, r: Regiment): number {
    const d = this.d;
    const mounted = d.mt[i] === 1;
    const pursue = r.mode === 'pursue';
    const C = COHESION;
    // (Not where the dead fight: the tide comes on as one mass, and the living keep their ranks
    // before it.)
    const loose = !this.fearless[0] && !this.fearless[1];
    const line = !mounted && !pursue && r.contact && r.role !== 'siege' && r.role !== 'command';
    const near = line && loose && r.role === 'line';
    const edge = near && (d.sx[i]! < 0 ? -d.sx[i]! : d.sx[i]!) > r.width * 0.5 - r.spacing * C.edgeFiles;
    // Initiative: a man of the line who has stood in contact without a foe for longer than his
    // patience (the eager soonest) looks further, for an enemy nobody of ours is fighting that he
    // can get at: round the end of the fight, or into a gap. Every fourth look (1.2 s) while he does.
    const idle = line && (r.role === 'line' || r.mode === 'melee') && d.idl[i]! > 0 ? this.tick - d.idl[i]! : 0;
    const roam = idle > C.patience * (1 - C.patienceEager * d.ea[i]!) && (loose || C.roamDead) && (this.tick + i - this.firstId[d.team[i]!]!) % 12 === 0;
    // The rear half of a block locked to its front, with an enemy at its back, faces about
    // (the renderer reads the same rule through `facesRear`: keep them alike).
    const rear = r.rearUntil > this.tick && !mounted && d.row[i]! >= Math.max(1, r.rows >> 1);
    const reach = near || rear ? C.reachNear : 10;
    // REACH: the front rank looks as far as its weapon reaches (and the ranks behind a long
    // spear's front that strike past it, only that far: `sup`).
    const sup = !mounted && d.row[i]! > 0 && this.supports(i, r);
    const wr = d.rc[i]!;
    let R = pursue ? 24 : mounted ? 15 : roam ? Math.max(reach, C.roamReach * r.spacing) : reach;
    // (A front-rank man sees a spear's point coming at him before it is on him: `points`.)
    const R0 = R;
    const front = !mounted && !pursue && d.row[i] === 0;
    if (front || sup) R = Math.max(R, wr + 9, POINT_SEEN);
    // (The line meets the point where it stands; shooters shoot on until the point strikes them.)
    const ofLine = r.role === 'line';
    const R02 = R0 * R0;
    const leash = pursue || roam || r.mode === 'rally' || (r.role === 'command' && this.generals[r.team]!.lastStand) ? 1e9 : r.role === 'command' ? HOUSEHOLD.leash : mounted ? 34 : near ? (edge ? C.leashEdge : C.leashNear) * this.doc[r.team]!.loose.leash : 9;
    const sxi = d.sx[i]!;
    const x = d.x[i]!;
    const y = d.y[i]!;
    // His leash runs from his place, or, swinging round the enemy's flank (P6), from where he is.
    const cu = d.cu[i] === 1;
    const gx = cu ? x : r.ax + r.fx * d.sy[i]! - r.fy * d.sx[i]!;
    const gy = cu ? y : r.ay + r.fy * d.sy[i]! + r.fx * d.sx[i]!;
    const team = d.team[i]!;
    const fx = r.fx;
    const fy = r.fy;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const R2 = R * R;
    const reach2 = reach * reach;
    const L2 = (leash + R) * (leash + R);
    const grid = this.grid;
    const gridEnd = this.gridEnd;
    const of0 = this.ofTeam0;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const att = d.att;
    const cur = d.target[i]!;
    const ri = d.rad[i]!;
    let best = -1;
    let bs = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        // Only the enemy's men in the cell (see `ofTeam0`).
        const from = team === 0 ? grid[c]! + of0[c]! : grid[c]!;
        const end = team === 0 ? gridEnd[c]! : grid[c]! + of0[c]!;
        for (let k = from; k < end; k++) {
          const j = items[k]!;
          const sj = d.state[j]!;
          if (sj > State.Routing) continue;
          const dx = kx[k]! - x;
          const dy = ky[k]! - y;
          let s = dx * dx + dy * dy;
          if (s > R2) continue;
          // (Past his usual look, only a spear whose point is at him, or a foe his own spear reaches.)
          const pj = front && d.rc[j]! >= REACH.long && wr < d.rc[j]! * REACH.short;
          const pa = pj ? ri + d.rad[j]! + (ofLine ? d.rc[j]! * REACH.stand + 3 : d.rc[j]!) : 0;
          if (s > R02 && !(pj && s <= pa * pa) && wr < REACH.long) continue;
          const lx = kx[k]! - gx;
          const ly = ky[k]! - gy;
          const far = lx * lx + ly * ly > L2;
          if (far && !line) continue;
          // (At hand: within his weapon's reach, a step more; a spear's reach is far longer than an arm's.)
          // (And a spear whose point is at a shorter arm is at hand to him: he has to get past it.)
          const h = pj ? Math.max(pa, ri + d.rad[j]! + 3) : ri + d.rad[j]! + (wr > 1.6 ? wr + 1.4 : 3);
          const hh = h * h;
          const at = s <= hh;
          // (A man striking past the front rank takes only a foe his point reaches from his place.)
          if (sup && s > (h + REACH.lean) * (h + REACH.lean)) continue;
          // (QA3 #1: nor, past his body's length, a man standing behind his own front rank (or
          // file): the man before him covers him. A spear's front rank fences with the front rank
          // facing it; it does not reach over it at the second rank, who, short of a pike, could
          // not answer; nor does a pike striking past its own front. Unless that man is at him.)
          if (!mounted && d.row[j]! > 0 && d.target[j] !== i && s > (ri + d.rad[j]! + 3) * (ri + d.rad[j]! + 3) && !this.open(x, y, j)) continue;
          // (A foe at hand he fights wherever he stands.)
          if (far && !at) continue;
          if (line) {
            const a = att[j]! - (j === cur ? 1 : 0);
            // Beyond his usual reach, only a foe on foot whom at most `roamJoin` of ours are
            // fighting, and whom he can get at (foot does not go hunting horsemen).
            if (!at && s > reach2 && (a > C.roamJoin || sj === State.Routing || d.mt[j] || !this.open(x, y, j))) continue;
            // One that others are fighting already less readily than one alone...
            if (a > 0) s *= 1 + C.crowd * (a < 3 ? a : 3);
            // ...but any foe at hand before one he would have to turn from him to reach.
            if (!at) s += hh * (1 + 3 * C.crowd);
          }
          if (!mounted && dx * fx + dy * fy < 0 !== rear) s *= 1.7;
          if (edge && (dx * -fy + dy * fx) * sxi > 0) s *= C.edgeOut;
          if (sj === State.Routing) s = pursue ? s * 0.6 : s * 3 + 30;
          if (s < bs) {
            bs = s;
            best = j;
          }
        }
      }
    }
    // A rider with nobody at hand while his block fights looks further, for himself (RIDER); nor
    // does he take a man our own foot is fighting at its front (he would ride into its ranks).
    if (mounted && !pursue && r.role !== 'command' && (r.engaged || r.mode === 'melee') && (best < 0 || this.covered(best, i))) return this.hunt(i, r);
    return best;
  }

  /**
   * Whether enemy man `j` stands open to a man at (x, y): no rank or file of his own between
   * them, going by his place in his block (its front rank to a man before it, its end file to a
   * man beside it, its rear rank to a man behind).
   */
  private open(x: number, y: number, j: number): boolean {
    const d = this.d;
    const o = this.regiments[d.reg[j]!]!;
    if (o.routed || o.cols <= 1) return true;
    const ex = x - o.ax;
    const ey = y - o.ay;
    const lat = ex * -o.fy + ey * o.fx;
    const fwd = ex * o.fx + ey * o.fy;
    const hw = o.width * 0.5;
    const row = d.row[j]!;
    if ((lat < 0 ? -lat : lat) > hw) {
      // Beside the block: the outer file on his side.
      const sx = d.sx[j]!;
      return (lat < 0 ? sx + hw : hw - sx) < o.spacing * 1.2;
    }
    if (fwd > -o.depth * 0.5) return row === 0;
    return row >= o.rows - 1;
  }

  /**
   * RIDER: a rider of a block in the fight who has nobody within his reach picks his own foe
   * within `RIDER.hunt`: the nearest, but never a man of braced spears while he is before their
   * front, nor one behind him if one lies ahead (×`RIDER.behind`); not fugitives, nor horse
   * riding out to re-form. No leash: he knows the men about him, not
   * his slot.
   */
  private hunt(i: number, r: Regiment): number {
    const d = this.d;
    const R = RIDER.hunt;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const vx = d.vx[i]!;
    const vy = d.vy[i]!;
    const team = d.team[i]!;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const grid = this.grid;
    const gridEnd = this.gridEnd;
    const of0 = this.ofTeam0;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const regs = this.regiments;
    const R2 = R * R;
    // Our foot locked in a fight close by (see `covered`).
    const foot = this.footNear;
    foot.length = 0;
    for (const f of this.teamRegs[team]!) {
      if (f.alive === 0 || f.routed || !f.engaged || !(f.role === 'line' || f.role === 'missile')) continue;
      const fx = f.cx - x;
      const fy = f.cy - y;
      const q = f.radius + R + RIDER.coverAhead;
      if (fx * fx + fy * fy < q * q) foot.push(f);
    }
    let best = -1;
    let bs = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const from = team === 0 ? grid[c]! + of0[c]! : grid[c]!;
        const end = team === 0 ? gridEnd[c]! : grid[c]! + of0[c]!;
        for (let k = from; k < end; k++) {
          const j = items[k]!;
          // (Men still fighting: fugitives are for the horse let loose on them.)
          if (d.state[j] !== State.Fighting) continue;
          const dx = kx[k]! - x;
          const dy = ky[k]! - y;
          let s = dx * dx + dy * dy;
          if (s > R2) continue;
          const o = regs[d.reg[j]!]!;
          // (Horse riding out to re-form he lets go: he does not ride off after it alone.)
          if (o.mode === 'withdraw') continue;
          // (Not across the front of braced spears: the way to their men is round their end.)
          if ((o.stance === 'pikewall' || o.stance === 'braced') && d.mass[j]! <= 2 && (x - o.ax) * o.fx + (y - o.ay) * o.fy > -2) continue;
          // (Nor a man our own foot is fighting at its front: another stretch, a flank or the rear.)
          if (foot.length > 0 && this.covered(j, i, foot)) continue;
          if (vx * dx + vy * dy < 0) s *= RIDER.behind;
          if (s < bs) {
            bs = s;
            best = j;
          }
        }
      }
    }
    void r;
    return best;
  }

  /** The nearest enemy man still fighting within `R` of man `i` (-1: none). */
  private foeAt(i: number, R: number): number {
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const team = d.team[i]!;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    let best = -1;
    let bs = R * R;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        const from = team === 0 ? this.grid[c]! + this.ofTeam0[c]! : this.grid[c]!;
        const end = team === 0 ? this.gridEnd[c]! : this.grid[c]! + this.ofTeam0[c]!;
        for (let k = from; k < end; k++) {
          const j = this.items[k]!;
          if (d.state[j] !== State.Fighting) continue;
          const dx = this.kx[k]! - x;
          const dy = this.ky[k]! - y;
          const q = dx * dx + dy * dy;
          if (q < bs) {
            bs = q;
            best = j;
          }
        }
      }
    }
    return best;
  }

  /**
   * RIDER: whether enemy `j` stands at the front of a block of our foot locked in a fight (within
   * its frontage and no more than `RIDER.coverAhead` before its front rank, or in its ranks)
   * while rider `i` is behind that front: he would have to ride into our own ranks to get at him.
   */
  private covered(j: number, i: number, near: Regiment[] | null = null): boolean {
    const d = this.d;
    const x = d.x[j]!;
    const y = d.y[j]!;
    const rx = d.x[i]!;
    const ry = d.y[i]!;
    for (const f of near ?? this.teamRegs[d.team[i]!]!) {
      if (f.alive === 0 || f.routed || !f.engaged || !(f.role === 'line' || f.role === 'missile')) continue;
      const ex = x - f.ax;
      const ey = y - f.ay;
      const fwd = ex * f.fx + ey * f.fy;
      if (fwd > RIDER.coverAhead || fwd < -f.depth) continue;
      const lat = ex * -f.fy + ey * f.fx;
      if ((lat < 0 ? -lat : lat) >= f.width * 0.5) continue;
      // (Only from behind that foot's front, within its frontage: from its flank, or past its
      // front, he gets at the man without going through our ranks.)
      const gx = rx - f.ax;
      const gy = ry - f.ay;
      const rl = gx * -f.fy + gy * f.fx;
      if (gx * f.fx + gy * f.fy < 0 && (rl < 0 ? -rl : rl) < f.width * 0.5 + d.rad[i]!) return true;
    }
    return false;
  }

  /**
   * RIDER: whether rider `i` stands in the ranks of a block of our foot (inside its footprint, a
   * man's breadth in from its edges): then the way out of it, the shorter, in tmp[0], tmp[1]
   * (a unit vector).
   */
  private amongFoot(i: number): boolean {
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const m = d.rad[i]!;
    for (const f of this.teamRegs[d.team[i]!]!) {
      if (f.alive === 0 || f.routed || !(f.role === 'line' || f.role === 'missile') || f.slip) continue;
      const ex = x - f.ax;
      const ey = y - f.ay;
      const fwd = ex * f.fx + ey * f.fy;
      if (fwd > -m || fwd < -f.depth + m) continue;
      const lat = ex * -f.fy + ey * f.fx;
      const al = lat < 0 ? -lat : lat;
      if (al > f.width * 0.5 - m) continue;
      // Out by the nearer of his sides: to the flank, or back out of the rear.
      const side = f.width * 0.5 - al;
      const back = f.depth + fwd;
      if (side < back) {
        const sg = lat < 0 ? -1 : 1;
        this.tmp[0] = -f.fy * sg;
        this.tmp[1] = f.fx * sg;
      } else {
        this.tmp[0] = -f.fx;
        this.tmp[1] = -f.fy;
      }
      return true;
    }
    return false;
  }

  /**
   * RIDER: a rider does not ride into the back of a friend who is slower than he is: when one
   * stands in his way (within `RIDER.look` ahead, closer than their two radii across), he swerves
   * toward the emptier side, harder the nearer the friend. Rewrites (vx, vy) in tmp[0], tmp[1]
   * and returns true when he swerves.
   *
   * (A small shell, which the engine inlines, over `swerveAt`, which it does not: the velocity
   * goes through the scratch, so it is not boxed on the heap for the call.)
   */
  private swerve(i: number, vx: number, vy: number): boolean {
    this.tmp[0] = vx;
    this.tmp[1] = vy;
    return this.swerveAt(i);
  }

  /** `swerve`, given (vx, vy) in tmp[0], tmp[1]. */
  private swerveAt(i: number): boolean {
    const d = this.d;
    const vx = this.tmp[0]!;
    const vy = this.tmp[1]!;
    const vm = sqrt(vx * vx + vy * vy);
    if (vm < d.spd[i]! * 0.25) return false;
    const ux = vx / vm;
    const uy = vy / vm;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const ri = d.rad[i]!;
    const look = RIDER.look;
    const team = d.team[i]!;
    const grid = this.grid;
    const gridEnd = this.gridEnd;
    const of0 = this.ofTeam0;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const kr = this.kr;
    const mx = x + ux * look * 0.5;
    const my = y + uy * look * 0.5;
    const R = look * 0.5 + 4;
    const x0 = Math.max(0, Math.floor((mx - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((mx + R) / CELL));
    const y0 = Math.max(0, Math.floor((my - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((my + R) / CELL));
    let near = Infinity;
    let nlat = 0;
    let left = 0;
    let right = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        // Only his own side's men in the cell (see `ofTeam0`).
        const from = team === 0 ? grid[c]! : grid[c]! + of0[c]!;
        const end = team === 0 ? grid[c]! + of0[c]! : gridEnd[c]!;
        for (let k = from; k < end; k++) {
          const j = items[k]!;
          if (j === i || d.state[j] !== State.Fighting) continue;
          const ex = kx[k]! - x;
          const ey = ky[k]! - y;
          const along = ex * ux + ey * uy;
          if (along <= 0 || along > look) continue;
          const lat = ey * ux - ex * uy;
          const w = ri + kr[k]! + 1;
          if (lat > -3 * w && lat < 3 * w) {
            if (lat > 0) left++;
            else right++;
          }
          if (lat <= -w || lat >= w) continue;
          // Only a friend he is closing on.
          if ((vx - d.vx[j]!) * ux + (vy - d.vy[j]!) * uy < vm * 0.3) continue;
          if (along < near) {
            near = along;
            nlat = lat;
          }
        }
      }
    }
    if (near === Infinity) return false;
    // To the emptier side; if even, away from the friend in his way (or, dead ahead, to his own file's side).
    const sg = left < right ? 1 : right < left ? -1 : nlat > 0.3 ? -1 : nlat < -0.3 ? 1 : d.sx[i]! >= 0 ? 1 : -1;
    const hard = near < look * 0.5;
    const a = hard ? 0.5 : 0.866;
    const b = hard ? 0.866 : 0.5;
    const px = -uy * sg;
    const py = ux * sg;
    this.tmp[0] = (ux * a + px * b) * vm;
    this.tmp[1] = (uy * a + py * b) * vm;
    return true;
  }

  /**
   * RIDER: whether an enemy stands within `RIDER.pressed` of rider `i`: then the unit vector
   * away from the nearest in tmp[0], tmp[1].
   */
  private pressed(i: number): boolean {
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const R = RIDER.pressed;
    const team = d.team[i]!;
    const grid = this.grid;
    const gridEnd = this.gridEnd;
    const of0 = this.ofTeam0;
    const items = this.items;
    const kx = this.kx;
    const ky = this.ky;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    let bs = R * R;
    let bx = 0;
    let by = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const c = row + cx;
        const from = team === 0 ? grid[c]! + of0[c]! : grid[c]!;
        const end = team === 0 ? gridEnd[c]! : grid[c]! + of0[c]!;
        for (let k = from; k < end; k++) {
          if (d.state[items[k]!] !== State.Fighting) continue;
          const dx = x - kx[k]!;
          const dy = y - ky[k]!;
          const q = dx * dx + dy * dy;
          if (q < bs) {
            bs = q;
            bx = dx;
            by = dy;
          }
        }
      }
    }
    if (bx === 0 && by === 0) return false;
    const q = sqrt(bs);
    this.tmp[0] = bx / q;
    this.tmp[1] = by / q;
    return true;
  }

  /**
   * RIDER: where a rider goes whose block is in the fight but who has no foe within
   * `RIDER.hunt` (he sits behind his own front, or the fight moved off): round the end of the
   * enemy block his block fights, on his own side of it, to come at its flank. Puts the point
   * in tmp[0], tmp[1] and returns true; false when there is no such block near (he rejoins his
   * place).
   */
  private flankPoint(i: number, r: Regiment): boolean {
    if (r.targetReg < 0) return false;
    const o = this.regiments[r.targetReg]!;
    // (Foot only: horse moves too fast to be ridden round alone; in a clash of horse he finds a
    // man of his own (`hunt`) or keeps his place.)
    if (o.alive === 0 || o.routed || !isFoot(o)) return false;
    const d = this.d;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const ex = o.cx - x;
    const ey = o.cy - y;
    if (ex * ex + ey * ey > RIDER.rejoin * RIDER.rejoin) return false;
    const lox = -o.fy;
    const loy = o.fx;
    const lat = (x - o.ax) * lox + (y - o.ay) * loy;
    const sg = lat < 0 ? -1 : 1;
    const out = o.width * 0.5 + RIDER.flankOut;
    // Before its front he rides out along it, a little off it, to its end; past its end, in at
    // its side.
    const ahead = (x - o.ax) * o.fx + (y - o.ay) * o.fy;
    const back = ahead > -2 && (lat < 0 ? -lat : lat) < out - 4 ? -RIDER.flankOff : o.depth * 0.5;
    this.tmp[0] = o.ax + lox * sg * out - o.fx * back;
    this.tmp[1] = o.ay + loy * sg * out - o.fy * back;
    return true;
  }

  private shoot(i: number, r: Regiment, st: UnitStats): void {
    const d = this.d;
    const tr = this.regiments[r.targetReg]!;
    if (tr.alive === 0) return;
    const s = this.soldiers[i]!;
    const kind = this.fire[s.team]![s.cls]!;
    // TERRAIN: from higher ground a shot carries further (and from lower, less).
    const reach = this.flat ? st.range : st.range + this.reachAdd(d.x[i]!, d.y[i]!, tr.cx, tr.cy, st.range);
    const lobbed = kind === 'lob' || kind === 'siege';
    const retry = r.role === 'missile' && !r.atWill ? 1 : 4;
    // v17 (QA #3): a flat shot (crossbow, gun, bombard) cannot go over a melee: its bolt or ball
    // would strike our own men locked with them first. It waits for a clear target.
    if (tr.engaged && !lobbed) {
      r.dangerShots++;
      d.cd[i] = retry + this.rng.int(4);
      return;
    }
    // Danger close (v17, QA #2 and #3): a man shoots only where the whole scatter of his shot,
    // and the stone's splash, falls clear of our own men, where they stand and where they will be
    // when it comes down. He tries a few of the enemy's men (over a melee, its rear ranks); if
    // every one is too near ours, he holds his shot.
    let v = -1;
    let dist = 0;
    let flight = 0;
    let leadX = 0;
    let leadY = 0;
    let spread = 0;
    let flatBow = false;
    const splash = kind === 'siege' ? SIEGE_SPLASH : 0;
    // HORSE: horse coming on at us (RAPID).
    const horseOn = isCav(tr) && (tr.mode === 'charge' || tr.mode === 'flank' || tr.mode === 'advance' || tr.mode === 'pursue');
    let onFront = true;
    for (let tries = 0; tries < DANGER.tries; tries++) {
      const c = tr.engaged ? this.pickRear(tr, d.x[i]!, d.y[i]!, reach) : this.pickInReach(tr, d.x[i]!, d.y[i]!, reach, r.atWill);
      if (c < 0) break;
      const dx = d.x[c]! - d.x[i]!;
      const dy = d.y[c]! - d.y[i]!;
      const q = sqrt(dx * dx + dy * dy);
      if (q > reach || q < 6) {
        if (v < 0) {
          v = c;
          dist = q;
        }
        break;
      }
      const fl = Math.max(3, Math.round((q / st.projectileSpeed) * TICKS_PER_SECOND));
      // Lead the target a little, and scatter more with distance: a lob most of all at long range.
      const lx0 = d.x[c]! + d.vx[c]! * fl * TICK_S * 0.8;
      const ly0 = d.y[c]! + d.vy[c]! * fl * TICK_S * 0.8;
      // At will against a foe close at hand, bows shoot flat, point-blank (and as surely as a crossbow);
      // against horse coming on, from further (RAPID).
      // (Not at horse come round on their flank or rear: men turning about in their ranks to meet
      // it shoot no faster, nor flat, than any at will.)
      const arc = (dx * r.fx + dy * r.fy) / (q || 1);
      onFront = arc > 0.3;
      const fb = r.atWill && kind === 'lob' && q < (horseOn && onFront ? RAPID.flat : POINT_BLANK);
      let sp = spreadAt(kind, q, st.range, fb);
      // HORSE (round 3): a block of foot shooters shoots worse off its front: on its flank the men
      // turn in their ranks and shoot past each other, behind it they shoot over or through their
      // own files (ARC). (Not horse archers: they turn their horses.)
      if (!onFront && r.role === 'missile') sp *= arc > -0.3 ? ARC.side : ARC.rear;
      // A fast-moving target is guessed at, not known: the further it goes while the shot is in the
      // air, the wider the miss (riders at the gallop at long range most of all; marching foot not).
      // (Shot flat, only his pace across the line counts: one riding straight at the bow rides onto it.)
      const vt = fb ? Math.abs(d.vx[c]! * dy - d.vy[c]! * dx) / (q || 1) : sqrt(d.vx[c]! * d.vx[c]! + d.vy[c]! * d.vy[c]!);
      if (vt > LEAD_EASY) sp += (vt - LEAD_EASY) * fl * TICK_S * LEAD_ERR;
      v = c;
      dist = q;
      flight = fl;
      leadX = lx0;
      leadY = ly0;
      spread = sp;
      flatBow = fb;
      // (A bombard's ball bounds on beyond the aim: the box covers that run too.)
      const bound = kind === 'cannon' ? CANNON_BOUND * 0.5 : 0;
      const ux = bound > 0 ? dx / (q || 1) : 0;
      const uy = bound > 0 ? dy / (q || 1) : 0;
      // (Point-blank, a man shoots between the files of his own block: he sees them.)
      if (!this.friendsNear(s.team, lx0 + ux * bound, ly0 + uy * bound, sp + bound + splash + DANGER.margin, fl, fb ? r.id : -1)) break;
      v = -2;
    }
    if (v === -2) {
      r.dangerShots++;
      d.cd[i] = retry + 3 + this.rng.int(6);
      return;
    }
    if (v < 0) {
      d.cd[i] = retry; // on the volley clock he tries again within the volley
      return;
    }
    if (dist > reach || dist < 6) {
      if (dist > reach) r.short++;
      d.cd[i] = retry;
      return;
    }
    let lx = leadX + (this.rng.next() - 0.5) * 2 * spread;
    let ly = leadY + (this.rng.next() - 0.5) * 2 * spread;
    if (!lobbed) {
      // Direct fire needs a clear line: whoever is first on it is who it hits (see `land`).
      // Crossbows see past their own ranks (they kneel or take turns), and so do guns firing rank by rank (S3).
      const own = kind === 'flat' || r.rippling ? r.id : -1;
      // (A bombard's ball goes on through several men, and bounds on beyond: none of them may be ours.)
      let ex = lx;
      let ey = ly;
      if (kind === 'cannon') {
        ex += ((lx - d.x[i]!) / (dist || 1)) * CANNON_BOUND;
        ey += ((ly - d.y[i]!) / (dist || 1)) * CANNON_BOUND;
      }
      const n = this.lineHits(d.x[i]!, d.y[i]!, ex, ey, i, own, kind === 'cannon' ? CANNON_PEN : 1);
      let first = n > 0 ? this.lineIds[0]! : -1;
      for (let k = 1; k < n; k++) if (d.team[this.lineIds[k]!] === s.team) first = this.lineIds[k]!;
      // (And nobody of ours, from another block, is about to walk across it while it flies: v17.)
      if (first < 0 || d.team[first] !== s.team) {
        const c = this.friendCrossing(s.team, d.x[i]!, d.y[i]!, lx, ly, flight * TICK_S, r.id, i);
        if (c >= 0) first = c;
      }
      if (first >= 0 && d.team[first] === s.team) {
        // Friends in the way: hold fire (the rear ranks wait their turn). (Until v17 a crossbowman
        // lofted his bolt over them at four times the scatter: a flat-shooting bow cannot lob,
        // and those bolts came down among our own men. Now, like the guns, the block steps aside
        // to open its line: `sidestep`.)
        r.blockedShots++;
        r.blocker = d.reg[first]!;
        d.cd[i] = r.role === 'missile' && !r.atWill ? 1 : 4 + this.rng.int(6);
        return;
      }
    }
    r.loosed++;
    r.fired++;
    r.volleyShots++;
    const lob = lobbed;
    if (kind === 'cannon') {
      // The ball bounds on along the ground beyond where it was aimed.
      const ux = (lx - d.x[i]!) / (dist || 1);
      const uy = (ly - d.y[i]!) / (dist || 1);
      lx = clampX(lx + ux * CANNON_BOUND);
      ly = clampY(ly + uy * CANNON_BOUND);
    }
    const range = st.range || 1;
    const arc = kind === 'siege' ? dist * 0.5 : flatBow ? dist * 0.05 : lob ? dist * (0.18 + 0.14 * (dist / range)) : kind === 'flat' ? dist * 0.06 : kind === 'cannon' ? dist * 0.02 : 0;
    d.aim[i] = kind === 'siege' ? 0.85 : flatBow ? 0.1 : lob ? Math.min(1, 0.3 + 0.6 * (dist / range)) : kind === 'flat' ? 0.1 : 0;
    this.projectiles.push({
      team: s.team, cls: s.cls, x0: d.x[i]!, y0: d.y[i]!, x1: lx, y1: ly, born: this.tick, lands: this.tick + flight,
      damage: st.missileDamage * (s.vet ? 1.1 : 1) * MISSILE_K, pierce: st.pierce, splash, shooter: i,
      arc, direct: !lob, pen: kind === 'cannon' ? CANNON_PEN : 0, flown: 0, left: kind === 'cannon' ? CANNON_PEN : 1, force: 1,
    });
    d.ammo[i]!--;
    d.acted[i] = this.tick;
    // On the volley clock a man is loaded again in time for the next word; at will, each at his own pace.
    // (At will, a bowman nocks and looses as fast as he can draw, with no long aim: the burst rate.)
    const reload = r.atWill && kind === 'lob' && r.role === 'missile' ? Math.round(st.reload * (horseOn && onFront && dist < RAPID.range ? RAPID.reload : BOW_BURST)) : st.reload;
    d.cd[i] = reload + this.rng.int(r.role === 'missile' && !r.atWill ? 3 : Math.max(2, Math.floor(reload / 5)));
  }

  /**
   * Whether a man of `team` (not of regiment `skipReg`) stands within the box ±h about (x, y),
   * now or `ticks` from now at his present pace (danger close: see DANGER).
   */
  private friendsNear(team: number, x: number, y: number, h: number, ticks: number, skipReg = -1): boolean {
    const d = this.d;
    const T = ticks * TICK_S;
    for (const o of this.teamRegs[team]!) {
      if (o.alive === 0 || o.id === skipReg) continue;
      const dx = o.cx - x;
      const dy = o.cy - y;
      const reach = o.radius + h * 1.42 + o.speed * 2 * T + 20;
      if (dx * dx + dy * dy > reach * reach) continue;
      for (const id of o.members) {
        if (d.state[id]! > State.Routing) continue;
        const ex = d.x[id]! - x;
        const ey = d.y[id]! - y;
        if (ex <= h && ex >= -h && ey <= h && ey >= -h) return true;
        const fx = ex + d.vx[id]! * T;
        const fy = ey + d.vy[id]! * T;
        if (fx <= h && fx >= -h && fy <= h && fy >= -h) return true;
      }
    }
    return false;
  }

  /**
   * A man of `team` (not of regiment `skipReg`, nor `skip`) who will be on the line from (x0, y0)
   * to (x1, y1) when a shot taking `flight` seconds over it goes by him, at his present pace; -1
   * none. (Only those nearer than the end: a friend just beyond the target is the scatter's
   * business, `friendsNear`.)
   */
  private friendCrossing(team: number, x0: number, y0: number, x1: number, y1: number, flight: number, skipReg: number, skip: number): number {
    const d = this.d;
    const lx = x1 - x0;
    const ly = y1 - y0;
    const L = sqrt(lx * lx + ly * ly) || 1;
    const ux = lx / L;
    const uy = ly / L;
    for (const o of this.teamRegs[team]!) {
      if (o.alive === 0 || o.id === skipReg) continue;
      // The regiment's circle against the line, widened by how far its men can go meanwhile.
      const ex = o.cx - x0;
      const ey = o.cy - y0;
      const t = Math.max(0, Math.min(L, ex * ux + ey * uy));
      const qx = ex - ux * t;
      const qy = ey - uy * t;
      const reach = o.radius + o.speed * 2 * flight + 8;
      if (qx * qx + qy * qy > reach * reach) continue;
      for (const id of o.members) {
        if (id === skip || d.state[id]! > State.Routing) continue;
        const f0 = ((d.x[id]! - x0) * ux + (d.y[id]! - y0) * uy) / L;
        const when = Math.max(0, Math.min(1, f0)) * flight;
        const mx = d.x[id]! + d.vx[id]! * when - x0;
        const my = d.y[id]! + d.vy[id]! * when - y0;
        const tt = mx * ux + my * uy;
        if (tt < 0 || tt > L) continue;
        const px = mx - ux * tt;
        const py = my - uy * tt;
        // (The longer till the shot reaches him, the less sure where he will be: men in a press
        // shuffle a couple of units a second whatever their pace says.)
        const rr = d.rad[id]! * 0.85 + 2 + when * 2;
        if (px * px + py * py <= rr * rr) return id;
      }
    }
    return -1;
  }

  /**
   * Men whose bodies cross the line from (x0, y0) to (x1, y1), nearest first, at most `max`
   * (into lineIds / lineT); `skip` is the shooter, `skipReg` a regiment to see through (-1 none).
   */
  private lineHits(x0: number, y0: number, x1: number, y1: number, skip: number, skipReg: number, max: number): number {
    const d = this.d;
    const lx = x1 - x0;
    const ly = y1 - y0;
    const L = sqrt(lx * lx + ly * ly) || 1;
    const ux = lx / L;
    const uy = ly / L;
    const ids = this.lineIds;
    const ts = this.lineT;
    const cap = Math.min(max, ids.length);
    let n = 0;
    const seen = this.cellSeen;
    const stamp = ++this.cellStamp;
    const steps = Math.ceil(L / CELL) + 1;
    for (let k = 0; k <= steps; k++) {
      const px = x0 + ux * Math.min(L, k * CELL);
      const py = y0 + uy * Math.min(L, k * CELL);
      const cx0 = Math.max(0, Math.floor(px / CELL) - 1);
      const cy0 = Math.max(0, Math.floor(py / CELL) - 1);
      const cx1 = Math.min(GW - 1, cx0 + 2);
      const cy1 = Math.min(GH - 1, cy0 + 2);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = cy * GW + cx;
          if (seen[c] === stamp) continue;
          seen[c] = stamp;
          for (let q = this.grid[c]!; q < this.gridEnd[c]!; q++) {
            const j = this.items[q]!;
            if (j === skip || d.state[j]! > State.Routing || d.reg[j] === skipReg) continue;
            const ex = d.x[j]! - x0;
            const ey = d.y[j]! - y0;
            const t = ex * ux + ey * uy;
            if (t < 0 || t > L) continue;
            const px2 = ex - ux * t;
            const py2 = ey - uy * t;
            const rr = d.rad[j]! * 0.85;
            if (px2 * px2 + py2 * py2 > rr * rr) continue;
            // Insert in order of t, keeping the nearest `cap`.
            let w: number;
            if (n < cap) w = n++;
            else if (ts[cap - 1]! <= t) continue;
            else w = cap - 1;
            while (w > 0 && ts[w - 1]! > t) {
              ids[w] = ids[w - 1]!;
              ts[w] = ts[w - 1]!;
              w--;
            }
            ids[w] = j;
            ts[w] = t;
          }
        }
      }
    }
    return n;
  }

  /**
   * A man of regiment `r` to shoot at from (x, y): a few picked at random, the first within
   * `range` (a bowman aims at the part of a big block he can reach), else the nearest of them.
   */
  private pickInReach(r: Regiment, x: number, y: number, range: number, nearest = false): number {
    const d = this.d;
    let best = -1;
    let bd = Infinity;
    for (let tries = 0; tries < 6; tries++) {
      const id = r.members[this.rng.int(r.members.length)]!;
      if (d.state[id]! > State.Routing) continue;
      const dx = d.x[id]! - x;
      const dy = d.y[id]! - y;
      const q = dx * dx + dy * dy;
      // (At will, the nearest of those he looks at: the eager men out in front draw the shots.)
      if (q <= range * range && q >= 36 && !nearest) return id;
      if (nearest && q < 36) continue;
      if (q < bd) {
        bd = q;
        best = id;
      }
    }
    return best >= 0 ? best : this.pickMember(r);
  }

  /**
   * Over a melee: a man in the rear ranks of `r` (the back half of its depth, away from the
   * fight at its front) within `range` of (x, y), or -1.
   */
  private pickRear(r: Regiment, x: number, y: number, range: number): number {
    const d = this.d;
    const back = r.depth * 0.5;
    for (let tries = 0; tries < 6; tries++) {
      const id = r.members[this.rng.int(r.members.length)]!;
      if (d.state[id]! > State.Routing || d.sy[id]! > -back) continue;
      const dx = d.x[id]! - x;
      const dy = d.y[id]! - y;
      if (dx * dx + dy * dy <= range * range) return id;
    }
    return -1;
  }

  private pickMember(r: Regiment): number {
    const d = this.d;
    for (let tries = 0; tries < 6; tries++) {
      const id = r.members[this.rng.int(r.members.length)]!;
      if (d.state[id]! <= State.Routing) return id;
    }
    for (const id of r.members) if (d.state[id]! <= State.Routing) return id;
    return -1;
  }

  /** Where a blow comes from against where the defender's regiment faces: 1 front, -1 rear. */
  private facing(a: number, t: number, dr: Regiment): number {
    const d = this.d;
    const ux = d.x[a]! - d.x[t]!;
    const uy = d.y[a]! - d.y[t]!;
    const un = sqrt(ux * ux + uy * uy) || 1;
    const dot = (ux * dr.fx + uy * dr.fy) / un;
    // A block that has just faced round and is still re-forming (see `turnFoot`) has no front yet:
    // a blow or a charge from before it takes it as in flank.
    return this.tick < dr.formedAt && dot > 0.29 ? 0.29 : dot;
  }

  /**
   * REACH: where a spear's point stands off man `i` coming at spearman `t`: the two bodies and
   * `REACH.stand` of the spear's reach. A spearman stands his foe off there, and a man held by
   * his point (`held`) comes no closer.
   */
  private pointLine(i: number, t: number): number {
    const d = this.d;
    return d.rad[i]! + d.rad[t]! + d.rc[t]! * REACH.stand;
  }

  /**
   * REACH: whether man `i`, coming at `t`, is held at `t`'s levelled point: `t` is a spearman of a
   * formed block standing to fight (not running, re-forming, in column, reeling, nor making for the
   * rear hurt), `i` stands before its front (or before the rear ranks it has turned about), his arm
   * shorter than `REACH.short` of the spear, on foot or on a horse whose charge is spent (a charge
   * meets the brace and pike-wall rules: `impact`), and he is not through the points already
   * (`ps`). Push of pike: spear against spear, neither is held; each fences from his own reach.
   */
  private held(i: number, t: number): boolean {
    const d = this.d;
    const rt = d.rc[t]!;
    if (rt < REACH.long || d.rc[i]! >= rt * REACH.short || d.ps[i]! > this.tick) return false;
    if (d.mt[i] && d.imp[i]! > 0.3) return false;
    if (d.state[t] !== State.Fighting || d.mt[t] || d.stun[t]! > 0 || this.tick < d.wd[t]! || d.cu[t]) return false;
    const o = this.regiments[d.reg[t]!]!;
    if (o.routed || this.tick < o.formedAt || o.stance === 'column') return false;
    // TERRAIN: no spear wall among trees or in a stream.
    if (!this.flat && this.terrain.ground[this.terrain.index(d.x[t]!, d.y[t]!)]! >= Ground.Wood) return false;
    const m = o.mode;
    if (m === 'pursue' || m === 'rout' || m === 'withdraw' || m === 'skirmish') return false;
    const back = facesRear(o, d.row[t]!, false, this.tick);
    const ux = d.x[i]! - d.x[t]!;
    const uy = d.y[i]! - d.y[t]!;
    const dot = (ux * o.fx + uy * o.fy) * (back ? -1 : 1);
    return dot > 0.3 * (sqrt(ux * ux + uy * uy) || 1);
  }

  /** REACH: a gap in the spear wall beside spearman `t`: a man of his rank on either hand down or out of his place. */
  private gapBeside(t: number): boolean {
    const d = this.d;
    const r = this.regiments[d.reg[t]!]!;
    const K = r.nbK;
    const row = d.row[t]!;
    const ck = Math.round(d.col[t]! * 2);
    const nb = r.nb;
    if (row * K + ck >= nb.length || nb[row * K + ck] !== t) return true;
    const wide = r.spacing * 2.1;
    const deep = this.regStep[r.id]! * 2;
    for (let side = -2; side <= 2; side += 4) {
      const kk = ck + side;
      // (The end of the rank is the flank, not a gap.)
      if (kk < 0 || kk >= K) continue;
      const j = nb[row * K + kk]!;
      if (j < 0) {
        // (A hole with a man beyond it; nobody beyond is the end of the rank.)
        const k2 = kk + side;
        if (k2 >= 0 && k2 < K && nb[row * K + k2]! >= 0) return true;
        continue;
      }
      if (d.state[j] !== State.Fighting) return true;
      // (Out of his place: a man's breadth and more open between them, or two ranks out of line.)
      const ex = d.x[j]! - d.x[t]!;
      const ey = d.y[j]! - d.y[t]!;
      const lat = ex * -r.fy + ey * r.fx;
      const fwd = ex * r.fx + ey * r.fy;
      if ((lat < 0 ? -lat : lat) > wide || (fwd < 0 ? -fwd : fwd) > deep) return true;
    }
    return false;
  }

  /** REACH: a man of the ranks behind a long spear's front who strikes past it (pikes, yari), from his place. */
  private supports(i: number, r: Regiment): boolean {
    const d = this.d;
    return d.rc[i]! >= REACH.support && d.row[i]! <= REACH.supportRows && !d.mt[i] && d.cu[i] === 0 && r.role === 'line';
  }

  /**
   * REACH: how close man `i` comes to his foe `t`: a short arm to body contact, a spear to
   * `REACH.stand` of its reach; held at `t`'s point (`held`), no closer than the point.
   */
  private measure(i: number, t: number): number {
    const d = this.d;
    const ri = d.rc[i]!;
    const c = d.rad[i]! + d.rad[t]! + (ri >= REACH.long ? ri * REACH.stand : 0.9);
    return this.held(i, t) ? Math.max(c, this.pointLine(i, t)) : c;
  }

  private strike(a: number, t: number): void {
    const d = this.d;
    const A = this.soldiers[a]!;
    const D = this.soldiers[t]!;
    const as = A.s;
    const ds = D.s;
    const dr = this.regiments[D.reg]!;
    const ar = this.regiments[A.reg]!;
    const sa = STANCES[ar.stance];
    const sd = STANCES[dr.stance];
    let attack = as.attack * (A.vet ? 1.1 : 1) + sa.attack - ar.fatigue * FATIGUE.combat + (ar.moraleState === 'wavering' || ar.moraleState === 'rallying' ? MORALE.waverAttack : 0) + (this.crumbling[ar.team] ? UNDEAD.crumbleAttack : 0);
    let defence = ds.defence * (D.vet ? 1.1 : 1) - dr.fatigue * FATIGUE.combat + (dr.moraleState === 'wavering' || dr.moraleState === 'rallying' ? MORALE.waverDefence : 0) + (this.crumbling[dr.team] ? UNDEAD.crumbleDefence : 0);
    const routing = d.state[t] === State.Routing;
    let fence = 1;
    if (routing) defence *= 0.2;
    else {
      if (d.stun[t]! > 0) defence *= d.dm[t] ? HORSE.downDefence : 0.6;
      const dot = this.facing(a, t, dr);
      defence += dr.stance === 'pikewall' && dot < 0.3 ? -10 : sd.defence;
      // REACH: a spearman with his foe inside his point fights cramped (he shortens his grip,
      // drops the spear for a sidearm, or is simply too close to thrust); spear on spear, front
      // to front, the points fence (below).
      const ex = d.x[t]! - d.x[a]!;
      const ey = d.y[t]! - d.y[a]!;
      const q = sqrt(ex * ex + ey * ey);
      const body = d.rad[a]! + d.rad[t]!;
      if (d.rc[a]! >= REACH.long && q < body + d.rc[a]! * REACH.inside) attack -= REACH.insideAttack;
      if (d.rc[t]! >= REACH.long && q < body + d.rc[t]! * REACH.inside) defence -= REACH.insideDefence;
      // A man on foot held at the points does nothing but keep them off: most thrusts glance off.
      // (Not a horse: it cannot be held back from the points, and is gutted on them.)
      else if (!d.mt[t] && this.held(t, a)) fence = REACH.heldHit;
      if (d.rc[a]! >= REACH.long && d.rc[t]! >= REACH.long && dot > 0.3) fence = REACH.fence;
      // TERRAIN: the man above strikes down with his weight behind it, the man below up the
      // slope; a man in the water has no footing; in a wood the ranks of a shield or pike wall
      // are broken by the trees.
      if (!this.flat) {
        const T = this.terrain;
        const ia = T.index(d.x[a]!, d.y[a]!);
        const it = T.index(d.x[t]!, d.y[t]!);
        const G = TERRAIN.heightGrade;
        const down = -T.grade(ia, ex / (q || 1), ey / (q || 1));
        attack += TERRAIN.heightAttack * (down > G ? G : down < -G ? -G : down);
        if (T.ground[ia] === Ground.Water) attack -= TERRAIN.waterAttack;
        if (T.ground[it] === Ground.Water) defence -= TERRAIN.waterDefence;
        else if (T.ground[it] === Ground.Wood && sd.defence > 0) defence -= sd.defence * (1 - TERRAIN.woodStance);
      }
      if (dot < -0.4) {
        attack += 20;
        defence *= 0.55;
        dr.flankShock += MORALE.rearBlow * this.shockK;
      } else if (dot < 0.3) {
        attack += 9;
        dr.flankShock += MORALE.flankBlow * this.shockK;
      }
    }
    const chance = Math.max(0.08, Math.min(0.92, 0.36 + (attack - defence) * 0.012)) * fence;
    d.acted[a] = this.tick;
    d.cd[a] = as.meleeCooldown + this.rng.int(4);
    if (this.rng.next() >= chance) return;
    let damage = as.damage;
    if (ds.mounted) damage *= as.antiCav * (ar.stance === 'pikewall' ? 1.4 : 1);
    const roll = 0.8 + this.rng.next() * 0.4;
    // HORSE: a spear goes for the horse as often as the man; other foot for its legs and bridle.
    // (Other foot pull down only riders whose charge has lost heart: HORSE.footShare.)
    if (ds.mounted && !as.mounted && d.hh[t]! > 0 && dr.role !== 'command' && this.rng.next() < (as.antiCav > 1.5 ? HORSE.spearShare : dr.moraleState === 'wavering' ? HORSE.footShare : 0)) {
      this.horseHit(t, damage * roll * MELEE_K, 0, this.facing(a, t, dr) > 0.25, a);
      return;
    }
    // HORSE: a rider thrown and not yet up, or caught running on foot, is stabbed through the gaps of his harness.
    const armour = d.dm[t] && (d.stun[t]! > 0 || routing) ? ds.armour * HORSE.downArmour : ds.armour;
    this.hurt(t, damage * roll * MELEE_K * (50 / (50 + armour)), a);
  }

  /** A charging man hits: knock-back and shock, or a horse impaled on braced spears. */
  private impact(a: number, t: number): void {
    const d = this.d;
    const A = this.soldiers[a]!;
    const D = this.soldiers[t]!;
    const as = A.s;
    const ds = D.s;
    const dr = this.regiments[D.reg]!;
    const energy = d.imp[a]!;
    const dot = this.facing(a, t, dr);
    d.acted[a] = this.tick;
    d.cd[a] = as.meleeCooldown;
    const standing = d.state[t] === State.Fighting;
    const frontal = dot > 0.25;
    // A pike wall impales horse charging its front, and stops the charge dead.
    if (as.mounted && !ds.mounted && standing && frontal && dr.stance === 'pikewall') {
      d.acted[t] = this.tick;
      d.imp[a] = 0;
      d.stun[a] = 8;
      d.vx[a] = -d.vx[a]! * 0.3;
      d.vy[a] = -d.vy[a]! * 0.3;
      this.hurt(a, ds.damage * Math.max(1.5, ds.antiCav) * 2.2 * MELEE_K * (50 / (50 + as.armour)) * (0.6 + energy * 0.6), t);
      // HORSE: and the horse takes the points in its chest.
      if (d.state[a] === State.Fighting && d.mt[a] && d.hh[a]! > 0 && this.regiments[A.reg]!.role !== 'command') this.horseHit(a, HORSE.impale * (0.6 + energy * 0.6), 0, true, t);
      return;
    }
    const routing = d.state[t] === State.Routing;
    const rear = !routing && dot < -0.4;
    const side = !routing && !rear && dot < 0.3;
    const ar = this.regiments[A.reg]!;
    const wedge = ar.stance === 'wedge';
    // T1: a charge on the Marshal's signal hits harder and shakes more.
    const ad = this.doc[A.team]!;
    const held = ar.held ? ad.heldCharge : 1;
    // Braced shock troops take a charge on their front without giving ground.
    const planted = standing && frontal && dr.stance === 'braced';
    let force = energy * (planted ? 0.3 : 1) * (wedge ? 1.25 : 1) * held;
    // TERRAIN: a charge down a slope hits harder, one up it softer.
    if (!this.flat) {
      const vx = d.vx[a]!;
      const vy = d.vy[a]!;
      const v = sqrt(vx * vx + vy * vy);
      if (v > 1) force *= Math.max(TERRAIN.chargeMin, Math.min(TERRAIN.chargeMax, 1 - TERRAIN.chargeK * this.terrain.grade(this.terrain.index(d.x[a]!, d.y[a]!), vx / v, vy / v)));
    }
    const roll = 0.8 + this.rng.next() * 0.4;
    const dmg = (as.damage + as.charge * 0.9) * force * (rear ? 1.3 : 1) * MELEE_K * (50 / (50 + ds.armour)) * roll;
    this.hurt(t, dmg, a);
    // Knocked back along the line of the charge, and reeling.
    let nx = d.vx[a]!;
    let ny = d.vy[a]!;
    let m = sqrt(nx * nx + ny * ny);
    if (m < 1) {
      nx = d.x[t]! - d.x[a]!;
      ny = d.y[t]! - d.y[a]!;
      m = sqrt(nx * nx + ny * ny) || 1;
    }
    // Foot charges shock less than horse, the heavier the more (shock troops > heavy foot >
    // spears > levies): its charge bonus sets it.
    const foot = as.mounted ? 1 : 0.15 + 0.03 * as.charge;
    // U2 Unflinching: the dead barely reel and are not stunned (and the charge stalls in them).
    const dd = this.doc[dr.team]!;
    const kb = planted ? 0 : (2 + 5 * energy) * (as.mass / (as.mass + ds.mass)) * foot * (wedge ? 1.5 : 1) * (dr.stance === 'loose' ? 0.7 : 1) * dd.knockback;
    if (d.state[t]! <= State.Routing) {
      d.x[t] = clampX(d.x[t]! + (nx / m) * kb);
      d.y[t] = clampY(d.y[t]! + (ny / m) * kb);
      const stun = as.mounted ? 8 + this.rng.int(6) : 2 + Math.round(as.charge * 0.3);
      d.stun[t] = planted || !dd.stun ? 0 : stun;
    }
    if (!routing) {
      const k = this.shockK;
      // (HORSE: a charge of horse that has lost heart on the way in shocks less.)
      const faint = as.mounted && ar.moraleState === 'wavering' ? HORSE.waverShock : 1;
      this.shake(dr, (rear ? MORALE.chargeRear : side ? MORALE.chargeFlank : MORALE.chargeFront) * force * faint * (ds.mounted ? 0.6 : 1) * (as.mounted ? 1 : 0.2 + 0.04 * as.charge) * k * (ar.held ? ad.heldShock : 1));
      dr.flankShock += (rear ? 0.6 : side ? 0.3 : 0) * k;
    }
    // Each man hit takes some of the charge out of him: knights carry through a thin line, light
    // horse soon stalls.
    d.imp[a] = Math.max(0, energy - (0.22 + 0.12 * ds.mass) * (wedge ? 0.55 : 1) * (planted ? 3 : 1) * (as.mounted && as.mass < 4 ? 1.7 : 1) * dd.drain);
  }

  private hurt(t: number, amount: number, by: number): void {
    const d = this.d;
    if (d.state[t]! > State.Routing) return;
    const was = d.hp[t]!;
    const st0 = d.state[t]!;
    d.hp[t]! -= amount;
    d.hit[t] = this.tick;
    if (d.hp[t]! > 0) {
      if (d.state[t] === State.Fighting && d.row[t] === 0 && !d.mt[t]) this.wounded(t, was);
      return;
    }
    d.state[t] = State.Dead;
    d.died[t] = this.tick;
    d.vx[t] = 0;
    d.vy[t] = 0;
    d.target[t] = -1;
    if (by >= 0) {
      d.kills[by]!++;
      const br = this.regiments[d.reg[by]!]!;
      br.recentKills += 1 / br.start;
    }
    const r = this.regiments[d.reg[t]!]!;
    // (A runner left behind when his block rallied is no longer in its ranks: see `survey`.)
    if (r.routed || st0 !== State.Routing) {
      r.alive--;
      r.recent += 1 / r.start;
      r.reflow = true;
    }
    // U3: one more the Lich-Marshal may raise (a share of one), if he fell for the first time.
    const side = d.team[t]!;
    const raiser = this.doc[side]!;
    if (raiser.raiseEvery > 0 && d.rose[t]! < 0 && RISES[this.soldiers[t]!.cls] && this.lordAlive(side)) this.toRaise[side]! += raiser.raiseShare;
    if (t === this.commander[d.team[t]!]) {
      const team = d.team[t]!;
      this.commanderFell[team] = true;
      this.events.push({ tick: this.tick, team, kind: 'commander', cls: U.Knights });
      const doc = this.doc[team]!;
      for (const o of this.teamRegs[team]!) {
        // T3: the brothers take their Marshal's death harder; S1: the samurai their daimyō's.
        const grief = doc.standFast && (o.cls === U.Knights || o.cls === U.Shock) && o.role !== 'command' ? doc.brothersGrief : 1;
        this.shake(o, MORALE.generalDeadShock * doc.generalDeadShock * grief);
      }
      // S1: his household horse charges to avenge him.
      if (doc.revenge && this.teamRegs[team]!.some((o) => o.role === 'shock-cav' && o.alive > 0 && !o.routed)) {
        this.generals[team]!.revengeAt = this.tick;
        this.events.push({ tick: this.tick, team, kind: 'doctrine', cls: U.Knights, note: 'revenge' });
      }
      // The Lich-Marshal's will held the dead together: without it the host crumbles.
      if (this.fearless[team] && !this.crumbling[team]) {
        this.crumbling[team] = true;
        this.events.push({ tick: this.tick, team, kind: 'crumble', cls: U.Knights, note: 'commander' });
      }
    }
  }

  /**
   * HORSE: rider `i`'s horse takes `raw` damage (before its barding, of which `pierce` is
   * ignored; from the side the barding covers less). Down, it leaves him on foot (`dismount`);
   * wounded, it slows, loses its charge and may bolt and throw him.
   */
  private horseHit(i: number, raw: number, pierce: number, front: boolean, by: number): void {
    const d = this.d;
    const S = this.soldiers[i]!;
    const st = S.s;
    const r = this.regiments[d.reg[i]!]!;
    const bard = st.barding * (front ? 1 : HORSE.sideBard) * (1 - pierce);
    d.hh[i]! -= raw * (50 / (50 + bard)) * (0.75 + this.rng.next() * 0.5);
    d.hit[i] = this.tick;
    this.shake(r, HORSE.woundShock * this.shockK);
    if (d.hh[i]! <= 0) {
      this.dismount(i, by);
      return;
    }
    const left = d.hh[i]! / st.horse;
    d.spd[i] = st.speed * (HORSE.slowMin + (1 - HORSE.slowMin) * left);
    const gallop = d.imp[i]! > 0.3;
    d.imp[i]! *= HORSE.impLoss;
    const bolt = (HORSE.boltMin + HORSE.bolt * (1 - left)) * (gallop ? HORSE.gallop : 1) * (this.fearless[r.team] ? HORSE.deadBolt : 1);
    if (this.rng.next() < bolt) this.dismount(i, -1);
  }

  /** HORSE: a rider's stats on foot (his class's, `FOOT_PACE`, a sword, no lance, no bow). */
  private footOf(team: number, cls: number): UnitStats {
    const key = team * UNIT_COUNT + cls;
    const had = this.footStats.get(key);
    if (had) return had;
    const st = this.stats[team]![cls]!;
    const foot: UnitStats = {
      ...st,
      mounted: false,
      horse: 0,
      barding: 0,
      speed: FOOT_PACE[cls] ?? 22,
      radius: cls === U.Knights ? 2.6 : 2.4,
      mass: cls === U.Knights ? 1.4 : 1.1,
      reach: 1.6,
      charge: 0,
      attack: st.attack * HORSE.footAttack,
      defence: st.defence * HORSE.footDefence * (cls === U.Knights ? HORSE.plateWinded : 1),
      damage: st.damage * HORSE.footDamage,
      shield: st.shield * 0.6,
      range: 0,
      ammo: 0,
      missileDamage: 0,
      meleeCooldown: st.meleeCooldown + 2,
      value: st.value * 0.4,
    };
    this.footStats.set(key, foot);
    return foot;
  }

  /**
   * HORSE: rider `i`'s horse is down or gone (`by`: who brought it down, or -1). He is on foot
   * (`footOf`), dazed and hurt by the fall, the harder at the gallop, and the riders close behind
   * him at the gallop are checked by him (some stumble). His block feels it.
   */
  private dismount(i: number, by: number): void {
    const d = this.d;
    const S = this.soldiers[i]!;
    const r = this.regiments[d.reg[i]!]!;
    const vx = d.vx[i]!;
    const vy = d.vy[i]!;
    const v = sqrt(vx * vx + vy * vy);
    const gallop = d.imp[i]! > 0.3 || v > S.s.speed * 0.6;
    const foot = this.footOf(d.team[i]!, S.cls);
    S.s = foot;
    d.mt[i] = 0;
    d.dm[i] = 1;
    d.hh[i] = 0;
    d.spd[i] = foot.speed;
    d.rad[i] = foot.radius;
    d.mass[i] = foot.mass;
    d.rc[i] = foot.reach;
    d.imp[i] = 0;
    d.ammo[i] = 0;
    d.target[i] = -1;
    d.cu[i] = 0;
    d.wd[i] = 0;
    d.ps[i] = 0;
    d.vx[i] = vx * 0.2;
    d.vy[i] = vy * 0.2;
    d.stun[i] = HORSE.stun + this.rng.int(HORSE.stunVar) + (gallop ? 10 : 0) + (S.cls === U.Knights ? HORSE.plateStun : 0);
    this.unhorsed[d.team[i]!]!++;
    this.shake(r, HORSE.downShock * this.shockK);
    // (A rider lost to his block; a horse brought down heartens those who did it.)
    r.recent += HORSE.lossShare / r.start;
    if (by >= 0) {
      const br = this.regiments[d.reg[by]!]!;
      br.recentKills += 1 / br.start;
    }
    if (gallop && v > 1) {
      // The riders on his heels ride into the fallen horse, or round it.
      const ux = vx / v;
      const uy = vy / v;
      for (const j of r.members) {
        if (j === i || !d.mt[j] || d.state[j] !== State.Fighting || d.imp[j]! <= 0.3) continue;
        const ex = d.x[i]! - d.x[j]!;
        const ey = d.y[i]! - d.y[j]!;
        const ahead = ex * ux + ey * uy;
        if (ahead < 0 || ahead > HORSE.pile * 2 || Math.abs(ex * uy - ey * ux) > HORSE.pile * 0.5) continue;
        d.imp[j]! *= 0.5;
        if (this.rng.next() < HORSE.pileTrip) {
          // He rides into the fallen horse: his own goes down on its knees, or over.
          d.stun[j] = Math.max(d.stun[j]!, 6);
          if (d.hh[j]! > 0) this.horseHit(j, HORSE.trip, 0, true, -1);
        }
      }
    }
    // At the gallop he may be pinned under the horse, or ridden over by those behind.
    const crush = gallop && this.rng.next() < HORSE.crush ? HORSE.crushHurt + this.rng.next() * HORSE.crushVar : 0;
    this.hurt(i, foot.hp * ((HORSE.fall + this.rng.next() * HORSE.fallVar) * (gallop ? HORSE.fallGallop : 1) + crush), by);
  }

  /**
   * HORSE: a rider on foot, still with his horse's block (`Store.dm` 1): he fights a foe at hand,
   * and while he is fit one within `joinFight` while his mates fight; nothing else (no bow).
   */
  private afootAct(i: number, r: Regiment): void {
    const d = this.d;
    let t = d.target[i]!;
    if (t >= 0 && d.state[t] !== State.Fighting) t = -1;
    if (t < 0 || (this.tick + i) % 3 === 0) {
      const fight = d.hp[i]! > this.soldiers[i]!.s.hp * HORSE.fightHp && (r.engaged || r.mode === 'melee' || r.mode === 'charge' || r.mode === 'pursue');
      const near = this.foeAt(i, fight ? HORSE.joinFight : HORSE.atHand);
      if (near >= 0 || !fight) t = near;
    }
    d.target[i] = t;
    if (t < 0 || d.stun[i]! > 0) return;
    const dx = d.x[t]! - d.x[i]!;
    const dy = d.y[t]! - d.y[i]!;
    const reach = d.rad[i]! + d.rad[t]! + d.rc[i]! + 1.4;
    if (dx * dx + dy * dy <= reach * reach && d.cd[i] === 0) this.strike(i, t);
  }

  /**
   * HORSE: a man of the foot not in a fight goes for an enemy rider unhorsed within `finish` of
   * him while that rider is down (dazed), badly hurt or running (on foot in plate he cannot get
   * away) and at most one of ours is at him already:
   * archers with their mallets and daggers, foot with whatever it has. `cur`: the one he is after.
   */
  private fallen(i: number, cur: number): number {
    const d = this.d;
    const ok = (j: number) => d.dm[j]! > 0 && (d.state[j] === State.Routing || (d.state[j] === State.Fighting && (d.stun[j]! > 0 || d.hp[j]! < this.soldiers[j]!.s.hp * HORSE.finishHp)));
    if (cur >= 0 && ok(cur)) {
      const ex = d.x[cur]! - d.x[i]!;
      const ey = d.y[cur]! - d.y[i]!;
      if (ex * ex + ey * ey < HORSE.finish * HORSE.finish * 2.25) return cur;
    }
    if ((this.tick + i) % 4 !== 0 || this.unhorsed[1 - d.team[i]!] === 0) return -1;
    const R = HORSE.finish;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const team = d.team[i]!;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    let best = -1;
    let bs = R * R;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        const from = team === 0 ? this.grid[c]! + this.ofTeam0[c]! : this.grid[c]!;
        const end = team === 0 ? this.gridEnd[c]! : this.grid[c]! + this.ofTeam0[c]!;
        for (let k = from; k < end; k++) {
          const j = this.items[k]!;
          if (!ok(j) || d.att[j]! > 1) continue;
          const dx = this.kx[k]! - x;
          const dy = this.ky[k]! - y;
          const q = dx * dx + dy * dy;
          if (q < bs) {
            bs = q;
            best = j;
          }
        }
      }
    }
    return best;
  }

  /**
   * HORSE: where a rider on foot (`afootAct`) goes, into `tmp`: at his foe; else to his mates if
   * they fight close by; else into the nearest block of our foot (he falls in with it when he
   * reaches it: `Store.dm` 2); else back to the general, or our own rear.
   */
  private afootMove(i: number, r: Regiment): void {
    const d = this.d;
    const spd = d.spd[i]!;
    const x = d.x[i]!;
    const y = d.y[i]!;
    const t = d.target[i]!;
    let gx = x;
    let gy = y;
    let stop = 0;
    if (t >= 0) {
      gx = d.x[t]!;
      gy = d.y[t]!;
      stop = this.measure(i, t);
    } else {
      const team = d.team[i]!;
      const mx = r.cx - x;
      const my = r.cy - y;
      let o: Regiment | null = null;
      const mq = mx * mx + my * my;
      if ((r.engaged || r.mode === 'melee') && mq < HORSE.mates * HORSE.mates && mq > 25 * 25) {
        gx = r.cx;
        gy = r.cy;
        stop = 6;
      } else {
        let bd = HORSE.refuge * HORSE.refuge;
        for (const f of this.teamRegs[team]!) {
          if (f.alive < 4 || f.routed || isMounted(f) || f.role === 'siege' || f.role === 'skirmish') continue;
          const fx = f.cx - x;
          const fy = f.cy - y;
          const q = fx * fx + fy * fy + (f.role === 'line' ? 0 : 150 * 150);
          if (q < bd) {
            bd = q;
            o = f;
          }
        }
      }
      if (o) {
        const fx = o.cx - x;
        const fy = o.cy - y;
        const reach = this.formRadius(o) + 6;
        if (fx * fx + fy * fy < reach * reach) {
          this.fallIn(i, r, o, false);
          d.dm[i] = 2;
          this.tmp[0] = 0;
          this.tmp[1] = 0;
          return;
        }
        gx = o.cx;
        gy = o.cy;
      } else if (!(r.engaged || r.mode === 'melee')) {
        const c = this.commander[team]!;
        if (c >= 0 && d.state[c] === State.Fighting) {
          gx = d.x[c]!;
          gy = d.y[c]!;
          stop = 25;
        } else {
          gx = team === 0 ? HORSE.home : FIELD_W - HORSE.home;
          stop = 10;
        }
      }
    }
    const ex = gx - x;
    const ey = gy - y;
    const q = sqrt(ex * ex + ey * ey);
    if (q <= stop + 0.5) {
      this.tmp[0] = 0;
      this.tmp[1] = 0;
      return;
    }
    const v = Math.min(spd * (t >= 0 ? 1 : 0.8), (q - stop) * 4) / q;
    this.tmp[0] = ex * v;
    this.tmp[1] = ey * v;
  }

  /**
   * P5: a man of the front rank of a block of the line, badly hurt (his hit points fall below
   * COHESION.woundedAt of his full), may drop back through his file (on a `woundedBack` chance,
   * a hash of his id): he and the rearmost man of his file change places, and he walks back
   * through the ranks, reeling (`stun`). Not the dead, who feel nothing.
   */
  private wounded(t: number, was: number): void {
    const d = this.d;
    const full = this.soldiers[t]!.s.hp;
    const C = COHESION;
    if (d.hp[t]! > full * C.woundedAt || was <= full * C.woundedAt) return;
    const r = this.regiments[d.reg[t]!]!;
    if (r.role !== 'line' || r.routed || !this.doc[r.team]!.loose.stepBack || r.stance === 'wedge') return;
    if ((hashUnit(t ^ this.salt ^ 0x5bd1) + 1) * 0.5 >= C.woundedBack) return;
    const key = Math.round(d.col[t]! * 2);
    let last = -1;
    for (const id of r.members) {
      if (id === t || d.state[id] !== State.Fighting || Math.round(d.col[id]! * 2) !== key) continue;
      if (last < 0 || d.row[id]! > d.row[last]!) last = id;
    }
    if (last < 0) return;
    // (And in the roll of who stands where: see `station`.)
    const K = r.nbK;
    const a = d.row[t]! * K + key;
    const z = d.row[last]! * K + key;
    if (key < K && a < r.nb.length && z < r.nb.length) {
      r.nb[a] = last;
      r.nb[z] = t;
    }
    d.row[t] = d.row[last]!;
    d.sy[t] = d.sy[last]!;
    d.row[last] = 0;
    d.sy[last] = 0;
    d.wd[t] = this.tick + C.woundedWalk;
    d.target[t] = -1;
  }

  /**
   * Nobody stands inside anybody: after everyone has moved, overlapping men are pushed apart
   * (heavier ones less), pair by pair in grid order so a press resolves rather than jitters.
   * Skirmishers squeeze through their own lines. A galloping rider shoves enemy foot aside a
   * stride ahead of him (unless they stand braced), so a charge opens a lane through a line
   * instead of riding through men. The correction is kept (`px`, `py`) so that next tick `move`
   * does not walk a man straight back into whoever pushed him.
   */
  private separate(): void {
    const grid = this.grid;
    const gridEnd = this.gridEnd;
    const kx = this.kx;
    const ky = this.ky;
    const kr = this.kr;
    const km = this.km;
    const kt = this.kt;
    const kl = this.kl;
    const kw = this.kw;
    const kpx = this.kpx;
    const kpy = this.kpy;
    const busy = this.busy;
    const items = this.items;
    const d = this.d;
    const bow = this.bowWave;
    const total = this.gridTotal;
    // Where everyone stands now (the cells are from the start of the tick: nobody moves far).
    for (let k = 0; k < total; k++) {
      const i = items[k]!;
      kx[k] = d.x[i]!;
      ky[k] = d.y[i]!;
      if (d.state[i]! > State.Routing) kl[k] = kl[k]! | 4;
    }
    kpx.fill(0, 0, total);
    kpy.fill(0, 0, total);
    for (let bi = 0; bi < this.busyN; bi++) {
      const c = busy[bi]!;
      const cx = c % GW;
      const cy = (c - cx) / GW;
      const a1 = gridEnd[c]!;
      // Each pair once: this cell's later items and the cell to the right (contiguous in grid
      // order), then the three cells below-left, below and below-right (contiguous too).
      // (A cell holds anyone exactly when its end is above 0.)
      const end1 = cx + 1 < GW && gridEnd[c + 1]! > 0 ? gridEnd[c + 1]! : a1;
      let r0 = 0;
      let r1 = 0;
      if (cy + 1 < GH) {
        const row = c + GW;
        const lo = cx > 0 ? row - 1 : row;
        const hi = cx + 1 < GW ? row + 1 : row;
        for (let q = lo; q <= hi; q++) {
          if (gridEnd[q]! === 0) continue;
          if (r1 === 0) r0 = grid[q]!;
          r1 = gridEnd[q]!;
        }
      }
      for (let ka = grid[c]!; ka < a1; ka++) {
        const li = kl[ka]!;
        if (li & 4) continue;
        let xi = kx[ka]!;
        let yi = ky[ka]!;
        const ri = kr[ka]!;
        const mi = km[ka]!;
        const ti = kt[ka]!;
        const wi0 = kw[ka]!;
        let pxi = 0;
        let pyi = 0;
        for (let pass = 0; pass < 2; pass++) {
          const kb0 = pass === 0 ? ka + 1 : r0;
          const kb1 = pass === 0 ? end1 : r1;
          for (let kb = kb0; kb < kb1; kb++) {
            const dx = xi - kx[kb]!;
            const dy = yi - ky[kb]!;
            let minD = ri + kr[kb]!;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD && (!bow || (wi0 === 0 && kw[kb] === 0))) continue;
            const lj = kl[kb]!;
            if (lj & 4) continue;
            let ma = mi;
            let mj = km[kb]!;
            if (ma === RISING_MASS && mj === RISING_MASS) continue;
            let k = 1;
            // A rider's bow wave: rider and shove direction (sideways out of his path) if any.
            let rider = -1;
            if (kt[kb] !== ti) {
              const wj = kw[kb]!;
              if (wi0 > 0 && (lj & 2) === 0 && mj <= 2) {
                const a = items[ka]!;
                if (d.vx[a]! * dx + d.vy[a]! * dy < 0) {
                  minD += wi0;
                  ma *= 3;
                  rider = a;
                }
              } else if (wj > 0 && (li & 2) === 0 && mi <= 2) {
                const b = items[kb]!;
                if (d.vx[b]! * dx + d.vy[b]! * dy > 0) {
                  minD += wj;
                  mj *= 3;
                  rider = b;
                }
              }
            } else if (((li | lj) & 1) !== 0) k = 0.3;
            if (d2 >= minD * minD) continue;
            const dd = sqrt(d2);
            if (rider < 0 && kt[kb] !== ti) {
              // A horse run onto braced foot is stopped dead.
              if (wi0 > 0 && (lj & 2) !== 0) d.imp[items[ka]!] = 0;
              else if (kw[kb]! > 0 && (li & 2) !== 0) d.imp[items[kb]!] = 0;
            }
            if (rider >= 0 && dd < ri + kr[kb]!) {
              // He could not get out of the way (men packed behind him): the horse is checked.
              d.imp[rider] = d.imp[rider]! * (d.mass[rider]! >= 4 ? 0.88 : 0.6);
              ma = mi;
              mj = km[kb]!;
            }
            let ux: number;
            let uy: number;
            if (rider >= 0) {
              // Thrown aside: half along the charge, mostly out to the side he stood on.
              const vx = d.vx[rider]!;
              const vy = d.vy[rider]!;
              const vq = sqrt(vx * vx + vy * vy) || 1;
              const fx = vx / vq;
              const fy = vy / vq;
              // Man relative to the rider.
              const sgn = rider === items[ka] ? -1 : 1;
              const rx = dx * sgn;
              const ry = dy * sgn;
              const side = rx * -fy + ry * fx >= 0 ? 1 : -1;
              let mx = fx * 0.5 - fy * side;
              let my = fy * 0.5 + fx * side;
              const mq = sqrt(mx * mx + my * my);
              mx /= mq;
              my /= mq;
              // u points from kb to ka: the man moves along u if he is ka, along -u if kb.
              ux = mx * sgn;
              uy = my * sgn;
            } else if (dd < 0.01) {
              ux = (ka & 1) === 0 ? 0.6 : -0.6;
              uy = 0.8;
            } else {
              ux = dx / dd;
              uy = dy / dd;
            }
            const f = (minD - dd) * k;
            const wi = mj / (ma + mj);
            const ax = ux * f * wi;
            const ay = uy * f * wi;
            const bx = ux * f * (1 - wi);
            const by = uy * f * (1 - wi);
            xi += ax;
            yi += ay;
            pxi += ax;
            pyi += ay;
            kx[kb]! -= bx;
            ky[kb]! -= by;
            kpx[kb]! -= bx;
            kpy[kb]! -= by;
          }
        }
        kx[ka] = xi;
        ky[ka] = yi;
        kpx[ka]! += pxi;
        kpy[ka]! += pyi;
      }
    }
    // Back from grid order to soldier order: positions, and the push as a velocity.
    d.px.fill(0);
    d.py.fill(0);
    for (let k = 0; k < total; k++) {
      if (kl[k]! & 4) continue;
      const i = items[k]!;
      const qx = kpx[k]!;
      const qy = kpy[k]!;
      if (qx === 0 && qy === 0) continue;
      const routing = d.state[i] === State.Routing;
      d.x[i] = routing ? kx[k]! : clampX(kx[k]!);
      d.y[i] = clampY(ky[k]!);
      d.px[i] = qx / TICK_S;
      d.py[i] = qy / TICK_S;
      d.vx[i]! += qx / TICK_S;
      d.vy[i]! += qy / TICK_S;
    }
  }

  /**
   * P1 (COHESION): how far ahead of his slot (negative: behind) a man walks, along the block's
   * facing: his eagerness and his file's (wider for green troops, narrower for veterans, by
   * the faction's `loose.lead`), more as the enemy nears (`near` 0..1), within `leadCap` rank
   * steps, plus a slow triangle wave along the files.
   */
  private lead(i: number, r: Regiment, near: number): number {
    const d = this.d;
    const L = this.doc[r.team]!.loose;
    const C = COHESION;
    const col = d.col[i]!;
    // (The mix of two even spreads, scaled back up to the spread of one.)
    const e = (C.fileShare * hashUnit((r.id * 977 + Math.round(col)) ^ this.salt) + (1 - C.fileShare) * d.ea[i]!) * C.fileNorm;
    const cap = C.leadCap * this.regStep[r.id]!;
    let f: number;
    if (d.mt[i]) f = e * C.horseLead * L.lead;
    else {
      f = e * (C.lead + C.leadNear * near) * L.lead * (r.veteran ? C.veteran : r.green ? C.green : 1);
      const ph = ((this.tick + col * C.rippleFile) % C.ripplePeriod) / C.ripplePeriod;
      f += (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4) * C.ripple * L.ripple;
    }
    return f > cap ? cap : f < -cap ? -cap : f;
  }

  /**
   * P3 (COHESION): whether a man of a block in melee is out of measure this tick: his breather
   * (`breathe` ticks in every `pulse`, his phase from his id, so neighbours take turns; the
   * faction's `loose.breathe`) while he recovers from a blow (his weapon not ready for
   * `breatheCd` ticks: he steps back between blows, so a breather costs him few), or his block's
   * lull. Foot only; the dead never.
   */
  private outOfMeasure(i: number, r: Regiment): boolean {
    if (r.lullUntil > this.tick) return true;
    const d = this.d;
    if (d.cd[i]! <= COHESION.breatheCd || d.mt[i] || r.role === 'command') return false;
    const b = this.doc[r.team]!.loose.breathe;
    const C = COHESION;
    return b > 0 && (this.tick + ((i * 37) % C.pulse)) % C.pulse < C.breathe * b;
  }

  /** P3: how far a man presses on, in a run of files surging forward (0 if not). */
  private surge(i: number, r: Regiment): number {
    if (r.surgeUntil <= this.tick) return 0;
    const c = this.d.col[i]! - r.surgeCol;
    return c >= 0 && c < r.surgeN ? COHESION.surgeStep : 0;
  }

  /**
   * P6 (COHESION): where a man whose slot lies beyond the end of the enemy block's front (his
   * block fights its front, wider than it) goes instead: his slot swung about that end of the
   * enemy's front, toward its flank and rear, the further the further out his file stands
   * (`curlBase` + `curlPerFile` a file beyond, at most `curlMax`, as tangents of half the
   * angle: no trig), times the faction's `loose.curl`. Puts the point in tmp[0], tmp[1] and
   * returns true; false when he is not beyond it.
   * (A shell over `curlAt`, passing the slot through the scratch: see `swerve`.)
   */
  private curl(i: number, r: Regiment, gx: number, gy: number): boolean {
    this.tmp[0] = gx;
    this.tmp[1] = gy;
    return this.curlAt(i, r);
  }

  /** `curl`, given (gx, gy) in tmp[0], tmp[1]. */
  private curlAt(i: number, r: Regiment): boolean {
    const gx = this.tmp[0]!;
    const gy = this.tmp[1]!;
    const L = this.doc[r.team]!.loose;
    if (L.curl <= 0 || this.fearless[1 - r.team]) return false;
    const o = this.regiments[r.targetReg]!;
    if (o.alive === 0 || o.routed || o.fx * r.fx + o.fy * r.fy > -0.3) return false;
    const C = COHESION;
    const lox = -o.fy;
    const loy = o.fx;
    const lat = (gx - o.ax) * lox + (gy - o.ay) * loy;
    const half = o.width * 0.5;
    const beyond = (lat < 0 ? -lat : lat) - half - r.spacing * 0.5;
    if (beyond <= 0) return false;
    const sg = lat < 0 ? -1 : 1;
    // About the end of the enemy's front: outward (u) and into the enemy's depth (b).
    const ux = lox * sg;
    const uy = loy * sg;
    const px = o.ax + ux * half;
    const py = o.ay + uy * half;
    const vx = gx - px;
    const vy = gy - py;
    const a = vx * ux + vy * uy;
    const b = -(vx * o.fx + vy * o.fy);
    const t = Math.min(C.curlMax, C.curlBase + (C.curlPerFile * beyond) / r.spacing) * L.curl;
    const c = (1 - t * t) / (1 + t * t);
    const s = (2 * t) / (1 + t * t);
    const a2 = a * c - b * s;
    // (No deeper than the enemy's rear rank and a little: round the flank, not off behind it.)
    const b2 = Math.min(o.depth + 6, a * s + b * c);
    this.tmp[0] = px + ux * a2 - o.fx * b2;
    this.tmp[1] = py + uy * a2 - o.fy * b2;
    void i;
    return true;
  }

  /**
   * P6: whether man `i`, fighting `t`, stands out past the end of the front of `t`'s block (at
   * its end file or beyond, before its rear): then the side he should take his foe from, a unit
   * vector outward along that block's front and a little back toward its rear, in tmp[0], tmp[1]
   * (so he steps round the corner rather than up to the front).
   */
  private wrapSide(i: number, t: number, r: Regiment): boolean {
    const L = this.doc[r.team]!.loose;
    if (L.curl <= 0 || this.fearless[1 - r.team]) return false;
    const d = this.d;
    const o = this.regiments[d.reg[t]!]!;
    if (o.routed || o.role === 'siege') return false;
    const lox = -o.fy;
    const loy = o.fx;
    const ex = d.x[i]! - o.ax;
    const ey = d.y[i]! - o.ay;
    const lat = ex * lox + ey * loy;
    const ahead = ex * o.fx + ey * o.fy;
    if ((lat < 0 ? -lat : lat) < o.width * 0.5 - o.spacing * 0.5 || ahead < -o.depth) return false;
    const sg = lat < 0 ? -1 : 1;
    const back = 0.45 * Math.min(1, L.curl);
    const m = sqrt(1 + back * back);
    this.tmp[0] = (lox * sg - o.fx * back) / m;
    this.tmp[1] = (loy * sg - o.fy * back) / m;
    return true;
  }

  /**
   * Station keeping (battle v17): where a man of a foot block makes for, given the point his place
   * in the block gives him (tx, ty, with his lead): partly that point (`COHESION.dressSlot`), the
   * rest where the men beside him and the man ahead of him in his file put him (a file's width
   * from each, a rank behind him), as a real man dresses on his neighbours: he cannot see the
   * whole line. A line on the move bends and ripples, and straightens itself over time. With the
   * man ahead fallen, in contact, he steps up into the hole, keeping station on the men beside it.
   * Neighbours who are fighting a foe (or swinging round a flank) do not count.
   * Puts the point in tmp[0], tmp[1]; false when he has nobody to dress on.
   * (A shell over `stationAt`, passing the point through the scratch: see `swerve`.)
   */
  private station(i: number, r: Regiment, tx: number, ty: number): boolean {
    this.tmp[0] = tx;
    this.tmp[1] = ty;
    return this.stationAt(i, r);
  }

  /** `station`, given (tx, ty) in tmp[0], tmp[1]. */
  private stationAt(i: number, r: Regiment): boolean {
    const tx = this.tmp[0]!;
    const ty = this.tmp[1]!;
    const d = this.d;
    const nb = r.nb;
    const K = r.nbK;
    let row = d.row[i]!;
    const ck = Math.round(d.col[i]! * 2);
    if (row * K + ck >= nb.length || nb[row * K + ck] !== i) return false;
    const C = COHESION;
    const fx = r.fx;
    const fy = r.fy;
    const sp = r.spacing;
    const step = this.regStep[r.id]!;
    let ox = tx;
    let oy = ty;
    if (row > 0 && r.contact) {
      // The man ahead of him is down: he takes his place (unless an enemy has stepped into it:
      // then he fights him from where he stands).
      const a = nb[(row - 1) * K + ck]!;
      if (a >= 0 && d.state[a] !== State.Fighting && !this.enemyAt(tx + fx * step, ty + fy * step, d.team[i]!, d.rad[i]! * 2 + 1)) {
        row--;
        ox += fx * step;
        oy += fy * step;
      }
    }
    let sx = 0;
    let sy = 0;
    let w = 0;
    const base = row * K;
    // (lateral unit: -fy, fx)
    for (let side = -2; side <= 2; side += 4) {
      const kk = ck + side;
      if (kk < 0 || kk >= K) continue;
      const j = nb[base + kk]!;
      if (j < 0 || j === i || !this.dresses(j, r)) continue;
      sx += d.x[j]! + fy * sp * (side > 0 ? 1 : -1);
      sy += d.y[j]! - fx * sp * (side > 0 ? 1 : -1);
      w++;
    }
    if (row > 0) {
      const ab = (row - 1) * K;
      const a = nb[ab + ck]!;
      if (a >= 0 && a !== i && this.dresses(a, r)) {
        sx += (d.x[a]! - fx * step) * C.dressAhead;
        sy += (d.y[a]! - fy * step) * C.dressAhead;
        w += C.dressAhead;
      } else {
        // (A short rank, or a wedge: the two ahead of him on either hand.)
        for (let side = -1; side <= 1; side += 2) {
          const kk = ck + side;
          if (kk < 0 || kk >= K) continue;
          const j = nb[ab + kk]!;
          if (j < 0 || j === i || !this.dresses(j, r)) continue;
          sx += d.x[j]! - fx * step + fy * sp * 0.5 * side;
          sy += d.y[j]! - fy * step - fx * sp * 0.5 * side;
          w++;
        }
      }
    }
    if (w === 0) {
      this.tmp[0] = ox;
      this.tmp[1] = oy;
      return ox !== tx || oy !== ty;
    }
    const k = C.dressSlot;
    this.tmp[0] = ox * k + (sx / w) * (1 - k);
    this.tmp[1] = oy * k + (sy / w) * (1 - k);
    return true;
  }

  /** Whether a standing man of the enemy of `team` is within `R` of (x, y) (the grid of this tick). */
  private enemyAt(x: number, y: number, team: number, R: number): boolean {
    const d = this.d;
    const x0 = Math.max(0, Math.floor((x - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((x + R) / CELL));
    const y0 = Math.max(0, Math.floor((y - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((y + R) / CELL));
    const R2 = R * R;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        const from = team === 0 ? this.grid[c]! + this.ofTeam0[c]! : this.grid[c]!;
        const end = team === 0 ? this.gridEnd[c]! : this.grid[c]! + this.ofTeam0[c]!;
        for (let k = from; k < end; k++) {
          const j = this.items[k]!;
          if (d.state[j] !== State.Fighting) continue;
          const dx = d.x[j]! - x;
          const dy = d.y[j]! - y;
          if (dx * dx + dy * dy <= R2) return true;
        }
      }
    }
    return false;
  }

  /**
   * Whether man `j` of block `r` is one to dress on: standing in it, in his place in the ranks.
   * (Not a man fighting a foe: he stands where his foe puts him, and dressing on him drew the men
   * beside him on into the enemy. Nor one reeling from a charge: dressing on men thrown aside by
   * horse opened the lane wider.)
   */
  private dresses(j: number, r: Regiment): boolean {
    const d = this.d;
    return d.state[j] === State.Fighting && d.reg[j] === r.id && d.cu[j] === 0 && d.target[j]! < 0 && d.stun[j] === 0;
  }

  private move(i: number): void {
    const d = this.d;
    // U3: a man the Lich-Marshal raised gets up where he fell before he goes anywhere.
    if (d.rose[i]! >= 0 && this.tick - d.rose[i]! < RISE_TICKS) {
      d.vx[i] = 0;
      d.vy[i] = 0;
      return;
    }
    const r = this.regiments[d.reg[i]!]!;
    const spd = d.spd[i]!;
    const x = d.x[i]!;
    const y = d.y[i]!;
    let vx: number;
    let vy: number;
    let cap = spd * 1.15;
    const routing = d.state[i] === State.Routing;
    const mounted = d.mt[i] === 1;
    if (routing) {
      // Each his own way and pace (see `rout`); hard by the top or bottom edge, along it. Every
      // other tick he looks ahead for an enemy close in his way (see `dodge`; his captain looks
      // further, every half second).
      if (((this.tick + i) & 1) === 0) this.dodge(i, d.team[i] === 0 ? -1 : 1, 20);
      // (HORSE: a knight unhorsed runs heavily in his plate.)
      const v = spd * 1.05 * d.hs[i]! * (d.dm[i] && this.soldiers[i]!.cls === U.Knights ? HORSE.plateRun : 1);
      vx = d.hx[i]! * v;
      vy = d.hy[i]! * v;
      if ((y < 12 && vy < 0) || (y > FIELD_H - 12 && vy > 0)) vy = 0;
      cap = spd * 1.25;
    } else if (d.dm[i] === 1 && isMounted(r)) {
      this.afootMove(i, r);
      vx = this.tmp[0]!;
      vy = this.tmp[1]!;
    } else if (mounted && r.mode !== 'withdraw' && this.amongFoot(i)) {
      // RIDER: a rider who finds himself in the ranks of our own foot rides out of them (to their
      // flank, or back out of their rear) and looks for another man (see `covered`); at the
      // gallop too: no rider charges on through his own men.
      vx = this.tmp[0]! * spd * RIDER.outOfRanks;
      vy = this.tmp[1]! * spd * RIDER.outOfRanks;
      d.target[i] = -1;
      if (d.wd[i]! < this.tick + 4) d.wd[i] = this.tick + 4;
      d.cu[i] = 1;
    } else {
      const t = d.target[i]!;
      // (A rank behind a long spear's front strikes past it from his place in the ranks.)
      if (t >= 0 && !(d.row[i]! > 0 && this.supports(i, r))) {
        let dx = d.x[t]! - x;
        let dy = d.y[t]! - y;
        // REACH: he closes to his weapon's reach, or is held at a spear's point (`measure`).
        const held = this.held(i, t);
        const contact = this.measure(i, t);
        let sg = 0;
        // P6: a man out past the end of the enemy's front closes on his foe from the flank side.
        // (Not a spear: he keeps his point on his man from where he stands.)
        if (!mounted && r.role === 'line' && d.imp[i]! <= 0.3 && d.rc[i]! < REACH.long && this.wrapSide(i, t, r)) {
          dx += this.tmp[0]! * contact;
          dy += this.tmp[1]! * contact;
        }
        const q = sqrt(dx * dx + dy * dy) || 1;
        // (A charge on foot runs in on a spear's points no further than the points; a spear's
        // charge lands at its own point, `act`.)
        if (mounted && d.state[t] === State.Routing && r.mode === 'pursue') {
          // QA round 2 #6: a rider after a fugitive rides him down: at the man's own pace and
          // more, closing to inside his reach, and cuts at him as he rides (`act`), not trotting
          // at his heels. (No impetus: a knock-back throws the man ahead of the horse again.) (Until v17 he closed only as fast as the gap, and sat 9-11 u
          // behind a running man for good: 8.8 kills a rider-minute.)
          const close = Math.max(spd * RIDER.rideDown, (q - contact + RIDER.rideIn) * 4);
          vx = d.vx[t]! + (dx / q) * close;
          vy = d.vy[t]! + (dy / q) * close;
          cap = spd * 1.2;
          d.cu[i] = 1;
        } else if (!mounted && d.dm[t] && d.state[t] === State.Routing) {
          // HORSE: a man after a rider unhorsed and running runs him down (`fallen`).
          const close = Math.max(spd * 0.3, (q - contact) * 4);
          vx = d.vx[t]! + (dx / q) * close;
          vy = d.vy[t]! + (dy / q) * close;
          cap = spd * 1.15;
        } else if (d.imp[i]! > 0.3 && !held && (mounted || q > contact)) {
          // (A spear runs in to its point, not past it: two lines running in meet in one stride.)
          const v = mounted || d.rc[i]! < REACH.long ? spd * 1.15 : Math.min(spd * 1.15, (q - contact) * 5);
          vx = (dx / q) * v;
          vy = (dy / q) * v;
          cap = spd * 1.2;
        } else if (!mounted && this.outOfMeasure(i, r)) {
          // P3: a breather (or the whole front's lull): a step or two back out of measure, at a walk.
          const back = r.lullUntil > this.tick ? COHESION.lullBack : COHESION.breatheBack;
          const v = Math.max(-spd * 0.5, Math.min(spd * 0.5, (q - contact - back) * 3)) / q;
          vx = dx * v;
          vy = dy * v;
        } else if (q > contact - (sg = r.surgeUntil > this.tick && !held ? this.surge(i, r) : 0)) {
          // (In a surge his files press in: he leans into his foe, and the press drives the
          // enemy back a step: see `separate`.)
          const v = Math.min(spd, (q - contact + sg) * 4) / q;
          vx = dx * v;
          vy = dy * v;
        } else if (!mounted && q < contact - 1.5 && (d.rc[i]! >= REACH.long ? d.ps[t]! <= this.tick : held)) {
          // REACH: a spearman with his foe too close (and not through his point) steps back to
          // bring it to bear, and a man held at the points who finds himself on them steps back
          // off them: the two lines come apart to the points again.
          const v = Math.max(-spd * 0.4, (q - contact) * 2) / q;
          vx = dx * v;
          vy = dy * v;
        } else {
          vx = 0;
          vy = 0;
        }
        // RIDER: he rides round a friend in his way rather than into his back, and is out of his
        // place while he goes for his own man (the anchor keeps to the rest).
        if (mounted) {
          if (q > contact + 2 && d.imp[i]! <= 0.3 && this.swerve(i, vx, vy)) {
            vx = this.tmp[0]!;
            vy = this.tmp[1]!;
          }
          d.cu[i] = q > contact + 6 ? 1 : 0;
        }
      } else {
        // Keep formation: match the anchor's pace and close on the slot.
        const gx = r.ax + r.fx * d.sy[i]! - r.fy * d.sx[i]!;
        const gy = r.ay + r.fy * d.sy[i]! + r.fx * d.sx[i]!;
        // In a melee the rear ranks close up gently: they back the front, they do not shove
        // it through the enemy. Men who have just rallied drift back into their ranks.
        const mode = r.mode;
        // P4: horse that has broken off closes up again on its rally point, at a walk.
        const rallying = (mode === 'rally' && this.tick - r.modeAt < 60) || (mode === 'hold' && this.tick < r.reformUntil);
        if (mounted) d.cu[i] = 0;
        if (mounted && this.tick < d.wd[i]! && this.pressed(i)) {
          // RIDER: pulling out of the spears (see `act`): away from the nearest, at a canter.
          vx = this.tmp[0]! * spd * 0.6;
          vy = this.tmp[1]! * spd * 0.6;
          d.cu[i] = 1;
        } else if (r.role === 'horse-archer' && (mode === 'kite' || mode === 'shoot' || mode === 'advance') && this.pressed(i)) {
          // RIDER: a horse archer with a foe at his horse's flank does not sit and wait for the
          // block to move: he rides off himself, away from the man and back toward his place.
          const ex = gx - x;
          const ey = gy - y;
          const q = sqrt(ex * ex + ey * ey) || 1;
          const w = Math.min(1, q / 30);
          vx = (this.tmp[0]! * (1 - w * 0.5) + (ex / q) * w * 0.5) * spd * 0.9;
          vy = (this.tmp[1]! * (1 - w * 0.5) + (ey / q) * w * 0.5) * spd * 0.9;
          if (this.swerve(i, vx, vy)) {
            vx = this.tmp[0]!;
            vy = this.tmp[1]!;
          }
          d.cu[i] = 1;
        } else if (mounted && (r.engaged || mode === 'melee') && r.role !== 'command' && this.flankPoint(i, r)) {
          // RIDER: nobody to fight where he is (behind his own front, say): he rides round to the
          // end of the enemy block and comes at its flank (where `hunt` finds him a man), round
          // any friend in his way, not into his back.
          const ex = this.tmp[0]! - x;
          const ey = this.tmp[1]! - y;
          const q = sqrt(ex * ex + ey * ey) || 1;
          const v = Math.min(spd * RIDER_FREE, q * 2) / q;
          vx = ex * v;
          vy = ey * v;
          if (this.swerve(i, vx, vy)) {
            vx = this.tmp[0]!;
            vy = this.tmp[1]!;
          }
          d.cu[i] = 1;
        } else if (mode === 'withdraw' && mounted && r.role !== 'command') {
          // RIDER: breaking off, each rider turns out of the fight by his own path (his own
          // turning circle: see below) and rides at his own pace for his own spot about the
          // rally point, his place in the block that will re-form there facing the fight, spread
          // out (`RIDER.rallySpread`): no wheel of the whole block about its middle.
          const sx = d.sx[i]! * RIDER.rallySpread + (((i * 7) % 11) - 5) * 1.5;
          const sy = d.sy[i]! * RIDER.rallySpread + (((i * 5) % 9) - 4) * 1.5;
          // (By way of the block's own goal: round any friend in the way, see `rideRound`.)
          const ex = r.tx + r.dfx * sy - r.dfy * sx - x;
          const ey = r.ty + r.dfy * sy + r.dfx * sx - y;
          const q = sqrt(ex * ex + ey * ey) || 1;
          const h = d.hs[i]! || 1;
          let v = Math.min(spd * PACE.withdraw * h, q * 1.5) / q;
          vx = ex * v;
          vy = ey * v;
          // QA review #14: a foe at his horse's head on the way to his spot (he was fighting on
          // the far side of him), he turns out round him, away from him, first: he does not ride
          // into him and stand there. (Until v17 riders were left in contact under half their
          // speed some 3 s a rider each time horse broke off.)
          const j = this.foeAt(i, RIDER.clear);
          if (j >= 0) {
            let ax = x - d.x[j]!;
            let ay = y - d.y[j]!;
            const m = sqrt(ax * ax + ay * ay) || 1;
            ax /= m;
            ay /= m;
            const along = (ex * ax + ey * ay) / q;
            if (along < 0.3) {
              // Round him: the part of his way across the line to the foe, and off from him.
              let wx = ex / q - along * ax + ax;
              let wy = ey / q - along * ay + ay;
              const w = sqrt(wx * wx + wy * wy) || 1;
              v = (spd * PACE.withdraw * h) / w;
              vx = wx * v;
              vy = wy * v;
            }
          }
          if (this.swerve(i, vx, vy)) {
            vx = this.tmp[0]!;
            vy = this.tmp[1]!;
          }
          cap = spd * 1.2 * h;
          d.cu[i] = 1;
        } else if (mode === 'withdraw' && mounted) {
          // P4: breaking off is no parade: each rider at his own pace toward a place spread about
          // his slot, a loose crowd riding for the rally point.
          const lx = gx + (gx - r.ax) * 0.6 + (((i * 7) % 11) - 5) * 2;
          const ly = gy + (gy - r.ay) * 0.6 + (((i * 5) % 9) - 4) * 2;
          const h = d.hs[i]! || 1;
          vx = (r.vax / TICK_S) * h + (lx - x) * 0.8;
          vy = (r.vay / TICK_S) * h + (ly - y) * 0.8;
          cap = spd * 1.2 * h;
        } else if (mode === 'pursue') {
          // A chase is a loose crowd: each man at his own pace toward a place well spread about
          // his slot.
          const lx = gx + (gx - r.ax) * 1.4 + (((i * 7) % 11) - 5) * 1.5;
          const ly = gy + (gy - r.ay) * 1.4 + (((i * 5) % 9) - 4) * 1.5;
          const h = d.hs[i]! || 1;
          vx = (r.vax / TICK_S) * h + (lx - x) * 0.9;
          vy = (r.vay / TICK_S) * h + (ly - y) * 0.9;
          cap = spd * (r.speed > 40 ? 1.2 : this.doc[r.team]!.footRun) * h;
        } else if (mode === 'charge' && !mounted) {
          // At a run, each man at his own pace: a ragged charge (run from too far) loses its ranks.
          // The eager run ahead of their slots (P1).
          const h = d.hs[i]! || 1;
          const k = r.ragged ? 0.9 : 2.2;
          const f = this.lead(i, r, 1);
          vx = (r.vax / TICK_S) * h + (gx + r.fx * f - x) * k;
          vy = (r.vay / TICK_S) * h + (gy + r.fy * f - y) * k;
          cap = spd * this.doc[r.team]!.footRun * 1.08;
        } else {
          const k = r.engaged ? 1 : rallying ? 0.7 : 2.5;
          if (rallying) cap = spd * 0.55;
          // P1: on the march each man of the line strides a little ahead of or behind his slot,
          // by his own eagerness and his file's, more so as the enemy comes near, and a slow wave
          // runs along the files; a rider at the charge has his own line too. (Not shooters: they
          // stand in their ranks to loose; and the dead, who never give a step, only on the march.)
          let f = 0;
          if (mounted ? mode === 'charge' : r.role === 'line' && (mode === 'advance' || mode === 'reserve' || (!r.engaged && (mode === 'hold' || mode === 'melee') && r.contact && this.doc[r.team]!.loose.stepBack))) f = this.lead(i, r, mounted ? 1 : r.closeIn);
          if (r.surgeUntil > this.tick) f += this.surge(i, r);
          let tx = gx + r.fx * f;
          let ty = gy + r.fy * f;
          d.cu[i] = 0;
          if (!mounted && r.role === 'line' && r.contact && (r.engaged || mode === 'melee' || mode === 'hold') && r.slot === 0 && r.targetReg >= 0 && this.curl(i, r, gx, gy)) {
            // P6: a file beyond the end of the enemy's front swings round its flank.
            tx = this.tmp[0]!;
            ty = this.tmp[1]!;
            d.cu[i] = 1;
          } else if (r.engaged && d.row[i]! > 0) {
            // P2: the rear ranks lean on the front, into its gaps.
            const L = COHESION.lean * this.doc[r.team]!.loose.leash;
            tx += r.fx * L;
            ty += r.fy * L;
          }
          // Foot keeps station on the men beside and ahead of him more than on his place in the
          // block: the line bends and dresses itself, and he steps up into a hole before him.
          // (Not shooters and skirmishers: they keep their ranks to loose, as for P1, and fight as a loose crowd.)
          if (!mounted && d.cu[i] === 0 && r.role === 'line' && this.station(i, r, tx, ty)) {
            tx = this.tmp[0]!;
            ty = this.tmp[1]!;
          }
          vx = r.vax / TICK_S + (tx - x) * k;
          vy = r.vay / TICK_S + (ty - y) * k;
          if (mode === 'charge' || mode === 'withdraw') cap = spd * 1.2;
        }
      }
    }
    if (mounted) {
      // A horse at speed cannot turn on the spot: it swings round at most 0.2 radians a tick
      // (it may slow as much as it likes, but not speed up, while it turns).
      const ox = d.vx[i]!;
      const oy = d.vy[i]!;
      const om = sqrt(ox * ox + oy * oy);
      if (om > spd * RIDER_FAST) {
        const wm = sqrt(vx * vx + vy * vy);
        if (wm > 0.5 && ox * vx + oy * vy < RIDER_COS * om * wm) {
          let cr = ox * vy - oy * vx;
          if (cr === 0) cr = ox * (FIELD_H / 2 - y) || 1;
          const sn = cr > 0 ? RIDER_SIN : -RIDER_SIN;
          const m = Math.min(om, wm) / om;
          vx = (ox * RIDER_COS - oy * sn) * m;
          vy = (ox * sn + oy * RIDER_COS) * m;
        }
      }
    }
    if (d.stun[i]! > 0) {
      vx *= 0.3;
      vy *= 0.3;
    }
    // Stakes: the enemy's horses balk and bleed.
    if (mounted && !routing && this.stakes.length > 0) {
      for (const k of this.stakes) {
        if (k.team === d.team[i] || Math.abs(x - k.x) > 4 || y < k.y0 || y > k.y1) continue;
        vx *= 0.25;
        vy *= 0.25;
        d.imp[i] = 0;
        if (this.tick % 5 === 0) this.hurt(i, 6, -1);
      }
    }
    const vmax = cap * 1.4;
    const vm = sqrt(vx * vx + vy * vy);
    if (vm > vmax) {
      vx = (vx / vm) * vmax;
      vy = (vy / vm) * vmax;
    }
    // Galloping (or running) in at a charge builds impetus; anything else bleeds it.
    if (r.mode === 'charge' && this.soldiers[i]!.s.charge > 0 && vm > spd * 0.7) d.imp[i] = Math.min(mounted || !r.ragged ? 1 : Math.max(0.35, 1 - (this.tick - r.chargeAt - RUN_IN) * 0.04), d.imp[i]! + (mounted ? 0.08 : 0.15));
    else if (d.imp[i]! > 0) d.imp[i] = d.imp[i]! < 0.05 ? 0 : d.imp[i]! * (mounted && vm > spd * 0.6 ? 0.93 : 0.8);
    // TERRAIN: the ground and the slope set his pace (up a hill slower, down it a little faster);
    // in a wood each man picks his own way among the trees, at his own pace, so the line goes
    // ragged; and no charge carries through trees or water.
    if (!this.flat) {
      const T = this.terrain;
      const ti = T.index(x, y);
      const gr = T.ground[ti]!;
      let k = T.pace(ti, vx, vy, mounted);
      if (gr === Ground.Wood) k *= 1 + TERRAIN.woodRagged * d.ea[i]!;
      vx *= k;
      vy *= k;
      if (gr >= Ground.Wood) {
        const most = gr === Ground.Water ? TERRAIN.waterImpetus : TERRAIN.woodImpetus;
        if (d.imp[i]! > most) d.imp[i] = most;
      }
    }
    // Men pressed by others do not walk into them: the part of his stride that goes into the
    // press is dropped (a galloping rider ploughs on; his bow wave moves them instead), and the
    // press itself moves him.
    const px = d.px[i]!;
    const py = d.py[i]!;
    const pm = sqrt(px * px + py * py);
    if (pm > 0.05 && !(mounted && d.imp[i]! > 0.3)) {
      const into = (vx * px + vy * py) / pm;
      if (into < 0) {
        vx -= (px / pm) * into;
        vy -= (py / pm) * into;
      }
    }
    d.vx[i] = vx;
    d.vy[i] = vy;
    let nx = x + vx * TICK_S;
    const ny = clampY(y + vy * TICK_S);
    if (routing) {
      if (nx < -4 || nx > FIELD_W + 4) {
        nx = Math.max(-8, Math.min(FIELD_W + 8, nx));
        d.state[i] = State.Fled;
        d.target[i] = -1;
        if (r.routed) r.alive--;
      }
    } else nx = clampX(nx);
    d.x[i] = nx;
    d.y[i] = ny;
  }

  private flyProjectiles(): void {
    const ps = this.projectiles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      if (p.lands > this.tick) {
        if (p.direct && p.left > 0) this.strikeAlong(p, (this.tick - p.born) / (p.lands - p.born));
        ps[w++] = p;
        continue;
      }
      this.land(p);
    }
    ps.length = w;
  }

  /**
   * Direct fire strikes the first man on the part of its line it flies over up to share `f` of
   * the way, friend or foe, where he stands now; a cannonball goes on through several, losing
   * force with each. (Until v17 the whole line was looked at when it came down: a man who stepped
   * onto it behind the shot, after it had gone by, took it, and so did our own men walking up
   * behind a block of crossbows.) A crossbow bolt passes its own regiment's ranks, as it did when
   * it was aimed (see `shoot`): they kneel or take turns.
   */
  private strikeAlong(p: Projectile, f: number): void {
    const d = this.d;
    const f0 = p.flown;
    if (f <= f0) return;
    p.flown = f;
    const dx = p.x1 - p.x0;
    const dy = p.y1 - p.y0;
    const sr = this.regiments[d.reg[p.shooter]!]!;
    const own = this.fire[p.team]![p.cls] === 'flat' || sr.rippling ? sr.id : -1;
    const n = this.lineHits(p.x0 + dx * f0, p.y0 + dy * f0, p.x0 + dx * f, p.y0 + dy * f, p.shooter, own, p.left);
    for (let k = 0; k < n && p.left > 0; k++) {
      const j = this.lineIds[k]!;
      const dmg = p.damage;
      p.damage = dmg * p.force;
      this.missileHit(j, p);
      p.damage = dmg;
      if (p.pen > 0) this.shake(this.regiments[d.reg[j]!]!, 0.5 * this.shockK);
      p.force *= 0.7;
      p.left--;
    }
  }

  private land(p: Projectile): void {
    const d = this.d;
    if (p.direct) {
      if (p.left > 0) this.strikeAlong(p, 1);
      return;
    }
    const radius = p.splash > 0 ? p.splash : 2.4;
    const R = radius + 4;
    const x0 = Math.max(0, Math.floor((p.x1 - R) / CELL));
    const x1 = Math.min(GW - 1, Math.floor((p.x1 + R) / CELL));
    const y0 = Math.max(0, Math.floor((p.y1 - R) / CELL));
    const y1 = Math.min(GH - 1, Math.floor((p.y1 + R) / CELL));
    let hit = -1;
    let bd = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GW + cx;
        for (let k = this.grid[c]!; k < this.gridEnd[c]!; k++) {
          const j = this.items[k]!;
          if (d.state[j]! > State.Routing) continue;
          const dx = d.x[j]! - p.x1;
          const dy = d.y[j]! - p.y1;
          const d2 = dx * dx + dy * dy;
          const rr = radius + d.rad[j]! * 0.6;
          if (d2 > rr * rr) continue;
          if (p.splash > 0) {
            // A stone kills whoever it lands among, friend or foe.
            if (d.team[j] === p.team && this.rng.next() > 0.5) continue;
            this.missileHit(j, p);
            this.shake(this.regiments[d.reg[j]!]!, 0.6 * this.shockK);
          } else if (d2 < bd) {
            bd = d2;
            hit = j;
          }
        }
      }
    }
    if (hit < 0) return;
    if (d.team[hit] === p.team && this.rng.next() > FRIENDLY_FIRE) return;
    this.missileHit(hit, p);
  }

  private missileHit(o: number, p: Projectile): void {
    const d = this.d;
    if (d.team[o] === p.team) this.ownGoals[p.team]!++;
    const army = this.setup.armies[d.team[o]!]!;
    const S = this.soldiers[o]!;
    // Shields stop missiles from the front.
    const r = this.regiments[d.reg[o]!]!;
    const ux = p.x0 - d.x[o]!;
    const uy = p.y0 - d.y[o]!;
    const un = sqrt(ux * ux + uy * uy) || 1;
    const front = (ux * r.fx + uy * r.fy) / un > 0.2;
    r.arrows += this.shockK;
    const sd = STANCES[r.stance];
    // HORSE: a bow's arrow at short range goes through more (the bodkin); and a rider's horse is
    // the bigger target, which his shield does not cover.
    let pierce = p.pierce;
    if (p.splash === 0 && (p.cls === U.Archers || p.cls === U.HorseArchers)) {
      const ex = d.x[o]! - p.x0;
      const ey = d.y[o]! - p.y0;
      const q = sqrt(ex * ex + ey * ey);
      const close = Math.max(0, Math.min(1, (HORSE.closeFar - q) / (HORSE.closeFar - HORSE.closeNear)));
      pierce = Math.min(0.9, pierce + HORSE.bodkin * close);
    }
    // TERRAIN: among trees the branches and trunks take many missiles (at a wood's edge fewer).
    if (!this.flat && p.splash === 0) {
      const T = this.terrain;
      const io = T.index(d.x[o]!, d.y[o]!);
      if (T.ground[io] === Ground.Wood) {
        const cover = (p.direct ? TERRAIN.coverDirect : TERRAIN.coverLob) * (T.woodDepth[io]! < TERRAIN.edge ? TERRAIN.coverEdge : 1);
        if (this.rng.next() < cover) return;
      }
    }
    const shooter0 = p.shooter >= 0 && d.team[p.shooter] !== d.team[o] ? p.shooter : -1;
    if (p.splash === 0 && d.mt[o] && d.hh[o]! > 0 && r.role !== 'command' && this.rng.next() < HORSE.share) {
      this.horseHit(o, p.damage * sd.missile, pierce, front, shooter0);
      return;
    }
    // (HORSE: a rider thrown and lying dazed has no shield up, and is shot through the gaps.)
    const down = d.dm[o]! > 0 && d.stun[o]! > 0;
    const shield = down ? 0 : S.s.shield + (r.stance === 'shieldwall' ? 0.35 : 0);
    if (p.splash === 0 && front && d.state[o] === State.Fighting && this.rng.next() < shield * (1 - pierce * 0.6)) return;
    const armour = S.s.armour * (1 - pierce) * (down ? HORSE.shotDown : 1);
    let dmg = p.damage * (50 / (50 + armour)) * (0.75 + this.rng.next() * 0.5) * (p.splash > 0 ? sd.stones : sd.missile);
    if (front) dmg *= 1 - army.pavise;
    this.shake(r, 0.04 * this.shockK);
    const shooter = p.shooter >= 0 && d.team[p.shooter] !== d.team[o] ? p.shooter : -1;
    this.hurt(o, dmg, shooter);
  }

  // ------------------------------------------------------------------ the end

  private checkEnd(): void {
    const d = this.d;
    const fighting = [0, 0];
    for (let i = 0; i < this.n; i++) if (d.state[i] === State.Fighting) fighting[d.team[i]!]!++;
    const before = [this.broken[0], this.broken[1]];
    for (let t = 0; t < 2; t++) {
      if (this.broken[t]) continue;
      const f = fighting[t]!;
      const o = fighting[1 - t]!;
      // The army breaks when nobody stands, or a last remnant faces a host. The fearless dead
      // stand longer, but a host that is spent breaks too: it does not run, it crumbles (see
      // UNDEAD), and the pursuit window below cuts the rest down.
      const n0 = this.startTotal[t]!;
      const breaks = this.fearless[t]
        ? f === 0 || f < n0 * UNDEAD.spent || (f < n0 * UNDEAD.remnant && o > f * UNDEAD.remnantOdds)
        : f === 0 || f < n0 * 0.08 || (f < n0 * 0.2 && o > f * 1.6);
      if (breaks) {
        this.broken[t] = true;
        if (this.brokenAt < 0) this.brokenAt = this.tick;
        this.events.push({ tick: this.tick, team: t, kind: 'break', cls: 0 });
        if (this.fearless[t]) {
          if (!this.crumbling[t]) this.events.push({ tick: this.tick, team: t, kind: 'crumble', cls: 0, note: 'spent' });
          this.crumbling[t] = true;
          continue;
        }
        for (const r of this.teamRegs[t]!) {
          if (r.alive > 0 && !r.routed) this.rout(r);
          else if (r.routed) r.moraleState = 'shattered';
        }
      }
    }
    if (this.broken[0] && this.broken[1]) {
      // The side that broke first lost, even if the winner's remnant gives way in the pursuit.
      // Both at once: whoever still has more men on the field (everyone is running by now, so
      // `strength`, which counts only men standing, would make it a coin toss).
      if (before[0] !== before[1]) this.result = this.decide('rout', before[0] ? 1 : 0);
      else {
        const a = this.onField(0);
        const b = this.onField(1);
        this.result = this.decide('rout', a === b ? null : a > b ? 0 : 1);
      }
      return;
    }
    if (this.brokenAt >= 0) {
      const loser = this.broken[0] ? 0 : 1;
      let left = 0;
      for (let i = 0; i < this.n; i++) if (d.team[i] === loser && d.state[i]! <= State.Routing) left++;
      // Let the pursuit run a little, then call it (at the time limit at the latest: `fight()`
      // stops there, and a replay must not run on past it to another ending).
      if (left === 0 || this.tick - this.brokenAt >= 120 || this.tick >= MAX_TICKS) this.result = this.decide('rout', loser === 0 ? 1 : 0);
      return;
    }
    if (this.tick >= MAX_TICKS) this.result = this.decide('time');
  }

  private kills(team: number): number {
    let k = 0;
    for (let i = 0; i < this.n; i++) if (this.d.team[i] === team) k += this.d.kills[i]!;
    return k;
  }

  /** Value of what a side still has on the field, standing or running. */
  private onField(team: number): number {
    const d = this.d;
    let v = 0;
    for (let i = 0; i < this.n; i++) {
      if (d.team[i] !== team || d.state[i]! > State.Routing) continue;
      const s = this.soldiers[i]!.s;
      v += s.value * (d.hp[i]! / s.hp);
    }
    return v;
  }

  /** Value of what a side still has fighting, against what it brought. */
  strength(team: number): number {
    const d = this.d;
    let v = 0;
    for (let i = 0; i < this.n; i++) {
      if (d.team[i] !== team || d.state[i] !== State.Fighting) continue;
      const s = this.soldiers[i]!.s;
      v += s.value * (d.hp[i]! / s.hp);
    }
    return v;
  }

  private decide(reason: 'rout' | 'time', winner: 0 | 1 | null = null): BattleResult {
    if (winner === null) {
      // On the strength still standing; failing that, on the men still on the field, then on
      // the kills. Only a perfectly even day is left to chance.
      const keys = [this.strength(0) - this.strength(1), this.onField(0) - this.onField(1), this.kills(0) - this.kills(1)];
      const k = keys.find((x) => x !== 0);
      winner = k === undefined ? (this.rng.next() < 0.5 ? 0 : 1) : k > 0 ? 0 : 1;
    }
    const d = this.d;
    const side = (team: number): SideResult => {
      const deadF = emptyCounts();
      const fledF = emptyCounts();
      const aliveF = emptyCounts();
      let kills = 0;
      for (let i = 0; i < this.n; i++) {
        if (d.team[i] !== team) continue;
        kills += d.kills[i]!;
        const s = this.soldiers[i]!;
        if (s.commander || this.regiments[s.reg]!.role === 'command') continue;
        const st = d.state[i]!;
        if (st === State.Dead) deadF[s.cls]!++;
        else if (st === State.Fled || st === State.Routing) fledF[s.cls]!++;
        else aliveF[s.cls]!++;
      }
      const start = this.setup.armies[team]!.counts.map((n) => Math.max(0, Math.floor(n)));
      const dead = emptyCounts();
      const fled = emptyCounts();
      const alive = emptyCounts();
      for (let c = 0; c < UNIT_COUNT; c++) {
        const f = this.startFigures[team]![c]!;
        if (f === 0) continue;
        // Figures back to men, in proportion.
        dead[c] = Math.min(start[c]!, Math.round((deadF[c]! / f) * start[c]!));
        fled[c] = Math.min(start[c]! - dead[c]!, Math.round((fledF[c]! / f) * start[c]!));
        alive[c] = start[c]! - dead[c]! - fled[c]!;
      }
      const out: SideResult = { start, dead, fled, alive, kills: kills * this.scale, commanderFell: this.commanderFell[team]! };
      if (this.doc[team]!.raiseEvery > 0) out.risen = this.risen[team]!.map((x) => x * this.scale);
      return out;
    };
    return { winner, reason, ticks: this.tick, scale: this.scale, sides: [side(0), side(1)] };
  }
}

/**
 * A place against regiment `o` for a block `depth` deep: k = 0 its front, 1 and 2 its flanks,
 * 3 its rear. Writes the anchor point and the facing to `out`.
 */
function slotPos(o: Regiment, k: number, depth: number, out: Float64Array): void {
  const fx = o.fx;
  const fy = o.fy;
  const lx = -fy;
  const ly = fx;
  void depth;
  if (k === 0) {
    out[0] = o.ax + fx * 3;
    out[1] = o.ay + fy * 3;
    out[2] = -fx;
    out[3] = -fy;
  } else if (k === 3) {
    out[0] = o.ax - fx * (o.depth + 4);
    out[1] = o.ay - fy * (o.depth + 4);
    out[2] = fx;
    out[3] = fy;
  } else {
    const s = k === 1 ? 1 : -1;
    const h = o.width * 0.5 + 4;
    out[0] = o.ax + lx * s * h - fx * o.depth * 0.5;
    out[1] = o.ay + ly * s * h - fy * o.depth * 0.5;
    out[2] = -lx * s;
    out[3] = -ly * s;
  }
}

/**
 * How readily a class breaks ranks to chase: levies and horse are keen, drilled heavy foot
 * less, the Templar knights (the Rule forbids leaving the banner) and the hatamoto least; the
 * dead (ghoul spears, black riders) chase anything that runs.
 */
const EAGER = [0.3, 0.55, 0.5, 0.35, 0.25, 0.85, 0.6, 0.55, 0.25, 0];
const EAGER_FACTION: Partial<Record<FactionId, Partial<Record<number, number>>>> = {
  // (v14: the knights 0.08, was 0.12: between their charges they are free more often, P4.)
  templar: { [U.Knights]: 0.08, [U.Shock]: 0.15 },
  // S2 First spear, long chase: samurai and yari riders pour after fugitives; the hatamoto guard the lord.
  samurai: { [U.HeavyInfantry]: 0.6, [U.LightCavalry]: 0.95, [U.Knights]: 0.15, [U.Shock]: 0.5 },
  undead: { [U.Spearmen]: 0.95, [U.LightCavalry]: 0.9, [U.HeavyInfantry]: 0.1 },
};
function eagerness(faction: FactionId, cls: number, veteran: boolean, green: boolean): number {
  const e = EAGER_FACTION[faction]?.[cls] ?? EAGER[cls] ?? 0.3;
  return Math.max(0, Math.min(1, e + (veteran ? -0.1 : 0) + (green ? 0.1 : 0)));
}

/**
 * U3: ticks a risen man takes to get up where he fell before he moves or fights: as long as the
 * renderer's rise (`riseTicks` in src/client/render/contract.ts: RISE.hold plus the Die strip
 * played back 1.5x slow, about 15 ticks; the game does not import from the client, so mirrored
 * here, rounded up a little).
 */
export const RISE_TICKS = 16;
/** U3: the weight of a man getting up from the dead in the press (nothing shoves him: see `rebuildGrid`). */
const RISING_MASS = 1e6;

/**
 * Danger close (v17, QA #2-#3): a shot is held when one of our men stands, or will stand when it
 * lands (at his present pace), inside its scatter (the box of ±spread about the aim point) and
 * `margin` more (the width of the man it would strike, and a little to spare); a stone's splash
 * widens the box by SIEGE_SPLASH. A shooter tries `tries` of the enemy's men before he holds.
 */
const DANGER = { margin: 4, tries: 3, foul: 60 };
/** The scatter of a shot `q` away (± this about the aim point): a lob most of all at long range. */
function spreadAt(kind: Ballistics, q: number, range: number, flatBow: boolean): number {
  const sp = 2 + q * (kind === 'siege' ? 0.05 : kind === 'gun' ? 0.018 : kind === 'cannon' ? 0.02 : 0.03);
  return (kind === 'lob' || kind === 'siege') && !flatBow ? sp + Math.max(0, q - range * 0.5) * 0.04 : sp;
}
/**
 * Skirmishers (v17, QA #5): out again from behind the line only with `out` javelins a man; fall
 * back below `spent` a man; their place behind the line moves only when the line has moved
 * `deadband`.
 */
/**
 * Skirmishers: out again with `out` javelins a man; spent under `spent`; their rest spot behind the
 * line moves when the line has moved `deadband`. With no line of their own (QA3 #3) they give
 * ground before foot slower than `faster` of their speed once its men are within `back`, to
 * `backTo` from them, while that is at least `room` of ground behind them, at `run` of their speed.
 * Retired and shot at (`arrows` over `shot`: QA3 #5), they rest further back, by `shelterStep`s
 * until out of the enemy's bowshot or `shelterFar`, for `shelterFor` ticks.
 */
const SKIRM = { out: 1.5, spent: 0.35, deadband: 30, back: 70, backTo: 125, faster: 0.85, room: 30, run: 0.9, shot: 1, shelterFor: 300, shelterStep: 50, shelterFar: 400 };
/**
 * Crossbows (direct fire, not the samurai's guns, whose doctrine is S3) stand `screen` before
 * their line while the lines are apart, and fall back through it when enemy foot comes within
 * `back`, horse within `horse` (a crossbow is spanned in 10 s and more: men who stood to take a
 * charge of horse before their line were ridden down), or the line comes up to them (`screen`).
 */
const FLAT_SCREEN = { screen: 14, back: 70, horse: 420 };
/**
 * Foot shooters taking cover from horse (v17, QA review 2 #1; see `takeCover`). `warn`: horse
 * coming within this of the block's front is watched; `closing`: riding toward it at this share
 * of its speed or more counts as coming at it; `release`: it leaves cover once no horse is this
 * near. `run`: the shooters run for cover at this share of their speed; the horse's ride to the
 * same spot is reckoned at its pace or `pace` of its speed, whichever is more, to `closeIn` short
 * of it. `slack`: they run this many seconds before the last moment they still could; `reach`: cover no
 * further than this; `gap`: its front this far behind the friend's ranks (`gapFight` when he is
 * locked in a fight); `there`: arrived
 * within this; `men`: a friend this strong at least; `clear`: no other enemy within this of the
 * spot; `stakes`: its own stakes within this before its front are cover enough. In cover it
 * stays put while its spot is within `stay`, and horse riding off further than `near` does not
 * keep it there. Cover is never more than `fwd` toward the enemy's side of the field with enemy
 * foot within `foot` of it.
 */
const COVER = { warn: 420, closing: 0.3, release: 480, closeIn: 20, pace: 0.75, run: 0.9, slack: 4, reach: 260, gap: 20, gapFight: 45, there: 6, stay: 25, near: 150, fwd: 20, foot: 300, men: 12, clear: 80, stakes: 30 };
/** Crossbows and guns blocked by our own men look this far along the line for a clear one, this much at a time. */
const LANE_SEARCH = 200;
const LANE_STEP = 20;
/** A stone strikes whoever is within this of where it lands (friend or foe: see `land`). */
const SIEGE_SPLASH = 9;
/** A bombard's ball bounds on this far past its aim point, through at most this many men. */
const CANNON_BOUND = 45;
const CANNON_PEN = 5;

/** Radians a tick for a turn of one degree a second. */
const DEG = (Math.PI / 180) * TICK_S;
/**
 * Foot wheels about the middle of its front: its flank man walks this pace (units a second), so
 * a block 80 wide turns about 10 degrees a second; never under 5 or over 20 (a pike block a third
 * of that). Open order turns quicker: each man simply turns.
 */
const FOOT_WHEEL = 9;
/** Foot's marching pace, units a second (about 2 m/s, a quick march: life's 1.3 would make a battle mostly approach). */
const FOOT_MARCH = 11;
/**
 * Volley fire (see docs/art-references/missile-drill.md). Formed missile foot looses on the
 * word: the loaded men together within VOLLEY_SPREAD ticks (half a second), the next volley a
 * reload and a VOLLEY_BEAT later ("make ready... present... loose": 0.6 s), so the quick
 * loaders wait for the order. After the block halts, the first volley comes a beat later.
 */
const VOLLEY_SPREAD = 5;
/**
 * A shot at a fast-moving target misses by up to this share of the way the target goes, beyond
 * LEAD_EASY, while the shot flies (on top of the scatter with range): the shooter leads it, but
 * only by guess. A rider at the gallop 500 away moves some 120 in an arrow's flight.
 */
const LEAD_ERR = 0.3;
/** A target this slow (units a second: foot at the march or a jog) is led true; horse at the canter or gallop is not. */
const LEAD_EASY = 25;
const VOLLEY_BEAT = 6;
/** A turn this small (cosine: 30 degrees) of formed missile foot is no move: see `tracking`. */
const WHEEL_STILL = 0.866;
/**
 * Fire at will: an enemy whose nearest men are this close to the front (or one charging the
 * block from twice as far) is no target for volleys. 50 units is under a second for charging
 * horse and two for running foot: less than one volley's cycle (2.3 s for bows), so waiting for
 * the word would mean being ridden down with loaded bows. Each man shoots as he can, and bows
 * shoot flat, point-blank.
 */
const AT_WILL_GAP = 50;
/**
 * At will, bows reload in this share of their volley reload: the 10-12 a minute a war bow manages
 * in a short burst, against the sustained, aimed 5-6 (docs/art-references/missile-drill.md).
 */
const BOW_BURST = 0.72;
const POINT_BLANK = 100;
/**
 * HORSE (round 2): horse coming on at a block of bows that shoots at will. Inside `range` (about
 * 100 m) the bowmen shoot as fast as they can draw, `reload` of the volley reload (4 s: the 15 a
 * minute a war bow manages for a minute or two when nothing needs ranging, against 12 aimed in a
 * burst, BOW_BURST), and inside `flat` (about 50 m) they shoot flat at the horses' chests, where a
 * rider coming straight on needs no lead across: only his crossing pace scatters the shot.
 */
/** HORSE (round 3): the scatter of a foot shooter's shot at a target on his block's flank, and behind it (`shoot`). */
const ARC = { side: 1.6, rear: 2.4 } as const;
const RAPID = { range: 520, flat: 260, reload: 0.58 } as const;
/** After this long (ticks) with nothing to shoot at, missile foot goes looking for a target along its line. */
const MISSILE_SEEK = 150;
/** An enemy man this close to the front of a block of shooters is at contact: they fight. */
const CONTACT_GAP = 8;
/**
 * Missile foot keeps this far behind its line's rear rank (24 until the scale rework; about a
 * ROW_GAP now, where it deploys), and the second line this far behind the block of the first it
 * follows (30), clear of the archers between them.
 */
const MISSILE_BEHIND = 70;
const RESERVE_BEHIND = 170;
/**
 * QA review 2 #5: a reserve keeps the friend it backs for RESERVE_KEEP ticks at least, and then
 * until another is nearer by this share of the distance; it moves only once its spot has drifted
 * RESERVE_DEADBAND off, and turns only once its facing is RESERVE_TURN (cosine) off; it sidesteps
 * (dresses its ranks, facing front) to a spot within RESERVE_SIDESTEP rather than wheel to march.
 */
/**
 * Line foot deploys from column into line this far short of the enemy's foot shooters' reach,
 * and forms column again only BOWSHOT_REFORM further out (QA review 2 #7).
 */
const BOWSHOT_MARGIN = 60;
const BOWSHOT_REFORM = 120;
const RESERVE_KEEP = 200;
/** A block holding for a flank slot farther off than this faces the enemy's edge, not its target (QA review 2 #7). */
const HOLD_SQUARE = 300;
const RESERVE_SWITCH = 0.6;
const RESERVE_DEADBAND = 25;
const RESERVE_TURN = 0.9;
const RESERVE_SIDESTEP = 90;
/** A reserve that has turned to face an enemy close by keeps facing it while it stays within RESERVE_WARY, for RESERVE_WARY_FOR ticks after it turned. */
const RESERVE_WARY = 80;
const RESERVE_WARY_FOR = 60;
/**
 * Horse against shooters (`horseStrike`): outshot this many times over, it forms up STRIKE_MARGIN
 * out of their reach, waits until every block is within STRIKE_THERE of its place (STRIKE_WAIT at
 * most), and goes in together.
 */
const STRIKE_OUTSHOT = 2;
/**
 * HORSE (round 3), horse with sense (docs/art-references/horse-wounds.md): no commander rides his
 * horse frontally across massed bowshot twice. A ride is `deadly` when the formed, unengaged
 * shooters covering its end (their reach and `pad` more) shoot more than this a tick for each
 * rider (60 bows against 20 knights about 0.35; 24 bows about 0.14); bows down to under `spent`
 * of their arrows count for less. Horse goes round to the open flank of such bows, `wide` beyond
 * their end and `behind` back from their front; a block that loses `breakLoss` of its riders (and
 * at least `breakMin`) on the way in, still more than `breakNear` off, breaks off out of their
 * reach and leaves them be for `spurn` ticks. Staged horse shot at draws back `stageBackStep`
 * more, to `stageBackMax`, no nearer its own edge than `edge`. Horse archers keep `haPad` outside
 * the reach of bows that outrange them.
 */
const SENSE = { footPrey: 1.5, together: 1, marching: 1, sideK: 0.85, rearK: 0.4, deadly: 0.15, spent: 0.3, pad: 30, wide: 160, behind: 40, breakLoss: 0.25, breakMin: 3, breakNear: 120, spurn: 900, stageBackStep: 80, stageBackMax: 600, edge: 150, haPad: 40 } as const;
const STRIKE_MARGIN = 60;
const STRIKE_THERE = 80;
const STRIKE_WAIT = 300;
/** Ticks between one man's shots, as the Generals reckon it: formed missile foot keeps to the volley clock. */
export function fireEvery(st: UnitStats): number {
  return st.role === 'missile' ? st.reload + VOLLEY_BEAT : st.reload;
}
/**
 * Horse: degrees a second at a stand, and how much less for each unit a second faster, down to
 * the gallop's 20 (a trot about 38, a canter 29). That is about twice the real rate (a canter
 * about 15, a gallop 10: formations.md, 7.5), so horse can still be got round a flank and onto
 * its target on one screen; a wheel at the gallop is still an arc some 150 units across.
 * Gathering speed and reining in, units a second squared (a standing start reaches the gallop
 * in about 85 units). A goal nearer than HORSE_REIN is walked to rather than ridden at.
 */
const HORSE_TURN = 50;
const HORSE_TURN_PER = 0.6;
const HORSE_TURN_MIN = 20;
const HORSE_ACCEL = 16;
const HORSE_BRAKE = 24;
const HORSE_REIN = 60;
/** A walk, as a share of a horse's speed: slower than this a block may turn about or back. */
const HORSE_WALK = 0.2;
/** Ticks a charge may run without a blow before it gives up aiming through its target and makes straight for it. */
const CHARGE_MISSED = 40;
/** A rider going faster than this share of his speed turns at most 0.2 radians a tick (about 115 degrees a second): its cosine and sine. */
const RIDER_FAST = 0.45;
const RIDER_COS = 0.980066577841;
const RIDER_SIN = 0.198669330795;

/**
 * Each rider thinks for himself, knowing the men about him (see `hunt`, `swerve`, `flankPoint`):
 * how far he looks for a foe of his own when his block fights and none is at hand; how much
 * less he likes a foe behind him; how far ahead he looks for a
 * friend in his way; how far out past the end of the enemy's front he rides to come at its
 * flank (and how far off its front he rides along it to get there), and beyond what distance from that block he rejoins his place instead; how much
 * looser than his place in the block his spot at the rally point is; how far horse facing
 * braced spears looks for easier prey (`thinkCav`); how near the rally point the middle of
 * its riders must be for the ride out to be over; how near enemy horse riding at it must be
 * for horse re-forming to break off the re-form and meet it (and how far a horse's length and room
 * clears a friend, `rideRound`; how far before our own foot's front a foe counts as its own,
 * `covered`, the pace, a share of his speed, at which a rider in their ranks rides out of
 * them, and the share of a block's riders in them at which it breaks off, `inOurRanks`; how long
 * a rider stands without a foe he can get at, and the share of a block's riders so, at which it
 * breaks off, `idleRanks`); how near a foe must be for a horse
 * archer to ride off from him by himself; under what share of his hit points a rider hit
 * among spears pulls out of them, and for how long (ticks); the gap to foot at which horse
 * archers ride off (until the sweep after v16, 35: foot closing at a run caught them); a rider
 * riding down a fugitive closes on him at least this share of his speed faster than the man runs,
 * to this far inside the measure (`move`; QA round 2 #6); a charge that closes on its prey by less
 * than `stallBy` in `stallFor` ticks, with no blow, cannot get at it, one at fleet horse `outrun` ticks past
 * CHARGE_MISSED without a blow (any charge, `chargeFor`) cannot catch it, and the prey given up
 * is left be for `spurnFor` ticks (`chargeSpent`; QA round 2 #3, #4); the cosine within which two
 * blocks of our horse come at one enemy horse from the same side (`besideFriends`).
 */
/**
 * HORSE (battle v17; docs/art-references/horse-wounds.md): arrows seldom got through a rider's
 * plate or mail, but his horse was a big, soft target. At Crécy and Agincourt the French charges
 * broke up under the arrows: horses shot, wounded horses bolting and throwing their riders, the
 * fallen tripping those behind, and the unhorsed left on foot in heavy armour. Missiles striking a
 * rider strike his horse `share` of the time (his shield covers him, not it); barding (UnitStats
 * `barding`) turns some, less from the side (`sideBard`). Bows shoot through more inside `close`
 * (the bodkin at short range: `bodkin` more pierce at `closeNear` and nearer, none past
 * `closeFar`). A wounded horse slows (to `slowMin` of its pace as it nears the end), loses the
 * charge (`impLoss` of its impetus a hit) and may bolt and throw its rider (`boltMin`, and
 * `bolt` times its wound share, `gallop` times more at the charge; the dead's horses hardly: `deadBolt`). A horse
 * down leaves its rider on foot (`dismount`): hurt by the fall (`fall` + `fallVar` of his hit points, `fallGallop`
 * times more at the gallop), dazed for `stun` + `stunVar` ticks (a knight in plate `plateStun` more:
 * meanwhile he defends at `downDefence` and his armour counts `downArmour`: daggers through the
 * gaps), and the riders close behind him at
 * the gallop lose half their impetus (`pile`), some stumbling (`pileTrip`). Spears put
 * `spearShare` of their blows into the horse; a pike wall impales it (`impale`). On foot a rider
 * fights at `footAttack` / `footDefence` / `footDamage`; he joins his mates' fight within
 * `joinFight` while he is fit (`fightHp`), else defends himself (`atHand`); with no fight he falls
 * in with our nearest foot within `refuge`, or makes his way back to the general or our own rear.
 */
const HORSE = {
  share: 0.72,
  sideBard: 0.5,
  bodkin: 0.3,
  closeNear: 160,
  closeFar: 460,
  slowMin: 0.55,
  impLoss: 0.75,
  boltMin: 0.1,
  bolt: 0.4,
  gallop: 1.4,
  deadBolt: 0.15,
  fall: 0.06,
  fallVar: 0.1,
  fallGallop: 2,
  stun: 15,
  stunVar: 20,
  plateStun: 15,
  lossShare: 1,
  crush: 0.4,
  shotDown: 0.6,
  crushHurt: 0.3,
  crushVar: 0.6,
  trip: 22,
  finish: 100,
  finishHp: 0.6,
  downDefence: 0.4,
  downArmour: 0.35,
  pile: 9,
  pileTrip: 0.25,
  downShock: 1.2,
  woundShock: 0.15,
  spearShare: 0.35,
  footShare: 0.3,
  waverShock: 0.5,
  impale: 45,
  footAttack: 0.75,
  footDefence: 0.8,
  plateWinded: 0.85,
  plateRun: 0.8,
  footDamage: 0.8,
  atHand: 12,
  joinFight: 45,
  fightHp: 0.4,
  mates: 160,
  refuge: 700,
  home: 160,
} as const;
/** HORSE: a rider's pace on foot, by class (plate and mail on foot are slow going). */
const FOOT_PACE: Partial<Record<number, number>> = { [U.LightCavalry]: 24, [U.HorseArchers]: 25, [U.Knights]: 17 };

const RIDER = {
  hunt: 40,
  behind: 1.5,
  look: 12,
  flankOut: 10,
  flankOff: 20,
  rejoin: 140,
  rallySpread: 1.4,
  spurn: 250,
  there: 25,
  meet: 90,
  room: 10,
  coverAhead: 8,
  outOfRanks: 0.6,
  ranksShare: 0.3,
  pressed: 15,
  spearHurt: 0.5,
  spearOut: 20,
  haFoot: 50,
  clear: 9,
  idleFor: 20,
  idleShare: 0.5,
  rideDown: 0.35,
  rideIn: 2,
  stallBy: 10,
  stallFor: 20,
  outrun: 100,
  chargeFor: 250,
  spurnFor: 300,
  sameSide: 0.5,
  besideShare: 0.75,
};
/** RIDER: the pace (a share of his speed) of a rider riding round to the flank on his own. */
const RIDER_FREE = 0.8;

function turnRate(r: Regiment, horse: boolean): number {
  const sd = STANCES[r.stance];
  if (horse) return Math.max(HORSE_TURN_MIN, HORSE_TURN - HORSE_TURN_PER * r.aspd) * DEG * sd.turn;
  let w = Math.max(5 * DEG, Math.min(20 * DEG, (FOOT_WHEEL * TICK_S) / (r.width * 0.5 + 8)));
  if (r.role === 'skirmish') w *= 2;
  else if (r.role === 'missile') w *= 1.5;
  return w * sd.turn;
}

/** Foot charges: the last stretch at a run. How far it can run before the ranks come apart (ticks). */
/**
 * Weapon reach (battle v17; docs/art-references/weapon-reach.md). Every man strikes a foe within
 * his and his foe's bodies and his weapon's reach (`UnitStats.reach`) and stands there; a
 * levelled spear holds men with shorter arms at its points.
 */
export const REACH = {
  /** A weapon of this reach and more is a spear (or pike, or yari): it keeps a foe at its point. */
  long: 9,
  /** A spearman stands his foe off at this share of his reach: the points in among the enemy's front rank. */
  stand: 0.75,
  /** A man whose reach is under this share of a spearman's cannot close on his levelled point (`held`). */
  short: 0.6,
  /** From this reach the ranks behind the front strike past it (pikes and yari), up to `supportRows` of them... */
  support: 17,
  supportRows: 2,
  /** ...leaning in on the men ahead by this much. */
  lean: 2,
  /** A foe closer than this share of a spearman's reach is inside his point: the spearman fights cramped. */
  inside: 0.45,
  insideAttack: 15,
  insideDefence: 8,
  /**
   * A man on foot held at the points, unable to strike, gives all he has to keeping them off
   * (the shield up, the point beaten aside): a thrust at him lands this much as often.
   */
  heldHit: 0.4,
  /** Spear on spear, front to front, a thrust lands this much as often: the points fence and beat each other aside. */
  fence: 0.55,
  /** Each look a man held at the points has this chance to get in by a gap beside his spearman... */
  gap: 0.2,
  /** ...or, the wall whole, by luck (times one and his shield): slipping under a point, ducking a thrust. */
  luck: 0.03,
  /**
   * ...and the heaviest foot (shock: Dane axes, naginata, the colossus) this many times as
   * often: they hack and beat the points aside, as the Doppelsöldner and halberdiers broke a push.
   */
  breaker: 3,
  /** Once through, he stays through this long (renewed while he is inside the point). */
  through: 30,
} as const;

/** REACH: how far a front-rank man looks for a spear's point at him (the longest point's line and a stride). */
const POINT_SEEN = 26;

const RUN_IN = 26;
const FOOT_RUN = 1.45;

function lineOrder(cls: number): number {
  // Centre-out order for the line: the heaviest in the middle.
  return cls === U.Shock ? 0 : cls === U.HeavyInfantry ? 1 : 2;
}

/** Interleaves a list so the first items sit in the middle of the front. */
function centreOut<T>(list: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i % 2 === 0) out.push(list[i]!);
    else out.unshift(list[i]!);
  }
  return out;
}

/** Sets a regiment's files and ranks for `n` men. */
function shape(reg: Regiment, n: number): void {
  const sd = STANCES[reg.stance];
  const ratio = sd.ratio > 0 ? sd.ratio : RATIO[reg.role]! * sd.ratioMul;
  // Engines stand in one row of four; a bigger battery (a huge army of engines) in a block.
  let cols = reg.role === 'siege' ? Math.max(1, Math.min(n, Math.max(4, Math.ceil(sqrt(n * 2))))) : Math.max(1, Math.min(n, Math.ceil(sqrt(n * ratio))));
  if (reg.stance === 'wedge') {
    let rows = 1;
    while ((rows * (rows + 1)) / 2 < n) rows++;
    cols = rows;
  }
  reg.cols = cols;
  reg.rows = Math.max(1, Math.ceil(n / cols));
  reg.width = (cols - 1) * reg.spacing + 4;
  reg.depth = (reg.rows - 1) * rankStep(reg) + 4;
  reg.radius = sqrt(reg.width * reg.width + reg.depth * reg.depth) * 0.5 + 3;
}

function spacingFor(reg: Regiment, s: Stance): number {
  const sd = STANCES[s];
  return reg.rad * 2 + GAP_IN_RANK[reg.role]! * sd.gap + sd.add;
}

/**
 * RANK_STEP as a map: a lookup by a role held in a variable reads a fraction out of a plain
 * object by copying it onto the heap (this runs for every man every tick), out of a Map without.
 */
const RANK_STEP_OF = new Map<string, number>(Object.entries(RANK_STEP));

/** Distance from one rank to the next (a wedge's ranks are offset by half a file, so closer). */
function rankStep(reg: Regiment): number {
  return reg.spacing * (reg.stance === 'wedge' ? 0.87 : RANK_STEP_OF.get(reg.role)!);
}

function defaultStance(reg: Regiment): Stance {
  return reg.role === 'missile' || reg.role === 'skirmish' || reg.role === 'horse-archer' ? 'loose' : 'line';
}

function rowWidth(list: Regiment[], gap: number): number {
  return list.reduce((w, r) => w + r.width + gap, 0) - gap;
}

/** A deterministic hash of an integer to -1..1 (Knuth's multiplicative hash; no Math.random). */
function hashUnit(n: number): number {
  return ((Math.imul(n | 0, 2654435761 | 0) >>> 0) % 2001) / 1000 - 1;
}

function cellIndex(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return cy * GW + cx;
}

/** Most men of one class an army can bring (far beyond any city; keeps the arithmetic sane). */
const MAX_MEN = 10_000_000;
const wholeMen = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.min(MAX_MEN, Math.floor(n)) : 0);
const within = (n: number, lo: number, hi: number, otherwise: number): number => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : otherwise);

/**
 * A setup with whole, finite numbers: counts and veterans floored to men (NaN, negative or
 * infinite counts are none), veterans no more than the men, morale bonus and pavise bounded.
 * A valid setup comes back equal to the one given.
 */
function sanitize(setup: BattleSetup): BattleSetup {
  const army = (a: ArmySpec): ArmySpec => {
    const counts = emptyCounts();
    const veterans = emptyCounts();
    for (let c = 0; c < UNIT_COUNT; c++) {
      counts[c] = wholeMen(a.counts[c] ?? 0);
      veterans[c] = Math.min(counts[c]!, wholeMen(a.veterans[c] ?? 0));
    }
    return { ...a, counts, veterans, moraleBonus: within(a.moraleBonus, -50, 50, 0), pavise: within(a.pavise, 0, 0.4, 0) };
  };
  return { ...setup, armies: [army(setup.armies[0]), army(setup.armies[1])] };
}

/** Fights a battle to its end. */
export function fight(setup: BattleSetup): BattleResult {
  return new Battle(setup).run();
}
