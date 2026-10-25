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
  - **Uncounted lines.** These earn nothing, and each push reports how many of each kind it had and in which files (`PushDelta.uncounted`):
    - *structure*: brackets, punctuation, bare tags and bare keywords (`}`, `);`, `</div>`, `} else {`, `return (`)
    - *fragments*: a lone name or call opener, as a wrapped argument leaves (`user,`, `{rising}`, `useEffect(() => {`)
    - *data*: literal rows such as `{ id: 7, name: "x" },`, `[-70, -118],` or a string on its own line, encoded blobs, and the inside of untagged multi-line strings
    - *prose*
    - *repeats*: copies of a line already credited (the duplicate cap)
    - *near-duplicates*: lines past the shape cap
    - A line with two names or values and some code around them counts, however short its names: `label.x = x;`, `y += len / 6;`, `x: number;`, `return 0;`. Style-sheet declarations such as `margin: 0;` count too. Comment frames (`/**`, ` *`, `*/`) count as blank lines, a comment is keyed by its text (single-line `/** … */` doc comments were all one key before), and `{/* … */}` in JSX is a comment.
  - **Filler.** Honest code leaves about one line in three uncounted, nearly all of it structure and repeated idioms (`ctx.beginPath();`, `display: flex;`). So a push may leave uncounted up to **0.5 lines per new credited code or test line, plus 2.5 per credited style-sheet line** (`FREE_PER_CODE`, `FREE_PER_STYLE`). Only what goes beyond that, plus everything past the daily cap, is *filler*, which frays the army. "New" means beyond the day's high-water mark of credited code, so writing, deleting and rewriting the same lines earns the allowance once. Padding pushed alone brings no code, so all of it is filler.
- **Ragged armies (simulation, `armyQuality`).** Quality falls by up to 15% as filler goes from 15% to 50% of lines (`FILLER_RAMP`; it was 30% to 80% when every uncounted line was filler).
- **Complexity rides on credited lines (ingestion, `rules/complexity.ts`).** Complexity is `branch points + function points + names ÷ 2`, read from syntax trees (DESIGN.md, *Sorting lines*), and every point of it is carried by a code key the push newly credits:
  - A line's **branch points** are parsed from the line alone, in the smallest code that completes it, so they are a function of its text, like its key. A key stores what it carries when it is credited and gives exactly that back when it loses the credit, so any history telescopes to its squash, as the lines themselves do.
  - A **function** (3 points) needs 3 statement lines newly credited in the push, each serving one function only. Three of its credited lines carry it (its first line when new, then statements), and deleting any one of them undoes the whole function, so gutting a function after it is counted pays nothing.
  - A **link** (half a point per imported name the file's added code uses, at most 3 an import) is carried by the import's own line; each local module links once a day per player.
  - Lines that are repeats, near-duplicates past the shape cap, filler, generated or vendored carry nothing.
- **Day memory (ingestion).** Each key remembers the most credit and the most removal credit it reached on earlier days. Only credit beyond that counts, so the same work is never paid twice across resets. Within one day, squash equivalence holds exactly. Balances and memory count for 7 days after they last moved (`LEDGER_LIVE_MS`) and are deleted after 8 (`LEDGER_KEEP_MS`).
- **Purpose tallies (simulation, `applyDelta`).** Code, removed lines and the difficulty bonus are also tallied by purpose (a fix's bonus is fix work, `fixWork`). Undone lines come off the undoing push's own purpose first, then the others in order, so the tallies always sum to the totals: a feature written and then deleted under a `fix:` message leaves no Clerics behind.
- **Forks wait for the upstream (ingestion, `server/upstream.ts`).** In a fork, edits of others' established code pay plain code credit at push time (M counts as 1, no effort credit). What the line bonus and effort credit would have paid is frozen with the push (from the push-time context, never re-read) and paid only once the commits are in the upstream's default branch: found by a compare against it, or a merged pull request from the fork branch holding all of the diff's commits, or a merge commit with the diff's patch id (a squash or rebase). It is credited after its day closes, capped with that day's immediate bonus as if it had paid at push time, as a one-off `upstream` input to the player's current war, at most one day's caps (3,800 lines) a UTC day; not found within 14 days, it pays nothing.
- **Repeat targets (ingestion, `applyPush`).** A file that held effort credit at the close of either of the two previous UTC days earns none today (at most once per player per 3 days). Its line bonus is not dampened. The window is a function of earlier days' final states only, so splitting today's pushes changes nothing.
- **Effective ledger (simulation, `effectiveLedger`).** Each metric is bounded by the real code behind it:
  - code lines: in full to 4000 per war, at half value from 4000 to 8000, nothing beyond (at most 6000 lines' worth)
  - removed lines: at most 4000 per war
  - files: at most `1 + code/20 + removed/100`
  - function points: at most `code/8` (one function per 24 lines; this repository has one per 32)
  - links: at most a quarter of complexity
  - complexity: at most `code/2` (2 branch points per line at ingestion; honest code here runs at about one point per three lines)

## Vectors

| # | Vector | How it would work | Defense now | Risk | Recommendation / test |
|---|---|---|---|---|---|
| 1 | Split vs squash | Many tiny pushes for per-push bonuses | Balances telescope; the army is a function of the day's ledger. Linear pass: 20 pushes / 1 squash = 1.000 exactly. Complexity: branch points are exact (a function of each line's text); functions and links are exact when each lands whole in one push (row 53) | Low | `ledger.test.ts` squash equivalence; sim test "many tiny pushes and one squashed push" |
| 2 | Add-then-delete churn | Write lines, delete them, repeat | Deleting cancels the credit; churn is reported | Low | existing |
| 3 | Reindent / whitespace | Run a formatter that only changes spacing | Spacing is removed from keys | Low | existing |
| 4 | Style reformat of old code | Change quotes and semicolons on legacy code to get removed + new credit | Canonical keys (quotes, `;`, `,`, spacing). Before: 346 credited lines out of 400; now ≤4 | Low | test "reformatting old code" |
| 5 | Line-wrap reflow | Rewrap long calls one argument per line | One-name fragments are not credited. Flipping the width back and forth pays nothing after the first time (day memory) | **Medium**: a one-time gain of about one line per wrapped statement, plus removal credit. Rewrapping 1200 old lines: ×1.24 under the square roots, **×1.64** under the linear budget (+1073 code lines) | Key multi-line statements by bracket depth. Tried in the linear-budget pass and backed out: a patch shows three lines of context, so a statement longer than that cannot always be read whole when one of its lines changes, and the squash stops being exact (in random histories of balanced, wrapped code, 37 of 500 split histories differed from their squash). Doing it needs whole-file contents (an extra request per file) or statements of at most three lines. Test "re-wrapping… pays at most once" |
| 6 | Move code between files | Cut and paste across files | Keys are not tied to a file; moves cancel | Low | existing |
| 7 | Copy code into many repositories or forks | Push the same file to N repos | Line keys are shared by all of a user's repos. Before: 4×; now 1× | Low | tests "copying…", "moving… between repositories" |
| 8 | Renames | Rename files | A pure rename has no patch; only changed lines count | Low | — |
| 9 | Exact duplicate lines | Paste the same line many times | Credited once. Before: twice. The copies are filler past the push's allowance | Low | existing, updated |
| 10 | Near-duplicates via comments | `foo(); // 1`, `foo(/* 2 */)` | Trailing and inline comments are stripped from keys. Before: 500 of 500; now ≤2 | Low | test "trailing comment" |
| 11 | Unicode tricks | Zero-width characters, NBSP, ideographic space, Cyrillic `а` | NFKC; Cf/M removed; look-alikes mapped. Before: 248 of 300 | Low (scripts outside the map: Low–Med) | test "zero-width…" |
| 12 | Data disguised as source | 2000 rows `{ id: 1, name: "x" },` in a `.ts` file | Literal data rows are filler; shape cap. Before: 2000 of 2000 | Low | test "data table" |
| 13 | Giant switch, numbered constants, SQL seeds | `case 17: return "x";`, `ICON_17 = …`, `INSERT … VALUES (…)` | Shape cap: 8 a day | Low–Med (each row needs a fresh identifier to escape the cap) | same test |
| 14 | Huge strings, base64, prose in strings | Text inside a template literal or `"""` | Untagged multi-line strings are data. Tagged ones (html`, css`) count, but prose and blob filters apply. Before: 1500 of 1500 | Low | test "prose or a blob" |
| 15 | Prose in markup, JSX or LaTeX | `<p>…</p>` lines; a paper in `.tex` | Prose filter (8+ words and no `(){}[];=:` or `a.b`). `.tex` and `.bib` count as docs | Low–Med (prose sprinkled with `=` passes) | test "prose in markup or LaTeX" |
| 16 | Minified code | One huge line | An average above 110 characters per line counts as generated; a line counts once | Low | existing |
| 17 | Generated or vendored code without markers | Codegen output or a vendored library under `src/` | Duplicates, shape and data filters; daily cap and knee. Whatever passes for code pays like code | **Medium** (linear: what passes pays in full, up to the cap) | Recommend fingerprinting known open-source files (hash of canonical lines) |
| 18 | Paste an open-source project | 50k real lines | 8000 code lines a UTC day and per war, the last 4000 at half value; the overflow is filler (a ragged army). Bounded by the cap: never more than a real day at the cap. Before: ×1.61 over a 1300-line day; now ×3.65, below a real day at the cap (×4.62) | **Medium–High** (one capped day for zero work; the linear budget makes the cap worth about 3 typical days instead of 1.6) | Recommend a rolling 7-day cap, or crediting nothing for lines already in another member's ledger. Tests "huge paste", "pasted code that passes for real is bounded by the cap" |
| 19 | `&&` / `\|\|` chains | 20 conditions per line | At most 2 branch points per line; complexity at most code/2 overall. ×0.546 (the chains are one line of code per condition-laden line, and long lines read as less code) | Low | tests "branch stuffing", "`if (true)` stuffing and long && chains…" |
| 20 | `if (true)` on every line | One fake branch per line | A constant condition is not a decision in the syntax tree: 0 points. Before: ×1.032 (keywords counted it); now ×1.005 | Low | tests "branch stuffing", "counts decisions from the syntax…" |
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
| 41 | Trivial line splits | Split every `a = f(x)` after the `=` to gain a line per statement | One-name fragments are not credited; day memory pays each split once | **Medium** (same mechanism and fix as 5). Splitting 1200 old lines: ×1.12 under the square roots, **×1.35** linear (+681 lines) | Statement keys, as for 5 |
| 42 | Padding hidden next to real code | Push braces, tables or copies with honest code so its allowance absorbs them | The allowance is at most 0.5 lines per new credited line (2.5 more per style-sheet line), and only code beyond the day's high-water mark earns it. Padding never earns anything; what fits in the allowance only escapes the ragged-army penalty. 650 brace lines or 600 table rows next to a 1500-line day: ×1.000 (before ×0.974 and ×0.978, when braces were always filler). 3000 braces in the same push: ×0.857 (before ×0.884) | Low (a small amount of padding is no longer penalised, but it still earns nothing) | Tests "padding pushed with honest code, or alone…", "writing, deleting and rewriting the same code earns the filler allowance once a day" |
| 43 | Keywords where there is no decision | `case` and `if` as identifiers or properties, keywords in strings and comments | Parsed, not matched: an identifier, a string or a comment is not a decision. ×1.000 (before ×1.022) | Low | test "counts decisions from the syntax…" |
| 44 | Stub and empty functions | 200 `function f() {}`, `throw "todo"`, `return null` bodies | A function needs 3 statement lines of credited code: 0 points. ×1.111 against the same bodies without the headers (before ×1.102); the gain is the header lines as code | Low | test "stub, empty and one-line functions…" |
| 45 | One function split into many tiny ones | 400 statements as 400 one-statement functions | Tiny functions have too few statements: 0 points. ×1.061 against one big function (before ×1.053: header lines) | Low | test "splitting one function into many tiny ones…" |
| 46 | One function split into 3-statement ones | 400 statements as 133 functions of 3 | Each is a real function (3 points), so this pays some; function points are held to code/8. ×1.053 (before ×1.030) | **Low–Med** (an honest refactor looks the same; bounded by the density cap and the complexity cap) | Consider grading points by body size, or a higher statement threshold. Test "splitting one function…" |
| 47 | Wrappers that only forward | `function f(a, b) { return g(a, b); }`, wrapped over several lines | One statement: 0 points | Low | test "wrappers that only forward…" |
| 48 | Unused imports, names only in comments or strings | 60 imports from local modules, never called | A name scores only where the syntax uses it on added lines (calls, member access, JSX tags, types): 0 | Low | test "imports earn names only when…" |
| 49 | The same module imported from many files | 60 files each importing `../orders` | A module links once a day per player: 2 names, not 120 | Low | test "importing the same module…" |
| 50 | Re-export barrels | `export { a, b } from './x'`, `export * from` | Not imports: 0 | Low | same test |
| 51 | Importing, then deleting the uses | Import and use 60 names, then delete the uses the same day | The import line carries the names and stays: the 60 names keep 30 points. ×1.008, as links are at most a quarter of complexity | Low | Carry links on the use lines too |
| 52 | Gutting a credited function | Write functions, then delete their bodies | Losing any of a function's three carrying lines undoes it: ×1.000 | Low | test "gutting a function…" |
| 53 | Functions and imports across split pushes | Twenty pushes of whole functions vs one squash | Branch points are exact (a function of the line). Functions and links count only what one push shows whole, so pushes of whole functions equal their squash exactly (×1.000), and a function built up over several pushes counts less, never more | Low (undercounts work built up across pushes) | tests "a day split into twenty pushes…", "a function built up over several pushes…" |
| 54 | Generated code with functions and imports | Codegen output | Generated and vendored lines carry nothing: 0 | Low | test "generated and vendored code raise no complexity" |
| 55 | Difficulty bonus: split vs squash | Spread an edit of others' code over many pushes, or split a removal from its replacement | Per-file day tallies (added keys, removed keys of others') are functions of the day's net state; the multiplier is frozen at the file's first sight of the day. Split = squash exactly, including a removal and its replacement in separate pushes | Low | `rules/difficulty.test.ts` "a day split into pushes earns exactly its squash…" |
| 56 | Edit, then revert, the same day | Modify others' code for the bonus, then restore it | The removed keys come back to zero and the added ones leave: the bonus is taken back exactly (a partial revert takes its part) | Low | "a modification reverted the same day takes its bonus back exactly" |
| 57 | Re-editing one's own code | Rewrite lines written today, or one's own older lines, again and again | Lines added today cancel in the ledger before any context is read; blame names the pusher's older lines, which never count as others'. Flip-flopping one's own edit across six days: only the first day's edit of others' code pays | Low | "gives the pusher's own lines nothing…", gaming "flip-flopping one's own lines across days…" |
| 58 | Trivial edits to a core file | Reindent, requote, reword comments or trailing comments on 40 lines of a central file | Canonical keys: the same key is removed and added, a net change of zero. Comments are not code keys. 0 bonus | Low | "gives trivial whitespace or comment edits to a core file about nothing" |
| 59 | Re-wrapping or renaming others' code | Rewrap 1,200 old lines in 5 core files one argument per line, or rename a variable across them | These are modified code: the per-file rule (40 lines in full, then √) and the 2,000-a-day cap bound them. Rewrap ×1.46 → **×1.69** (+523 bonus lines); rename ×1.18 → **×1.44** (+476) | **Medium** (amplifies rows 5 and 41 by the multiplier, at most ~(40 + √n) × 2.2 lines a file) | Statement keys (row 5); or weight modified lines by how much of the old line survives. Gaming tests "re-wrapping others' old code…", "a mass rename…" |
| 60 | Fork farming | In a fork of a big project, replace upstream code in 40 files a day with new code | A fork's bonus pays only once its commits are in the upstream's default branch (row 72). Unmerged: ×2.93 → **×2.02**, the same as the code alone. Merged (the upstream accepted 40 files of rewrites): it pays as maintenance, a day late (row 71) | Low (needs the upstream's maintainers to merge it) | Gaming tests "farming a fork's upstream code…", "farming a fork whose pull requests are never merged…" |
| 61 | Bonus without code | Replace others' lines with copies of one line | A file's added tally counts each key once; the bonus is at most 3 × the day's code lines: ×1.003 (bonus 11 over 5 files) | Low | Gaming test "replacing others' code with copies…" |
| 62 | Delete here, add there | Delete others' lines in one place of a file and add unrelated code elsewhere in it | Pairing is per file and day, so this pays as an in-place edit (×1.36, the same as replacing in place). By design: in-place replacement is no harder, and a per-hunk pairing could not be squash-exact | Low–Med | Gaming test "deleting others' lines in one place…" |
| 63 | Forged history in a new repository | Backdate commits to 2015, invent 100 authors, push a "core file" | Line ages clamped to the repository's (source's) creation and to each author account's creation; accounts younger than 30 days are not authors; the gate holds M to ×1.5 without 2 independent contributors and 5 stars or 2 forks | Low–Med | Server test "a new repository with forged old history and sockpuppet authors earns little" |
| 64 | Sockpuppet contributors and stars | Old accounts (or spoofed author emails of real users) as "contributors", bought stars | Account age is checked (GitHub GraphQL `createdAt`, free in the same query); no cheap check of an account's other activity, so the star/fork gate carries the rest. A mirror names people by email and cannot check accounts | **Medium** (a farm of aged accounts that star and commit passes the gate; the bonus is still at most ×3.2 on modified lines and 2,000 lines a day) | Check contributors' activity elsewhere (a GraphQL `contributionsCollection` costs more points); weight stars by stargazer age |
| 65 | Context outages | Push when GraphQL fails, hoping for something better | Failure only lowers the bonus: batch, then single queries, then the mirror, then neutral (×1) | Low | Server tests "retries one file per query…", "is the fallback when GraphQL fails…" |
| 67 | Effort credit: tiny edits across many core files | Change 3 lines of others' code in each of 40 central files of a big project (or a fork of one) | Held to 15 files' worth a day (1,800 lines) plus the line bonus. **In a fork** it pays nothing until the edits are merged upstream: ×2.48 → **×1.11** (the code alone). **With push rights** to the big project: still ×2.48 the first day, but the same 40 files again the next days earn the effort credit one day in three (row 77): mean **×1.69** over 6 days (×2.48, 1.28, 1.28, 2.49, 1.28, 1.28); rotating 120 core files keeps ×2.50 | **Medium** (was High: a fork needs the upstream to merge 40 token edits; push rights to a 5-star, 2-contributor repository with established files, or 120 such files, are what remains) | Weight the effort credit by how much of the file the edit touches; lower FILE_CAP. Tests "is held to FILE_CAP files' worth…", gaming "tiny 3-line edits across 40 core files of a fork…", "tiny edits to the same 40 core files every day…" |
| 68 | Effort credit: split vs squash, and reverts | Cross the 3-line threshold over several pushes, or revert below it | The credit is a function of the file's day state (modified lines, frozen multiplier): awarded by the push that reaches 3, taken back exactly by a revert below 3. Split = squash | Low | Tests "is awarded by the push that reaches 3…", "split = squash across the threshold" |
| 69 | Effort credit on trivial or own edits | Whitespace, comments, one's own files | They never make modified lines of others' code, so never reach the threshold: 0 | Low | Test "whitespace-only edits and one's own files earn none" |
| 70 | Effort credit in a gated repository | A young repository with invented contributors | Scaled by (M − 1) / 2.2, and the gate holds M to ×1.5: 27 lines a file instead of 120 | Low–Med | Test "scales with the file's multiplier, so a gated file earns proportionally little" |
| 71 | Fork farming, with the effort credit | 40 files a day of upstream code replaced in a fork | Nothing pays until the commits are upstream: ×3.47 → **×2.02** unmerged (6 days: bonus 0 every day). If the upstream merges every day's work, each war carries the day before's bonus: mean **×2.97** over 6 days (×2.16, 3.49, 2.94, 2.93, 3.42, 2.90), the same 40 files' effort credit one day in three (a repository of one's own: ×3.11) | Low unmerged; Medium if a big project merges 40 files of rewrites a day | Gaming tests "farming a fork whose pull requests are never merged…", "a fork farm whose commits are all merged upstream…" |
| 72 | A fork whose pull request is never merged | Push hard-looking edits to a fork and never get them accepted | No bonus at push time; checked daily for 14 days, then given up on: **0 bonus** | Low | Server test "a fork whose pull request is never merged pays nothing, and is given up on after 14 days" |
| 73 | One merged commit carrying a push | Push one honest commit with 40 token edits; open a pull request with the honest commit only | A pull request counts only when it holds **all** of the diff's own commits; a compare finds a head only when everything before it is in the default branch; a patch id must be the whole diff's | Low | Server test "a merged pull request holding only some of a push's commits does not carry the rest" |
| 74 | Forged merge events | Sign a `pull_request` "merged" delivery with one's own hook secret | The member signs their own deliveries, so the event is never trusted: it only makes the member's pending rows for that repository due, and the check asks GitHub | Low | Server test "a webhook's merged pull request wakes the checks, and is never trusted on its own" |
| 75 | Reused branch names and look-alike squashes | An old merged pull request from the same branch name, or a squash of other content | Commits must match exactly; a patch id is compared only with merges after the push and must equal the whole diff's (no line numbers or whitespace) | Low | Server test "finds a squash merge by patch id…" (the other-content squash pays nothing) |
| 76 | Banking merges | Hold two weeks of fork pull requests, get them merged at once, pour them into one war | At most one day's caps (3,800 lines) of upstream reward a UTC day per player; the rest waits for the next days; a war's code knee and cap still bound it (never above an honest capped day, ×4.6) | Low | Server test "banked pull requests merged together arrive a day's caps at a time…" |
| 77 | Repeat targets | Token edits to the same core file every day | Effort credit at most once per player per 3 days per file (`EFFORT_REPEAT_DAYS`); keyed by the close of earlier days, so split = squash. The line bonus still pays daily. 40 files daily: one day in three (row 67) | **Medium** (rotating three sets of files escapes it: the dampening prices the attack, it does not stop it) | Tests "a file earns effort credit at most once per player per 3 days…", "is keyed by the close of earlier days…" |
| 78 | Edit, earn, revert | Make the edit for the credit, revert it later | Same day: the credit is taken back exactly (clawback, rows 56 and 68). The next day: day memory makes the revert free and the credit stays, exactly as a survive-the-day rule would decide (the edit did survive the day). See *Survival or clawback* | Low–Med (a revert just after a war's reset, before UTC midnight, lands in the next war, whose ledger never goes below 0; as for every line, row 27) | Gaming test "an edit reverted before the day ends keeps nothing…" |
| 79 | Merging one's own pull requests | A maintainer of the upstream merges their own fork's pull requests | Pays exactly as editing the upstream directly would (rows 67 and 77 apply) | Low–Med | — |
| 66 | Choosing which files get context | Touch many files so the bonus covers more | Only the 5 most changed source files of a diff that remove lines get context; the others stay ×1. The frozen multiplier is per file and day | Low | Server test "never fetches context for assets, lockfiles…" |

## The difficulty bonus, measured

The bonus (DESIGN.md, *The difficulty bonus*) pays `f(modified) × (M − 1)` extra code lines for edits to others' established code, M at most ×3.2 (×1.5 behind the repository gate), the first 40 modified lines of a file in full and a square root beyond, at most 3 × the day's code and 2,000 lines a day.

On the hand-built fixtures (`server/testing/difficultyFixtures.ts`, `scripts/measure-difficulty.ts`), through the same pipeline ingestion runs:

| Push | Code | Removed | Bonus | Credited | Before |
|---|---|---|---|---|---|
| vite-like fix: 5 lines in 4 files of 212–3,688 lines (css.ts ×3.2, build.ts ×3.2, asset.ts ×3.2, sourcemap.ts ×2.6) | 5 | 5 | 10 | **15** | 5 |
| greenfield: 500 new lines in 6 new files of a repository made this week | 500 | 0 | 0 | 500 | 500 |

A maintainer in a war (`MAINTAINERS=1 DAYS=128 pnpm tsx scripts/diagnose-war.ts 4 0`: one maintainer pushing small fixes to others' code in a big repository, median 15 lines a push, against three greenfield pushers, everyone on the same random workdays and push rates; fair share 25%):

| | Maintainer wins | Maintainer's budget / greenfield median | Code a day (maintainer / greenfield) | Bonus a day |
|---|---|---|---|---|
| No bonus | 2% | 0.24 | 529 / 2,786 | 0 |
| The bonus as built (M ≤ 3.2) | 4% | 0.39 | 513 / 2,709 | 525 |
| (M − 1) tripled, sensitivity only (64 days) | 5% | 0.63 | 487 / 2,776 | 1,526 (held to 3 × code) |

**The effort credit** (DESIGN.md, *The effort credit*), tuned on the same simulation (128 seeded days, the same days for every setting; the bonus also counts toward veteran ranks). Maintainer wins (fair share 25%), by its push rate that day, and its budget against the greenfield median:

| FILE_CREDIT | FILE_CAP | Wins | < 1.5 pushes/h | 2–4 /h (normal day) | ≥ 3 /h | Budget / greenfield | Bonus a day |
|---|---|---|---|---|---|---|---|
| 0 (line bonus only) | — | 4% | — | 2% | — | 0.39 | 525 |
| 30 | 15 | 7% | 4% | 4% | 19% | 0.50 | 883 |
| 60 | 15 | 7% | 0% | 7% | 19% | 0.64 | 1,255 |
| 90 | 15 | 9% | 2% | 5% | 25% | 0.74 | 1,579 |
| **120** | **15** | **12%** | 7% | **14%** | 19% | **0.83** | 1,974 |
| 120 | 10 | 10% | 4% | 7% | 19% | 0.72 | 1,736 |
| 120 | 20 | 12% | 7% | 14% | 22% | 0.87 | 1,974 |
| 150 | 15 | 13% | 4% | 12% | 22% | 0.90 | 2,333 |
| 200 | 20 (no veteran change) | 12% | 5% | 15% | 20% | 1.07 | 2,948 |
| 240 | 20 (no veteran change) | 14% | 7% | 12% | 20% | 1.20 | 3,629 |

(30 is from a run without the veteran change, 83 days; 60–150 are 128 days with it; 200 and 240 are without it, 120 days.) Win share plateaus at 12–15% even when the maintainer's budget passes the greenfield median: the winner is usually the day's top budget, and a maintainer's capped credit rarely tops a heavy greenfield day. A low-activity maintainer (< 1.5 pushes an hour) still loses to greenfield pushers almost always (7% at the chosen setting), as intended. With no maintainers the room is unchanged: identical day for day over 128 days (top committer wins 61%, 64% of days conquered, conquest median 15.7 h, first capture 14.4 h).

The line bonus alone lifts a maintainer's army by about 60%, but not to a fair share: at the same push rate a greenfield pusher writes five times the lines, and a multiplier on modified lines (at most ×3.2, and 3 × code) cannot close a gap that wide. Parity would need credit that is not proportional to lines for small hard changes.

Attacks, each as strength over an honest day (1500 lines, 30 files, tests and comments) plus the attack, pushed with a ×3.2 context; *before* is the same push with no bonus:

| Attack | Before | Now | Bonus lines |
|---|---|---|---|
| Re-wrap 1,200 of others' old lines in 5 core files | 1.460 | 1.686 | 523 |
| Rename a variable across them | 1.185 | 1.444 | 476 |
| Replace others' lines with copies of one line (5 files) | 1.003 | 1.003 | 11 |
| Fork farming: 40 files of others' code replaced with new code | 2.020 | 2.925 | 2,000 (cap) |
| Delete others' lines in one place, add code elsewhere in the file | 1.138 | 1.363 | 380 |
| The same, replaced in place (honest) | 1.138 | 1.363 | 380 |
| Whitespace, quotes, comments on 40 core lines | 1.000 | 1.000 | 0 |

With the effort credit (FILE_CREDIT 120, FILE_CAP 15), the same attacks:

| Attack | Before (no bonus) | Line bonus only | Line bonus + effort credit | Bonus lines |
|---|---|---|---|---|
| Re-wrap 1,200 of others' old lines in 5 core files | 1.460 | 1.686 | 2.024 | 1,123 |
| Rename a variable across them | 1.185 | 1.444 | 1.924 | 1,076 |
| Copies of one line in 5 files | 1.003 | 1.003 | 1.003 | 11 |
| Fork farming: 40 files of replaced code | 2.020 | 2.925 | 3.471 | 3,800 (both caps) |
| Tiny 3-line edits across 40 core files (120 lines) | 1.113 | — | **2.477** | 2,026 (effort cap) |
| Delete here, add there (5 files) | 1.138 | 1.363 | 1.813 | 980 |
| For scale: an honest day at the code cap | — | — | 4.6 | — |
| Own lines rewritten, today's or older | — | — | 0 |

## The complexity pass, measured

Branch points were a keyword count; now complexity is `branch points + 3 × new functions + ½ × imported names used`, read from syntax trees (DESIGN.md, *Sorting lines*). At the same time armies became twice the size (every budget weight and every unit count doubled; DESIGN.md, *How many soldiers*), so "before" and "now" below are each strength over the same honest day under its own rules.

**On this repository's last 81 commits** (`git show -U3` per commit through `measurePush`, each on a fresh ledger): 23,134 code lines; the keyword count found 5,636 branch points and the syntax tree 5,580; 729 new functions (2,187 points); 454 imported names used from local modules (227 points). Complexity 7,994, or 7,727 after the caps (0.33 a line). That is 1.42 points for each keyword branch point, so the budget's complexity term and the Knight, Troll and Dragon thresholds are the old branch ones × 1.42. Links are 2.8% of complexity. b0f0ae9 (ring conquest visuals and HUD): 1,770 lines, 510 → 507 branch points, 32 functions (+96), 29 names from 19 local modules (+14.5): complexity 617.5.

Each row is an honest day (1500 lines in 30 files, with tests and comments; its functions run 10 to 40 statements, about one every 27 lines, as in real code) plus the attack, as strength over the honest day plus the reference (the same code written plainly, or nothing). On a denser synthetic day (functions of 3 to 8 statements) complexity already sits at its cap, so none of these attacks adds any; only their extra lines of code count.

| Attack | Before | Now | Complexity, attack vs reference (branches / function points / names) |
|---|---|---|---|
| 200 stub and empty functions (vs the bodies alone) | 1.102 | 1.111 | 356 / 96 / 0 vs the same |
| One function split into 400 one-statement ones | 1.053 | 1.061 | 356 / 96 / 0 vs 356 / 99 / 0 |
| One function split into 133 three-statement ones | 1.030 | **1.053** | 356 / 324 / 0 vs 356 / 99 / 0 |
| 150 forwarding wrappers | 1.044 | 1.035 | 356 / 96 / 0 |
| 60 unused imports | 1.035 | 1.035 | 0 names |
| Imported names only in comments and strings | 1.035 | 1.035 | 0 names |
| The same module imported from 60 files | 1.048 | 1.032 | 2 names |
| 60 imports whose names are used (honest) | 1.033 | 1.041 | 120 names |
| A re-export barrel of 50 modules | 1.035 | 1.035 | 0 names |
| `if (true)` on 1500 lines (vs the same lines plain) | 1.032 | 1.005 | equal |
| 20-term `&&` chains on 1500 lines | 0.550 | 0.546 | — |
| Identifiers named `case`, `if`, `while` on 1500 lines | 1.022 | 1.000 | equal |
| Generated code with functions and imports | 1.000 | 1.000 | 0 |
| Add then delete 2000 lines with imports, three times | 0.953 | 0.953 | 0 |
| Functions gutted after they were credited | 1.000 | 1.000 | undone |
| Imports credited, their uses deleted after | 1.000 | 1.008 | 120 names stay |
| 20 pushes of whole functions vs their squash | 1.000 | 1.000 | equal |
| For scale: 1500 more honest lines; an honest day at the cap | 1.819, 3.835 | 1.832, 3.819 | — |

The older vectors, on the same honest day, move by at most about 1% either way (the doubled army rounds to pairs): rewrapping 1200 old lines 1.519 → 1.531, splitting them after `=` 1.439 → 1.450, a 50k paste 3.318 → 3.320, many tiny files 1.066 → 1.045, mass deletion 1.346 → 1.350, duplicates, tables, switch arms, style sheets, spam and churn within ±0.01.

Two residuals: splitting code into functions of exactly three statements pays (each is a real function), held to one function per 24 lines (`code/8` function points), and an import keeps its names after its uses are deleted (links are at most a quarter of complexity). Both stay under the complexity cap of one point per two lines.

## The filler pass, measured

The army preview of this repository's commit b0f0ae9 (ring conquest visuals and HUD: canvas renderers, JSX, style sheets) reported **907 lines of filler** and a ragged note ("35% of lines were filler"). Almost none of it was padding:

- 361 lines with no words at all: `}`, `);`, `})}`, `[-70, -118],`, strings on their own line
- 248 lines with one word of two letters or more: `label.x = x;`, `v.sampleTick = -1;`, `y += len / 6;`, `</span>`, `return (`, `margin: 0;`
- 107 "duplicate" comments: every single-line `/** … */` doc comment was keyed as the empty comment (the comment stripper removed the comment itself), plus `/**` and `*/` frames
- 152 repeated code lines across files: `ctx.beginPath();` (7 copies), `display: flex;`, the same import in two components
- 21 style-sheet selectors past the shape cap (`.victory-line {`), 13 lines of JSX prose, 8 JSX comments `{/* … */}` keyed as `{}`

The missing-patch estimate was not involved: no file of that commit is near GitHub's limit, and estimated additions count as code, never filler (the preview now says "estimated").

After this pass the same commit measures **0 filler**: 1770 code lines (was 1660), 269 comment lines (was 159), and 681 lines left uncounted (401 structure, 160 repeats, 45 data, 35 fragments, 27 near-duplicates, 13 prose), within the allowance of 885. Over this repository's last 80 commits, 36 were ragged from filler before and 2 are now: a 31-line commit that is mostly SVG path data (−15%, was −12%) and a 3400-line art commit (−0.1%, was −5.7%).

Each row is an honest day plus the attack, as strength over the honest day alone (as below). *Same push* rows put the attack in the honest day's push, where the allowance could absorb it.

| Attack | Before | Now | Filler lines (before → now) |
|---|---|---|---|
| Exact duplicates (2000 copies) | 0.907 | 0.857 | 2199 → 2000 |
| Rewrap 1200 old lines one argument per line | 1.635 | 1.548 | 2356 → 1621 |
| Split 1200 old lines after `=` | 1.345 | 1.345 | 595 → 56 |
| 3000 punctuation-only lines | 0.884 | 0.857 | 3199 → 3000 |
| Data table (2000 rows) | 0.907 | 0.857 | 2199 → 2000 |
| Switch arms (2000) | 0.908 | 0.857 | 2191 → 1988 |
| CSS sprite rules (2000) | 0.908 | 0.857 | 2191 → 1968 |
| Near-duplicates via comments (500) | 0.987 | 0.949 | 698 → 499 |
| Add then delete 2000 lines, three times | 0.963 | 0.944 | 994 → 530 |
| Copy to 3 repositories (vs once) | 0.877 | 0.850 | — |
| `&&` chains, `if (true)`, tiny files, pastes, mass deletion, test and comment spam | unchanged | unchanged | — |
| Same push: 3000 punctuation lines | 0.884 | 0.857 | 3199 → 2361 |
| Same push: 2000 duplicates, or a 2000-row table | 0.907 | 0.857 | 2199 → 1361 |
| Same push: rewrap 1200 old lines | 1.618 | 1.615 | 2356 → 982 |
| Same push: 650 punctuation lines, or a 600-row table | 0.974, 0.978 | 1.000 | 849 → 11, 799 → 0 |

An honest day (1500 lines, 30 files, tests and comments) is unchanged at ×1.000 with 0 filler (was 199). An honest day past the cap is ×4.583 (was ×4.615): the lines past the cap are filler and fray it a little more.

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

## Changes in the difficulty-bonus pass

- `src/rules/difficulty.ts` (new, pure): the multiplier, the per-file credit rule, the repository gate, line-age clamping, blame and history into a file's context
- `src/rules/ledger.ts`: `measurePush` is `preparePush` (pure, worker-safe) then `applyPush` (the ledger); per-file day tallies of modified code, the frozen multiplier, the per-file and daily bonus; `PushDelta.bonus` and `difficulty`
- `src/server/difficulty.ts` (new): REST facts per repository per day, one GraphQL query per diff, single-file retries, the mirror, neutral; `src/server/mirror.ts` (new): the bare partial-clone mirror
- `src/server/github.ts`: GraphQL with its own rate-limit bucket, repository facts and languages, commit bases and author emails
- `src/server/parsePool.ts`, `parseWorker.ts` (new): parsing in worker threads
- `src/sim/muster.ts`: `bonus` in the ledger and the budget's code term, through the knee and cap, at most `BONUS_PER_CODE` (3) × code; push inputs and replays carry `bonus` (written only when nonzero)
- grammars vendored in `assets/grammars/` (`scripts/vendor-grammars.ts`), the grammar packages dropped from the dependencies

## Changes in the complexity pass

- `src/rules/complexity.ts` (new, server only): tree-sitter parsing (`web-tree-sitter` and the grammars' `.wasm`, loaded lazily) for JavaScript, TypeScript, TSX, Python, Go, Rust, Java, Kotlin and Ruby:
  - `lineBranches`: a line's decision points from its own syntax tree, set in the smallest code that completes it; constant conditions, strings, comments and identifiers do not count
  - `analyzeFile`: each hunk's new side parsed as a fragment; definitions wholly on added lines with their statement lines, and local imports with the names the added code uses
  - budgets: 1 MB of parsed text a push (hunks and lines), 250 ms a file; past them, keywords
- `src/rules/ledger.ts`: complexity rides on credited code keys (`WEIGHT`, `FUNCTION_OF`, `FUNCTION` and the day's `LINKS` scopes); `PushDelta` gains `functions`, `links` and `modules`
- `src/sim/muster.ts`: `complexityOf` (links at most a quarter, function points at most `code/8`, the whole at most `code/2`); the budget's complexity term; Knights, Trolls and Dragons from complexity; armies twice the size, counts in pairs and paid in pairs
- `src/sim/stats.ts`, `src/sim/world.ts`, `src/sim/council.ts`: the room holds 4000 soldiers and an army 320 slots; walls 75 HP a slot; a tower looses up to 24 bolts; sieges wait for 50 soldiers (20 for breached walls)
- push inputs, replays and snapshots carry `functions` and `links` (older ones decode with none); the preview, the chronicle, the digest's Architect and the HUD's ledger show complexity and its parts

## Changes in the filler pass

- `src/rules/ledger.ts`:
  - `fillerKind` replaces the two-letter-word rule: structure, fragments and literal data are told apart, and short statements with one-letter names count as code
  - comments are keyed by their text; comment frames count as blank lines
  - `PushDelta.uncounted`: every uncounted added line by kind, with the files holding most of each
  - filler is what a push leaves uncounted beyond `FREE_PER_CODE` (0.5) per new credited code or test line plus `FREE_PER_STYLE` (2.5) per credited style-sheet line, plus lines past the daily cap; new code is measured against the day's high-water mark
- `src/rules/classify.ts`: `{/* … */}` in JSX is a comment
- `src/sim/muster.ts`: `FILLER_RAMP` is 15% to 50% (was 30% to 80%)
- `src/server/preview.ts` and `src/client/pages/Preview.tsx`: the reasons lead with the army size and what each part of the work added to it, say how it was spent on specialists, and name the kind and files of uncounted lines and of filler

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
