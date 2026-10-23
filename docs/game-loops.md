# Pushfront game loops

Pushfront is played two ways at once. You *build* your army by doing your real work, and you *command and watch* it. The loops below make both satisfying over minutes, hours, and weeks.

No loop may reward gaming the code metrics. Every reward comes either from real contribution, measured by the ledger (see [fair-play.md](fair-play.md)), or from play on the battlefield. Unlocks are cosmetic and social, never power.

## The minute loop: "My push became an army"

**Trigger.** You push code. With a repository webhook it lands in seconds; through the events feed, minutes later.

**Payoff, in order:**

1. A toast: *"Your banner rises."* It names the repo and shows the commit message as a herald's scroll.
2. A horn sounds and your capital's gates open.
3. The platoon unfurls its battalion flag and marches out. The camera can follow it, and the "Follow my banner" control is one key.
4. Every 1–3 minutes your soldiers meet the enemy. Each clash brings kills, a rout, a Champion's last stand, or a fireball. Every death adds to your tally, and every rout or capture is a chronicle line with your name in ink.

**Your inputs in this loop:**

- **Rally** your platoons onto a site. One rally every 30 minutes, with a satisfying stamp.
- Send **emotes** to the room.
- **Inspect** a platoon to read its regiment's story: repo, commit, kills, morale.

**The dopamine beat.** Push, then *see it*, then watch it matter. The delay between pushing and seeing must feel like a fanfare, not a lag.

## The hour loop: "Today's war"

Each player gets three **Orders** for the day, drawn from a deck of battlefield objectives. Examples:

- *Hold a shrine for 10 minutes*
- *Your soldiers slay 40 foes*
- *Strike the Monolith for 3,000 damage*
- *Rout three enemy platoons*
- *Sack a capital*
- *Slay 15 foes under your War Cry*
- *Field a veteran army*
- *Bring a broken platoon home alive*

The deck holds 17 Orders. The three are drawn from the war's seed and your account, so they are fixed for the day, and two of the same kind (say, two slaying goals) never pair up. Orders depend on battle outcomes and can't be completed by pushing differently. Each fulfilled Order stamps a wax seal on your page and pays 50 **Glory**, the lifetime currency.

**The shared rhythm of the day:**

1. **Dawn.** Everyone strikes the Monolith together, and the room cooperates.
2. **Late morning.** The Monolith falls, the Heart opens, and the first betrayal follows.
3. **Afternoon.** The bounty on the leader turns the room against them.
4. **Dusk.** Last pushes and War Cries.
5. **The reset hour.** The digest, and a new dawn.

**Spectator hooks:**

- the hottest-fight director camera
- a "since you looked away" summary of what happened while you were gone
- a highlight toast for every set piece
- a renown race with trend arrows and a crown that changes hands

**Choices that matter by the hour:**

- **Doctrine** (once an hour) counters what your rivals pick.
- **Rally** concentrates your force.
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

**The Hall of Legends.** Champions and Dragons still standing at the day's end, the captain of a platoon with 20+ kills, and whoever struck the Monolith's killing blow are **named**, for example "Brannoc the Unbowed, of the parser Battalion" (at most three a player a day). They are enshrined in the room's Hall with their deeds, and a legend's statue stands at your capital in the next day's war.

**Seasons.** A room's **Season** is a calendar week (an ISO week) of its daily wars. Season standings sum each day's placing points: 10, 6, 4, 3 and 2 for first to fifth, and 1 for anyone else who fought. The Season Victor's monument is raised at the Heart of the next season's maps, and the season gets its own illuminated recap.

**Deeds.** About 30 achievements, for example:

- First Blood
- Dragonslayer
- Unbroken: a day of 20+ kills with no routs
- Siegebreaker
- Iron Streak: seven days fighting

Each is shown as a seal in your profile's codex.

**Rivalries.** Head-to-head records against the players you fight most ("You vs. @bo: 12–9"), shown on your profile. Each day, every pair of human players who both fought scores one bout, won by whoever placed higher; a shared place counts for neither.

**Streaks.** Consecutive days with at least one push. *Rest* keeps a streak, without growing it, on days you choose not to push.

## Why players return

- **Every session:** their own push becomes visible and consequential.
- **Every day:** new Orders, a new map, a new digest, and a chance at the crown.
- **Every week:** a season to win and a monument to raise.
- **Long term:** Rank, heraldry, the Hall of Legends, Deeds and rivalries. Their house grows a history in the room.
