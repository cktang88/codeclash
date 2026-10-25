# Pushfront

Pushfront is an all-day war fought with your pushes. Sign in with GitHub and join a room. Each push you make to a public repository is read and sorted into the kind of code it is, then marches out of your capital as a platoon. Tests become shield-bearing Wardens, docs become Heralds, and refactors that delete code become fast Outriders. A big feature brings a Champion. The armies meet in the middle and fight slowly enough to watch. There is no manual control: your code is your only command. At the room's reset hour the day ends, everyone gets a digest, and a new map begins.

[DESIGN.md](DESIGN.md) holds the rules and the architecture.

## Run locally

Requirements: Node 22 or later, and pnpm (`corepack enable` provides the pinned version).

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

**Set `GITHUB_TOKEN` in `.env` first.** Without it GitHub allows only 60 anonymous requests an hour, about four army previews, after which the preview reports "GitHub's gates are shut for the hour"; real pushes are not ingested and the difficulty bonus can't read blame. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with "Public repositories (read-only)" access and no other permissions, and paste it in: that's 5,000 requests an hour. Every variable is documented in [`.env.example`](.env.example) and in the [Environment](#environment) table below.

Use pnpm, not npm: the lockfile is `pnpm-lock.yaml`, and running `npm i` over a pnpm-made `node_modules` fails with `ERESOLVE … Found: vite@undefined`. If that happens, `rm -rf node_modules` and run `pnpm install`.

Open http://localhost:5173. The Vite dev server proxies `/api`, `/auth`, `/hooks`, and `/ws` to the game server on port 8787.

- **No setup at all:** open http://localhost:5173/demo. A sparring war runs entirely in your browser.
- **Army preview:** open http://localhost:5173/preview and paste any public repository (`owner/repo` or a GitHub link). It shows the army each of the latest 10 commits would raise, and why. It uses `GITHUB_TOKEN` when it is set, and otherwise reads anonymously at 60 GitHub requests an hour (about four uncached previews).
- **Without GitHub sign-in:** set `DEV_AUTH=1` and sign in at `http://localhost:5173/auth/dev?login=<any login>`. Set `DAY_MINUTES=10` to watch a whole day end, write its digest, and start again within minutes.
- **With real pushes:** set `GITHUB_TOKEN` to a token that can read public data. Members' public pushes are polled from the events API. GitHub may deliver those events minutes to hours late. A member who wants near-real-time armies can open Settings, create a personal hook, and add it to a repository as a push webhook.
- **Real sign-in:** create a GitHub OAuth app with the callback URL `${PUBLIC_URL}/auth/github/callback`, then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Pushfront requests no scopes.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | unset | Server token for public events and diffs, also used by the army preview. Without it, only sparring bots fight. The difficulty bonus reads blame over GitHub's GraphQL API, which needs a token: without one (or when GraphQL fails) it falls back to `MIRROR_DIR`, else no bonus. |
| `MIRROR_DIR` | unset | Directory for local git mirrors, the difficulty bonus's fallback when GraphQL cannot answer. Each is a bare partial clone holding only the history of the source files it was asked about, for repositories of 50 MB or less; mirrors over 50 MB are deleted and ones idle for 14 days pruned. Needs `git` on the PATH. Unset: no mirrors (the default, and in tests). |
| `PARSE_WORKERS` | 2 (0 under test) | Worker threads that parse pushes with tree-sitter, so a huge push never blocks the wars. 0 parses on the main thread. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | unset | OAuth app for sign-in. |
| `PUBLIC_URL` | `http://localhost:5173` | Origin browsers use. Builds OAuth callbacks, hook URLs, and digest links. Required in production. |
| `SESSION_SECRET` | random per boot | HMAC key for the session cookie. Required in production, 32 or more characters. |
| `PORT`, `HOST` | `8787`, `0.0.0.0` | Listen address. |
| `DATABASE_PATH` | `data/pushfront.db` | SQLite file. Use a persistent volume in production. |
| `CLIENT_DIR` | `dist/client` | Built client, served with SPA fallback when present. |
| `COMMONS` | `1` | Seeds "The Commons", a public room with sparring bots. |
| `MAX_ROOMS_PER_USER` | `5` | Rooms one player may own. |
| `MAX_LIVE_ROOMS` | `200` | Rooms the server will simulate. |
| `DEV_AUTH` | `0` | Enables `/auth/dev?login=`. Refused in production. |
| `DAY_MINUTES` | unset | Replaces the daily cycle with wars of this length, for testing. |
| `SERVICE_WORKER` | `1` | `0` is the service worker's kill switch: pages unregister it and drop its caches. |

Copy [`.env.example`](.env.example) to `.env` to start; it lists every variable with the same defaults. `.env` is git-ignored, so tokens never get committed.

## Grammars

The tree-sitter grammars are vendored as `.wasm` files in `assets/grammars/`, with their source package, version and sha256 in `assets/grammars/grammars.json`; the grammar packages are not dependencies (they ship native bindings and install scripts). To update one, change its version in `scripts/vendor-grammars.ts` and run `pnpm grammars` (it uses `npm pack`, which runs no install scripts); `pnpm grammars --check` verifies the files.

## Test

```sh
pnpm test
pnpm typecheck
pnpm tsx scripts/diagnose-war.ts 8 30   # a synthetic 8-player, 30-minute war, narrated
MAINTAINERS=1 DAYS=128 pnpm tsx scripts/diagnose-war.ts 4 0   # 128 days, one maintainer among greenfield pushers
pnpm tsx scripts/measure-difficulty.ts  # the difficulty bonus on a vite-like fix and a greenfield commit
```

## Replays

Every finished war can be downloaded as a replay from `/api/rooms/<slug>/wars/<id>/replay`. A replay is the war's header (seed, slot count, players, repositories with their languages) plus its inputs, and nothing else. Any client rebuilds the same battle from it tick for tick, and the replay viewer in the app does exactly that.

## Deploy

Pushfront runs as one Fly.io machine with a volume mounted at `/data`.

```sh
fly volumes create pushfront_data --size 1
fly secrets set GITHUB_TOKEN=... GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=... SESSION_SECRET=... PUBLIC_URL=https://<app>.fly.dev
fly deploy
```

On `SIGTERM` the server writes a snapshot of every war and closes the database. On boot, each war loads its latest snapshot, replays the logged inputs, and catches up to wall-clock time, so a restart loses no battle state.

## Art credits

Units, castles, terrain and most effects are drawn procedurally in `src/client/render`. The explosion clouds in fireballs, sacks and the Monolith's fall use frames from Kenney's Smoke Particles pack. The frames live in `src/client/public/art/kenney-fx/`, with the pack's license file alongside.

| Pack | Author | License | Source |
| --- | --- | --- | --- |
| Smoke Particles | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/smoke-particles |

## Sound credits

Sound is off until the player presses the sound seal, on every visit, and it suspends while the tab is hidden. Cues are defined in `src/client/audio/catalog.ts`. Sampled cues use clips from three Kenney packs, which are trimmed, made mono and loudness-normalized. Each clip ships as Ogg Vorbis and as AAC (`.m4a`, for Safari before 18.4); the browser fetches the format it prefers and falls back to the other. The clips live in `src/client/public/audio/kenney/`, with each pack's license file alongside. Every other sound is synthesized with Web Audio in `src/client/audio/synth.ts`: horns, bells, roars, fire, drums, choir and the army's murmur. So is the generative music in `src/client/audio/music.ts`. Any sampled cue falls back to synthesis if its clip fails to load.

| Pack | Author | License | Source |
| --- | --- | --- | --- |
| Impact Sounds | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/impact-sounds |
| Interface Sounds | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/interface-sounds |
| RPG Audio | Kenney (kenney.nl) | CC0 1.0 | https://kenney.nl/assets/rpg-audio |
