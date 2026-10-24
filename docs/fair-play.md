# Fair play: how the army could be gamed, and what stops it

The goal: **a bigger contribution makes a better army, and nothing else does.** That includes play: there is **no manual control: your code is your only command.** Nobody can steer an army or time a buff to make up for less work; the same war council leads every army, and cheers in the room are just for show. Many small commits and one squashed commit give the same army, apart from timing. This page lists every gaming vector we could think of. For each one it gives the defense, the risk that remains, and what to do next.

The tests are in [`src/rules/gaming.test.ts`](../src/rules/gaming.test.ts), which runs crafted diffs through `measurePush` the way the poller does, and [`src/sim/gaming.test.ts`](../src/sim/gaming.test.ts), which runs crafted ledgers through `armyFor` and `armyQuality`. A test passes when the gamed army is at most 10% stronger than the honest one. Strength is `quality × Σ count·√(hp·damage)`.

**The budget is linear** (DESIGN.md, *How many soldiers*): twice the real code raises twice the army. That rewards volume more than the old square roots did, so every line that passes for code now pays in full. Two things carry the weight: the ledger's filters, which keep padding from passing for code at all, and the daily cap with its knee (full value to 4000 lines, half to 8000, nothing beyond), which bounds whatever does pass.

"Before" gives what the attack earned before this pass.

## How the defenses fit together

- **Ledger (ingestion).** Every counted line becomes a key: its kind, language family and canonical text. A push moves per-key balances. A key's worth depends only on its balance, so any history adds up to the same total as its squash.
  - **Canonical text.** NFKC; invisible characters, combining marks and Cyrillic/Greek look-alikes removed; spacing, quote style, `;`, `,` and comments stripped.
  - **Duplicates.** A key is credited **once** per user.
  - **Shape cap.** Code lines that differ only in literals, numbers or numbered names (the line's *shape*) are credited **8 times a day**. In style sheets, markup and SQL, class and id selectors (`.icon-x`, `#panel-y`) are blanked out of the shape too.
  - **Shared across repositories.** Line keys belong to the user, not to one repository.
  - **Files touched per day.** A file counts while any of its code keys carries a net change today. This per-file state is scoped to the UTC day, so a file touched yesterday counts again when changed today, and a file whose changes are undone stops counting.
  - **Daily caps.** At most 8000 code lines and 10,000 branch points are credited per UTC day; the rest is filler. The caps telescope like the balances, so splitting a paste gains nothing.
  - **Filler.** These lines earn nothing:
    - lines with fewer than two words
    - literal data rows such as `{ id: 7, name: "x" },`
    - encoded blobs
    - prose
    - the inside of untagged multi-line strings
- **Day memory (ingestion).** Each key remembers the most credit and the most removal credit it reached on earlier days. Only credit beyond that counts, so the same work is never paid twice across resets. Within one day, squash equivalence holds exactly. Balances and memory count for 7 days after they last moved (`LEDGER_LIVE_MS`) and are deleted after 8 (`LEDGER_KEEP_MS`).
- **Purpose tallies (simulation, `applyDelta`).** Code and removed lines are also tallied by purpose. Undone lines come off the undoing push's own purpose first, then the others in order, so the tallies always sum to the totals: a feature written and then deleted under a `fix:` message leaves no Clerics behind.
- **Effective ledger (simulation, `effectiveLedger`).** Each metric is bounded by the real code behind it:
  - code lines: in full to 4000 per war, at half value from 4000 to 8000, nothing beyond (at most 6000 lines' worth)
  - removed lines: at most 4000 per war
  - files: at most `1 + code/20 + removed/100`
  - branch points: at most `code/3` (and 2 per line at ingestion)

## Vectors

| # | Vector | How it would work | Defense now | Risk | Recommendation / test |
|---|---|---|---|---|---|
| 1 | Split vs squash | Many tiny pushes for per-push bonuses | Balances telescope; the army is a function of the day's ledger. Linear pass: 20 pushes / 1 squash = 1.000 exactly | Low | `ledger.test.ts` squash equivalence; sim test "many tiny pushes and one squashed push" |
| 2 | Add-then-delete churn | Write lines, delete them, repeat | Deleting cancels the credit; churn is reported | Low | existing |
| 3 | Reindent / whitespace | Run a formatter that only changes spacing | Spacing is removed from keys | Low | existing |
| 4 | Style reformat of old code | Change quotes and semicolons on legacy code to get removed + new credit | Canonical keys (quotes, `;`, `,`, spacing). Before: 346 credited lines out of 400; now ≤4 | Low | test "reformatting old code" |
| 5 | Line-wrap reflow | Rewrap long calls one argument per line | Fragments under two words are filler. Flipping the width back and forth pays nothing after the first time (day memory) | **Medium**: a one-time gain of about one line per wrapped statement, plus removal credit. Rewrapping 1200 old lines: ×1.24 under the square roots, **×1.64** under the linear budget (+1073 code lines) | Key multi-line statements by bracket depth. Tried in the linear-budget pass and backed out: a patch shows three lines of context, so a statement longer than that cannot always be read whole when one of its lines changes, and the squash stops being exact (in random histories of balanced, wrapped code, 37 of 500 split histories differed from their squash). Doing it needs whole-file contents (an extra request per file) or statements of at most three lines. Test "re-wrapping… pays at most once" |
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
| 17 | Generated or vendored code without markers | Codegen output or a vendored library under `src/` | Duplicates, shape and data filters; daily cap and knee. Whatever passes for code pays like code | **Medium** (linear: what passes pays in full, up to the cap) | Recommend fingerprinting known open-source files (hash of canonical lines) |
| 18 | Paste an open-source project | 50k real lines | 8000 code lines a UTC day and per war, the last 4000 at half value; the overflow is filler (a ragged army). Bounded by the cap: never more than a real day at the cap. Before: ×1.61 over a 1300-line day; now ×3.65, below a real day at the cap (×4.62) | **Medium–High** (one capped day for zero work; the linear budget makes the cap worth about 3 typical days instead of 1.6) | Recommend a rolling 7-day cap, or crediting nothing for lines already in another member's ledger. Tests "huge paste", "pasted code that passes for real is bounded by the cap" |
| 19 | `&&` / `\|\|` chains | 20 conditions per line | At most 2 branch points per line; at most code/3 overall | Low | test "branch stuffing" |
| 20 | `if (true)` on every line | One fake branch per line | Branch points at most code/3; within 10% of honest | Low | tests "branch stuffing", "inflated branch points" |
| 21 | Many tiny files | 1 line in each of 200 files | Effective files at most 1 + code/20 + removed/100; files weigh 0.07 slots each. Before this: 1.6×; square-root pass ×1.083; linear ×1.060 | Low | tests "many tiny files" (both) |
| 22 | Mass deletion | Delete 30k lines, for example in a fork | Removed lines count at most 4000 a war and weigh an eighth of code (0.004 slots a line); files bounded. Square-root pass ×1.474 on a 1300-line day; linear ×1.358 | Low–Med (deleting someone else's code in a fork still pays, up to the cap) | tests "mass deletion" (both) |
| 23 | Delete before reset, restore after | Revert at 23:59, re-revert at 00:01, every day | Day memory: work credited on an earlier day is never credited again. Before: full credit every day | Low: ledger rows count for 7 days after they last move (`LEDGER_LIVE_MS`), so alternate-day farming no longer pays | Test "deleting work before the daily reset" |
| 24 | Removal farming | Delete old code, restore it the next day, delete it again | Day memory also covers removal credit | Low | test "deleting old code… alternate days" |
| 25 | Force-push, amend, push to a second branch | The three-dot compare shows the same lines again | SHA dedup plus the per-key cap of 1. Before: 2× | Low | test "force-pushing…"; poller test updated |
| 26 | Merge or rebase that pulls in others' commits | `git pull` brings upstream commits into the pushed range | A range holding anyone else's commits or any merge is measured commit by commit, using only the user's own non-merge commits (the newest 20), through the same ledger | Low | Poller tests "measures only the user's own commits in a mixed push" and "ignores merge commits" |
| 27 | Timing around the reset | Paste 8k before 00:00 UTC and 8k after, in a war that resets at another hour | The simulation caps code per war like a day (knee at 4000, cap at 8000). Square-root pass ×1.73 on a 1300-line day; linear ×4.30, below one real day at the cap (×4.62) | Low (bounded by the cap; see 18) | tests "huge paste…", "two days of pasting" |
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
| 39 | Unusual extensions as source | `.sql`, `.css` or `.html` used as a data store | Shape cap, data-row and prose filters; selectors are blanked from style-sheet shapes, so one rule per class counts 8 times a day. Before: 2000 sprite rules ×1.43 (×2.26 under the linear budget); now ×0.91 (≤ 40 lines credited) | Low–Med (varied hand-written declarations still count) | Test "a style sheet of one rule per class" |
| 40 | Extremely long lines | Pack logic into 2000-character lines | A line counts once; branches capped per line; minified detection | Low | — |
| 41 | Trivial line splits | Split every `a = f(x)` after the `=` to gain a line per statement | Fragments under two words are filler; day memory pays each split once | **Medium** (same mechanism and fix as 5). Splitting 1200 old lines: ×1.12 under the square roots, **×1.35** linear (+681 lines) | Statement keys, as for 5 |

## The linear-budget pass, measured

Each row is an honest day (1500 lines written, 1301 credited, over 30 files, with tests and comments) plus the attack, as strength over the honest day alone, run through `measurePush` and the army formulas. *Square root* is the ledger and budget before this pass; *linear* is now. For scale, an honest day with 1500 more real lines is ×1.51 under the square roots and ×2.05 now, and an honest day at the cap ×1.98 and ×4.62.

| Attack | Square root | Linear | Credited code (before → now) |
|---|---|---|---|
| Split into 20 pushes vs one squash | 1.000 | 1.000 | equal |
| Add then delete 2000 lines, three times | 0.963 | 0.963 | 1301 → 1301 |
| Exact duplicates (2000 copies) | 0.907 | 0.907 | 1301 → 1301 |
| Near-duplicates via comments (500) | 0.987 | 0.987 | 1302 → 1302 |
| Rewrap 1200 old lines one argument per line | 1.237 | **1.635** | 2374 → 2374 |
| Split 1200 old lines after `=` | 1.118 | **1.345** | 1982 → 1982 |
| 3000 punctuation-only filler lines | 0.884 | 0.884 | 1301 → 1301 |
| Comment spam (20k) | 0.913 | 0.915 | 1301 → 1301 |
| Test spam (20k) | 0.822 | 0.824 | 1301 → 1301 |
| Data table (2000 rows) | 0.907 | 0.907 | 1301 → 1301 |
| Switch arms (2000) | 0.922 | 0.908 | 1309 → 1309 |
| CSS sprite rules, one per class (2000) | 1.425 | **0.908** | 3301 → 1309 |
| Generated code with a marker (5000) | 1.000 | 1.000 | 1301 → 1301 |
| Vendored code under `vendor/` (5000) | 1.000 | 1.000 | 1301 → 1301 |
| `if (true)` on 1500 real lines (vs the same lines plain) | 1.049 | 1.033 | — |
| `&&` chains on 1500 real lines (vs the same lines plain) | 0.726 | 0.525 | — |
| The same 1500 lines in 1500 one-line files (vs 15 files) | 1.083 | 1.060 | — |
| Copy to 3 repositories (vs once) | 0.887 | 0.877 | — |
| Mass deletion (30k lines) | 1.474 | 1.358 | 1284 → 1284 |
| Pasted open source, 3000 lines (under the cap) | 1.647 | 2.770 | 3901 → 3901 |
| Pasted open source, 50k lines in one day | 1.612 | 3.653 | 5000 → 8000 |
| Pasted open source, 8000 a day on both sides of UTC midnight | 1.727 | 4.298 | 10000 → 14925 |

Every attack gives at most its previous advantage except two kinds, both bounded by the cap:

- **Code that passes for real** (rows 17, 18, 27) pays like real code. It stays below a real day at the cap, in the same proportion as before (a 50k paste is 0.81 of a capped real day under the square roots and 0.79 now). The cap is worth more typical days than it was (about 3 instead of 1.6), which is the main risk of the linear budget.
- **Re-wrapping and splitting old lines** (rows 5, 41) pay about one line per statement, once ever (day memory), so they grow with the budget's slope like real code: ×1.64 and ×1.35 for 1200 old lines. Statement keys would close them but break exact squash equivalence with three-line patch context (row 5), and squash equivalence is the stronger guarantee.

## Costs to honest work, measured

On this repository's own source plus zod and rxjs, honest code keeps about **92%** of the credit it earned before the first pass. The losses fall in four places:

- exact duplicate lines, which now count once
- untagged multi-line strings, such as an embedded SQL schema or a GLSL shader, which are now data
- runs of calls that differ only in numbers (drawing code, tables), which the shape cap limits
- long runs of JSX text, which read as prose

All players are measured the same way. A realistic day of features, fixes, tests, comments and a refactor (1400 lines over 10 files) gets no negative quality notes, earns *Well tested* and veteran rank 1, and reaches rank 2 at 12 files (test "a realistic day…").

## Changes in the linear-budget pass

- `src/sim/muster.ts`:
  - the budget is linear: `BUDGET_PER_10K` (0.032 a code line, 0.07 a file, 0.01 a branch point, 0.004 a removed line), computed in whole numbers (`budgetOf`)
  - code lines count in full to `CODE_KNEE` (4000), half to `CODE_CAP` (8000), nothing beyond (`credited`); removed lines at most 4000
  - Paladins one per 300 fix lines and Rangers one per 500 (were 150 and 250), so fixes' linear wants take a third of the budget and Clerics still muster
- `src/rules/ledger.ts`:
  - style-sheet, markup and SQL shapes blank class and id selectors
  - `DAILY_CODE_CAP` is `CODE_CAP` (8000)
  - (tried and backed out: keying wrapped statements whole; see vector 5)
- `src/sim/world.ts`: `fieldCap` is at most an even share of the room's 2000 soldiers (rooms of more than 12); `compareStandings` and `dayWinner` rank ties on capitals by the day's code

## Changes in the first pass

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
