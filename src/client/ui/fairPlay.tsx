import { Cat, type Ledger, type PlayerState } from '../../sim/api.ts';
import { armyQuality, VETERAN_CODE, VETERAN_FILES } from '../../sim/muster.ts';
import { compact } from './format.ts';

const RANKS = ['', 'I', 'II', 'III'];

export function powerLabel(power: number): string {
  return `×${power.toFixed(2)}`;
}

/** A player's standing as an army: veteran rank, or ragged with the reasons why. */
export function ArmyMark({ player }: { player: PlayerState }) {
  const q = armyQuality(player.ledger);
  const penalties = q.notes.filter((n) => n.effect < 0);
  if (q.veterancy > 0 && penalties.length === 0) {
    return (
      <span className="tag tag-gold army-mark" title={`Veteran rank ${RANKS[q.veterancy]}: soldiers muster ${powerLabel(q.power)} as strong`}>
        Veteran {RANKS[q.veterancy]} <span className="num">{powerLabel(q.power)}</span>
      </span>
    );
  }
  if (penalties.length > 0) {
    return (
      <span className="tag tag-ragged army-mark" title={`Ragged army, ${powerLabel(q.power)}: ${penalties.map((n) => n.text).join('; ')}`}>
        Ragged <span className="num">{powerLabel(q.power)}</span>
      </span>
    );
  }
  return null;
}

/** What the next veteran rank still needs, or null at the top rank. */
export function nextRank(ledger: Ledger): { rank: number; code: number; files: number } | null {
  const now = armyQuality(ledger).veterancy;
  if (now >= VETERAN_CODE.length) return null;
  return {
    rank: now + 1,
    code: Math.max(0, VETERAN_CODE[now]! - (ledger.lines[Cat.Code] ?? 0)),
    files: Math.max(0, VETERAN_FILES[now]! - ledger.files),
  };
}

function nextRankText(ledger: Ledger): string {
  const next = nextRank(ledger);
  if (!next) return ' Top veteran rank reached.';
  const needs = [next.code > 0 ? `${compact(next.code)} more lines of real code` : '', next.files > 0 ? `${next.files} more source ${next.files === 1 ? 'file' : 'files'}` : '']
    .filter(Boolean)
    .join(' and ');
  return needs ? ` Veteran rank ${RANKS[next.rank]} needs ${needs}.` : '';
}

const ROWS: { label: string; value: (l: Ledger) => number; hint?: string }[] = [
  { label: 'Code', value: (l) => l.lines[Cat.Code] ?? 0, hint: 'Counted code lines: no comments, blanks, filler or undone work' },
  { label: 'Files', value: (l) => l.files, hint: 'Source files touched today, each counted once' },
  { label: 'Branch points', value: (l) => l.branches, hint: 'Decisions read from the syntax: if, loops, case arms, catch, ternaries, &&, ||' },
  { label: 'New functions', value: (l) => Math.round((l.functions ?? 0) / 3), hint: 'Functions, methods and classes with at least three statements: 3 points of complexity each' },
  { label: 'Imported names', value: (l) => l.links ?? 0, hint: 'Names used from newly imported modules of your own repository: half a point each, at most a quarter of complexity' },
  { label: 'Removed', value: (l) => l.lines[Cat.Removed] ?? 0, hint: 'Deleted source lines' },
  { label: 'Tests', value: (l) => l.lines[Cat.Test] ?? 0 },
  { label: 'Comments', value: (l) => l.lines[Cat.Comment] ?? 0 },
  { label: 'Docs', value: (l) => l.lines[Cat.Docs] ?? 0 },
  { label: 'Config', value: (l) => l.lines[Cat.Config] ?? 0 },
  { label: 'Churn', value: (l) => l.churn, hint: 'Lines that cancelled earlier work today: they count for nothing' },
  { label: 'Filler', value: (l) => l.filler, hint: 'Duplicates, punctuation-only lines and pasted tables: they count for nothing' },
];

/** Today's contribution, the quality it buys, and the road to the next veteran rank. */
export function LedgerPanel({ player }: { player: PlayerState }) {
  const ledger = player.ledger;
  const q = armyQuality(ledger);
  return (
    <section className="ledger" aria-label="Today's ledger">
      <h3 className="ledger-title">
        Today's ledger <ArmyMark player={player} />
      </h3>
      <dl className="ledger-grid">
        {ROWS.map((r) => (
          <div key={r.label} className="ledger-row" title={r.hint}>
            <dt>{r.label}</dt>
            <dd className="num">{compact(r.value(ledger))}</dd>
          </div>
        ))}
      </dl>
      {q.notes.length > 0 && (
        <ul className="ledger-notes">
          {q.notes.map((n) => (
            <li key={n.kind} className={n.effect < 0 ? 'note-bad' : 'note-good'}>
              <span className="num">{n.effect > 0 ? '+' : ''}{Math.round(n.effect * 100)}%</span> {n.text}
            </li>
          ))}
        </ul>
      )}
      <p className="ledger-foot muted">
        Soldiers muster at <strong className="num">{powerLabel(q.power)}</strong> strength.
        {nextRankText(ledger)}
      </p>
    </section>
  );
}
