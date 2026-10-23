# Pushfront

Pushfront is an all-day war fought with your pushes. You sign in with GitHub and join a room (public, or private by invite). Every push you make to a public repository is read, sorted into what kind of code it is, and becomes a **platoon** that marches out of your capital toward the middle of the map. Nobody steers individual soldiers. You make a few scarce decisions, and you watch. Each room's war lasts 24 hours. At the room's reset hour the war ends, a **digest** is written, and a fresh map begins.

This file is the source of truth for the rules and the architecture.

## 1. From a push to a platoon

### What we read

For every member, the server polls `GET /users/{login}/events/public` with an ETag. An unchanged feed answers `304`, which costs no rate limit. For each new `PushEvent` (keyed by `push_id`), it calls `GET /repos/{o}/{r}/compare/{before}...{head}` once. A new branch (`before` is all zeros) falls back to `GET /repos/{o}/{r}/commits/{head}`. A branch deletion is skipped. Only commits authored by the member count, and a commit SHA already seen for that member is never counted twice.

GitHub delivers public events anywhere from 30 seconds to several hours late. A member who wants near-real-time armies can add a repository webhook (push events) pointing at their personal hook URL. The server verifies the HMAC signature and then runs the same compare call.

Only public repositories are read. Lines changed are not quality. Pushfront rewards a healthy *shape* of work (tests, docs, deletions, a balanced push) and uses diminishing returns so volume alone never wins.

### Sorting lines into categories

Each changed file is classified by path. The first matching rule wins:

| Category | Matched by |
| --- | --- |
| vendor | `node_modules/`, `vendor/`, `third_party/`, `extern/`, `bower_components/`, `Godeps/`, `Carthage/`, `*.min.js` |
| generated | lockfiles, `dist/`, `build/`, `out/`, `target/`, `.next/`, `coverage/`, `*.map`, `*.pb.go`, `*_pb2.py`, `*.g.dart`, `*_generated.*`, `*.gen.*`, `*.snap`; any file whose patch header says `@generated`, `DO NOT EDIT`, or `auto-generated` |
| docs | `*.md`, `*.mdx`, `*.rst`, `*.adoc`, `*.txt`, `docs/`, `README`, `CHANGELOG`, `LICENSE`, `CONTRIBUTING` |
| test | `*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`, `spec/`, `e2e/`, `*_test.go`, `test_*.py`, `*_test.py`, `conftest.py`, `src/test/`, `*Test.java`, `*Tests.swift`, `*_spec.rb`, `testdata/`, `fixtures/` |
| config | `.github/`, `Dockerfile`, `Makefile`, `*.yml`, `*.yaml`, `*.toml`, `*.ini`, `*.json`, `*.tf`, `*.nix`, `.gitignore`, `.editorconfig`, dotfiles |
| source | everything else with a known source extension |

Files of any other type (images, binaries, data) are ignored.

Inside **source** files, every *added* line from the patch is counted as one of these:

- **code**
- **comment**: a line comment, or a line inside a block comment, using the file's language syntax
- **blank**: whitespace only

Deleted source lines are counted as **removed**. Test, docs, config, generated and vendor files count added non-blank lines. When GitHub omits a patch because it is too large, the file's `additions` count is used, and those lines are all treated as code.

The nine line counts are `code, test, comment, docs, config, removed, generated, vendor, blank`. **Blank lines raise nothing.** They are recorded for the digest.

### Units

There are twenty unit kinds.

- **Base and elite.** Each line category raises a base unit. In a big push, it also raises an elite.
- **Specials.** Berserkers and Clerics come from the shape of a push, not from one category.
- **Heroes.** Champions and Dragons crown well-rounded pushes.

Each unit takes one or more **slots** in its platoon. HP, damage and range are listed per unit. Speed is in world units per tick, at 5 ticks per second. Melee reach is 13–16 units, plus half the target's size.

| Unit | Raised by | Tier | Slots | HP | Dmg | Range | Speed | Abilities |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Footman | code | base | 1 | 110 | 11 | melee | 1.6 | Spear and shield. +60% vs Outriders and Knights |
| Knight | code (elite) | elite | 2 | 240 | 22 | melee | 2.4 | Charge: the first blow after riding 40 units deals ×1.8 |
| Warden | test | base | 1 | 190 | 6 | melee | 1.3 | Tower shield: allies within 40 take 30% less damage. Arrows deal half damage to it |
| Paladin | test (elite) | elite | 2 | 320 | 14 | melee | 1.4 | Shield aura like a Warden's. Every 2 s, heals the most wounded ally within 40 for 6. ×2 vs undead |
| Archer | comment | base | 1 | 55 | 8 | 95 | 1.6 | Arrows in flight. +40% vs Footmen, Skeletons, Mercenaries, Berserkers. +80% vs fliers |
| Ranger | comment (elite) | elite | 2 | 90 | 17 | 125 | 1.9 | Elven longbow, with the same bonuses as the Archer |
| Herald | docs | base | 1 | 80 | 4 | melee | 1.6 | Banner aura: heals allies within 50. Halves its platoon's morale loss |
| Wizard | docs (elite) | elite | 2 | 85 | 20 | 120 | 1.4 | Fireballs burst over 28 units (full damage at the center, half at the edge) |
| Sapper | config | base | 1 | 90 | 10 | melee | 1.5 | ×6 damage to structures |
| Trebuchet | config (elite) | elite | 3 | 260 | 34 | 175 | 0.8 | Stones burst over 22 units. Prefers any structure in range. ×2 vs structures |
| Outrider | removed | base | 1 | 120 | 15 | melee | 3.2 | +60% vs ranged units, Heralds, Sappers, Clerics |
| Griffin Rider | removed (elite) | elite | 2 | 200 | 20 | melee | 3.6 | Flies over water, rock and crowds. Same bonuses as the Outrider |
| Skeleton | generated | base | 1 | 70 | 6 | melee | 1.3 | Brittle fodder |
| Bone Golem | generated (elite) | elite | 3 | 520 | 14 | melee | 0.9 | Lumbering wall. +30% vs base units |
| Mercenary | vendor | base | 1 | 130 | 16 | melee | 1.8 | Contract ends 10 minutes after marching out |
| Troll | vendor (elite) | elite | 3 | 600 | 24 | melee | 1.2 | Regenerates 1.2 HP per tick, a quarter of that while scorched by fire. +30% vs base units. Contract of 20 minutes |
| Berserker | untested, uncommented code | special | 1 | 120 | 26 | melee | 2.1 | Hits hard, dies fast |
| Cleric | a fix | special | 1 | 90 | 5 | melee | 1.5 | Every 2 s, heals the most wounded ally within 80 for 22 |
| Champion | a balanced push | hero | 2 | 520 | 26 | melee | 1.5 | Allies within 60 deal 20% more. Its platoon cannot rout while it lives. ×1.5 vs heroes and Dragons |
| Dragon | a legendary push | legend | 6 | 2400 | 24 | 70 | 2.0 | Flies. Every 2 s breathes fire on every enemy in a 50° cone, and singes structures in it. Valor aura like a Champion's |

Fliers ignore terrain and the press of ground soldiers. Melee soldiers can still strike them once the flier comes within reach.

- **Balanced push:** at least 20 code lines, at least 1 test line, and at least 1 comment or docs line.
- **Legendary push:** a balanced push with at least 150 code lines, 50 test lines, and 30 comment or docs lines.
- **Fix:** a commit message containing `fix`, `fixes`, `fixed`, `bug`, `hotfix` or `patch`.

### How many soldiers

For each line category: `count = floor(coef * sqrt(lines))`. If that is 0 but `lines >= threshold`, the count becomes 1. Counts are capped per category.

Once a category's lines reach its **elite** line count, every 3 base soldiers of that category are promoted to 1 elite.

| | code | test | comment | docs | config | removed | generated | vendor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coef | 0.6 | 0.7 | 0.6 | 0.45 | 0.4 | 0.45 | 0.15 | 0.12 |
| threshold | 1 | 1 | 3 | 5 | 5 | 10 | 50 | 50 |
| cap | 12 | 10 | 8 | 6 | 6 | 8 | 6 | 4 |
| elite at | 120 | 60 | 30 | 60 | 60 | 80 | 5000 | 4000 |

Then, in order:

1. **Berserkers.** With at least 30 code lines and no test or comment lines, half the Footmen (rounded down) become Berserkers.
2. **Clerics.** A fix adds 1 Cleric, or 2 if it also removes at least 40 lines.
3. **Heroes.** A balanced push adds a Champion. A legendary push adds a Dragon instead. Neither comes while fatigue applies.
4. **Fitting.** A platoon holds at most 32 slots. The cheapest soldiers are trimmed first, and heroes are never trimmed.

Fatigue keeps a heavy pusher from flooding the map:

- **Hourly levy.** After 3 pushes in the last hour, further platoons get half the counts.
- **Daily weariness.** After 12 pushes today, platoons get a third of the counts.
- Every push still raises at least one Footman.

**Caps.**

- A player fields at most 160 slots, and a room at most 2000 soldiers. A platoon that would break either cap waits in its capital's **muster queue** and marches when there is room. The queue holds up to 24 platoons.
- An army has at most one Dragon alive. A second legendary push brings a Champion instead.

**Regrouping.** Remnants fold into stronger formations of the same army. A platoon qualifies when it has 4 or fewer soldiers left, or less than 30% of its strength. It merges into a bigger platoon of its army within 140 units. A routed remnant that reaches its capital joins its army's nearest platoon in the field, at any distance.

## 2. Hierarchy and heraldry

- **Army.** One per player per war. It has one **hue**, assigned from a colorblind-aware wheel so that players in a room are far apart.
- **Battalion.** One per repository the player pushed to today. Its flag is the army hue in a lightness and saturation step unique to the battalion, plus a **pattern** (plain, chevron, saltire, pale, fess, quarterly, bend, chief), an **emblem** (one of 12), and an accent stripe in the repository's language color. All of these are chosen from a hash of the repo name. The flag shows the repo's initials.
- **Platoon.** One per push. It carries its battalion's flag plus its ordinal number within the battalion (I, II, III …). It marches and fights as a formation, from front to back:
  - Trolls, Golems, Paladins, Wardens and Skeletons in front
  - Champions, Knights, Footmen, Mercenaries and Berserkers in the line
  - Sappers in the middle
  - Wizards, Rangers, Archers, Heralds and Clerics behind
  - Trebuchets at the rear

  Outriders and Griffin Riders ride the flanks. A Dragon hovers behind the center.

## 3. The battlefield

The map is a disc with one **capital** per slot, on a ring at 84% of the radius. A war's map is generated at the start of the day with `slots = clamp(members + 2, 4, 16)`, so players who join during the day take a spare slot. Once all slots are taken, a new member starts with tomorrow's war.

- **Capital.** One per player. It has 8000 HP and a tower (20 damage, range 160). Platoons spawn at its gate. Within 220 units of their own capital, a player's units take 20% less damage (home turf).
- **Sacking.** A capital at 0 HP is **sacked**. The player who dealt the final blow gains renown: 120 for the first sack of that capital today, 60 for the second, 40 for the third, and so on (`120 / n`, rounded down). The capital lies in ruins for 20 minutes, invulnerable and silent, and then rebuilds at full HP.
- **Shrines.** One per slot, at 46% of the radius between neighboring capitals. Each is capturable.
- **The Heart.** It sits at the center and is guarded at dawn by the **Legacy Monolith**, a neutral structure with `30000 + 10000 * members` HP that fires on anyone near it. Everyone attacks it together. The player who dealt the most damage to it gets the Monolith award. The Heart can be captured only after the Monolith falls.
- **Terrain.** Forest slows movement by 40% and halves arrow damage. Water and rock are impassable. The terrain is generated from seeded noise in one sector and rotated into the others, so every slot sees the same map.

### Capture

A shrine or the Heart flips after a single army has held it uncontested for 10 seconds (30 seconds for the Heart).

## 4. Command (the scarce decisions)

| Lever | What it does | Limit |
| --- | --- | --- |
| **Doctrine** | Assault: +15% damage, prefers enemy capitals and the Heart. Hold: +20% damage reduction near your shrines, defends. Siege: +50% structure damage, targets capitals. Skirmish: +20% speed, prefers lightly held objectives. | change once per hour |
| **Rally** | Every platoon marches on one chosen objective | once per 30 minutes, lasts 2 hours |
| **War Cry** | Your soldiers deal +30% damage and move 25% faster for 60 seconds | once per war |

All three are deterministic inputs to the simulation, so they appear in the replay.

Each player's **war council** runs every 3 seconds. It gives each platoon an objective, weighing these factors:

- the objective's renown
- distance (supply lines: reinforcements always come from the capital)
- enemy and friendly strength nearby
- doctrine
- rally

## 5. Morale and routs

Every platoon has morale from 0 to 100. Morale falls by `150 / platoonSize` per soldier lost and drains while the platoon is outnumbered 2 to 1. A Herald halves the loss. Morale recovers slowly out of combat.

At 0 morale the platoon **routs**: it stops fighting and flees to its capital. There it rallies at 60 morale and takes new orders. Routs make fights end and stay readable.

## 6. Renown and winning the day

Renown is the score:

| Source | Renown |
| --- | --- |
| Shrine held | 2 per minute |
| The Heart held | 8 per minute |
| Kill | the victim's value (1 for most units, 2 for Wardens, Heralds, Outriders and Mercenaries, 10 for a Champion) |
| Kill of a soldier of the renown leader (bounty) | double the victim's value |
| Monolith damage | 1 per 100 damage |
| Sacking a capital | 120 for the first sack of that capital today, then `120 / n` for the n-th |

A holding pays in full only while its owner has soldiers near it. An ungarrisoned holding pays a quarter of its renown, rounded down. A leader therefore has to spread thin to keep everything.

At the reset hour, the player with the most renown wins the day.

## 7. The daily digest

When a war ends, the server computes a digest from the final world and the war's inputs. The function is pure and deterministic. The digest contains:

- the winner, the final standings, and the renown each player gained
- the code each player pushed, by category
- superlatives, so most active players earn one:

| Award | Goes to |
| --- | --- |
| Warlord | most kills |
| Iron Wall | fewest losses per soldier raised |
| Test Legion | most test lines |
| Scribe | most docs and comment lines |
| Demolisher | most removed lines |
| Siegebreaker | most structure damage |
| Monolith Slayer | most Monolith damage |
| Ghost | the highest renown per push |
| Militia Mob | most generated lines (affectionately) |
| Standard Bearer | most balanced pushes |

- highlights: the largest clashes, sacks, captures, and the Monolith's fall, each with a tick so the replay can jump there
- each player's best platoon, with its repo and commit message
- lifetime progress: days played, days won, the current streak of days with at least one push, and titles earned

Members may switch on **Rest** for a day, which keeps their streak. A room owner may set a Slack or Discord webhook URL, and the digest is posted there.

## 8. Rooms

- **Visibility.** A public room appears in the lobby. Anyone can watch it, and any signed-in player can join. A private room is reachable only through its invite link. Only members and holders of the link can watch it.
- **Settings.** The owner sets the room's name, its reset hour (in UTC), and how many sparring bots it has (0–6). Bots push synthetic code so that a room is never empty.
- **Owner tools.** The owner can rename the room, change its settings, remove members, and rotate the invite code.
- **In the room.** Viewers see presence (who is watching). They can send emotes, which float over the sender's capital, and use a short chat. Chat and emotes are not part of the replay.

## 9. Determinism and replay

The simulation is pure. It uses only `+ - * / Math.sqrt Math.floor Math.abs Math.min Math.max`, a seeded PRNG stored in the world, and iteration over arrays in index order. It runs at 5 ticks per second.

A war's **replay** is everything needed to rebuild it, and nothing more:

```json
{
  "v": 1,
  "seed": 123, "slots": 6, "members": 4, "tickMs": 200,
  "startsAt": 1761177600000, "endsAt": 1761264000000,
  "players": [{ "login": "ana", "id": 1, "hue": 210, "slot": 0, "bot": false }],
  "repos": ["ana/parser"],
  "inputs": [[1200, "push", 0, 0, [120, 30, 12, 4, 0, 18, 0, 0, 9], 3, "Fix tokenizer"], [3000, "doc", 0, 2]]
}
```

The map, the capitals and everything else derive from `seed`, `slots` and `members`. The chronicle (history log) is a pure function of the simulation's events, so a replay reproduces it too. The server keeps snapshots every 10 minutes only to seek quickly. They are a cache, not a source of truth.

## 10. Architecture

```
GitHub events/compare ─▶ ingest ─▶ SQLite (users, pushes, seen commits)
                                   │
              rules (pure) ────────┴─▶ push input ─▶ war (per room) ─▶ sim (pure, 5 Hz)
                                                       │
                                  inputs + snapshots ──┼─▶ SQLite
                                                       └─▶ WebSocket ─▶ clients run the same sim
```

- **One authoritative Node process.** It runs every room's war, the poller, HTTP and WebSockets.
- **Lockstep spectators.** A client receives one snapshot, then only inputs stamped one second ahead, and simulates locally with interpolation. A checksum every 10 seconds catches divergence.
- **SQLite in WAL mode.** Every input is written to the log before it is broadcast. On restart, a war loads its latest snapshot, replays the logged inputs, and catches up to wall-clock time.
- **Stack.** TypeScript everywhere. Fastify and `@fastify/websocket` on the server. PixiJS 8 renders the battlefield and React the HUD. Vite builds the client, and Vitest runs the tests.
