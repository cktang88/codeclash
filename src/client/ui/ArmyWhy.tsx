// "Why this army", read at a glance: the size and power as big figures, a stacked bar and a small
// table of where the size came from, the soldiers it was spent on, the veteran rank, and what did
// not count. Every figure comes from the server's `PreviewWhy`; prose lives only in glosses
// (keyboard-reachable tooltips). Styles in styles/preview.css.

import { useId, useRef, useState, type ReactNode } from 'react';
import type { PreviewSource, PreviewUnit, PreviewWhy } from '../../protocol.ts';
import { STATS } from '../../sim/stats.ts';
import { Icon, UnitIcon } from './icons.tsx';
import {
  amountText,
  barLabel,
  messengerText,
  nearMissText,
  powerLabel,
  powerText,
  powerTone,
  rankBars,
  rankName,
  ROMAN,
  segments,
  SIZE_GLOSS,
  SOURCE_NAME,
  sourceGloss,
  uncountedLine,
  VETERAN_GLOSS,
} from './why.ts';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * A word with a gloss: a button that shows a short note on hover or focus, kept inside the viewport.
 * Escape hides it; the note stays while the pointer is over it.
 */
export function Gloss({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    const el = tip.current;
    if (!el || typeof window === 'undefined') return;
    el.style.setProperty('--shift', '0px');
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const dx = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
    el.style.setProperty('--shift', `${Math.round(dx)}px`);
  };
  return (
    <span className={`gloss${className ? ` ${className}` : ''}`} data-open={open || undefined} onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="gloss-mark"
        aria-describedby={id}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {label}
      </button>
      <span role="tooltip" id={id} ref={tip} className="gloss-tip">
        {children}
      </span>
    </span>
  );
}

/** Lines of a gloss, one paragraph each. */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className="gloss-line">
          {l}
        </span>
      ))}
    </>
  );
}

/** The header row: "78 soldiers + 14 support", then "Power ×1.26" with what makes it. */
export function WhyHead({ why }: { why: PreviewWhy }) {
  return (
    <div className="why-head">
      <p className="why-size">
        <span className="why-big num">{fmt(why.size)}</span>{' '}
        <Gloss label={why.size === 1 ? 'soldier' : 'soldiers'} className="why-unit-word">
          {SIZE_GLOSS}
        </Gloss>
        {why.support > 0 && (
          <span className="why-support-sum">
            {' + '}
            <span className="why-mid num">{fmt(why.support)}</span> support
          </span>
        )}
      </p>
      <div className="why-power">
        <span className="why-power-word">Power</span> <span className={`why-big num${why.parts.some((p) => p.effect < 0 && p.kind !== 'veteran') ? ' bad' : ''}`}>{powerText(why)}</span>
        {why.parts.length > 0 && (
          <ul className="why-seals" aria-label="What sets the power">
            {why.parts.map((p) => (
              <li key={p.kind} className={`why-seal tone-${powerTone(p)}`}>
                <Gloss label={powerLabel(p)}>{p.kind === 'veteran' ? <Lines lines={[p.detail, VETERAN_GLOSS]} /> : p.detail}</Gloss>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One stacked bar of the size by source; a fork's pending credit as a ghost beyond it. */
function SizeBar({ why }: { why: PreviewWhy }) {
  const { parts, ghost } = segments(why);
  if (parts.length === 0 && !ghost) return null;
  return (
    <div className="why-bar" role="img" aria-label={barLabel(why)}>
      {parts.map((s) => (
        <span key={s.key} className={`why-seg seg-src-${s.key}`} style={{ flexGrow: s.size }}>
          {s.label && <span className="why-seg-label num">{s.label}</span>}
        </span>
      ))}
      {ghost && (
        <span className="why-seg seg-src-pending" style={{ flexGrow: ghost.size }}>
          {ghost.label && <span className="why-seg-label num">{ghost.label}</span>}
        </span>
      )}
    </div>
  );
}

function SourceRow({ s }: { s: PreviewSource }) {
  const zero = !s.pending && s.size === 0;
  return (
    <tr className={`src-${s.key}${s.pending ? ' is-pending' : ''}${zero ? ' is-zero' : ''}`}>
      <th scope="row" className="why-src">
        <span className={`why-swatch seg-src-${s.key}`} aria-hidden />
        {s.pending && <Icon name="clock" size={15} className="why-hourglass" />}
        <Gloss label={SOURCE_NAME[s.key]}>
          <Lines lines={sourceGloss(s)} />
        </Gloss>
      </th>
      <td className="why-amount">
        <span className="why-amount-text">{amountText(s)}</span>
        {s.chips.map((c) => (
          <span key={c} className="why-chip">
            {c}
          </span>
        ))}
      </td>
      <td className="num why-add">
        {s.pending ? (
          <span className="why-later" title="Not counted until merged upstream">
            +{fmt(s.size)}
          </span>
        ) : s.size > 0 ? (
          `+${fmt(s.size)}`
        ) : (
          <span aria-label="nothing">—</span>
        )}
      </td>
    </tr>
  );
}

/** "Where the size came from": the bar, then a source | amount | +size table. */
function Sources({ why }: { why: PreviewWhy }) {
  const messenger = messengerText(why);
  return (
    <section className="why-sec why-sources">
      <h4 className="why-title">Where the size came from</h4>
      <SizeBar why={why} />
      {why.sources.length > 0 && (
        <table className="why-table">
          <caption className="sr-only">Where the army size came from</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Amount</th>
              <th scope="col" className="num">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {why.sources.map((s) => (
              <SourceRow key={s.key} s={s} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Army size
              </th>
              <td className="num">{fmt(why.sources.some((s) => !s.pending && s.size > 0) ? why.size : 0)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {messenger && <p className="why-fine">{messenger}</p>}
      {why.notes.map((n) => (
        <p key={n} className="why-fine">
          {n}
        </p>
      ))}
    </section>
  );
}

function UnitCell({ u }: { u: PreviewUnit }) {
  const s = STATS[u.kind]!;
  return (
    <li className={`why-unit wt-${s.tier}`}>
      <Gloss
        label={
          <>
            <UnitIcon kind={u.kind} size={26} title="" className="why-unit-icon" />
            <span className="why-unit-text">
              <span className="why-unit-name">
                {u.count === 1 ? s.name : s.plural} <span className="num">×{fmt(u.count)}</span>
              </span>
              <span className="why-unit-why">{u.reason}</span>
            </span>
          </>
        }
      >
        {u.detail}
      </Gloss>
    </li>
  );
}

/** "How it was spent": a cell per kind, support apart, near misses in a fine line. */
function Spent({ why }: { why: PreviewWhy }) {
  if (why.units.length === 0 && why.supportUnits.length === 0 && why.nearMisses.length === 0) return null;
  return (
    <section className="why-sec why-spent">
      <h4 className="why-title">How it was spent</h4>
      {why.units.length > 0 && (
        <ul className="why-units">
          {why.units.map((u) => (
            <UnitCell key={u.kind} u={u} />
          ))}
        </ul>
      )}
      {why.supportUnits.length > 0 && (
        <div className="why-support">
          <span className="why-support-word">Support</span>
          <ul className="why-units is-support">
            {why.supportUnits.map((u) => (
              <UnitCell key={u.kind} u={u} />
            ))}
          </ul>
        </div>
      )}
      {why.nearMisses.length > 0 && <p className="why-fine">{why.nearMisses.map(nearMissText).join(' · ')}</p>}
    </section>
  );
}

/** "Rank": the veteran rank and two small bars toward the next. */
function Rank({ why }: { why: PreviewWhy }) {
  const r = why.rank;
  const next = r.rank < r.max ? `Veteran ${ROMAN[r.target.rank]}` : null;
  return (
    <section className="why-sec why-rank">
      <h4 className="why-title">Rank</h4>
      <p className={`why-rank-name${r.rank > 0 ? ' is-veteran' : ''}`}>
        {r.rank > 0 && <Icon name="shield" size={16} />}
        <Gloss label={rankName(r)}>{VETERAN_GLOSS}</Gloss>
        {next && <span className="why-rank-next"> · toward {next}</span>}
      </p>
      <div className="why-meters">
        {rankBars(r).map((b) => (
          <div key={b.what} className={`why-meter-row${b.met ? ' is-met' : ''}`}>
            <span className="why-meter-what">{b.what}</span>
            <span
              className="why-meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={b.need}
              aria-valuenow={Math.min(b.have, b.need)}
              aria-label={`${b.what} toward ${next ?? rankName(r)}: ${fmt(b.have)} of ${fmt(b.need)}`}
            >
              <span className="why-meter-fill" style={{ width: `${Math.round(b.fill * 100)}%` }} />
            </span>
            <span className="num why-meter-num">
              {fmt(b.have)}/{fmt(b.need)}
              {b.met && <span className="why-met"> ✓</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Didn't count": one line, opening to the detail by kind; red ink when filler is penalised. */
function Uncounted({ why }: { why: PreviewWhy }) {
  const line = uncountedLine(why);
  if (!line) return null;
  return (
    <section className={`why-sec why-uncounted${line.penalised ? ' is-bad' : ''}`}>
      <h4 className="why-title">Didn’t count</h4>
      <details className="why-fold">
        <summary>
          {line.penalised && <Icon name="skull" size={15} />}
          {line.text}
        </summary>
        <ul>
          {why.uncounted.kinds.map((k) => (
            <li key={k.kind}>{k.text}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The sections under the header: sources, spending, rank, and what did not count; the prose in one gloss. */
export function WhyBody({ why, reasons }: { why: PreviewWhy; reasons: readonly string[] }) {
  return (
    <div className="why-body">
      <Sources why={why} />
      <Spent why={why} />
      <Rank why={why} />
      <Uncounted why={why} />
      {reasons.length > 0 && (
        <p className="why-fine why-scribe">
          <Gloss label="The scribe’s full notes">
            <Lines lines={reasons} />
          </Gloss>
        </p>
      )}
    </div>
  );
}

/** The whole card: header, then `children` (the formation), then the sections, folded unless `open`. */
export function ArmyWhy({ why, reasons, open = false, children }: { why: PreviewWhy; reasons: readonly string[]; open?: boolean; children?: ReactNode }) {
  return (
    <section className="why" aria-label="Why this army">
      <WhyHead why={why} />
      {children}
      <details className="why-more" open={open}>
        <summary>
          <span className="why-more-word">Why this army</span>
        </summary>
        <WhyBody why={why} reasons={reasons} />
      </details>
    </section>
  );
}
