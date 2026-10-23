/**
 * The codex kit: every HUD and page control drawn as part of an illuminated war chronicle
 * (docs/art-direction.md §4). Components here carry the markup; styles.css carries the look,
 * keyed to the same class names the rest of the client already uses.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ElementType, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from './Link.tsx';
import type { Route } from '../route.ts';

/* ------------------------------------------------------------------ sound */

/** UI sounds from the audio module (docs/art-direction.md §7). Off until the player opts in. */
export type UiSound = 'ui.click' | 'ui.seal' | 'ui.page' | 'ui.toast' | 'ui.coin' | 'ui.quill' | 'ui.open' | 'ui.close';

interface SoundApi {
  play(name: string): void;
  enabled(): boolean;
  setEnabled(on: boolean): void;
  subscribe(fn: () => void): () => void;
}

// The audio module loads on its own schedule so the first paint never waits for it.
const audioModules = import.meta.glob<{ sound?: SoundApi }>('../audio/index.ts');
let sound: SoundApi | null = null;
const soundListeners = new Set<() => void>();
const loadAudio = Object.values(audioModules)[0];
if (loadAudio && typeof window !== 'undefined') {
  void loadAudio()
    .then((m) => {
      sound = m.sound ?? null;
      sound?.subscribe(() => soundListeners.forEach((fn) => fn()));
      soundListeners.forEach((fn) => fn());
    })
    .catch(() => undefined);
}

export function sfx(name: UiSound): void {
  try {
    sound?.play(name);
  } catch {
    // Sound is garnish; never let it break a click.
  }
}

function subscribeSound(fn: () => void): () => void {
  soundListeners.add(fn);
  return () => soundListeners.delete(fn);
}

/** Whether sound is on, and a setter that must be called from inside a click. */
export function useSound(): { available: boolean; on: boolean; set(on: boolean): void } {
  const on = useSyncExternalStore(subscribeSound, () => sound?.enabled() ?? false, () => false);
  const available = useSyncExternalStore(subscribeSound, () => sound !== null, () => false);
  return { available, on, set: (v) => sound?.setEnabled(v) };
}

/* ----------------------------------------------------------------- pigment */

/**
 * An army's hue as a CSS variable. Styles mix it to a pigment that reads on the surface it
 * sits on: dark ink on vellum, a lighter wash on night vellum.
 */
export function hueVar(hue: number | null | undefined, extra?: CSSProperties): CSSProperties | undefined {
  if (hue == null) return extra;
  return { ...extra, ['--h' as string]: String(Math.round(hue)) } as CSSProperties;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* --------------------------------------------------------------- surfaces */

type PanelProps = {
  as?: ElementType;
  night?: boolean;
  /** Hand-placed rotation of the leaf, in degrees. Text stays square; only the leaf turns. */
  tilt?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Record<string, unknown>;

/** A vellum leaf: deckled edge, inset ink rule, fleuron corners, paper grain, cast shadow. */
export function VellumPanel({ as: El = 'section', night, tilt, className, style, children, ...rest }: PanelProps) {
  const s = tilt === undefined ? style : ({ ...style, ['--tilt' as string]: `${tilt}deg` } as CSSProperties);
  return (
    <El className={`panel${night ? ' panel-night' : ''}${className ? ` ${className}` : ''}`} style={s} {...rest}>
      {children}
    </El>
  );
}

/** Night vellum: ink-night ground with gold rules, for overlays and the night bars. */
export function NightPanel(props: PanelProps) {
  return <VellumPanel {...props} night />;
}

/* ---------------------------------------------------------------- actions */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { sound?: UiSound | null };

function useClickSound(sound: UiSound | null | undefined, onClick: ButtonProps['onClick']): ButtonProps['onClick'] {
  return (e) => {
    if (sound) sfx(sound);
    onClick?.(e);
  };
}

/**
 * A round wax seal pressed into the page: the strongest action on a surface. The sigil is
 * embossed into the wax; an optional caption is written beside it.
 */
export function SealButton({
  sigil,
  caption,
  tone = 'vermilion',
  size = 'md',
  className,
  sound: snd = 'ui.seal',
  onClick,
  children,
  ...rest
}: ButtonProps & { sigil: ReactNode; caption?: ReactNode; tone?: 'vermilion' | 'gold' | 'blue'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button type="button" className={`seal-btn seal-${tone} seal-${size}${className ? ` ${className}` : ''}`} onClick={useClickSound(snd, onClick)} {...rest}>
      <span className="seal-disc" aria-hidden>
        <span className="seal-sigil">{sigil}</span>
      </span>
      {caption && <span className="seal-caption">{caption}</span>}
      {children}
    </button>
  );
}

/** A text action as a wax plaque (vermilion) or a gilded plaque (gold, for victory and value). */
export function Plaque({ tone = 'wax', size, className, sound: snd = 'ui.seal', onClick, children, ...rest }: ButtonProps & { tone?: 'wax' | 'gilt'; size?: 'sm' | 'lg' }) {
  return (
    <button type="button" className={`btn ${tone === 'wax' ? 'btn-primary' : 'btn-gilt'}${size ? ` btn-${size}` : ''}${className ? ` ${className}` : ''}`} onClick={useClickSound(snd, onClick)} {...rest}>
      {children}
    </button>
  );
}

/** A secondary action: an ink-ruled label whose flourish draws in on hover. */
export function InkLink({ to, className, children, ...rest }: { to: Route; className?: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <Link to={to} className={`ink-link${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------- tabs */

/** Silk ribbon bookmarks hanging from a page's top edge. */
export function Ribbons<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: readonly (readonly [T, ReactNode])[];
  value: T | null;
  onChange(v: T): void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next]![0]);
  };
  return (
    <div className={`tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {items.map(([id, text], i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={value === id}
          tabIndex={value === id || (value === null && i === 0) ? 0 : -1}
          className={`ribbon${value === id ? ' is-on' : ''}`}
          data-ribbon={i % 4}
          onClick={() => {
            if (value !== id) sfx('ui.page');
            onChange(id);
          }}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="ribbon-text">{text}</span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- badges */

/** A small heraldic shield or wax roundel, never a rounded chip. */
export function Badge({
  tone = 'ink',
  shape = 'shield',
  title,
  className,
  children,
}: {
  tone?: 'ink' | 'gold' | 'vermilion' | 'blue' | 'green' | 'ragged';
  shape?: 'shield' | 'seal' | 'label';
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`tag badge badge-${shape} tone-${tone}${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- bars */

/**
 * A carved channel with a pigment fill and a gilded end cap. When the value drops, a pale
 * wound lingers where the fill was and drains after 400ms (the delay lives in CSS).
 */
export function CarvedBar({
  value,
  max,
  kind,
  size,
  label,
  valueText,
  className,
}: {
  value: number;
  max: number;
  kind: 'hp' | 'strength' | 'morale' | 'capture' | 'glory';
  size?: 'lg';
  label?: string;
  valueText?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span
      className={`bar${size ? ` bar-${size}` : ''}${className ? ` ${className}` : ''}`}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? Math.round(max) : undefined}
      aria-valuenow={label ? Math.round(value) : undefined}
      aria-valuetext={label ? valueText : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="bar-wound" style={{ width: `${pct}%` }} />
      <span className={`bar-fill bar-${kind}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

/* ------------------------------------------------------------- lettering */

/** Opens a paragraph with an illuminated initial. */
export function DropCap({ text, className, as: El = 'p' }: { text: string; className?: string; as?: ElementType }) {
  const first = text.slice(0, 1);
  return (
    <El className={`has-dropcap${className ? ` ${className}` : ''}`}>
      <span className="dropcap" aria-hidden>
        {first}
      </span>
      <span className="sr-only">{first}</span>
      {text.slice(1)}
    </El>
  );
}

/** A label on a small vellum scroll-plate, as the map labels are drawn. */
export function Cartouche({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`cartouche${className ? ` ${className}` : ''}`}>{children}</span>;
}

/** A gilded rule with a centred fleuron, to divide chapters of a page. */
export function Fleuron({ className }: { className?: string }) {
  return (
    <div className={`fleuron-rule${className ? ` ${className}` : ''}`} aria-hidden>
      <svg viewBox="0 0 48 16" width="48" height="16">
        <path d="M24 2.5 29.5 8 24 13.5 18.5 8Z" fill="currentColor" />
        <path d="M17 8c-3.5-4-8-4.5-13-1.5 5 1.4 9 1.6 13 1.5ZM31 8c3.5-4 8-4.5 13-1.5-5 1.4-9 1.6-13 1.5Z" fill="currentColor" opacity=".8" />
        <circle cx="24" cy="8" r="1.4" fill="var(--vermilion)" />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- numbers */

/** A number that ticks to its new value like a scribe tallying. */
export function Tally({ value, format = (n) => String(Math.round(n)), duration = 420, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (prefersReducedMotion() || !Number.isFinite(start)) {
      from.current = value;
      setShown(value);
      return;
    }
    setBump((b) => b + 1);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className={`num tally${className ? ` ${className}` : ''}`} data-bump={bump % 2}>
      {format(shown)}
    </span>
  );
}
