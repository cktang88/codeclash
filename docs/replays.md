# Replays that survive sim changes

Status: proposal (research, November 2026). Nothing here is implemented yet.

## The problem

Today a battle row holds the `BattleSetup` (seed, both armies, about 0.4 KB of JSON) and the `BattleResult`, and the browser shows the battle by running `new Battle(setup)` again, tick for tick (`src/client/ui/BattleView.tsx`). That only works while the browser runs the same sim the server fought with. The first balance patch, new doctrine or `BATTLE_VERSION = 2` (already planned for Fortunes of War in `docs/design.md`) changes every old battle's replay **without any error**: the players see a different fight, maybe with a different winner, than the one that was scored.

Two details in the code make this worse:

- `Battle`'s constructor used to mix the **constant** `BATTLE_VERSION` into the seed (`new Rng(mixSeed(setup.seed, BATTLE_VERSION))`) and never read `setup.version`, so a v1 setup loaded by a v2 sim ran as v2 and nothing refused it. *Since v3:* the constructor refuses a setup of another version (`BattleVersionError`), and the seed takes a separate constant, `SEED_SALT` (still 2), so bumping `BATTLE_VERSION` no longer re-seeds every battle by itself; a version that should re-seed must change `SEED_SALT` too.
- The sim's behaviour lives in `battle.ts` **and** its imports `factions.ts`, `units.ts` and `rng.ts`. A stat change in `units.ts` changes battles just as much as a code change, and nothing ties those files to `BATTLE_VERSION`.

Requirement: a player can open any battle (days, weeks, months, a year later) and see the fight that was scored.

## How games do it

There are two families, and real games use both.

**Inputs plus a deterministic sim (lockstep).** Age of Empires synchronized 1,500 units over a 28.8k modem by sending only commands and running the same simulation everywhere; sending unit state "would limit us to 250 moving units" ([1500 Archers on a 28.8, Bettner and Terrano, GDC 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)). Replays come free with this design: the replay file is the setup plus the command list. The catch is that **a replay only plays on the exact build that recorded it**, and every studio handles that in one of three ways:

- **Keep every old build and load the right one.** StarCraft II "has always automatically loaded replays in the appropriate version of the game behind the scenes"; replays from earlier versions need that version, and the client fetches it ([Blizzard, patch 2.0.10 replay notes](https://news.blizzard.com/en-us/article/10495761/update-der-replay-funktion-in-2-0-10)). Players report the install keeps old executables under `Versions/` and downloads missing ones on demand ([r/starcraft](https://lr.us.psf.lt/r/starcraft/comments/1kyzzhc/new_update_bricked_replays)). This is the closest match to what we need.
- **Refuse old replays.** Factorio stores the replay inside the save; replays from older versions cannot be played, and the developers declined to migrate them, because "a replay only works if the game produces the exact same results" and every bug fix changes that ([Factorio wiki, Replay system](https://wiki.factorio.com/Replay_system); [forum: Replay Migration](https://forums.factorio.com/viewtopic.php?p=575606)). Age of Empires II replays are commonly broken between patches, and the community answer is "set up an older version of the game" ([CaptureAge forum](https://captureage.nolt.io/122)). Total War has the same experience with saves after patches and works around it with beta branches of old builds ([GameSpot](https://gamespot.com/articles/total-war-warhammer-2-hammers-herdstones-update-may-break-current-saved-games-heres-a-workaround/1100-6493928/)).
- **Version fields and desync checks.** Factorio's lockstep multiplayer compares state checksums and writes a desync report when a client diverges ([Friday Facts #188](https://cf-www.factorio.com/blog/post/fff-188)). We borrow this as the checksum trail below.

**Recorded state (snapshots plus deltas).** Server-authoritative games record what the server sent to clients. Source engine demos (CS, Dota 2, Deadlock) are the network stream: a header with the demo and network protocol versions, periodic full packets and per-tick entity deltas; "periodic DEM_FullPacket commands provide complete state snapshots that allow the parser to jump ahead" ([Valve DEM format](https://developer.valvesoftware.com/wiki/DEM_Format); [boon docs](https://boon.readthedocs.io/en/latest/internals/file-structure.html)). Rocket League replays are the replicated network stream too; a 1.5 MB replay decodes to 31 MB of JSON ([rattletrap](https://www.stackage.org/lts-14.22/package/rattletrap)). Overwatch's kill cam and highlights reuse the replicated state the netcode already produces ([GDC 2017, Replay Technology in Overwatch](https://gdcvault.com/play/1024053/Replay-Technology-in-Overwatch-Kill)). Recorded streams survive sim changes but not **format** changes: Dota 2 replays regularly fail to load after patches because the client's decoders moved on ([Steam discussion](https://steamcommunity.com/app/570/discussions/0/4338735089007355500)). The lesson for us: a recorded stream needs its own small, frozen, versioned decoder too.

General guides frame the same trade-off: inputs are the most compact but need determinism; periodic state costs storage but needs none ([Game Developer, "What just happened? Creating a replay system"](https://www.gamedeveloper.com/programming/what-just-happened-creating-a-replay-system); [bugnet, how to build a replay system](https://bugnet.io/blog/how-to-build-a-replay-system)).

## Is the JS sim deterministic across Node, Chrome, Firefox and Safari?

**What the spec guarantees.** ECMAScript defines `+ - * /` as IEEE 754-2019 binary64 operations with round-to-nearest (`Number::add`, `Number::multiply` and friends: "performs multiplication according to the rules of IEEE 754-2019 binary double-precision arithmetic"). `Math.sqrt` returns "𝔽(the square root of ℝ(n))", the exactly rounded result, with no approximation latitude. `Math.floor/ceil/round/abs/min/max/imul` are exact. In contrast, the spec says `acos … atan2, cbrt, cos, exp, hypot, log, pow, sin, tan` and the rest are "not precisely specified", only recommending fdlibm ([ECMA-262, §21.3.2](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-function-properties-of-the-math-object)), and `**` goes through `Number::exponentiate`, which is approximated in the same way. JS has no x87 extended precision and no fused multiply-add contraction: every operation rounds to a double. The tightening of `Math.sqrt` to correct rounding dates to [tc39/ecma262 PR #903](https://github.com/tc39/ecma262/pull/903).

**Where it goes wrong in practice.** Transcendentals do differ: V8 and SpiderMonkey use different fdlibm ports, JavaScriptCore uses the platform libm, and V8 changed its `sin` results between versions ([Tom MacWright, "Math keeps changing"](https://macwright.com/2020/02/14/math-keeps-changing)). A JS physics engine found `Math.sqrt` matched between Node and Chrome while `sin`/`cos` did not ([bounce issue #8](https://codeberg.org/perplexdotgg/bounce/issues/8)). Our sim already avoids all of these (`rng.ts` rules: only `+ - * / sqrt floor abs min max imul`). I checked: `src/game` uses no `**`, no transcendentals, and its one `sort` has a comparator (the sort is stable since ES2019, so ties keep a fixed order). Other traps the rules should name: `Math.random`, `Date`, iteration over `Map`/object keys that were inserted in data-dependent order, and `toFixed`/string round trips (JSON numbers round-trip exactly, so the stored setup is safe).

**Measured.** I bundled `battle.ts` with esbuild and ran four battles (150, 500, 1000 and 2500 men a side) to the end in Node 22.22 (V8), Chromium 141 (V8), Firefox 142 (SpiderMonkey) and WebKit 26 (JavaScriptCore), hashing every figure's `x, y, hp, state` (float64 bits) every 50 ticks. **All four engines produced identical hash trails, tick counts and winners** (final hashes `5d296eff`, `4ac36e10`, `04664040`, `9226f0cb`). This was on x86-64 Linux. ARM (Apple Silicon, iPhones) was not tested. IEEE basic operations should match there too, but the checksum trail below is how we would find out in production.

Conclusion: re-simulating in the browser is sound **as long as the browser runs the same sim code**. The real risk is our own code changes, not the engines.

## Options

Measured on the real sim (`new Battle(setup)`, the bench army mix, seeds 1 to 3, both sides Templars, side B 10% larger). Sizes are per battle, brotli quality 9, positions quantized to 0.25 world units (half that size is visually lossless: the field is drawn at its native 640×360, so 1 unit = 1 pixel). See [Measurements](#measurements) for the details.

| Option | Stored per battle (daily, ~1,000 men a side) | Server CPU at fight time | Client CPU | Survives sim changes | Complexity |
| --- | --- | --- | --- | --- | --- |
| **A. Setup only (today)** | ~1 KB | the sim (0.7–3.4 s) | the sim, in real time | **No: replays silently change** | none |
| **B. Setup + versioned frozen sim bundles** | ~1 KB + ~100 B trail; **9 KB gz per sim version, once** | sim + ~10 ms hashing | the sim (the same as today) | Yes, as long as every bundle is kept and still runs in browsers | low to medium: freeze step, dynamic import, CI guard |
| **C. Recorded state stream** (every tick, 0.25 u) | 790–960 KB (1.16 MB for a 262 s battle) | sim + ~0.2 s recording + 0.5 s brotli-9 | decode and draw only | Yes, as long as the stream decoder is kept frozen | medium-high: format, encoder, decoder, seeking, renderer reads from the stream |
| C at every 2nd tick, interpolated | 520–650 KB | same | same | same | same |
| C at every 5th tick, interpolated | 325–415 KB (Q 0.5 u: about −11%) | same | same | same; motion is visibly smoothed (p99 error 5 units) | same |
| **D. Event log only ("puppet" replay)**: deaths, hits, shots, orders, morale, regiment anchors at 2 Hz | 95–145 KB | sim + ~0.1 s | a stand-in sim walks figures to their regiments' recorded paths | Yes | high, and the fidelity is low: figures' own movement is invented |
| **E. Hybrid: B, with C kept for retired versions or failed checks (recommended)** | ~1 KB in SQLite; streams only for battles of retired versions | B; streams made by a batch job when a version is retired, or on a failed check | B; C only on fallback | Yes, in two independent ways | medium |

Scale (1,000 leagues of 8 players: 4 daily battles a league a day plus 4 grand battles a week, so **4,570 battles a day, 1.67 M a year**):

| Option | Per day | Per year | R2 at $0.015/GB-month ([pricing](https://developers.cloudflare.com/r2/pricing/)) |
| --- | --- | --- | --- |
| A / B (rows in SQLite) | ~5 MB | ~2 GB | not needed (SQLite) |
| C every tick | ~4.2 GB | ~1.5 TB | ~$135 in year 1, then $270/yr for each year kept |
| C every 5th tick, Q 0.5 u | ~1.6 GB | ~600 GB | ~$55 in year 1, then $108/yr for each year kept |
| D events | ~0.5 GB | ~180 GB | ~$16 in year 1, then $32/yr for each year kept |
| E (streams only for one retired version a quarter, already-old battles) | ~5 MB | ~2 GB of rows, plus streams only for what is retired | $0 until something is retired |

Brotli quality 11 shrinks streams a further 10% but costs 3.5–8 s a battle (15–20× q9). Not worth it at fight time. zstd 19 is between the two in size and 2–3× slower than brotli 9.

## Recommendation

**Option E: keep every released sim version runnable (option B) and verify with a checksum trail. Generate recorded streams (option C) only for versions we decide to retire, or when a client's check fails.**

Why:

1. The sim bundle is tiny: `battle.ts` with `factions.ts`, `units.ts` and `rng.ts`, minified, is **22 KB, 8.8 KB gzip**. A hundred versions are under 1 MB in total, fetched only by someone watching an old battle. This is StarCraft II's approach at 1/10,000th of the cost.
2. Full fidelity for free: the browser runs the exact code that decided the battle, so the scene, the ticker and the blood are all the same as today, and the result is identical by construction.
3. Determinism across engines is measured, not assumed, and the checksum trail (4 bytes per 5 seconds) turns any future divergence (ARM Safari, an engine bug, a bad bundle) into a detected, recoverable event instead of a silently different battle.
4. The server can **always** recreate a stream later from the archived bundle (it is the same code in Node), so recorded streams need not be made at fight time. Making every stream at fight time would cost 0.6–1.5 TB a year to protect against something the trail already detects. The one case for recording at fight time is "we might lose the bundle". That is ruled out by keeping bundles in git and content-addressed, and by a CI test that runs every bundle.

## The format

### 1. Battles table (SQLite, stays the source of truth)

```sql
ALTER TABLE battles ADD COLUMN sim_version INTEGER NOT NULL DEFAULT 1;   -- = setup.version
ALTER TABLE battles ADD COLUMN sim_build TEXT NOT NULL DEFAULT '';        -- sha256 of the bundle, first 16 hex
ALTER TABLE battles ADD COLUMN trail BLOB;                                -- checksum trail, see below
ALTER TABLE battles ADD COLUMN stream_key TEXT;                           -- object key of a recorded stream, if any
```

`setup` and `result` stay JSON as today. Walkovers (`walkoverResult`) have no sim and no trail.

### 2. Sim versions

- `BATTLE_VERSION` is bumped by **any** change that can alter a battle: code in `battle.ts`, stats in `units.ts`/`factions.ts`, `rng.ts`, constants such as `MAX_FIGURES` or `MAX_TICKS`. Renderer-only changes do not bump it.
- `Battle`'s constructor checks `setup.version === BATTLE_VERSION` and throws otherwise. It is the only way to make a mismatch loud.
- `pnpm sim:freeze` (new script) runs esbuild on an entry that exports `{ Battle, BATTLE_VERSION, simHash }` into `sims/battle.v<N>.<sha16>.js` (committed; ESM; no imports), and adds it to `sims/index.json`: `{ "1": { "file": "battle.v1.3f9c….js", "sha256": "…", "frozen": "2026-11-…", "status": "live" } }`. `status` is `live`, `retiring` or `retired`.
- The server serves `sims/` as immutable static files (`Cache-Control: public, max-age=31536000, immutable`). The client keeps a static import for the current version and loads older ones with `await import(/* @vite-ignore */ `/sims/${entry.file}`)` (or `new Function` from fetched text for a CSP without dynamic import). The server uses the same files through `import()` when it needs an old version (stream generation, audits).
- **Golden-trail CI guard** (new test): `sims/golden.json` holds, for each version, the trail of 6 fixed setups (small, large, grand-scale, brigands, cavalry-heavy, missile-heavy). The test runs (a) each frozen bundle against its own golden (the archive still works) and (b) the current source against the current version's golden. If (b) fails, the change altered battles: bump `BATTLE_VERSION`, freeze, and record new goldens. This is the step that stops "forgot to bump" from ever reaching players.
- **The renderer contract.** Old bundles must keep working with the new renderer. The renderer may read only a frozen `SimView` interface: `tick`, `scale`, `done()`, `step()`, `result`, `events`, `soldiers[i].{x,y,vx,vy,hp,state,actedAt,cls,team,reg,commander,s.mounted,s.radius}`, `regiments[i].{cx,cy,fx,fy,routed,team,cls}`, `projectiles[i].{team,cls,x0,y0,x1,y1,born,lands,splash}`, `stakes`. A new renderer feature that needs more data reads it through an adapter that supplies a default for old versions. Derive the exact list from `src/client/render/scene.ts` when the contract is written (it also reads e.g. `s.target`).

### 3. Checksum trail

- Every 50 ticks (5 s), and at the final tick, the sim hashes all figures in id order: FNV-1a 32 over the two 32-bit halves of the float64 bits of `x, y, hp, state`, chained from the previous value. It is stored as little-endian `uint32[]` (3600 ticks at most, so ≤ 73 entries, ≤ 292 bytes; measured 52–208 bytes).
- Cost: 4–18 ms a battle in V8, 0.5–1% of the sim.
- The client computes the same thing while it plays. On the first mismatch it stops trusting the re-sim, reports `{battleId, version, tick, ua}` to the server, and switches to the stream (below). The trail also makes a cheap server audit possible: "re-run 1% of last month's battles with their bundle, compare the trails".
- The trail is put in the bundle (`simHash`), so it is frozen with the version. Use FNV-1a (or xxhash32), not a cryptographic hash: it is for detecting divergence, not for security.

### 4. Recorded stream (`.ccr`), for retired versions and fallback

A binary, little-endian, brotli-compressed file, made by running the archived bundle in Node with a recorder attached. It is stored in object storage under `replays/<league>/<battleId>.v<fmt>.ccr.br` and served with `Content-Encoding: br` (every browser decodes it, with no JS decompressor), `immutable`.

Header:

| Field | Type | Notes |
| --- | --- | --- |
| magic | 4 bytes | `CCR1` |
| formatVersion | u8 | 1. The decoder for each format version is kept forever (it is ~5 KB) |
| simVersion, simBuild | u16, 8 bytes | which bundle produced it |
| battleId, seed | u32, u32 | |
| ticks, tickRate | u16, u8 | ≤ 3600, 10 |
| sampleEvery K | u8 | 1, 2 or 5; the client interpolates between samples |
| quant Q | u8 | quanta per world unit: 2 (0.5 u) by default |
| figures, regiments | u16, u16 | |
| setupLen + setup JSON | varint + bytes | so the stream stands alone |
| figure table | per figure: team, cls, reg, flags (vet, commander) | 4 B × ≤ 2,200 |
| regiment table | per regiment: team, cls, role | |
| result JSON, trail | | the trail of the run that made the stream must equal the battle row's |
| chunk index | u32 offsets, one per 100 ticks | for seeking |

Chunks (one per 10 s of battle):

- **keyframe**: for every figure, `state` (2 bits), and for figures that are alive, absolute `x, y` as uvarint quanta; every regiment's `cx, cy, fx·64, fy·64`.
- **K-tick frames**: for every figure that was alive at the previous frame, in id order, zigzag-varint `Δx, Δy` from the previous frame (quantize absolute positions first, then take differences of the quantized values, so there is no drift); then regiments' deltas.
- **events**, each list sorted by tick, encoded as varint tick-delta and zigzag id-delta: state changes `(tick, id, state)`, hits `(tick, id)` (the scene's blood), blows/shots `(tick, id)` (the `actedAt` animation), projectiles `(born, shooter, x1, y1, flight)` (`x0, y0` come from the shooter's position; `cls`/`splash` from its class), regiment orders `(tick, reg, mode, tx, ty)`, narrative `BattleEvent`s.
- a CRC32 for each chunk.

Positions are about 75% of the bytes and the events 25%. The layout options I measured (whole-frame planes, per-figure tracks within a chunk, linear prediction) differ by only ±5% after brotli, because the figures' positions carry real jitter from the separation forces. Pick the simplest (frame-major).

### 5. Client flow

```
row = GET /api/battles/:id       → setup, result, simVersion, simBuild, trail, streamUrl?
if index[simVersion].status != 'retired':
    sim = (simVersion == current) ? static import : await import(index[simVersion].file)
    play sim; check trail every 50 ticks
    on mismatch → report, then fall through
stream = fetch(streamUrl ?? POST /api/battles/:id/stream)   // the server makes and caches it on demand
play stream (decode, interpolate K, draw with the same renderer through the SimView adapter)
```

## Migration from setup-only storage

1. **Now, before any sim change** (no behaviour change):
   - Freeze the current sim as v1: `sims/battle.v1.<sha>.js`, `index.json`, goldens. Check that the bundle reproduces every stored battle: replay all rows and compare `result` (as `league.test.ts` already does for one); this is cheap (~1–3 s a battle) and gives a list of any rows that do not reproduce.
   - Add the `setup.version` check to the constructor, and the CI golden guard.
   - Add the columns. Back-fill `sim_version = 1`, `sim_build = <v1 sha>`, and `trail` by re-running each stored battle with the v1 bundle (the same run as the check above).
2. **Client**: load the bundle by version; check the trail; report mismatches. Use a static import for the current version, so nothing changes for today's battles.
3. **Then ship v2** (Fortunes of War): bump, freeze, new goldens. Old battles keep playing on v1.
4. **Streams**: build the recorder and the `.ccr` decoder only when they are needed: the first time a version is to be retired, or when trail mismatches appear in the reports. Until then, the on-demand endpoint can stay unimplemented and a mismatch shows the result with "this replay could not be verified".
5. **Retiring a version** (optional, e.g. when the renderer contract can no longer be met for it): mark it `retiring`, run a batch job that makes streams for all its battles (CPU: about the sim time, ~2 s a battle, plus 0.5 s brotli), check each stream's trail, upload, set `stream_key`, then mark it `retired`. Keep the bundle file anyway. It costs nothing and allows regenerating.
6. **Retention**: if storage ever matters, keep full replays for N weeks and setups/results forever; with option B there is nothing to prune but rows.

## Measurements

Scripts (scratch, not committed): `measure.ts` (sizes) and `detentry.ts` + `pw/det.cjs` (cross-engine check). It runs `new Battle(setup)` with `scripts/battle-bench.ts`'s army builder (side B ×1.1 and +50% of class 3) and records every tick. Node 22.22, one core of a 4-vCPU cloud VM. `MAX_FIGURES` is 1,100 a side, so 2,500 men a side is drawn at scale 3 (1,601 figures). "br9" is brotli quality 9; KB = 1,024 bytes. Table cells are means (or ranges) over seeds 1–3.

| Armies (men a side) | Figures | Ticks (s) | Sim ms | Every tick | Every 2nd | Every 5th | Events only | Events + regiment tracks | Trail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 500 | 969 | 650–760 (65–76 s) | 650–750 | 392 KB | 267 KB | 174 KB | 47 KB | 59 KB | 52–60 B |
| 1,000 | 1,918 | 710–1,220 (71–122 s) | 1,285–1,663 | 894 KB | 601 KB | 385 KB | 107 KB | 127 KB | 56–96 B |
| 2,500 (scale 3) | 1,601 | 820–2,620 (82–262 s) | 1,391–3,361 | 927 KB | 618 KB | 391 KB | 99 KB | 123 KB | 64–208 B |
| 6,000 (scale 6) | 1,918 | 710–1,220 | 1,564–1,788 | 894 KB | 601 KB | 385 KB | 107 KB | 127 KB | 56–96 B |

- **Stream size is bounded by `MAX_FIGURES`, not by army size.** 6,000 men a side at scale 6 is the same figure-level battle as 1,000 men at scale 1 (the same figures, ticks and bytes), since the sim deploys `round(count / scale)` figures.
- **Per 10 s of battle** (brotli 11, every tick): 47–80 KB; every 5th tick: 22–34 KB. Roughly **0.45 bytes per figure-tick** at every tick and 0.2 at every 5th tick (≈1 byte per figure per sample). The theoretical worst case (2,200 figures all alive for the full 3,600 ticks) is ~3.5 MB every tick and ~1.4 MB every 5th tick; in practice armies thin out, and the longest battle measured (262 s, 1,601 figures) was 1.16 MB every tick and 477 KB every 5th tick.
- **Codecs** (one 1,000-man stream every tick, raw 2.3 MB): gzip-9 941 KB in 0.5 s; brotli-9 894 KB in 0.47 s; brotli-11 802 KB in 7.4 s; zstd-19 864 KB in 1.1 s. Fixed-width int16 deltas compress 10–15% worse than varints.
- **Quantization** (500 men, every 5th tick): 0.25 u → 155 KB, 0.5 u → 138 KB, 1 u → 120 KB (brotli 11). Every tick: 354 → 294 → 236 KB.
- **Interpolation** error against the true positions (alive figures, interpolated ticks only): every 2nd tick, mean 0.23–0.30 u, p99 2.5–3.2 u, 11–17% of samples off by more than 1 u; every 5th tick, mean 0.63–0.76 u, p99 4.7–5.4 u. Figures jitter tick to tick (the separation and collision forces), so decimation visibly smooths the scrum. Every 2nd tick is the lowest rate that keeps the look; every 5th is acceptable for an archive.
- **Event volume** per 1,000-man battle: ~28 k blows/shots, ~12 k hits, ~10 k projectiles, ~2 k state changes, ~1 k regiment orders, ~4 k integer morale changes.
- **Recording overhead**: snapshotting every tick plus encoding: 40–200 ms; hashing the trail: 4–18 ms.
- **Cross-engine determinism**: identical trails in Node 22.22 / Chromium 141 / Firefox 142 / WebKit 26 (x86-64 Linux) for 150, 500, 1,000 and 2,500 men a side; the full four battles took 5.1 s (Chromium), 7.0 s (Firefox) and 5.7 s (WebKit).
- **Sim bundle**: esbuild `--bundle --minify` of `src/game/battle.ts`: 22,294 bytes, 8,777 gzip.
- **Setup**: 405–417 bytes of JSON, ~210 bytes gzip.

Note: the brief assumed battles of 900–3,000 ticks; with the bench armies they lasted 650–2,620 ticks (65–262 s). Grand battles with larger, mixed armies will be at the long end, which the "every 2nd/5th tick" upper bounds above cover.

## Version log

- **v16**: morale that does not grow with the battle (`MORALE` in `src/game/command.ts`). Outnumbered weighs the enemy fighting close by against ours fighting close by (`Regiment.friendNear`), not against the block alone (15 a unit of the odds beyond 1.2, was 9): on the crowded field of a big battle every block counted two or three times its strength about it. A friend's rout shakes the blocks about it by its share of the men there (`MORALE.friendRout` 60 x share, at most 14; was 7 to every friend within 150, however many).
- **v15**: bug fixes from a sweep of the sim (see the v15 note in `src/game/battle.ts`). Horse sent at a block of the line but cutting down the shooters behind it no longer breaks off to charge again (it went by its target, not by whom its men fought). The general's household takes on only enemies whose men come within its reach, riding for the nearest man (it rode for the centre of any block whose bounding circle came within 40: the Lich-Marshal fell in over half of all battles). Balance: the undead raise at most 8 figures a pulse, the daimyō's aura is 1.35x, the samurai's curl and surge 1. A risen man (U3) gets up where he fell for 16 ticks (`RISE_TICKS`, the renderer's rise) before he moves or fights.
- **v14**: looser, livelier battles (`docs/art-references/battle-cohesion.md` §6; `COHESION` and each faction's `DOCTRINE.loose` in `src/game/command.ts`). Wider gaps between blocks (28, 22-34 by room), rows (26), archers' blocks (24) and out to the wings (60, the horse 16 before the line). A ragged approach (per-man eagerness from a hash of his id and the seed, a wave along the files, a wider charge pace). Horse breaks off, rallies on a rally point and charges again (from horse too; at most four times; not against or by the dead). In contact the front loosens and files beyond an enemy's front curl round its flank. Breathers between blows, surges and lulls in the melee. Wounded men drop back; holes in the line stay open a moment. Templar knights' chase eagerness 0.08, samurai katana attack x1.0. See the v14 note in `src/game/battle.ts`.
- **v13**: morale shocks that came a man or a missile at a time (flank and rear blows, charge impact, missiles, stones, fugitives taken in) count as shares of a block of 35 men (`MORALE.blockMen`), so bigger blocks in bigger battles no longer take several times the shock from the same share of their men hit (the undead won 70% of battles of 1500 men a side and more). Battle doctrines, three a faction (`DOCTRINE` in `src/game/command.ts`, `docs/faction-doctrines.md`): Templar Marshal's charge, re-form on the banner, brothers who do not rout while the Marshal lives; Samurai uma-jirushi, first spear and long chase, teppō before the line firing rank by rank (and the first-volley morale shock, now simulated); Undead tide, unflinching, the fallen rising (new `Soldier.roseAt`, optional `SideResult.risen`, event `doctrine`). Undead hit points 66%. See the v13 note in `src/game/battle.ts`.
- **v12**: the dead know no fear. Undead regiments never waver, rout or rally and take no morale effects (morale reads 100); every undead class has 69% of its hit points (the Bone Colossus 80%, engines unchanged). When the Lich-Marshal falls the whole host crumbles: 2% of each man's hit points a second and -4 attack, -3 defence (new event `crumble`). An undead army breaks under 8% standing, or under 20% against twice as many, and crumbles instead of running. See the v12 note in `src/game/battle.ts` and `UNDEAD` in `src/game/command.ts`.
- **v11**: missile drill. Foot shooters stop to shoot (never while their block walks or wheels); bows, crossbows and guns fire in volleys on a per-regiment clock (reload plus a 0.6 s beat, the loaded men within half a second), fire at will when an enemy is within 50 units (or charging from 100), and fight at contact. They stand further back, and bows lob over a melee. Skirmishers fall back by an about-turn (no more spinning javelin men). Stats: bow reload 22 to 15, crossbow 44 to 38, samurai teppō reload x1.34 and damage x1.3. See the v11 note in `src/game/battle.ts` and `docs/art-references/missile-drill.md`.
- **v10**: routs recover. Fugitives may fall in with a steady, unengaged regiment of their side and class that has room (Templars: of their family), and a broken regiment rallies only out of contact, with an anchor (its standard, the commander, a formed reserve), with odds by class from `docs/art-references/rout-recovery.md`; a second rout is final, and undead never rally. A man's regiment can change during a battle (`Soldier.reg` reads the live roll). New events `joins` and `reform`. See the v10 note in `src/game/battle.ts` and `REGROUP` in `src/game/command.ts`.
