# Fair play: how the army could be gamed, and what stops it

The goal: **a bigger contribution makes a better army, and nothing else does.** That includes play: there is **no manual control: your code is your only command.** Nobody can steer an army or time a buff to make up for less work; the same war council leads every army, and cheers in the room are just for show. Many small commits and one squashed commit give the same army, apart from timing. This page lists every gaming vector we could think of. For each one it gives the defense, the risk that remains, and what to do next.

The tests are in [`src/rules/gaming.test.ts`](../src/rules/gaming.test.ts), which runs crafted diffs through `measurePush` the way the poller does, and [`src/sim/gaming.test.ts`](../src/sim/gaming.test.ts), which runs crafted ledgers through `armyFor` and `armyQuality`. A test passes when the gamed army is at most 10% stronger than the honest one. Strength is `quality × Σ count·√(hp·damage)`.

"Before" gives what the attack earned before this pass.

## How the defenses fit together

- **Ledger (ingestion).** Every counted line becomes a key: its kind, language family and canonical text. A push moves per-key balances. A key's worth depends only on its balance, so any history adds up to the same total as its squash.
  - **Canonical text.** NFKC; invisible characters, combining marks and Cyrillic/Greek look-alikes removed; spacing, quote style, `;`, `,` and comments stripped.
  - **Duplicates.** A key is credited **once** per user.
  - **Shape cap.** Code lines that differ only in literals, numbers or numbered names (the line's *shape*) are credited **8 times a day**.
  - **Shared across repositories.** Line keys belong to the user, not to one repository.
  - **Files touched per day.** A file counts while any of its code keys carries a net change today. This per-file state is scoped to the UTC day, so a file touched yesterday counts again when changed today, and a file whose changes are undone stops counting.
  - **Daily caps.** At most 5000 code lines and 10,000 branch points are credited per UTC day; the rest is filler. The caps telescope like the balances, so splitting a paste gains nothing.
  - **Filler.** These lines earn nothing:
    - lines with fewer than two words
    - literal data rows such as `{ id: 7, name: "x" },`
    - encoded blobs
    - prose
    - the inside of untagged multi-line strings
- **Day memory (ingestion).** Each key remembers the most credit and the most removal credit it reached on earlier days. Only credit beyond that counts, so the same work is never paid twice across resets. Within one day, squash equivalence holds exactly. Balances and memory count for 7 days after they last moved (`LEDGER_LIVE_MS`) and are deleted after 8 (`LEDGER_KEEP_MS`).
- **Purpose tallies (simulation, `applyDelta`).** Code and removed lines are also tallied by purpose. Undone lines come off the undoing push's own purpose first, then the others in order, so the tallies always sum to the totals: a feature written and then deleted under a `fix:` message leaves no Clerics behind.
- **Effective ledger (simulation, `effectiveLedger`).** Each metric is bounded by the real code behind it:
  - code and removed lines: at most 5000 per war
  - files: at most `1 + code/20 + removed/100`
  - branch points: at most `code/3` (and 2 per line at ingestion)

## Vectors

| # | Vector | How it would work | Defense now | Risk | Recommendation / test |
|---|---|---|---|---|---|
| 1 | Split vs squash | Many tiny pushes for diminishing-returns or per-push bonuses | Balances telescope; the army is a function of the day's ledger | Low | `ledger.test.ts` squash equivalence |
| 2 | Add-then-delete churn | Write lines, delete them, repeat | Deleting cancels the credit; churn is reported | Low | existing |
| 3 | Reindent / whitespace | Run a formatter that only changes spacing | Spacing is removed from keys | Low | existing |
| 4 | Style reformat of old code | Change quotes and semicolons on legacy code to get removed + new credit | Canonical keys (quotes, `;`, `,`, spacing). Before: 346 credited lines out of 400; now ≤4 | Low | test "reformatting old code" |
| 5 | Line-wrap reflow | Rewrap long calls one argument per line | Fragments under two words are filler. Flipping the width back and forth pays nothing after the first time (day memory) | **Medium**: a one-time gain of about one line per wrapped statement, plus removal credit | Key multi-line statements by bracket depth. Test "re-wrapping… pays at most once" |
| 6 | Move code between files | Cut and paste across files | Keys are not tied to a file; moves cancel | Low | existing |
| 7 | Copy code into many repositories or forks | Push the same file to N repos | Line keys are shared by all of a user's repos. Before: 4×; now 1× | Low | tests "copying…", "moving… between repositories" |
| 8 | Renames | Rename files | A pure rename has no patch; only changed lines count | Low | — |
| 9 | Exact duplicate lines | Paste the same line many times | Credited once. Before: twice | Low | existing, updated |
| 10 | Near-duplicates via comments | `foo(); // 1`, `foo(/* 2 */)` | Trailing and inline comments are stripped from keys. Before: 500 of 500; now ≤2 | Low | test "trailing comment" |
| 11 | Unicode tricks | Zero-width characters, NBSP, ideographic space, Cyrillic `а` | NFKC; Cf/M removed; look-alikes mapped. Before: 248 of 300 | Low (scripts outside the map: Low–Med) | test "zero-width…" |
| 12 | Data disguised as source | 2000 rows `{ id: 1, name: "x" },` in a `.ts` file | Literal data rows are filler; shape cap. Before: 2000 of 2000 | Low | test "data table" |
| 13 | Giant switch, numbered constants, SQL seeds | `case 17: return "x";`, `ICON_17 = …`, `INSERT … VALUES (…)` | Shape cap: 8 a day | Low–Med (each row needs a fresh identifier to escape the cap) | same test |
| 14 | Huge strings, base64, prose in strings | Text inside a template literal or `"""` | Untagged multi-line strings are data. Tagged ones (html`, css`) count, but prose and blob filters apply. Before: 1500 of 1500 | Low | test "prose or a blob" |
| 15 | Prose in markup, JSX or LaTeX | `<p>…</p>` lines; a paper in `.tex` | Prose filter (8+ words and no `(){}[];=:` or `a.b`). `.tex` and `.bib` count as docs | Low–Med (prose sprinkled with `=` passes) | test "prose in markup or LaTeX" |
| 16 | Minified code | One huge line | An average above 110 characters per line counts as generated; a line counts once | Low | existing |
| 17 | Generated or vendored code without markers | Codegen output or a vendored library under `src/` | Duplicates, shape and data filters; daily cap; √ returns | **Medium** | Recommend fingerprinting known open-source files (hash of canonical lines) |
| 18 | Paste an open-source project | 50k real lines | 5000 code lines per UTC day and per war; √ returns | **Medium** (one strong day for zero work) | Recommend a rolling 7-day cap, or crediting nothing for lines already in another member's ledger. Test "huge paste" |
| 19 | `&&` / `\|\|` chains | 20 conditions per line | At most 2 branch points per line; at most code/3 overall | Low | test "branch stuffing" |
| 20 | `if (true)` on every line | One fake branch per line | Branch points at most code/3; within 10% of honest | Low | tests "branch stuffing", "inflated branch points" |
| 21 | Many tiny files | 1 line in each of 200 files | Effective files at most 1 + code/20 + removed/100. Before: 1.6× | Low | tests "many tiny files" (both) |
| 22 | Mass deletion | Delete 30k lines, for example in a fork | Removed lines at most 5000 per war; files bounded. Before: 300× the capped value | Low–Med (deleting someone else's code in a fork still pays, up to the cap) | tests "mass deletion" (both) |
| 23 | Delete before reset, restore after | Revert at 23:59, re-revert at 00:01, every day | Day memory: work credited on an earlier day is never credited again. Before: full credit every day | Low: ledger rows count for 7 days after they last move (`LEDGER_LIVE_MS`), so alternate-day farming no longer pays | Test "deleting work before the daily reset" |
| 24 | Removal farming | Delete old code, restore it the next day, delete it again | Day memory also covers removal credit | Low | test "deleting old code… alternate days" |
| 25 | Force-push, amend, push to a second branch | The three-dot compare shows the same lines again | SHA dedup plus the per-key cap of 1. Before: 2× | Low | test "force-pushing…"; poller test updated |
| 26 | Merge or rebase that pulls in others' commits | `git pull` brings upstream commits into the pushed range | A range holding anyone else's commits or any merge is measured commit by commit, using only the user's own non-merge commits (the newest 20), through the same ledger | Low | Poller tests "measures only the user's own commits in a mixed push" and "ignores merge commits" |
| 27 | Timing around the reset | Paste 5k before 00:00 UTC and 5k after, in a war that resets at another hour | The simulation caps code per war at 5000. Before: 2× | Low | tests "huge paste…", "two days of pasting" |
| 28 | Commit-message keyword stuffing | Every message `feat:` (or `fix:`) | Purpose changes which units, never the slot budget. Within +10% for every purpose | Low | test "keyword stuffing" |
| 29 | Test spam | 20k test lines | At most 4 Wardens; a quality penalty from 3:1 | Low | test "spam" |
| 30 | Comment spam | 20k comment lines | At most 3 Archers; a penalty from 0.5:1 | Low | test "spam" |
| 31 | Docs and config spam | 20k docs or config lines | At most 2 Heralds and 3 Sappers | Low | test "spam", "support alone" |
| 32 | Skipping tests and comments | Untested code turned half the Footmen into stronger Berserkers | A third of the Footmen become Berserkers, and each Berserker takes the place of 2 Footmen. Before: +11% | Low | test "leaving out tests" |
| 33 | Push spam | Hundreds of pushes | The army comes from the ledger, not from push count | Low | — |
| 34 | Webhook replay or forgery | Resend a signed delivery | HMAC, push-id and SHA dedup, 20 deliveries a minute | Low | `hooks.test.ts` |
| 35 | Co-author trailers or author spoofing | `Co-authored-by:`, or a foreign author email | A commit counts when GitHub links its author to the user's account id; without a linked account the author login must match, and webhooks refuse such commits. Events whose actor is another account (a renamed login taken over) are skipped | Low | `poller.test.ts` |
| 36 | Sockpuppet accounts | Several accounts in one room | One army per account; owners can remove members | **Medium** | Recommend a floor on account age and activity (`createdAtGithub` is stored) |
| 37 | Binary and lockfile churn | Regenerate lockfiles, images | Lockfiles count as generated; binaries are ignored | Low | existing |
| 38 | Languages without comment syntax | Comments in a language the ledger reads as C | Added `--` for VHDL, `%` for `.m`; unknown languages default to C-like | Low–Med | test "comments in a language…" |
| 39 | Unusual extensions as source | `.sql`, `.css` or `.html` used as a data store | Shape cap, data-row and prose filters. CSS declarations still count | **Medium** | Consider weighting style and markup lines below program code |
| 40 | Extremely long lines | Pack logic into 2000-character lines | A line counts once; branches capped per line; minified detection | Low | — |

## Costs to honest work, measured

On this repository's own source plus zod and rxjs, honest code keeps about **92%** of the credit it earned before this pass. The losses fall in four places:

- exact duplicate lines, which now count once
- untagged multi-line strings, such as an embedded SQL schema or a GLSL shader, which are now data
- runs of calls that differ only in numbers (drawing code, tables), which the shape cap limits
- long runs of JSX text, which read as prose

All players are measured the same way. A realistic day of features, fixes, tests, comments and a refactor (1400 lines over 10 files) gets no negative quality notes, earns *Well tested* and veteran rank 1, and reaches rank 2 at 12 files (test "a realistic day…").

## Changes in this pass

- `src/rules/classify.ts`:
  - multi-line string tracking (template literals, `"""`, raw strings), with tagged templates and `${…}` interpolations understood and regex literals skipped
  - VHDL and `.m` comments
  - `.tex` and `.bib` count as docs
- `src/rules/ledger.ts`:
  - canonical keys and the Unicode folding
  - duplicate cap of 1
  - shape cap
  - data-row, blob and prose filler
  - 2 branch points per line at most
  - day memory
  - per-file state scoped to the UTC day, so files touched are counted per day
  - `MemoryLedger.today`
- `src/server/db.ts` (`ledgerFor`): non-file scopes are shared by all of a user's repositories, and the store reports `day()` (UTC day number).
- `src/sim/muster.ts`:
  - `CODE_CAP` and `effectiveLedger` bound code, removed lines, files and branch points
  - 1 Berserker replaces 2 Footmen
  - `applyDelta` takes undone lines off the push's own purpose first
