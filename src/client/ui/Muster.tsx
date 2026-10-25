/**
 * An army drawn small: the battlefield's own unit art, painted once per kind and look onto a
 * canvas (`paintPortrait`) and set out as a little formation block per kind with its count, the
 * way a muster roll would be illuminated. Used by the army preview.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { PreviewArmy, PreviewLines } from '../../protocol.ts';
import { Kind } from '../../sim/api.ts';
import { STATS } from '../../sim/stats.ts';
import { domCanvas, paintPortrait, type PortraitLook } from '../render/art/bake.ts';
import { hslNumber, mixColor } from '../render/paint.ts';
import { UnitIcon } from './icons.tsx';

/* ---------------------------------------------------------------- pigment */

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
/** Neutral pigment for a viewer with no army yet: a slate ultramarine, still a pigment, never grey. */
const NEUTRAL_HUE = 222;

/** The soldiers' cloth, halo and ragged wash, as the battlefield mixes them (render/units.ts). */
export function armyLook(hue: number | null): { tint: string; halo: string; ragged: string; css: string } {
  const actor = hue === null ? mixColor(hslNumber(NEUTRAL_HUE, 42, 44), 0x9a7a4e, 0.12) : mixColor(hslNumber(hue, 80, 52), 0x9a7a4e, 0.06);
  return { tint: hex(actor), halo: hex(mixColor(actor, 0xfff6e2, 0.62)), ragged: hex(mixColor(actor, 0x8a8478, 0.5)), css: hex(actor) };
}

/* -------------------------------------------------------------- portraits */

interface Portrait {
  url: string;
  /** Display size in CSS px at the formation's scale. */
  w: number;
  h: number;
}

const portraits = new Map<string, Portrait>();
const waiting = new Map<string, Set<() => void>>();
const queue: { key: string; kind: number; look: PortraitLook }[] = [];
let pumping = false;
/** CSS px per logical art px: a Footman stands about 36px tall. */
const SCALE = 0.6;

function resolution(): number {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  return Math.max(0.75, Math.min(1.5, SCALE * dpr * 1.1));
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const slice = () => {
    const t0 = performance.now();
    // Paint a few figures per slice, so a page of armies never stalls a frame for long.
    while (queue.length > 0 && performance.now() - t0 < 12) {
      const job = queue.shift()!;
      if (portraits.has(job.key)) continue;
      try {
        const res = resolution();
        const c = paintPortrait(job.kind, job.look, res, domCanvas) as HTMLCanvasElement;
        portraits.set(job.key, { url: c.toDataURL('image/png'), w: (c.width / res) * SCALE, h: (c.height / res) * SCALE });
      } catch {
        // No 2D canvas (a locked-down browser): the woodcut icon stays in its place.
        portraits.set(job.key, { url: '', w: 0, h: 0 });
      }
      waiting.get(job.key)?.forEach((fn) => fn());
      waiting.delete(job.key);
    }
    if (queue.length > 0) setTimeout(slice, 0);
    else pumping = false;
  };
  setTimeout(slice, 0);
}

function lookKey(kind: number, look: PortraitLook): string {
  return `${kind}|${look.tint}|${look.halo}|${look.rank}|${look.ragged ? 1 : 0}`;
}

/** A unit's portrait in an army's look, painted in the background; null until it is ready. */
export function usePortrait(kind: number, look: PortraitLook): Portrait | null {
  const key = lookKey(kind, look);
  const [, bump] = useState(0);
  const have = portraits.get(key) ?? null;
  useEffect(() => {
    if (portraits.has(key)) return;
    const done = () => bump((n) => n + 1);
    let set = waiting.get(key);
    if (!set) {
      waiting.set(key, (set = new Set()));
      queue.push({ key, kind, look });
      pump();
    }
    set.add(done);
    return () => {
      set.delete(done);
    };
  }, [key]);
  return have && have.url ? have : null;
}

/* -------------------------------------------------------------- formation */

/** Kinds in the order a muster roll lists them: legends and heroes, elites, the line, then support. */
export const ROLL_ORDER: readonly number[] = [
  Kind.Dragon, Kind.Champion, Kind.Troll, Kind.Knight, Kind.Paladin, Kind.Ranger, Kind.Wizard, Kind.GriffinRider, Kind.Ballista, Kind.Trebuchet, Kind.BoneGolem,
  Kind.Berserker, Kind.Cleric, Kind.Footman, Kind.Outrider, Kind.Mercenary, Kind.Skeleton,
  Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper,
];
const SUPPORT = new Set<number>([Kind.Warden, Kind.Archer, Kind.Herald, Kind.Sapper]);

/** Figures drawn in a block before the count speaks for the rest. */
function shown(kind: number, n: number, compact: boolean): number {
  const slots = STATS[kind]!.slots;
  const cap = kind === Kind.Dragon ? 1 : slots >= 3 ? 2 : slots === 2 ? 3 : compact ? 5 : 8;
  return Math.min(n, cap);
}

function Figure({ kind, look, index }: { kind: number; look: PortraitLook; index: number }) {
  const p = usePortrait(kind, look);
  // Each figure stands a little out of line, as soldiers do.
  const style = { ['--i' as string]: index, ['--jit' as string]: `${((index * 37) % 5) - 2}px` } as CSSProperties;
  if (!p) return <UnitIcon kind={kind} size={30} title="" className="muster-fig muster-fig-icon" />;
  return <img className="muster-fig" src={p.url} width={Math.round(p.w)} height={Math.round(p.h)} alt="" style={style} draggable={false} />;
}

/** One kind's block: its soldiers in a short rank and their count. */
function Block({ kind, count, look, compact }: { kind: number; count: number; look: PortraitLook; compact: boolean }) {
  const s = STATS[kind]!;
  const n = shown(kind, count, compact);
  const tier = SUPPORT.has(kind) ? 'support' : s.tier;
  return (
    <li className={`muster-block mb-${tier}`} title={`${count} ${count === 1 ? s.name : s.plural}: ${s.role}`}>
      <span className="muster-rank" aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <Figure key={i} kind={kind} look={look} index={i} />
        ))}
      </span>
      <span className="muster-count">
        <span className="num">×{count}</span> <span className="muster-name">{count === 1 ? s.name : s.plural}</span>
      </span>
    </li>
  );
}

/** An army as formation blocks grouped by kind. Ragged armies wear faded, torn cloth; veterans gilding. */
export function Formation({ army, hue, compact = false, label }: { army: PreviewArmy; hue: number | null; compact?: boolean; label: string }) {
  const colors = armyLook(hue);
  const look: PortraitLook = { tint: army.ragged ? colors.ragged : colors.tint, halo: colors.halo, rank: army.veterancy, ragged: army.ragged };
  const kinds = ROLL_ORDER.filter((k) => (army.counts[k] ?? 0) > 0);
  const soldiers = army.counts.reduce((a, b) => a + b, 0);
  return (
    <ul className={`muster${army.ragged ? ' is-ragged' : ''}${army.veterancy > 0 ? ` is-veteran vet-${army.veterancy}` : ''}${compact ? ' is-compact' : ''}`} aria-label={`${label}: ${soldiers} ${soldiers === 1 ? 'soldier' : 'soldiers'}, ${kinds.map((k) => `${army.counts[k]} ${army.counts[k] === 1 ? STATS[k]!.name : STATS[k]!.plural}`).join(', ')}`}>
      {kinds.map((k) => (
        <Block key={k} kind={k} count={army.counts[k]!} look={look} compact={compact} />
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- line bar */

/** Categories in the bar: what raises the army first, inert last. */
const BAR: readonly { key: keyof PreviewLines; label: string; tone: string }[] = [
  { key: 'code', label: 'code', tone: 'code' },
  { key: 'removed', label: 'removed', tone: 'removed' },
  { key: 'test', label: 'tests', tone: 'support' },
  { key: 'comment', label: 'comments', tone: 'support' },
  { key: 'docs', label: 'docs', tone: 'support' },
  { key: 'config', label: 'config', tone: 'support' },
  { key: 'generated', label: 'generated', tone: 'inert' },
  { key: 'vendor', label: 'vendored', tone: 'inert' },
  { key: 'blank', label: 'blank', tone: 'inert' },
];

/** A small stacked bar of a diff's lines by category: code in the army's pigment, support muted, inert pale. */
export function LineBar({ lines, hue }: { lines: PreviewLines; hue: number | null }) {
  const total = BAR.reduce((n, b) => n + lines[b.key], 0);
  const style = { ['--army' as string]: armyLook(hue).css } as CSSProperties;
  const parts = BAR.filter((b) => lines[b.key] > 0);
  return (
    <figure className="linebar" style={style}>
      <span className="linebar-channel" role="img" aria-label={parts.length ? parts.map((b) => `${lines[b.key].toLocaleString('en-US')} ${b.label}`).join(', ') : 'No lines read'}>
        {parts.map((b) => (
          <span key={b.key} className={`linebar-seg seg-${b.key} tone-${b.tone}`} style={{ flexGrow: lines[b.key], minWidth: 3 }} />
        ))}
        {total === 0 && <span className="linebar-empty">no lines read</span>}
      </span>
      {parts.length > 0 && (
        <figcaption className="linebar-legend">
          {parts.map((b) => (
            <span key={b.key} className={`linebar-key tone-${b.tone}`}>
              <span className={`linebar-swatch seg-${b.key}`} aria-hidden />
              <span className="num">{lines[b.key].toLocaleString('en-US')}</span> {b.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
