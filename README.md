# Code Clash

Code Clash turns your pushes into a medieval war. Sign in with GitHub and swear to a league. Every push you make to a public repository is measured, and the credited work raises your **commandery**: real code builds the Sergeants’ Hall, logic the Archery Butts, refactors the Stables, tests the Hospital and the Walls, docs the Chapter House. The buildings train soldiers every hour, and fresh work calls up a levy at once.

- **Every night** at the league’s hour, the soldiers each lord trained that day meet another lord’s, one against one, on an open field. A win makes veterans and lifts the city’s output for the rest of the week.
- **Every week**, on the seventh night, everyone trained that week (less the dead the Hospital could not save) fights the **Grand Battle**. Then every city is razed and the next week starts from nothing.

Volume and consistency both pay: building levels grow with the square root of their work, each day in a row you push raises the Fields and speeds all training (+7% a day), a day without a push musters only 40% of that day's men, and code past 1,000 lines a day counts at 30%. Factions share the same ten unit classes with small differences, Rome-II style; the Knights Templar ship first.

## Architecture

Three layers, each usable without the next:

| Layer | Path | What it does |
| --- | --- | --- |
| Measurement | `src/measure/` | Pure. Reads diffs and credits work: line classes, tree-sitter complexity, the anti-gaming ledger (squash-equivalent, copies and filler count nothing), the difficulty bonus. `credit.ts` is the boundary: a day's pushes summed into `Work`. See [docs/fair-play.md](docs/fair-play.md). |
| Ingestion | `src/ingest/` | GitHub: OAuth tokens (sealed), event polling, early discovery, webhooks, forks' upstream bonus, parse workers, and its SQLite tables. Emits one `PushReport` per push. |
| Game | `src/game/` | Pure and deterministic. `city.ts` (the commandery economy), `battle.ts` (the regiment battle: up to 2800 figures a side on a 1600×1200 field, blocks with stances, a General and a Captain per regiment), `command.ts` (orders, battle plans and the morale table), `league.ts` (week clock, Swiss pairing, brigands), `factions.ts`, `units.ts`. |

`src/server/` glues them: every `PushReport` is appended to a work log (at the time the server received it, so late events can never rewrite battles already fought), cities are recomputed from that log on demand, and a scheduler fights each league's battles at their hour and records the setup and result. `src/client/` is the browser: it fetches a battle's setup and fights the same battle again, tick for tick, to show it. Rendering is plain Canvas 2D at the field's native 640×360, painted with procedural pixel sprites, scaled up with whole pixels and finished with a grade, vignette, grain and scanlines.

## Run locally

Requirements: Node 22 or later, and pnpm (`corepack enable` provides the pinned version).

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

Open http://localhost:5173 (the Vite dev server proxies `/api`, `/auth` and `/hooks` to the game server on port 8787).

- **No setup at all:** http://localhost:5173/demo fights a sparring battle in your browser.
- **Without GitHub sign-in:** set `DEV_AUTH=1` and sign in at `http://localhost:5173/auth/dev?login=<any login>`. Set `DAY_MINUTES=10` to run a whole week in seventy minutes.
- **Real pushes:** set `GITHUB_TOKEN` (a fine-grained token with public read access). Signed-in players' public pushes are polled from the events API; a player's own token also enables faster discovery.
- **Real sign-in:** create a GitHub OAuth app with the callback URL `${PUBLIC_URL}/auth/github/callback`, then set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `TOKEN_KEY`.

## GitHub rate limits and players' tokens



A player's token also buys **faster discovery**. GitHub's events feed can lag minutes to hours, so for each signed-in player with a token the server watches up to 10 of their recently active public repositories (from their pushes, their contributions of the last week and `/user/repos`). It reads the branch heads every 2 to 15 minutes (faster while they're pushing) with ETags, so an unchanged repository costs nothing. A moved branch is ingested exactly as its PushEvent would be, and the PushEvent that arrives later counts nothing twice. Discovery spends at most 250 charged requests an hour of the player's own budget and never touches the server's. Players without a token get the events feed as before.

**Privacy.** The profile says it plainly: "We store your sign-in token to read your public activity on your own GitHub rate limit. Public data only; revoke any time at github.com/settings/applications." The token is requested with no scopes, so it can read public data only. It is stored encrypted (AES-256-GCM, keyed from `TOKEN_KEY`, bound to the player's id), never logged, and never sent to any browser. Signing out keeps it. **Disconnect GitHub** in settings or on your profile deletes it, and so does deleting your account. Revoking the app on GitHub stops it at once.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | unset | Server token for public events and diffs. Without it, only sparring bots fight. The difficulty bonus reads blame over GitHub's GraphQL API, which needs a token: without one (or when GraphQL fails) it falls back to `MIRROR_DIR`, else no bonus. |
| `MIRROR_DIR` | unset | Directory for local git mirrors, the difficulty bonus's fallback when GraphQL cannot answer. Each is a bare partial clone holding only the history of the source files it was asked about, for repositories of 50 MB or less; mirrors over 50 MB are deleted and ones idle for 14 days pruned. Needs `git` on the PATH. Unset: no mirrors (the default, and in tests). |
| `PARSE_WORKERS` | 2 (0 under test) | Worker threads that parse pushes with tree-sitter, so a huge push never blocks the server. 0 parses on the main thread. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | unset | OAuth app for sign-in. |
| `PUBLIC_URL` | `http://localhost:5173` | Origin browsers use. Builds OAuth callbacks, hook URLs, and digest links. Required in production. |
| `SESSION_SECRET` | random per boot | HMAC key for the session cookie. Required in production, 32 or more characters. |
| `TOKEN_KEY` | from `SESSION_SECRET`, else random per boot (dev only) | Key material (32+ bytes) for encrypting players' stored GitHub sign-in tokens. Required in production when OAuth is configured. Keep it secret, separate from `SESSION_SECRET`, and stable: changing it makes every stored token unreadable, and players are asked to sign in again. |
| `PORT`, `HOST` | `8787`, `0.0.0.0` | Listen address. |
| `DATABASE_PATH` | `data/codeclash.db` | SQLite file. Use a persistent volume in production. |
| `CLIENT_DIR` | `dist/client` | Built client, served with SPA fallback when present. |
| `COMMONS` | `1` | Seeds "The Commons", a public league with sparring bots. |
| `MAX_LEAGUES_PER_USER` | `5` | Leagues one player may own. |
| `DEV_AUTH` | `0` | Enables `/auth/dev?login=`. Refused in production. |
| `DAY_MINUTES` | unset | Replaces the day with cycles this long (a week is seven), for testing. |

Copy [`.env.example`](.env.example) to `.env` to start; it lists every variable with the same defaults. `.env` is git-ignored, so tokens never get committed.

## Grammars

The tree-sitter grammars are vendored as `.wasm` files in `assets/grammars/`, with their source package, version and sha256 in `assets/grammars/grammars.json`; the grammar packages are not dependencies (they ship native bindings and install scripts). To update one, change its version in `scripts/vendor-grammars.ts` and run `pnpm grammars` (it uses `npm pack`, which runs no install scripts); `pnpm grammars --check` verifies the files.

## Test

```sh
pnpm test
pnpm typecheck
pnpm bench           # battles of 250 to 2800 men a side: timings and phases (contact, first rout, break, end)
pnpm bench 2800 3    # one battle, with casualties and its event log
pnpm tsx scripts/battle-trace.ts 500 1   # a battle as it unfolds, every regiment every 10 s
```

## Deploy

Code Clash runs as one Fly.io machine (`fly.toml`: region `iad`, `shared-cpu-2x`, 512 MB plus 512 MB swap) with a volume mounted at `/data` for the SQLite database and the local mirrors.

```sh
fly launch --no-deploy --copy-config      # or: fly apps create <app>, then set `app` in fly.toml
fly volumes create codeclash_data --region iad --size 3
fly secrets set GITHUB_TOKEN=... GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... SESSION_SECRET=$(openssl rand -hex 32) TOKEN_KEY=$(openssl rand -hex 32)
fly deploy
```

`TOKEN_KEY` is a secret, so it goes in `fly secrets`, never in `fly.toml`. If your app isn't named `codeclash`, change `app` and `PUBLIC_URL` in `fly.toml` (and the OAuth app's callback URL to `${PUBLIC_URL}/auth/github/callback`). At 512 MB the config runs one parse worker (`PARSE_WORKERS=1`) and caps the V8 heap at 320 MB; with many busy leagues, raise the machine to 1 GB and drop both.

Battles are recorded when fought, and cities are recomputed from the work log, so a restart loses nothing: on boot the server fights any battle whose hour passed while it was down.
