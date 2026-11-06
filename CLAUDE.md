# Code Clash: working rules

## Layers
- `src/measure/` measures diffs (pure). `src/ingest/` talks to GitHub and stores pushes. `src/game/` is the pure, deterministic game (city, battle, league). `src/server/` glues them; `src/client/` draws them. Keep the game deterministic: no Math.random / Date / trig in `src/game` (see `src/game/rng.ts`).
- Sprite painter and renderers share `src/client/render/contract.ts`; change it only on both sides at once.

## Art and design: always work from references
- **Before drawing or designing anything visual** (sprites, animations, buildings, terrain, UI, effects, factions, unit looks, city scenes), gather **several real images from the internet as references** — at least 3, ideally 5+ per subject: CC0/public-domain pixel art (OpenGameArt CC0, itch.io CC0 packs, Kenney, Lospec palettes), period sources (medieval manuscripts, Maciejowski Bible, museum photos of arms/armour, Templar seals and banners), and screenshots of the games we take after (Total War battle formations, isometric pixel RTS/city builders). Follow the `art-reference` skill in `.claude/skills/art-reference/SKILL.md`.
- Look at the references (download them and open them with the Read tool), write down what you take from each, then draw. Compare your screenshots against them in every critique round.
- Record the references used in `docs/art-references/<subject>.md` (URL, licence, what was learned).
- References are for study. Only commit third-party image files that are CC0 or otherwise licensed for redistribution, and credit them in README.md. Never commit non-free assets (the old 3D pack is a cautionary tale).
- Delegate design and drawing to subagents (game design, sprites, renderer, city, UI), each told to follow this section, and run them in parallel where their files don't overlap.
- Every art change is verified with screenshots (Playwright: `require('playwright')`, `chromium.launch()`), looked at, and iterated at least three rounds.

## Iterating on battles: small and headless
- Follow the `fast-sim` skill (`.claude/skills/fast-sim/SKILL.md`): reproduce and fix in seconds-long headless set pieces (`scripts/duel.ts`, one regiment against one regiment), run single test files and `pnpm test:fast` while iterating, and run full battles, fairness and the full suite once at the end. Never iterate on grand battles or 100-battle runs.

## Checks
`pnpm typecheck`, `pnpm test`, `pnpm build`. Commit messages end with the Co-Authored-By / Claude-Session lines the session gives.
