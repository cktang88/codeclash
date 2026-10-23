import { useMemo, useState, type ReactNode } from 'react';
import type { RosterEntry } from '../../protocol.ts';
import { KIND_COUNT } from '../../sim/api.ts';
import type { ChronicleEntry, ChronicleKind } from '../../sim/chronicle.ts';
import { STATS } from '../../sim/stats.ts';
import { ago, clock } from '../ui/format.ts';
import { EventIcon, UnitIcon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';
import { hueVar } from '../ui/codex.tsx';
import { PurposeTag } from '../ui/PurposeTag.tsx';
import type { Purpose } from '../../sim/api.ts';

export type ChronicleFilter = 'all' | 'mine' | 'big';

export const BIG_MOMENTS = new Set<ChronicleKind>(['sack', 'monolith', 'dragon', 'champion', 'clash', 'leader', 'cry', 'capture', 'rebuilt']);
const SHOWN = 160;

const ids = new WeakMap<ChronicleEntry, number>();
let nextId = 1;
function keyOf(e: ChronicleEntry): number {
  let id = ids.get(e);
  if (id === undefined) {
    id = nextId++;
    ids.set(e, id);
  }
  return id;
}

export function filterChronicle(entries: readonly ChronicleEntry[], filter: ChronicleFilter, viewerP: number | null): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length < SHOWN; i--) {
    const e = entries[i]!;
    if (filter === 'mine' && (viewerP === null || (e.p !== viewerP && e.q !== viewerP))) continue;
    if (filter === 'big' && !BIG_MOMENTS.has(e.kind)) continue;
    out.push(e);
  }
  return out;
}

/** Splits chronicle text so @logins render in their army's color. */
export function colorize(text: string, roster: readonly RosterEntry[]): ReactNode[] {
  const parts = text.split(/(@[A-Za-z0-9][A-Za-z0-9-]*)/g);
  return parts.map((part, i) => {
    if (!part.startsWith('@')) return part;
    const r = roster.find((x) => x.login.toLowerCase() === part.slice(1).toLowerCase());
    if (!r) return part;
    return (
      <strong key={i} className="who" style={hueVar(r.hue)}>
        {part}
      </strong>
    );
  });
}

/** Muster lines spell out the platoon's soldiers; the chips show them, so the list is trimmed from the text. */
export function entryText(e: ChronicleEntry): string {
  if (e.kind !== 'muster' || !e.units) return e.text;
  const cut = e.text.lastIndexOf(' musters: ');
  return cut < 0 ? e.text : `${e.text.slice(0, cut)} musters:`;
}

export function UnitChips({ units, size = 15 }: { units: readonly number[]; size?: number }) {
  const chips = [];
  for (let k = 0; k < KIND_COUNT; k++) {
    const n = units[k] ?? 0;
    if (n <= 0) continue;
    chips.push(
      <span key={k} className="unit-chip" title={`${n} ${n === 1 ? STATS[k]!.name : STATS[k]!.plural}`}>
        <UnitIcon kind={k} size={size} title="" />
        <span className="num">{n}</span>
      </span>,
    );
  }
  return <span className="unit-chips">{chips}</span>;
}

export function Chronicle({ entries, viewerP, now }: { entries: readonly ChronicleEntry[]; viewerP: number | null; now: number }) {
  const { store, field, mode } = useHudContext();
  const [filter, setFilter] = useState<ChronicleFilter>('all');
  const shown = useMemo(() => filterChronicle(entries, filter, viewerP), [entries, filter, viewerP]);
  const roster = store.roster;
  return (
    <div className="chronicle">
      <div className="segmented" role="tablist" aria-label="Filter the chronicle">
        {(['all', 'mine', 'big'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? 'is-on' : ''}
            onClick={() => setFilter(f)}
            disabled={f === 'mine' && viewerP === null}
            title={f === 'mine' && viewerP === null ? 'Join today’s war to follow your own army' : undefined}
          >
            {f === 'all' ? 'All' : f === 'mine' ? 'Mine' : 'Big moments'}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty-note">{filter === 'all' ? 'Nothing has happened yet today. History begins with the first push.' : 'Nothing here yet.'}</p>
      ) : (
        <ol className="chronicle-list" aria-live="polite" aria-relevant="additions">
          {shown.map((e) => {
            const at = store.timeOfTick(e.tick);
            const actor = e.p >= 0 ? roster[e.p] : undefined;
            const located = e.x !== 0 || e.y !== 0 || e.kind === 'monolith';
            const body = (
              <>
                <span className={`chron-icon chron-${e.kind}`} style={hueVar(actor?.hue)}>
                  <EventIcon kind={e.kind} size={18} />
                </span>
                <span className="chron-body">
                  <span className={`chron-text${entryText(e).startsWith('@') ? '' : ' has-cap'}`}>{colorize(entryText(e), roster)}</span>
                  {e.kind === 'muster' && <MusterFacts entry={e} />}
                  {e.kind === 'muster' && e.units && <UnitChips units={e.units} />}
                  <span className="chron-time" title={new Date(at).toLocaleString()}>
                    {mode === 'live' ? ago(now - at) : clock(at)}
                  </span>
                </span>
              </>
            );
            return (
              <li key={keyOf(e)} className={`chron chron-k-${e.kind}${BIG_MOMENTS.has(e.kind) ? ' is-big' : ''}`}>
                {located ? (
                  <button className="chron-btn" onClick={() => field()?.focus(e.x, e.y, 1.1)} title="Show on the map">
                    {body}
                  </button>
                ) : (
                  <div className="chron-btn">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

type MusterEntry = ChronicleEntry & { purpose?: Purpose; files?: number; branches?: number };

/** What the push was for and how big it was: the reasons behind its soldiers. */
function MusterFacts({ entry }: { entry: MusterEntry }) {
  const facts: string[] = [];
  if (entry.files !== undefined && entry.files > 0) facts.push(`${entry.files} file${entry.files === 1 ? '' : 's'}`);
  if (entry.branches !== undefined && entry.branches > 0) facts.push(`${entry.branches} branch point${entry.branches === 1 ? '' : 's'}`);
  if (!entry.purpose && facts.length === 0) return null;
  return (
    <span className="muster-facts">
      <PurposeTag purpose={entry.purpose} />
      {facts.length > 0 && <span className="muted small">{facts.join(' · ')}</span>}
    </span>
  );
}
