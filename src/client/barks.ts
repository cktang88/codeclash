// Commander barks: a short line a platoon's commander calls out about what the platoon is doing and
// why (sim/stance.ts), and the status line and state word the HUD shows for it. Pure: the renderer
// draws them, these functions only decide what is said, by whom, and when.

import { Kind, TICK_MS } from '../sim/api.ts';
import { Wait, type WaitInfo } from '../sim/stance.ts';
import { STATS } from '../sim/stats.ts';

/** What a line may name. */
export interface BarkNames {
  /** "@login" of a player. */
  player(p: number): string;
  /** "the Ash Fort", "@ada-bot's capital". */
  site(k: number): string;
  /** Wall-clock time of a tick, "15:36". */
  clock(tick: number): string;
}

/**
 * Lines per state. Placeholders: {eta} a spoken span, {clock} the hour it ends, {n} {m} a muster
 * count, {site} the site concerned, {foe} the foe, {me} the platoon's own player, {by} the shooter.
 */
export const BARK_LINES: Readonly<Record<Wait, readonly string[]>> = {
  [Wait.Marching]: ['For {me}’s honour!', 'March on, lads, march on!', 'Eyes front — {site} awaits.', 'Keep the column tight!'],
  [Wait.Fighting]: ['Hold the line!', 'Steel to steel!', 'For {me}’s honour!', 'Break them!'],
  [Wait.Sieges]: ['{eta} till the rams may roll…', 'No wall falls before {clock}. Patience.', 'Sharpen the stakes; the sieges open in {eta}.', 'We wait on the clock, lads — {eta} yet.'],
  [Wait.Barred]: ['Their gates are barred till {clock}!', '{foe} sleeps behind barred gates — {eta} more.', 'Barred gates… we wait {eta}.'],
  [Wait.Massing]: ['We need more swords — {n} of {m}.', 'Not enough spears yet: {n} of {m}.', 'Wait for the others — {n} of {m} here.', 'Muster on the banner! {n} of {m}.'],
  [Wait.NeedFort]: ['Take {site} first!', 'No siege without the fort, lads.', '{site} first, then the walls!'],
  [Wait.Holding]: ['Hold the fort, lads.', 'Nobody takes {site} from us.', 'Eyes on the road.', 'Dig in and keep watch.'],
  [Wait.PullBack]: ['Back! Out of the tower’s reach!', 'Withdraw — those walls can’t be touched yet!', 'Fall back, out of bowshot!', 'Back to the road, and dress the line!'],
  [Wait.Regrouping]: ['Back to the banner!', 'Form up, form up!', 'To the colours!'],
  [Wait.Rising]: ['Home or the grave!', 'We take back {site}!', 'Our walls, our hearths!'],
  [Wait.Besieging]: ['The walls crack — press on!', 'Breach in {eta}! Keep at it!', 'Rams forward!', 'Bring them down, stone by stone!'],
  [Wait.Routing]: ['Run for it!', 'Every man for himself!', 'Back to the walls!'],
};

/** Lines when a platoon is going after the soldier shooting at it, by the shooter's kind. */
const HUNT_LINES: Partial<Record<Kind, readonly string[]>> = {
  [Kind.Trebuchet]: ['Trebuchet! Ride it down!', 'Silence that engine!', 'Get under the stones — at the engine!'],
  [Kind.Archer]: ['Archers! Close with them!', 'At the bowmen, before they loose again!'],
  [Kind.Ranger]: ['Rangers in the trees — at them!', 'Close the distance!'],
  [Kind.Wizard]: ['Get the fire-caster!', 'At the wizard, quick!'],
  [Kind.Dragon]: ['The wyrm! Spears up!', 'Bring down the dragon!'],
};

/** Backing out of range of soldiers sheltering under walls it may not storm yet. */
const OUT_OF_RANGE: readonly string[] = ['Fall back, out of bowshot!', 'Out of their reach — back, back!', 'They hide under their walls. Back to the road!'];

/** A spoken span: "3 hours", "1h 12m", "40 minutes", "moments". */
export function spoken(ticks: number): string {
  const s = Math.max(0, Math.floor((ticks * TICK_MS) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m === 0 ? `${h} hour${h === 1 ? '' : 's'}` : `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m} minute${m === 1 ? '' : 's'}`;
  return 'moments';
}

/** A small deterministic hash: the same platoon says the same thing at the same turn of its story. */
export function mix(a: number, b: number, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

function fill(line: string, w: WaitInfo, me: number, tick: number, names: BarkNames): string {
  return line
    .replace('{eta}', w.eta >= 0 ? spoken(w.eta) : 'a while')
    .replace('{clock}', w.eta >= 0 ? names.clock(tick + w.eta) : 'the hour')
    .replace('{n}', String(w.n))
    .replace('{m}', String(w.m))
    .replace('{site}', w.site >= 0 ? names.site(w.site) : 'the field')
    .replace('{foe}', w.foe >= 0 ? names.player(w.foe) : 'the foe')
    .replace('{me}', names.player(me))
    .replace('{by}', w.by >= 0 ? STATS[w.by]!.name : 'them');
}

/** The line platoon `id` (of player `me`) calls out in state `w`; `nth` counts its barks, so lines vary over time. */
export function barkLine(id: number, me: number, w: WaitInfo, nth: number, tick: number, names: BarkNames): string {
  const hunt = w.kind === Wait.Fighting && w.by >= 0 ? HUNT_LINES[w.by as Kind] : undefined;
  const lines = hunt ?? (w.kind === Wait.PullBack && w.by >= 0 ? OUT_OF_RANGE : BARK_LINES[w.kind]);
  // Variants a line can't fill sensibly (no time to wait on) fall back to the first.
  let line = lines[mix(id, w.kind, nth) % lines.length]!;
  if ((line.includes('{eta}') || line.includes('{clock}')) && w.eta < 0) line = lines.find((l) => !l.includes('{eta}') && !l.includes('{clock}')) ?? line;
  return fill(line, w, me, tick, names);
}

/** One word or two for a label: "Besieging", "Massing 24/50", "Waiting · sieges in 1h 12m". */
export function stateWord(w: WaitInfo, names: BarkNames): string {
  switch (w.kind) {
    case Wait.Besieging:
      return w.foe >= 0 ? `Besieging ${names.player(w.foe)}` : 'Besieging';
    case Wait.Massing:
      return `Massing ${w.n}/${w.m}`;
    case Wait.Sieges:
      return `Waiting · sieges in ${spoken(w.eta)}`;
    case Wait.Barred:
      return `Waiting · gates barred ${spoken(w.eta)}`;
    case Wait.NeedFort:
      return 'Taking the fort first';
    case Wait.Holding:
      return 'Holding the fort';
    case Wait.PullBack:
      return 'Pulling back';
    case Wait.Fighting:
      return w.by >= 0 ? `Charging the ${STATS[w.by]!.name}` : w.foe >= 0 ? `Fighting ${names.player(w.foe)}` : 'Fighting';
    case Wait.Regrouping:
      return 'Regrouping';
    case Wait.Rising:
      return 'Rising';
    case Wait.Routing:
      return 'Routing';
    default:
      return w.site >= 0 ? `Marching on ${names.site(w.site)}` : 'Marching';
  }
}

/** The full status line for the Inspector: "Massing at the Ash Fort — 24 of 50 soldiers; sieges open in 1h 12m". */
export function statusLine(w: WaitInfo, names: BarkNames): string {
  const site = w.site >= 0 ? names.site(w.site) : 'the field';
  const foe = w.foe >= 0 ? names.player(w.foe) : 'the foe';
  switch (w.kind) {
    case Wait.Sieges:
    case Wait.Barred: {
      const wait = w.kind === Wait.Sieges ? `sieges open in ${spoken(w.eta)}` : `${foe}’s gates are barred for ${spoken(w.eta)} more`;
      return w.m > 0 && w.n < w.m ? `Massing at ${site} — ${w.n} of ${w.m} soldiers; ${wait}.` : `Waiting at ${site}, ${w.n} strong; ${wait}.`;
    }
    case Wait.Massing:
      return `Massing at ${site} — ${w.n} of ${w.m} soldiers; then the walls of ${foe}.`;
    case Wait.NeedFort:
      return `Taking ${site}: walls are stormed only from the fort beside them.`;
    case Wait.Holding:
      return `Holding ${site}, facing the road.`;
    case Wait.PullBack:
      return w.by >= 0 ? `Under fire from a ${STATS[w.by]!.name} it cannot reach: pulling back out of range.` : `Under fire from ${site}’s tower: pulling back out of its reach.`;
    case Wait.Fighting:
      return w.by >= 0 ? `Shot at by a ${STATS[w.by]!.name}: going after it.` : `Fighting ${foe}.`;
    case Wait.Regrouping:
      return `Regrouping at ${site} after a rout.`;
    case Wait.Rising:
      return `Rising: marching on ${site} to retake it.`;
    case Wait.Besieging:
      return `Besieging ${site}${w.eta >= 0 ? ` — the walls could fall in ${spoken(w.eta)}` : ''}.`;
    case Wait.Routing:
      return `Routing back to ${site}.`;
    default:
      return `Marching on ${site}.`;
  }
}

// ---------------------------------------------------------------- when to bark

/** A bark shows this long, fading in and out at the ends. */
export const BARK_MS = 5200;
export const BARK_FADE_IN = 260;
export const BARK_FADE_OUT = 520;
/** Between a platoon's own barks: 45 s, plus up to 45 s more by the platoon, so barks stagger. */
export const BARK_GAP = 45_000;
export const BARK_JITTER = 45_000;
/** At most this many barks on screen at once (a selected platoon may take a lower one's place). */
export const BARK_MAX = 4;
/** A bark that wanted to show on a change of state but found no room waits at most this long. */
const PENDING_MS = 8000;

export const BarkRank = { OnScreen: 1, Mine: 2, Followed: 3, Selected: 4 } as const;

export interface BarkCandidate {
  id: number;
  /** The platoon's state now. */
  kind: Wait;
  /** Who matters most: BarkRank (0 for off screen). */
  rank: number;
}

export interface ShownBark {
  id: number;
  kind: Wait;
  /** Which bark of this platoon it is (for the line). */
  nth: number;
  /** 0..1. */
  alpha: number;
}

interface Memory {
  kind: Wait;
  /** When it last barked, or -Infinity. */
  last: number;
  /** When it next may bark unprompted. */
  next: number;
  /** A change of state it still wants to call out, since when; or -1. */
  pending: number;
  nth: number;
  /** The bark showing now: when it began, or -1. */
  shownAt: number;
  seen: number;
}

/**
 * Decides who barks: on a change of state, then now and then (every 45 to 90 s a platoon, staggered),
 * at most BARK_MAX at once, the selected platoon first, then the followed, then the viewer's own,
 * then those on screen. Far out only the selected platoon barks. Under reduced motion barks pop in
 * and out without fading.
 */
export class BarkScheduler {
  private mem = new Map<number, Memory>();
  private out: ShownBark[] = [];

  update(cands: readonly BarkCandidate[], now: number, opts: { far: boolean; reducedMotion: boolean }): ShownBark[] {
    const mem = this.mem;
    // Remember every candidate; notice changes of state.
    for (const c of cands) {
      let m = mem.get(c.id);
      if (!m) {
        // First seen (a page load, a resync): no flood of barks; each finds its own moment.
        m = { kind: c.kind, last: -Infinity, next: now + (mix(c.id, 7) % BARK_JITTER) + 4000, pending: -1, nth: 0, shownAt: -1, seen: now };
        mem.set(c.id, m);
      } else if (m.kind !== c.kind) {
        m.kind = c.kind;
        m.pending = now;
        // A bark already showing for the old state gives way.
        if (m.shownAt >= 0 && now - m.shownAt < BARK_MS - BARK_FADE_OUT) m.shownAt = now - (BARK_MS - BARK_FADE_OUT);
      }
      m.seen = now;
    }
    for (const [id, m] of mem) if (now - m.seen > 30_000) mem.delete(id);
    // Who is showing, and who wants to.
    const byId = new Map<number, BarkCandidate>();
    for (const c of cands) byId.set(c.id, c);
    let showing = 0;
    for (const m of mem.values()) {
      if (m.shownAt >= 0 && now - m.shownAt >= BARK_MS) m.shownAt = -1;
      if (m.shownAt >= 0) showing++;
    }
    const wanting: BarkCandidate[] = [];
    for (const c of cands) {
      const m = mem.get(c.id)!;
      if (m.shownAt >= 0) continue;
      if (m.pending >= 0 && now - m.pending > PENDING_MS) m.pending = -1;
      if (opts.far && c.rank < BarkRank.Selected) continue;
      if (c.rank <= 0) continue;
      if (m.pending >= 0 || now >= m.next) wanting.push(c);
    }
    wanting.sort((a, b) => b.rank - a.rank || (mem.get(a.id)!.pending >= 0 ? 0 : 1) - (mem.get(b.id)!.pending >= 0 ? 0 : 1) || a.id - b.id);
    for (const c of wanting) {
      const m = mem.get(c.id)!;
      if (showing >= BARK_MAX) {
        // The selected platoon may take the place of the least important bark showing.
        if (c.rank < BarkRank.Selected) {
          if (m.pending < 0) m.next = now + 15_000;
          continue;
        }
        let worst: Memory | null = null;
        let worstRank = Infinity;
        for (const [id, o] of mem) {
          if (o.shownAt < 0 || id === c.id) continue;
          const r = byId.get(id)?.rank ?? 0;
          if (r < worstRank) {
            worstRank = r;
            worst = o;
          }
        }
        if (!worst || worstRank >= BarkRank.Selected) continue;
        worst.shownAt = -1;
        showing--;
      }
      m.shownAt = now;
      m.last = now;
      m.nth++;
      m.pending = -1;
      m.next = now + BARK_GAP + (mix(c.id, m.nth) % BARK_JITTER);
      showing++;
    }
    // What is on screen, and how solid.
    const out = this.out;
    out.length = 0;
    for (const c of cands) {
      const m = mem.get(c.id)!;
      if (m.shownAt < 0) continue;
      // Far out, a bark already showing for a platoon that is no longer selected fades away.
      if (opts.far && c.rank < BarkRank.Selected) {
        m.shownAt = -1;
        continue;
      }
      const age = now - m.shownAt;
      let alpha = 1;
      if (!opts.reducedMotion) alpha = Math.min(1, age / BARK_FADE_IN, (BARK_MS - age) / BARK_FADE_OUT);
      out.push({ id: c.id, kind: m.kind, nth: m.nth, alpha: Math.max(0, Math.min(1, alpha)) });
    }
    // Platoons gone from the field stop barking at once.
    for (const [id, m] of mem) if (m.shownAt >= 0 && !byId.has(id)) m.shownAt = -1;
    return out;
  }

  /** Forget everyone: a new war, or a seek in a replay. */
  reset(): void {
    this.mem.clear();
  }
}
