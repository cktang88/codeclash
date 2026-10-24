# Pushfront game loops

Pushfront is played two ways at once. You *build* your army by doing your real work, and you *command and watch* it. The loops below make both satisfying over minutes, hours, and weeks.

No loop may reward gaming the code metrics. Every reward comes either from real contribution, measured by the ledger (see [fair-play.md](fair-play.md)), or from play on the battlefield. Unlocks are cosmetic and social, never power.

## The minute loop: "My push became an army"

**Trigger.** You push code. With a repository webhook it lands in seconds; through the events feed, minutes later.

**Payoff, in order:**

1. A toast: *"Your banner rises."* It names the repo and shows the commit message as a herald's scroll.
2. A horn sounds and the gate facing your busier front opens.
3. The platoon unfurls its battalion flag and marches out along the ring road toward a neighbour. The camera can follow it, and the "Follow my banner" control is one key.
4. Every 1–3 minutes your soldiers meet the enemy. Each clash brings kills, a rout, a Champion's last stand, or a fireball. Every death adds to your tally, and every rout or capture is a chronicle line with your name in ink.

**Your inputs in this loop:**

- **Rally** your platoons onto a site: a border fort or a neighbour's capital picks the front your army fights on. One rally every 30 minutes, with a satisfying stamp.
- Send **emotes** to the room.
- **Inspect** a platoon to read its regiment's story: repo, commit, kills, morale.

**The dopamine beat.** Push, then *see it*, then watch it matter. The delay between pushing and seeing must feel like a fanfare, not a lag.

## The hour loop: "Today's war"

Each player gets three **Orders** for the day, drawn from a deck of battlefield objectives. Examples:

- *Hold a border fort for 10 minutes*
- *Your soldiers slay 40 foes*
- *Hold your walls through a 20-minute siege*
- *Rout three enemy platoons*
- *Storm a capital*
- *Retake a fallen home*
- *Slay 15 foes under your War Cry*
- *Field a veteran army*
- *Bring a broken platoon home alive*

The deck holds 17 Orders. The three are drawn from the war's seed and your account, so they are fixed for the day, and two of the same kind (say, two slaying goals) never pair up. Orders depend on battle outcomes and can't be completed by pushing differently. Each fulfilled Order stamps a wax seal on your page and pays 50 **Glory**, the lifetime currency.

**The shared rhythm of the day: a campaign around the ring.** The capitals stand on a ring around a lake or a massif, seats shuffled each day, and every army fights only the two beside it.

1. **Dawn.** Banners rise. The first pushes march out along the front roads and skirmish for the border forts between neighbours. Every gate is barred, so the morning is about renown, forts and building the day's army.
2. **Late morning.** The fort lines settle. Armies mass at the forts they hold. At 40% of the war (09:36 of a day) the siege trains arrive and walls can be stormed from a fort you hold, but slowly at first, while a quiet player's gates stay barred for about two hours after their first push (8% of the war).
3. **Afternoon.** The sieges gather pace, slowly at first, until 70% of the war (16:48), when no wall falls in less than half an hour of unbroken siege while its tower bleeds the besiegers; every barred gate is open from 65% (15:36). No capital falls before about 14:00, and the first ones fall through the afternoon as soon as an army can hold the walls long enough. Defenders come home, neighbours strike at the besieger's other flank, and every push still counts. A capital taken becomes its captor's gate, and every capital held beyond home swells the captor's army by a quarter.
4. **Late afternoon.** The fallen fight on as **risings** outside their old walls, and retake them if the conqueror's front runs thin. Two owners left share both fronts; the ring narrows.
5. **Evening.** One banner over every capital ends the war on the spot, and the room waits for the reset. Otherwise the last pushes and War Cries decide who holds the most capitals.
6. **The reset hour.** The digest (the most capitals, then renown), and a new ring in a new order.

**Spectator hooks:**

- the hottest-fight director camera
- a "since you looked away" summary of what happened while you were gone (forts lost, capitals stormed, risings)
- a highlight toast for every set piece
- the ring itself: who holds which capital, and a renown race with trend arrows for the tiebreak

**Choices that matter by the hour:**

- **Doctrine** (once an hour) counters what your rivals pick.
- **Rally** picks the front you push on.
- The **War Cry** is a once-a-day trump card.

## The 10+ hour loop: "My house's legend"

**The daily digest.** Your day as an illuminated chronicle page:

- awards
- your best regiment
- the highlights, linked into the replay
- the timelapse
- your seals for the day

**Glory and Rank.** Glory accumulates from Orders as they are fulfilled, and at the reset from each day you fought in (a push or a kill):

| Source | Glory |
| --- | --- |
| placing 1st / 2nd / 3rd (with renown) | 100 / 60 / 40 |
| fighting the day through, otherwise | 20 |
| each award | 30 |
| each fulfilled Order | 50 |
| a streak of *n* days (n ≥ 2) | 10 × min(n, 7) |

It raises a lifetime **Rank**:

| Rank | Title | Glory |
| --- | --- | --- |
| 1 | Squire | 0 |
| 2 | Man-at-Arms | 200 |
| 3 | Knight | 600 |
| 4 | Banneret | 1500 |
| 5 | Baron | 3000 |
| 6 | Marshal | 6000 |
| 7 | Warlord | 12000 |
| 8 | Legend | 25000 |

**Heraldry unlocks** (cosmetic, chosen in your **Armory**, each opening at a Rank):

- your army standard's pattern (8) and emblem (12)
- capital keep styles: stone, timber, citadel
- unit trims: studs, filigree, ermine
- a victory fanfare: horn, drums, choir
- a banner tassel
- a herald's title shown beside your name: a Rank title you have reached, or one a Deed grants

**The Hall of Legends.** Champions and Dragons still standing at the day's end, the captain of a platoon with 20+ kills, and the general who took the whole ring are **named**, for example "Brannoc the Unbowed, of the parser Battalion" (at most three a player a day). They are enshrined in the room's Hall with their deeds, and a legend's statue stands at your capital in the next day's war.

**Seasons.** A room's **Season** is a calendar week (an ISO week) of its daily wars. Season standings sum each day's placing points: 10, 6, 4, 3 and 2 for first to fifth, and 1 for anyone else who fought. The Season Victor's monument is raised at the centre of the next season's rings, and the season gets its own illuminated recap.

**Deeds.** About 30 achievements, for example:

- First Blood
- Dragonslayer
- Unbroken: a day of 20+ kills with no routs
- Siegebreaker (storm a capital), Ringholder (take every capital), Phoenix (retake your home)
- Iron Streak: seven days fighting

Each is shown as a seal in your profile's codex.

**Rivalries.** Head-to-head records against the players you fight most ("You vs. @bo: 12–9"), shown on your profile. Each day, every pair of human players who both fought scores one bout, won by whoever placed higher; a shared place counts for neither.

**Streaks.** Consecutive days with at least one push. *Rest* keeps a streak, without growing it, on days you choose not to push.

## Why players return

- **Every session:** their own push becomes visible and consequential.
- **Every day:** new Orders, a new ring and new neighbours, a new digest, and a chance to hold the whole ring.
- **Every week:** a season to win and a monument to raise.
- **Long term:** Rank, heraldry, the Hall of Legends, Deeds and rivalries. Their house grows a history in the room.
