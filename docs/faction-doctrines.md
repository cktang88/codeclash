# Faction battle doctrines

**Built in battle v13** (the recommended set of section 6; see section 9 for where the build
departs from this design). Originally design only. The user asked for factions that fight **noticeably differently**, for example
"Templars reform more often to banners". Today the three factions differ by at most three
±10% stat tweaks (`src/game/factions.ts`), a few rally and eagerness constants
(`REGROUP.samuraiLord`, `REGROUP.templarBanner`, `EAGER_FACTION` in `battle.ts`), and the rules
being added now: the teppō first-volley shock, and the Undead's no-rout, low-hp and Lich-crumble
rule. This page proposes **battle doctrines**. A doctrine is a small, deterministic rule on a lever
the sim already has, and it is meant to be **seen on screen**: a block that moves, waits, runs,
re-forms or stands where another faction's would not.

Read alongside: `docs/factions.md` (rosters, tweaks, "Proposed faction rules"),
`src/game/command.ts` (MORALE, REGROUP), `docs/art-references/rout-recovery.md` and `rally.md`
(the v10 rally research), `formations.md` §4 (Sengoku formations), and `weapon-attacks.md` S2
(the nagae-yari beat).

Source quality markers: **[P]** is a primary text or a close paraphrase of one, **[S]** a
scholarly or encyclopaedic secondary source, **[pop]** popular history (use with care), and
**[game]** a game or fantasy convention.

---

## 1. Research: how they fought

### 1.1 The Knights Templar and the military orders

**Squadrons under the Marshal and the banner.** On campaign the orders fought in *eschielles*,
squadrons under named leaders. These were smaller than the 20–40-man *conrois* of two or three ranks,
and several of them made a *bataille*. Hospitaller (and Templar) charges were "probably made at a
trot, with the horses kept very close together", spurred to a canter just before impact [S, Nicolle,
*Knight Hospitaller* 1, ch. "Training, strategy and tactics",
https://erenow.org/ww/knight-hospitaller-1/7.php]. Each squadron had its own banner (Münter's
edition of the statutes), and the Master's *gonfanon baucent* (white with a black chief) was the
order's war banner [S, https://en.wikipedia.org/wiki/Baucent]. The Marshal carried it into battle
with ten brothers guarding him. A knight "did not have to leave the gonfanon for whatever reason" on
pain of losing the habit. If the Marshal's banner fell, the gonfanonier raised a new one and led
the next charge [S, OSMTH *Carpe Diem* 2021, "The Gonfanon Beauceant", citing Upton-Ward art.
161–163, 178, 234, 241–242, 452, 478, 589,
https://carpediem.osmth.org/documents/2021_spr_doc01.pdf].

**Not breaking ranks, and never leaving the field while a banner flies.** "Templar rules
forbade leaving the ranks once an army was drawn up, except to test a horse or saddle or to help
a comrade in distress", and "in the melee after a successful charge, no man was to leave his
position, even if wounded" [S, Nicolle, erenow link above]. A brother cut off from his banner had
to reach the nearest Christian banner. "No brother was permitted, on pain of expulsion from the
order, to leave the field of battle" while "at least one banner of the order was still flying".
If every Templar banner was lost, they rallied to the Hospitallers or to any Christian banner.
"Only when the last standard was 'turned to destruction'" might a Templar flee [S,
https://en.wikipedia.org/wiki/Baucent; OSMTH PDF above, art. 167–168, 421]. Lowering the banner
in battle, or an unlawful charge while bearing it, cost a brother the habit [OSMTH PDF, art. 241–242].
The verbatim Upton-Ward text was still not found online (the same gap as rout-recovery.md §3.1),
so article numbers here are taken from the OSMTH footnotes.

**The held charge, only on command.** The Rule's battle section (Rule §179 as quoted) is a charge
drill. "When the brothers go in squadrons, a turcopole should carry the banner, and the Standard
Bearer should form the squires into a squadron". "If the Marshal and the brothers charge, the
squires who lead the destriers should charge behind their lords". The standard bearer keeps the
banner furled on his lance "until the Marshal charges" [P via pop, "The Soldiers of Christ II",
https://warhistory.org/article/the-soldiers-of-christ-ii]. Templar brothers were court-martialled
for having "charged without orders" ["The Soldiers of Christ III",
https://warhistory.org/ja/article/the-soldiers-of-christ-iii?amp=1]. Matthew Bennett's essay
"La Règle du Temple as a military manual, or how to deliver a cavalry charge" (appendix to the
Upton-Ward translation) reads these articles as a drill for exactly this
[https://www.medievalists.net/2010/12/la-regle-du-temple-as-a-military-manual-or-how-to-deliver-a-cavalry-charge/].

**Arsuf, 1191: the vanguard, the rearguard and the screen.** Richard kept the column tight.
The Templars under Robert de Sablé were in the van and the Hospitallers in the rear, where the pressure was
greatest. "Infantry marched on the landward flank to screen the horsemen, with crossbowmen on the
outside." The charge was held for a signal of "six clear trumpet blasts". The Hospitaller marshal
and Baldwin le Carron charged early, "through their own infantry". Richard committed everyone, then
"halted the first pursuit after about 1.5 km" and regrouped twice before a third charge
[S, https://en.wikipedia.org/wiki/Battle_of_Arsuf; Garnier de Nablus,
https://en.wikipedia.org/wiki/Garnier_de_Nablus]. Richard gave the orders, "whom he placed in the
crucially important positions of van- and rear-guards", strict instructions "not to break
formation or launch an attack without his explicit command"
[pop, https://warhistory.org/article/battle-of-arsuf-1191?amp=0]. On the 1148 march through Asia
Minor, Louis VII's army, harried by Turkish horse archers, was put under Templar discipline and the
Templars guarded its rear [pop, https://www.history.com/shows/knightfall/pages/from-pilgrim-bodyguards-to-master-warriors;
Odo of Deuil, Fordham sourcebook, https://sourcebooks.web.fordham.edu/source/odo-deuil.asp].

**Turcopoles and sergeants.** Turcopoles were light horse archers under the Turcopolier. In
battle they "formed the rear ranks behind the knights", and otherwise scouted, harassed, pursued
and took prisoners. Brother-sergeants, in lighter armour, rode in the back ranks of the charge and
"may go to the back, if they wish, without permission" when wounded [pop, "Soldiers of Christ
III" above]. "Turcopoles could follow the knights' charge to give support or rescue". Many
sergeants were heavy infantry, and the orders' discipline made them "less vulnerable to
horse-archers". "Crossbowmen may have ... [fired] concentrated volleys when light horse-archers
closed in" [S, Nicolle].

**What the price of discipline looked like.** At Hattin the military orders held to the banner
while the infantry fled onto the Horns, and some 200 captured Templars and Hospitallers were beheaded
[S, https://en.wikipedia.org/wiki/Battle_of_Hattin]. At al-Mansurah (1250) the Templars followed
Robert of Artois's rash charge into the town against their Master's advice and were nearly wiped
out [S, https://en.wikipedia.org/wiki/Battle_of_Al_Mansurah].

**Take-aways for the sim:** (1) the knights wait, then go **all at once, on one signal**, in a
tight wedge with the light horse behind them; (2) after the blow they **come back to the banner**
rather than chase; (3) the professed brothers **do not leave while a banner flies**, and men who
lose their own banner go to **any** friendly one; (4) the foot is a **screen** for the horse, with
crossbows on the outside.

### 1.2 The Samurai clans, Sengoku period

**Ashigaru corps: teppō, yari, yumi.** The Sengoku battle shifted "from single combat to massed
formations", and ashigaru, "rigorously trained so that they would hold their ranks in the face of
enemy fire", became the backbone of the army. Guns outnumbered bows 2:1 in 1592 and 4:1 in 1597 [S,
https://en.wikipedia.org/wiki/Ashigaru]. Archers stayed among the gunners "to help protect them
while they reload" [pop, Turnbull summary via search; Osprey, *Ashigaru 1467–1649*,
https://www.ospreypublishing.com/uk/ashigaru-14671649-9781841761497/]. Turnbull describes the
period's "military revolution": large armies, firearms, and "an eventual shift towards fighting on
foot" (Goodreads blurb of the same book, https://www.goodreads.com/book/show/45728253).

**Teppō volleys at Nagashino, and the debate.** The traditional account has 3,000 guns in three
rotating ranks behind a palisade. *Shinchō Kōki* (Ōta Gyūichi, a vassal of Nobunaga) gives about
1,000 guns under five commanders and makes "no mention of three-stage shooting". The rotation
story traces to the 1903 *Nihon Senshi* via the less reliable Edo-period *Shinchōki*. "Most of the
Takeda warlords' deaths occurred during the retreat, not during the fighting", and "Takeda
cavalry" is a misnomer: no Takeda unit was all-mounted [S,
https://en.wikipedia.org/wiki/Battle_of_Nagashino]. Volley fire was, however, used against
Nobunaga by the Ikkō-ikki at Ishiyama Hongan-ji five years earlier [pop, search summary of
https://weaponsandwarfare.com/?p=15685]. *Design stance:* rank-staggered rolling fire is the
iconic picture, so we can show it, but we should not claim it as fact. The rule text says
"drilled volleys", not "Nagashino three-rank".

**Nagae yari blocks.** Ashigaru pikes were about 4.5–6.5 m long [S, https://en.wikipedia.org/wiki/Yari].
Nobunaga's 3.5-ken (about 5.6 m) spears are recorded in 1553. The weight made thrusting
inaccurate, so the ranks raised the spears and beat down "in coordinated strokes ... strike, reset,
strike, reset". This jarred arms, broke spears and "kept enemies on the defensive", and the
samurai exploited the openings: "the ashigaru were the battering ram; the samurai were the arrow".
Blocks were rarely more than three ranks deep because of the swing room needed. Against horse they
closed into a dense wall [pop, https://ancientwarhistory.com/the-battering-ram-of-the-samurai-age-japans-unconventional-spear-tactics-and-the-yari-bumari-formation/].
The beating is marked [est] in weapon-attacks.md S2 too, so treat it as plausible, not proven.

**Formations (sonae and the named *jin*).** Kawanakajima 1561: the Takeda used the *kakuyoku*
(crane's wing) pincer, and the Uesugi the *kuruma gakari* wheel, "in which every unit is replaced by
another as it becomes weary" [S, https://en.wikipedia.org/wiki/Battle_of_Kawanakajima].
*Hoshi* was an arrowhead with light flanks that drove deep. *Gyorin* (fish scales) was a snub-nosed
wedge used against a larger enemy "to bulldoze a small section". *Ganko* (geese) put lines of
marksmen in front, with samurai about the general and missile men in the rear. Many of these "were
not properly formalised until ... the Edo period", and "in real battles, formations often broke
down, since samurai sought personal valour" [pop,
https://samuraihistoryculture.substack.com/p/samurai-battle-formations]. The *gyorin* is linked
above all to Takeda Shingen (Kōyō Gunkan tradition, https://en.wikipedia.org/wiki/K%C5%8Dy%C5%8D_Gunkan).

**Valour, heads and loose discipline.** *Ichiban-yari*, the "first spear" to strike the enemy,
was a named honour. The Seven Spears of Shizugatake were each rewarded with 3,000 koku
[pop, https://lightinthecloudsblog.com/tag/spear/; https://kenshi247.net/blog/2014/10/21/ichiban-yari/].
Heads were proof of merit, tagged with the victim's and the taker's names and inspected at the
*kubi jikken* [pop, https://samuraihistoryculture.substack.com/p/kubi-jikken-samurai-head-viewing;
https://jref.com/glossary/185/]. The chase was where the killing was done: Nagashino's dead fell
in the retreat. At Mimigawa (1578) "the bodies of the Ōtomo army littered the 25 km" of the pursuit
[S, https://en.wikipedia.org/wiki/Battle_of_Mimigawa].

**Feigned retreat (*tsuri-nobuse*).** The Shimazu's favourite tactic, used eight times between
1527 and 1600, put a decoy in the centre that fell back and drew the enemy across a river into flanking
ambushes. It was used at Kizaki (1572, outnumbered 10:1), Mimigawa (1578) and Hetsugigawa (1587) [S,
https://en.wikipedia.org/wiki/Battle_of_Mimigawa; https://en.wikipedia.org/wiki/Battle_of_Kizaki;
https://en.wikipedia.org/wiki/Feigned_retreat].

**The lord's uma-jirushi.** The great standard marked the commander. It "was the focal point of
action", organising and motivating troops, and its bearer held "arguably the most dangerous
position" on the field [S, https://en.wikipedia.org/wiki/Uma-jirushi]. At Mikatagahara Ieyasu's
golden-fan standard was planted on a hill to rally the beaten Tokugawa. Where the lord died or
defected (Ōtani and Ukita at Sekigahara) the retinue dissolved (rout-recovery.md §3.6;
https://en.wikipedia.org/wiki/Battle_of_Mikatagahara; https://en.wikipedia.org/wiki/Battle_of_Sekigahara).
The Kakuyoku diagram note says it plainly: the commander "was the main rallying point, and his
death usually ended the battle" [pop, substack formations link].

**Take-aways for the sim:** (1) guns that fire **ripple after ripple**, not one cloud; (2) yari
blocks that **beat the enemy front back**; (3) samurai who **run in for the first spear** and
**chase far** after heads; (4) an army bound to **one man's standard**: strong around it, and
dissolving if he falls; (5) the Shimazu **feint**.

### 1.3 The Hollow Host (fantasy)

The conventions are consistent across sources. In Warhammer Fantasy Battle (6th ed.) the undead
"cause fear", are "immune to psychology", "cannot be broken" (a lost combat costs extra wounds
instead), "can only react to charges by holding their ground", and "cannot march unless ... within
12" of the General". If the General is destroyed, "the Undead in the army will start to slowly
crumble to dust" [game, https://6th.whfb.app/special-rules/undead-vampire-counts]. A battle
standard near them reduces the crumbling [game, https://9th.whfb.app/army-list/vampire-counts]. In
Total War: Warhammer, Vampire Counts units "never rout. Rather, they will crumble into dust if
losing badly", and the lord raises the dead [game,
https://totalwarwarhammer.fandom.com/wiki/Vampire_Counts;
https://pcgamer.com/hands-on-with-total-war-warhammers-vampires]. Undead crumbling began as a
zombie rule in 3rd edition [game, forum summary via
https://www.dakkadakka.com/dakkaforum/posts/list/209958.page]. Our motto already says it: *What
falls, rises. What rises, marches.*

**Take-aways for the sim:** (1) **slow and relentless**: no halts, no withdrawals, quickening only
near the necromancer; (2) **they do not flinch**; (3) the **Lich is the linchpin** (crumble, in
progress); (4) **the fallen rise**, kept cheap and invariant-safe.

---

## 2. The levers we have (battle.ts v10)

| Lever | Where | Notes |
|---|---|---|
| General plan, personality, `rashKnights`, `holdUntil`, `dueled`/`haltUntil`, `useReserve`, general charge | `generalThink`, `choosePlan`, `General` | Per team, deterministic from `General.rng`. |
| Withdraw-a-wavering-regiment (once, 90 back) | `generalThink` (`r.withdrew`) | The natural hook for "re-form on the banner". |
| Reserve commit timing (`wait` 20/60/140 by personality) | `commitReserves` | |
| Knights' go-signal (`linesMet`, `early`, `rashKnights`) | `cavalryOrders` shock-cav branch | |
| Charge launch, ragged after `RUN_IN`, foot `FOOT_RUN` 1.45 | `startCharge`, `moveAnchor`, `move` | |
| Charge impact: force, wedge ×1.25, knockback, stun, morale shock, impetus drain | `impact` | |
| Melee hit, flank/rear | `strike` | No knockback today. |
| Cycle charge (pull out 120 and come again) | `thinkCav` engaged branch | Withdraw point `wx, wy`. |
| Chasing: `eager` (EAGER, EAGER_FACTION), `far`, `tired`, `recallAt` cooldown 120 | `chase`, `thinkCav` | |
| Stances: shieldwall (arrows > 2.5 or horse near), pikewall, wedge, braced, loose | `chooseStance`, `STANCES` | |
| Volley start (all loose within 0.5 s) | `setMode('shoot')` | Volley and fire-at-will work in progress: coordinate. |
| Morale target, aura, general dead, break | `morale`, `hurt` (commander), `MORALE` | |
| Rout, shatter, rally odds, re-form (`REGROUP.extra`), fugitives joining | `rout`, `thinkRouted`, `rallyOdds`, `regroup` | |
| Marching pace `FOOT_MARCH` 11 | `moveAnchor` | |

Every rule below is a faction branch (`this.setup.armies[t].faction === ...`) on one of these.
To keep `battle.ts` readable, gather the numbers in a `DOCTRINE` table in `command.ts`, keyed by
faction, next to `REGROUP`. Every doctrine changes battle outcomes, so it needs a
`BATTLE_VERSION` bump (old replays are refused, as usual).

Army shape to keep in mind (standard `MIX`): heavy foot 22%, spears 20%, skirmishers 8%, archers
12%, crossbows/teppō 7%, light horse 7%, horse archers 5%, knights 3%, shock foot 3%, engines 0.5%.
So a knights-only rule touches 3% of the men but the decisive blow. A heavy-foot or spears rule
touches 42%.

---

## 3. Knights Templar doctrines

### T1. The Marshal's charge: one signal, one wedge, back to the banner ★

- **Player sees:** the Knight-Brothers sit motionless in their reserve place, in line, while the
  other side's knights go in early or wander after fugitives. Then, on one tick, the ticker reads
  *"The Marshal unfurls the Beauséant: the knight-brothers charge as one"*. Every Templar knight
  regiment goes into wedge and launches at the **same** enemy block, with the Turcopoles a second
  behind them, "behind their lords". The hit is visibly harder: more men knocked flat, deeper
  penetration. Then the knights pull out and **ride back to the Marshal's banner** rather than 120
  units straight back, form up, and wait for the next signal. They almost never chase.
- **Rule:**
  - Templar generals never have `rashKnights`, and the `early` (aggressive/reckless) knight
    release does not apply to Templar knights: *nobody charges without leave*.
  - A per-army `signalAt` (-1 at start). The Marshal gives the signal on a General think when the
    lines are engaged (`linesMet`) **and** (an enemy line block locked with ours has morale < 45,
    or the general charge fires, or tick > 1500). Re-signal at most every `signalEvery` = 250 ticks
    (25 s), after the knights have re-formed.
  - On the signal, every Templar shock-cav regiment not fighting other horse gets
    `give(r, 'flank', target, 3)`, or `'charge'` if it is already within 160, at the **one** chosen
    target (the lowest-morale locked enemy block, else the nearest missile block). Templar light
    horse gets the same target at `side` 1/2 (`'flank'`) 10 ticks later.
  - Held-charge bonus: the first impact tick of a signalled charge uses `force × heldCharge` (1.20),
    and the charge's morale shock uses `× heldShock` (1.25). Pay for it by **removing the
    `Knights charge ×1.1` tweak** (the doctrine replaces it).
  - Recall: cycle-charge withdraw point = 30 units in front of the Marshal (the commander's
    position) when he is within 400, else as now. Templar knights' chase: `far` capped at 120 and
    `tired` at 60 ticks; `eager` stays 0.12.
- **Levers:** `General.rashKnights`, `cavalryOrders` (`go`, the shock-cav branch), new
  `General.signalAt`, `impact()` (`force`, morale term), `thinkCav` (cycle-charge `wx, wy`; chase
  `far`, `tired`), the `charge` event with a `note`, `factions.ts` tweaks.
- **Balance risk:** waiting cedes tempo. Enemy horse can pick off our archers before the signal,
  although the knights still answer enemy horse within 220, as now. The doubled hit can decide the
  battle in one stroke, which hurts the Undead most because their low hp makes charges lethal.
  *Measure:* tick of the first knight charge (Templar vs others), knight-impact kills per charge,
  knight losses, Templar win% per matchup and size. *Tune:* `heldCharge` 1.1–1.3, the morale
  threshold 40–55, `signalEvery`.

### T2. Re-form on the banner (the user's example) ★

- **Player sees:** a Templar block that starts to waver **steps back to the nearest banner**,
  meaning the Marshal or a steady friendly regiment of its family, dresses its files there, and goes back
  in. The ticker reads *"The sergeants fall back on the Beauséant and re-form"*. Broken Templar
  regiments can come back **twice**, and fugitives stream visibly toward banners. Other factions
  pull a wavering block out once, 90 units straight back, and rally broken ones at most once.
- **Rule:**
  - Wavering withdrawal: Templars may withdraw a wavering regiment `withdrawals` = 2 times (others
    1). The withdrawal point is 40 behind the nearest friendly anchor within 300: the commander, or a
    steady unengaged regiment of the same family (`takerKey` family). It re-enters when steady
    (morale > waverAt + 8) or after 200 ticks, as now.
  - Re-forming after a rout: per-faction `REGROUP.extra`: Templar 1, others 0. The extra re-forming
    needs **any friendly banner** within `banner` (200), not only its own standard. That is the
    Rule's "nearest Christian banner". Odds are `extraOdds` 0.5.
  - Shorter shaken period for Templars: `shaken` 250 ticks (others 400). Discipline returns them
    to the line sooner.
  - Keep `templarBanner` +0.2 and family joining as they are.
- **Levers:** `generalThink` (`r.withdrew` becomes a counter, and the withdraw `x, y`), `REGROUP`
  made faction-indexed (`extra`, `shaken`), `rout()` (`spent`), `thinkRouted`/`rallyOdds`
  (banner anchor for the extra re-form), and a `'reform'` event (exists).
- **Balance risk:** more staying power, so Templars will win more long grinds. *Measure:* rallies
  and re-forms per battle (target: Templar about 2× Samurai, i.e. 3 against 1.5 at 500 a side,
  rally.md table), share of fugitives returned (now 5.6%; aim for 9–12%), win%. *Pay:* drop
  `Knights morale ×1.05`. If they are still strong, set `extraOdds` to 0.35.

### T3. Not while the Beauséant flies ★

- **Player sees:** the professed brothers (Knight-Brothers and Iron Brethren) **do not run** while
  the Marshal lives. Surrounded and shredded, they stay *wavering* (they fight worse) and die in
  place while levies and pilgrims break around them, with the ticker line *"The Iron Brethren will
  not leave the field while the banner flies"*. When the Marshal falls, the brothers take a
  heavier shock and may flee at last, toward any banner.
- **Rule:** in `morale()`, for a Templar regiment of class Knights or Shock: if
  `r.morale < breakAt` and the commander is alive (`!commanderFell[team]`), set
  `r.morale = breakAt` and stay wavering instead of `rout(r)`. When the commander falls, these classes
  take `generalDeadShock × 1.5` (30 instead of 20). The army breaking (`checkEnd`) still routs
  everyone, so battles end as now.
- **Levers:** `morale()` (the `breakAt` branch), `hurt()` (the commander-death shock loop), and one
  event line (throttled like `waver`).
- **Balance risk:** small. It covers 6% of the men, and they die instead of running, so losses go up
  for the side that wins the grind. It does make the Marshal's death matter more, which is a fair
  counter for Samurai and Undead. *Measure:* Templar knights/brethren casualty share, how often
  they are the last formed blocks, and win% when the Marshal dies vs lives.

### T4. The Arsuf screen (optional)

- **Player sees:** under arrows or near horse archers, Templar sergeants and spearmen lock a
  **shield wall early** and keep it. Genoese crossbows stand tight behind and shoot **over** the
  shields: bolts visibly cross the friendly line. This is the march at Arsuf: foot screening the
  horse, crossbows on the outside.
- **Rule:** Templar line foot goes to shieldwall at `arrows > 1.2` (others 2.5), or when an enemy
  horse-archer block is within 160. Templar crossbows follow the line at `lineDepth + 6` (others +14).
  Their direct-fire line check skips friendly men within 20 of the shooter if those men are in
  shieldwall: bolts loft over them.
- **Levers:** `chooseStance` (line case), `thinkMissile` (follow distance), `shoot()` (`lineHits`
  skip rule for `flat`).
- **Balance risk:** a clear edge against Samurai horse archers and teppō, which is the intent but
  could swing that matchup. Shieldwall's half pace slows the Templar advance. *Measure:* Samurai vs
  Templar win%, missile damage taken by Templar foot. Lower effort than it sounds, but it touches the
  shot-blocking code (v7 bug history), so test it carefully.

### Rejected or merged

- *Fight to the death in the rearguard*: after the army breaks, `checkEnd` ends the battle 12 s later,
  so there is nothing to see. Its spirit is in T3.

---

## 4. Samurai doctrines

### S1. The lord's uma-jirushi: strong around it, gone without it ★

- **Player sees:** samurai blocks near the daimyō's nobori/uma-jirushi fight on long after they
  should have wavered. Broken regiments rally on him (+0.4 total, as now). When he **falls**, the
  ticker reads *"The daimyō has fallen! His retainers scatter"*. A wave of wavers and routs spreads
  from his position, and the hatamoto make one last **charge of revenge** at the nearest enemy.
  This is Mikatagahara's Natsume, Ōtani at Sekigahara, and the *kakuyoku* note: "his death usually ended
  the battle".
- **Rule:** Samurai: aura `MORALE.aura × 1.4` (14) within `auraRange × 1.25` (300).
  `generalDeadShock × 1.75` (35) and lasting `generalDead × 1.4` (20). On the daimyō's death,
  every Samurai Knights regiment is given `'charge'` at the nearest enemy, once, ignoring
  `fatigue`/morale gates.
- **Levers:** `morale()` (aura and general dead), `hurt()` commander branch, `cavalryOrders` (a
  one-off override flag), and the `commander` event note.
- **Balance risk:** higher variance. Samurai gain while he lives and lose hard when he dies, and
  general deaths depend on `thinkCommand` exposure (`reach` 40). *Measure:* share of battles in which
  each faction's general dies (expect under 15%), Samurai win% conditional on that, and the overall
  win%. *Tune:* the aura multiplier first.

### S2. First spear, long chase (valour over discipline) ★

- **Player sees:** katana samurai **run** the last stretch into contact rather than walk. The first
  samurai block to strike gets a ticker line, *"The Akamatsu samurai claim the first spear!"*, and a
  visible lift. When enemies break, samurai and yari riders **pour after them in loose crowds**,
  far across the field, and come back late. Templar knights by contrast barely stir. The
  weakness is visible too: chasers caught by a rallied or fresh enemy block get cut up.
- **Rule:**
  - `EAGER_FACTION.samurai`: HeavyInfantry 0.6 (now default 0.3), LightCavalry 0.95, and keep
    hatamoto (Knights) 0.15: they guard the lord.
  - Samurai chase: `far × 1.4`, `tired × 1.4`, recall cooldown 80 ticks (others 120).
  - First spear: the first Samurai line regiment to become `engaged` gets `+8` morale and every
    Samurai regiment within 240 gets `+3` (one-off, in `survey`).
  - `shouldCharge`: Samurai HeavyInfantry charge any steady target within 140 (others need a
    wavering target or the general charge).
  - Optional add-on: `commitReserves` `wait` = 20 for Samurai, whatever the personality, so
    reserves are thrown in early.
- **Levers:** `EAGER_FACTION`, `eagerness()`, `chase()` (`far`, `tired`, `recallAt` gate),
  `thinkCav` chase (`far`, `tired`), `shouldCharge`, `survey()`/`morale()` (first spear), and
  `commitReserves`.
- **Balance risk:** charging more often adds impact and fatigue. Chasing kills fugitives (good) but
  takes blocks out of the line (bad). It nets about even, and is positive in big battles where the
  pursuit decides casualties. *Measure:* chase events and chase kills per battle, men lost while
  chasing, Samurai fatigue at contact, and win% at 250/400/600 (Samurai were weak at 250, so this may
  help there). *Tune:* `far`, `eager` HeavyInfantry 0.45–0.65.

### S3. Drilled teppō fire: ripples, not one cloud ★

- **Player sees:** the Teppō Ashigaru open with the one great volley (the existing first-volley morale
  rule: the whole line in one smoke bank). After that they fire **rank by rank**: the front rank
  kneels and fires, then the second, then the third, so a rolling ripple of muzzle flashes and smoke
  walks along the block. Templar crossbows and Undead arbalests shoot raggedly at will.
- **Rule:** for Samurai `gun` regiments, after the first volley each man's reload cooldown is
  re-phased by rank: `d.cd = reload × (row % 3) / 3` once, then left alone. Rank order is preserved
  because they all have the same reload. Throughput is unchanged; the timing is what changes.
  A visual countermarch (front rank steps back through the files) is *not* proposed: it churns slots
  (`assignSlots`), and the history is disputed. The renderer can show the kneeling front rank with
  the existing Brace pose.
- **Levers:** `setMode('shoot')` and the volley / fire-at-will code being written now (do this
  **with** that agent), `d.row`, `d.cd`. For the renderer: front rank Brace while `row === 0` and
  shooting (`contract.ts` needs nothing new if Brace is reused).
- **Balance risk:** close to none. Steady fire spreads missile fear more evenly (`r.arrows` decays
  ×0.8 per think). *Measure:* teppō damage per regiment per minute, and target morale traces, against the
  current volley model. Wording: the doctrine text says "drilled volleys", not "Nagashino three
  ranks" (see 1.2).

### S4. Yari-bumari: the pike block beats them back

- **Player sees:** where a Samurai Yari Ashigaru block meets enemy foot head-on, the enemy front
  rank **staggers back** under the beating spears, and the line visibly **bows** in front of the yari
  block while the block edges forward. The samurai beside it then cut into the gaps.
- **Rule:** a frontal hit by a Samurai Spearmen soldier on foot (not horse) knocks the target back
  1.5 units and stuns it for 3 ticks (stunned men defend ×0.6, as now). The block's anchor
  advances 2 units/s while engaged frontally and its recent kills ≥ its recent losses. Pikewall
  against horse is unchanged.
- **Levers:** `strike()` (knockback borrowed from `impact()`, `d.stun`), `moveAnchor` (engaged
  advance), and the yari overhead-beat anim (weapon-attacks.md S2, already specced).
- **Balance risk:** stuns raise the samurai's hit chance against the stunned (defence ×0.6), which
  could be strong, since spears are 20% of the army. *Pay:* the spear `armour ×0.95` tweak already
  exists. If it is still strong, use stun 2 ticks or knockback only. *Measure:* spear-vs-heavy-foot
  duels (`only()` in `battle.test.ts`), and the overall win%. Also watch the collision code
  (`separate`) for jitter.

### S5. Tsuri-nobuse: the Shimazu feint (stretch)

- **Player sees:** once a battle, a cunning daimyō's light horse or skirmishers, engaged in front,
  **turn and run** like a rout. Eager enemy blocks chase them out of the line, the feigners wheel
  about, and a waiting reserve hits the chasers in the flank. Ticker: *"A feigned flight! The
  enemy is drawn into the ambush"*.
- **Rule:** cunning Samurai generals only, once per battle, after contact: pick a LightCavalry or
  Skirmisher regiment with morale > 60 in front of an enemy regiment with `eager ≥ 0.5`. Set
  `r.feint = tick` and run it 150 back toward a held second-line regiment, keeping its state
  `Fighting` (no morale loss) but drawn as running. `nearestFoe(kind 4)` treats feigners as routed
  prey, so enemy `chase()` takes the bait. After 60 ticks, or when a chaser is within 40 of the
  ambush, the feigners `charge` and the reserve is committed to the chasers' flank (`commitReserves`
  with `side` 1/2).
- **Levers:** `generalThink`/`choosePlan` (cunning), a new `Regiment.feint`, `nearestFoe`,
  `chase()`, `commitReserves`, and the renderer (a running pose for a non-routed block; `scene.ts`
  `MoraleState` might need a `'feigning'` value, which is a contract change).
- **Balance risk:** it only pays against eager enemies: Undead ghouls and riders (0.9–0.95) bite hard,
  and Templar knights (0.12) barely at all. That is a nice matchup texture, but it widens the
  Samurai–Undead gap. *Measure:* feints per battle, chasers killed per feint, and win% per
  matchup. Effort is high, so it goes last.

### Rejected

- *Individual champions who challenge*: needs a duel subsystem (single-figure targeting, other blocks
  holding off), and the ritual challenge is more Genpei (12th c.) than Sengoku. The first-spear
  line in S2 carries the flavour.
- *Horse archers kiting more*: horse archers are 5% of the army and already kite. Low visibility, and
  the yabusame damage tweak exists.
- *Kuruma gakari rotation*: attractive (fresh blocks replace weary ones), but it is an Uesugi trick
  and needs pass-through movement of reserves. A possible later Commander trait.

---

## 5. Hollow Host doctrines

### U1. The tide: slow, unhalting, quickened by the Lich ★

- **Player sees:** the whole host walks forward **in one even line** and never stops. It doesn't
  halt to trade volleys, isn't pulled back to re-form, and doesn't sprint the last stretch. The blocks
  near the Lich-Marshal's green lantern move faster and the far ones lag, so the line bows toward
  the necromancer. Living armies halt, shoot, surge and fall back; the dead just come.
- **Rule:**
  - Undead foot `FOOT_MARCH` × 0.8 (8.8) unless within `auraRange` (240) of a living Lich-Marshal,
    where it is 11 (WFB: undead "cannot march unless within 12" of the General").
  - Undead generals: no `hold` or `refuse` plans (score 0), no volley halt (`dueled = true` at
    start), and no wavering withdrawal.
  - Undead foot charges with `FOOT_RUN` = 1.15 (others 1.45): a lurch, not a sprint.
- **Levers:** `moveAnchor` (pace), `choosePlan` scores, `generalThink` (`dueled`, the withdraw
  branch), and the `FOOT_RUN` use in `moveAnchor`/`move`.
- **Balance risk:** slower means more arrows taken on the approach, and the low hp makes that
  costly. Never halting gives some of it back. *Measure:* tick of first contact by faction, Undead
  losses before contact, and win% vs Samurai (most missiles). *Tune:* the far-from-Lich pace
  multiplier 0.75–0.9.

### U2. Unflinching: they do not reel ★

- **Player sees:** a knight charge **into a block of skeletons does not scatter it**. The riders hit,
  bones break, but the ranks do not fly back or stagger, and the charge **stalls** in the block. Against
  living foot the same charge flings men aside. This is the WFB "hold their ground" rule.
- **Rule:** in `impact()`, when the target's army is Undead: knockback ×0.3, stun 0, and impetus
  drain per man hit ×1.3 (the charge stops sooner). The charge damage is unchanged, and their low hp still
  makes it lethal. Morale shock is moot, because the dead never rout.
- **Levers:** `impact()` (`kb`, `d.stun`, `d.imp` drain).
- **Balance risk:** it blunts cavalry, the main tool against them, at the same time as the Undead
  lose hp. The two pull opposite ways, which is the point. *Measure:* knight charges' kills against
  Undead blocks before and after, and Templar vs Undead win% (T1 makes Templar charges harder, so tune
  the two together). *Tune:* knockback ×0.3–0.6.

### U3. What falls, rises ★

- **Player sees:** every 10 seconds the Lich-Marshal's lantern pulses. Within its reach, a few
  **bone heaps of the host's own fallen pull themselves up** (green wisp, a reversed death
  animation) and shuffle back into the files of their regiment at reduced strength. Ticker: *"The
  Lich-Marshal raises 6 of the fallen"*. It stops for good when the Lich falls, and the host then
  crumbles (the in-progress rule).
- **Rule:** every 100 ticks, if the Lich is alive: walk the Undead **own** dead in id order. Raise a
  man if he is of a foot class (HeavyInfantry, Spearmen, Skirmishers; no horse, Colossus or engines),
  has been dead ≥ 30 ticks, lies within `auraRange` of the Lich, was never raised before, and his
  regiment is still standing (alive > 0, not shattered). Stop at
  `max(1, round(0.015 × start of army))` per pulse, capped at 12. A raised man returns to `Fighting`
  at 40% hp in his own regiment, with `r.alive++` and `r.reflow = true` (`closeRanks` reslots him). A
  `risen` flag stops him being raised twice.
  - Invariants: `members` already keep dead ids (`closeRanks` filters by state), so membership does
    not change, nor the Store size, nor the counts. `d.kills` of whoever killed him stays credited (he
    *was* killed). End-of-battle losses read `start - alive` and stay consistent. Deterministic:
    fixed order and fixed cadence, with no rng.
  - Explicitly **not** proposed: enemy dead rising as undead levies. That needs soldiers changing team,
    or a pre-allocated hidden pool regiment outside `counts`. It touches `Store` sizing, `MAX_FIGURES`
    scaling, value/strength and reports. Possible later, as a pool of Dead-at-start Ghoul figures
    teleported onto enemy corpses (the corpse is hidden by the renderer), but not for this round.
- **Levers:** a new `raise()` step in `step()` (every 100 ticks), `d.state`/`d.hp`/`d.died`,
  `Regiment.alive`/`reflow`, a `'raise'` event, and the renderer: a figure going Dead→Fighting must
  restart its animation. Check `scene.ts`, which keys death on `died`, and add a `rose` tick to
  `contract.ts` on both sides at once (CLAUDE.md).
- **Balance risk:** a direct strength gain, about 1.5% of the army per 10 s while the Lich lives
  and fights are near him. *Pay:* this is what lets the Undead keep **much lower hp**. Set hp and raise
  rate together. *Measure:* figures raised per battle (aim for 5–10% of the host's losses), Undead
  win% at each size, and win% when the Lich dies early. Also measure Lich deaths: he is now a
  target worth killing.

### U4. Relentless pursuit (cheap add-on)

- **Player sees:** when an enemy breaks, ghoul spears and black riders chase it to the edge and are
  never called back. The dead do not stop to re-form.
- **Rule:** Undead `chase()`/`thinkCav` chase: no `far` or `tired` limit, recall only on formed
  enemy within 30 or prey gone. `EAGER_FACTION.undead` already has 0.9–0.95 for these classes.
- **Levers:** `chase()`, `thinkCav` chase branch.
- **Risk:** small. It is mostly the same as now, only longer. It makes them bite on S5 feints.

### Linchpin (in progress, recorded here for completeness)

The Lich-Marshal rule being added now (crumble when he dies) is the keystone of U1 and U3: the
tide slows and the raising stops when he falls. Keep the crumble numbers in the same `DOCTRINE`
table.

### Rejected

- *Fearless, so no shock morale*: with no-rout, morale shocks to the Undead already do nothing
  visible. U2 gives the visible half (no reeling). A *dread* aura on enemies near Death Knights was
  considered, but it reads only as a morale number, so it was dropped.

---

## 6. Recommended set, ranked by visibility per unit of effort

| Rank | Faction | Doctrine | Visibility | Effort | Why this rank |
|---|---|---|---|---|---|
| 1 | Undead | U1 The tide | High (the whole host, all battle) | Low: pace, plan scores, flags | Changes the look of every Undead battle for a few lines. |
| 2 | Samurai | S1 The lord's uma-jirushi | High at the moment it matters | Low: constants plus a one-off order | A cheap, dramatic collapse, with a good ticker line. |
| 3 | Templar | T2 Re-form on the banner | High: blocks walk back to banners and return | Low–medium: withdraw counter, faction REGROUP | This is the user's example. |
| 4 | Samurai | S2 First spear, long chase | High: running charges, crowds chasing | Low: eagerness, chase constants, one morale event | |
| 5 | Undead | U2 Unflinching | High in every cavalry clash | Very low: three multipliers in `impact()` | |
| 6 | Templar | T1 The Marshal's charge | Very high: the battle's set piece | Medium: signal state and target selection | The headline Templar difference. |
| 7 | Templar | T3 Not while the Beauséant flies | Medium: brothers die in place | Very low | Pairs with T1 and T2. |
| 8 | Samurai | S3 Rolling teppō fire | High (smoke ripples) | Low, but must merge with the volley work in progress | Do it with that agent. |
| 9 | Undead | U3 What falls, rises | High (bones stand up) | Medium: game rule plus a renderer contract tick | The motto made real. |
| — | Optional | T4 Arsuf screen, S4 Yari-bumari, U4 pursuit | Medium | Medium / medium / very low | Next round, if balance allows. |
| — | Stretch | S5 Tsuri-nobuse | Very high | High (new state, renderer) | Last. |

**Recommended set (three per faction):**

- **Templar:** T1 The Marshal's charge, T2 Re-form on the banner, T3 Not while the Beauséant flies.
  *Discipline:* they wait, strike once and hard, come back to the banner, and do not run.
- **Samurai:** S1 The lord's uma-jirushi, S2 First spear and long chase, S3 Drilled teppō
  fire. *Valour and the lord:* they run in, chase far, fire in ripples, and stand or fall with
  their daimyō.
- **Undead:** U1 The tide, U2 Unflinching, U3 What falls, rises. *The tide:* slow, never stopping,
  never reeling, and the fallen rise while the Lich lives.

Each set has a built-in weakness: Templars cede tempo and lose the brothers if the Marshal dies,
Samurai over-chase and hang on one life, and the Undead are slow under arrows and hang on the Lich.
That gives each faction a visible way to lose as well as to win.

---

## 7. Balance method

- **Script:** the existing `<scratchpad>/balance/balance.ts` method (docs/factions.md): the
  standard `MIX`, equal men, both commanders, every seed fought **from both sides of the field**.
  Run 30 seeds × 2 sides × {250, 400, 600} for each of the 3 cross matchups, and also the mirrors.
  Window: 45–55% overall per matchup (stricter than the 40–60% test band), no size bucket outside 40–60,
  and mirrors at 50% ± 2.
- **Per-doctrine telemetry** (count events from `BattleResult.events`): first knight charge tick
  and kills per signalled charge (T1); withdrawals, rallies and re-forms per battle (T2); brothers'
  casualty share and Marshal-dead win% (T3); general-death rate and Samurai win% given it (S1); chase
  events, chase kills and men lost while chasing (S2); teppō damage per minute (S3); first-contact
  tick and pre-contact Undead losses (U1); knight-charge kills against Undead (U2); figures raised per
  battle and Lich-dead rate (U3).
- **Order of tuning:** land one faction's set at a time and re-run all three matchups, since
  T1+U2 and S2+U4 interact. Use the doctrine's own *pay* lever first (remove the stat tweak it
  replaces: Templar `Knights charge 1.1` and `morale 1.05`; the Undead HI morale stand-in
  goes when no-rout lands), then the doctrine numbers, and stat tweaks last.
- **Determinism:** every rule uses fixed cadences, id order and the existing `General.rng`/`this.rng`.
  No Date, no Math.random, no trig (`src/game/rng.ts`). `pnpm fairness` must still show no side bias.
- **Tests:** a `game.test.ts` case per faction vs Templar (40 seeds, both sides, 40–60%), plus
  one behaviour test per doctrine in `behaviour.test.ts`. For example: Templar knights do not charge
  before the signal; Samurai heavy foot chases further than Templar; a raised Undead figure keeps
  `members` and counts consistent; Undead knockback under a charge is under half of living foot's.

## 8. Implementation plan

1. **Scaffolding** (one agent, `command.ts` + `battle.ts`): add a `DOCTRINE` table keyed by
   faction, make `REGROUP.extra`/`shaken`/withdrawals faction-indexed, and add the per-army flags
   (`signalAt`, `firstSpear`, `raisedAt`). Bump `BATTLE_VERSION`. No behaviour change yet:
   mirrors still at 50%.
2. **Cheap set** (same agent, sequential: all in `battle.ts`): U1, U2, S1, T3, then S2 and T2.
   Balance run after each faction.
3. **T1 The Marshal's charge**: signal and shared target in `cavalryOrders`, held-charge bonus in
   `impact()`, return to the banner in `thinkCav`. Remove the knights' charge tweak. Balance.
4. **S3 Rolling teppō fire**: hand to (or merge with) the volley / fire-at-will agent, since it is
   the same code.
5. **U3 What falls, rises**: game rule first, behind a constant set to 0, then the renderer
   (`contract.ts` `rose` tick, `scene.ts` restart of the animation) **on both sides at once**. Turn it on and
   balance against the Undead hp cut.
6. **Screens and words**: chronicle and ticker lines for each doctrine (`note`s on events), the
   `FactionDef.rule` text replaced by a short doctrine list, and `docs/factions.md` updated. Per
   CLAUDE.md, every visible change gets Playwright screenshots of a battle at the moment the
   doctrine fires (signalled charge, banner re-form, daimyō's fall, ripple fire, skeletons not
   reeling, bones rising), looked at, with three iteration rounds. Compare against the references above
   (Arsuf, Nagashino screens, Total War Warhammer undead) and record them in
   `docs/art-references/doctrines.md`.
7. Then T4, S4 and U4 if the balance window still has room; S5 last.

Checks at each step: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm fairness`.

---

## 9. As built (battle v13)

All nine recommended doctrines are in `battle.ts`, their numbers in `DOCTRINE` (`command.ts`), the
player's text in `FactionDef.rule` and `docs/factions.md`, tests in `src/game/doctrine.test.ts`.
Where the build departs from the design above:

- **T1.** The late signal is 20 s after the lines meet (not tick 1500, which most battles never
  reach), and against the undead, whose morale never falls, a locked block "falters" at 60% of its
  men. A signal holds 30 s or until its target is gone. The Turcopoles get the target the same
  General think (no 10-tick delay). The knights' morale ×1.05 went too (T2's price).
- **T2.** As designed, plus `shaken` 250. The withdrawal point is behind the banner block's rear
  rank, not its centre.
- **S1.** Aura ×1.6 (the balance runs wanted more than ×1.4); the revenge charge lasts 30 s. v15: ×1.35, once the general's household no longer rode into the enemy's blocks and the daimyō lived through most battles.
- **S2.** As designed; the optional early reserve was not needed.
- **S3.** Rank fire alone did little: behind a big army's line a matchlock, which needs a clear
  line of fire, had nothing to shoot (0.3 shots a man at 1500 a side against 2.9 at 250, a large
  part of the samurai's weakness in big battles). So the teppō go out 14 before their line, as
  behind the fence at Nagashino, and the line waits for them (up to 15 s); they fall back through
  it (slipping through like skirmishers) when a formed enemy is within 60, when the line comes up,
  or at contact. A rippling rank shoots past its own block's other ranks. The first-volley shock
  (8 morale, through `shake()`) is the old faction rule, now simulated.
- **U1, U2.** As designed.
- **U3.** The raise is a plain 0.8% of the host a pulse (the cap of 12 made it a size-dependent
  rule: 1.6% of a 250 army, 0.4% of a 2800 one), with undead hit points 66%. v15 brings back a cap, of 8 figures a pulse:
  with the household fix the Lich-Marshal lives through most battles, and a raising that grew with
  the host won the undead 64% of battles of 1500 a side against the Templars (49% with the cap).
  v16 raises a share of the fallen instead (45% of the foot who fall while he stands, as many as
  have fallen in his hand at each pulse, of those within his reach): by the clock, a big battle,
  which runs longer, raised a greater share of its host, and the cap of 8 bit only in big ones.
  The general's household no longer rides into blocks that outweigh it twice over (v16), so the
  Lich-Marshal falls in some 5-15% of battles. A risen man may die
  again and does not rise twice; `SideResult.risen` counts the raised. The renderer plays Die
  backwards (`contract.ts` `RISE`) with a green grave-light; classic art keeps a corpse that may
  still rise off the ground texture.
- **Big battles.** Before the doctrines, v13 fixed why the undead won 70% of big battles: per-man
  morale shocks counted per head while blocks grow with the battle (`MORALE.blockMen`).

## Sources

Templars and the military orders
- Wikipedia, "Baucent": https://en.wikipedia.org/wiki/Baucent
- OSMTH *Carpe Diem* (2021), "The Gonfanon Beauceant" (cites Upton-Ward article numbers): https://carpediem.osmth.org/documents/2021_spr_doc01.pdf
- D. Nicolle, *Knight Hospitaller* 1, "Training, strategy and tactics": https://erenow.org/ww/knight-hospitaller-1/7.php
- "The Soldiers of Christ II" (quotes Rule §179): https://warhistory.org/article/the-soldiers-of-christ-ii
- "The Soldiers of Christ III" (sergeants, turcopoles, "charged without orders"): https://warhistory.org/ja/article/the-soldiers-of-christ-iii?amp=1
- Medievalists.net on M. Bennett, "La Règle du Temple as a military manual": https://www.medievalists.net/2010/12/la-regle-du-temple-as-a-military-manual-or-how-to-deliver-a-cavalry-charge/
- J. M. Upton-Ward, *The Rule of the Templars* (Boydell 1992), not read online: https://boydellandbrewer.com/9780851157016/the-rule-of-the-templars/
- Wikipedia, "Battle of Arsuf": https://en.wikipedia.org/wiki/Battle_of_Arsuf ; "Garnier de Nablus": https://en.wikipedia.org/wiki/Garnier_de_Nablus
- warhistory.org, "Battle of Arsuf 1191": https://warhistory.org/article/battle-of-arsuf-1191?amp=0
- History.com, "From Pilgrim Bodyguards to Master Warriors": https://www.history.com/shows/knightfall/pages/from-pilgrim-bodyguards-to-master-warriors
- Odo of Deuil, Fordham Medieval Sourcebook: https://sourcebooks.web.fordham.edu/source/odo-deuil.asp
- Wikipedia, "Battle of Hattin": https://en.wikipedia.org/wiki/Battle_of_Hattin ; "Battle of Al Mansurah": https://en.wikipedia.org/wiki/Battle_of_Al_Mansurah

Samurai
- Wikipedia, "Ashigaru": https://en.wikipedia.org/wiki/Ashigaru
- Osprey, Turnbull, *Ashigaru 1467–1649*: https://www.ospreypublishing.com/uk/ashigaru-14671649-9781841761497/ ; Goodreads blurb: https://www.goodreads.com/book/show/45728253
- Wikipedia, "Battle of Nagashino": https://en.wikipedia.org/wiki/Battle_of_Nagashino
- weaponsandwarfare.com on Nagashino volleys and the Ikkō-ikki precedent: https://weaponsandwarfare.com/?p=15685
- Wikipedia, "Yari": https://en.wikipedia.org/wiki/Yari
- ancientwarhistory.com, "Yari-bumari": https://ancientwarhistory.com/the-battering-ram-of-the-samurai-age-japans-unconventional-spear-tactics-and-the-yari-bumari-formation/
- Wikipedia, "Battle of Kawanakajima": https://en.wikipedia.org/wiki/Battle_of_Kawanakajima ; "Kōyō Gunkan": https://en.wikipedia.org/wiki/K%C5%8Dy%C5%8D_Gunkan
- Samurai History & Culture, "Samurai battle formations": https://samuraihistoryculture.substack.com/p/samurai-battle-formations ; "Kubi jikken": https://samuraihistoryculture.substack.com/p/kubi-jikken-samurai-head-viewing
- JREF, "Kubi jikken": https://jref.com/glossary/185/
- Ichiban-yari: https://lightinthecloudsblog.com/tag/spear/ ; https://kenshi247.net/blog/2014/10/21/ichiban-yari/
- Wikipedia, "Battle of Mimigawa": https://en.wikipedia.org/wiki/Battle_of_Mimigawa ; "Battle of Kizaki": https://en.wikipedia.org/wiki/Battle_of_Kizaki ; "Feigned retreat": https://en.wikipedia.org/wiki/Feigned_retreat
- Wikipedia, "Uma-jirushi": https://en.wikipedia.org/wiki/Uma-jirushi ; "Battle of Mikatagahara": https://en.wikipedia.org/wiki/Battle_of_Mikatagahara ; "Battle of Sekigahara": https://en.wikipedia.org/wiki/Battle_of_Sekigahara

Undead (game conventions)
- WFB 6th ed., Undead special rules: https://6th.whfb.app/special-rules/undead-vampire-counts
- Warhammer Armies Project 9th, Vampire Counts: https://9th.whfb.app/army-list/vampire-counts
- Total War: Warhammer wiki, Vampire Counts: https://totalwarwarhammer.fandom.com/wiki/Vampire_Counts
- PC Gamer, "Hands-on with Total War: Warhammer's Vampires": https://pcgamer.com/hands-on-with-total-war-warhammers-vampires
- Dakka Dakka thread on the origin of undead crumbling: https://www.dakkadakka.com/dakkaforum/posts/list/209958.page

Earlier project research reused: `docs/art-references/rout-recovery.md` (Hastings, Arsuf, Hattin,
Mikatagahara, Sekigahara), `rally.md` (v10 rally numbers), `formations.md` §4 (Kawanakajima,
Nagashino), and `weapon-attacks.md` S2 (nagae-yari beat).
