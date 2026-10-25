/**
 * The codex kit: every HUD and page control drawn as part of an illuminated war chronicle
 * (docs/art-direction.md §4). Components here carry the markup; styles.css carries the look,
 * keyed to the same class names the rest of the client already uses.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type ElementType, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './icons.tsx';
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

/** Any cue from the audio catalog by name (fanfares, set pieces). */
export function sfxCue(name: string): void {
  try {
    sound?.play(name);
  } catch {
    // As above.
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
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const EARTH: [number, number, number] = [0x9a, 0x7a, 0x4e];
const INK_RGB: [number, number, number] = [0x22, 0x18, 0x0f];
const VELLUM_RGB: [number, number, number] = [0xef, 0xe4, 0xc8];

function mixRgb(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as [number, number, number];
}

/**
 * An army hue as a pigment (docs/art-direction.md §2): the hue mixed toward a warm earth, in
 * three values. Matches the battlefield's `pigmentOf`, for SVG fills that cannot use color-mix.
 */
export function pigment(hue: number, tone: 'light' | 'base' | 'shade' = 'base'): string {
  let c = mixRgb(hslRgb(((hue % 360) + 360) % 360, 0.66, 0.5), EARTH, 0.16);
  if (tone === 'light') c = mixRgb(c, VELLUM_RGB, 0.38);
  if (tone === 'shade') c = mixRgb(c, INK_RGB, 0.38);
  return `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

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
  items: readonly (readonly [NoInfer<T>, ReactNode])[];
  value: T | null;
  onChange: (v: NoInfer<T>) => void;
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

/**
 * An engraved vignette for a page that has nothing written on it yet: an empty plinth, a
 * closed ledger or a cold brazier, inked as a woodcut, with the reason set beneath in italic.
 */
export function EmptyVignette({ kind, title, children }: { kind: 'plinth' | 'ledger' | 'brazier'; title: string; children?: ReactNode }) {
  return (
    <div className="empty-vignette">
      <svg viewBox="-60 -60 120 100" width="150" height="125" aria-hidden className="empty-vignette-art">
        <defs>
          <pattern id={`ev-hatch-${kind}`} width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
            <path d="M0 0v3.2" stroke="rgba(34,24,15,.42)" strokeWidth=".8" />
          </pattern>
        </defs>
        <ellipse cx="2" cy="33" rx="46" ry="5" fill="rgba(18,22,31,.18)" />
        {kind === 'plinth' && (
          <g stroke="#22180f" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M-30 32h60l-4-8h-52Z" fill="#d9c79e" />
            <path d="M-22 24V-6h44v30" fill="#e6d8b4" />
            <path d="M8-6h14v30H8Z" fill={`url(#ev-hatch-${kind})`} stroke="none" />
            <path d="M-26-6h52l-3-7h-46Z" fill="#d9c79e" />
            <path d="M-12 8c6 6 18 6 24 0M-14 2c2-4 4-5 7-5M14 2c-2-4-4-5-7-5" fill="none" stroke="#8a6418" strokeWidth="1.2" />
            <path d="M-18-13c-8-10-6-26 4-34M18-13c8-10 6-26-4-34" fill="none" stroke="#8a6418" strokeWidth="1.3" strokeDasharray="5 3" />
          </g>
        )}
        {kind === 'ledger' && (
          <g stroke="#22180f" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M-40 30 0 22 40 30V-14L0-22-40-14Z" fill="#e6d8b4" />
            <path d="M0-22V22" />
            <path d="M14-10 30-7M14-2 30 1M14 6 26 8" stroke="rgba(34,24,15,.3)" strokeWidth="1" />
            <path d="M-30-7-14-10M-30 1-14-2" stroke="rgba(34,24,15,.3)" strokeWidth="1" />
            <path d="M0 22 40 30V-14L0-22Z" fill={`url(#ev-hatch-${kind})`} stroke="none" opacity=".45" />
            <path d="M22-48 6 6" stroke="#22180f" strokeWidth="1.3" />
            <path d="M22-48c6 6 8 16 2 26-3-2-6-4-8-8" fill="#efe4c8" />
            <circle cx="-22" cy="16" r="6" fill="#b8321f" />
          </g>
        )}
        {kind === 'brazier' && (
          <g stroke="#22180f" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M-26-4h52l-8 18h-36Z" fill="#7a5512" />
            <path d="M6-4h20l-8 18H4Z" fill={`url(#ev-hatch-${kind})`} stroke="none" />
            <path d="M-10 14-18 32M10 14 18 32M0 14v18" fill="none" />
            <path d="M-14-4c2-6 6-8 10-6 2-6 8-6 10 0 4-2 8 0 8 6" fill="#4a3a28" />
            <path d="M-4-16c-4-6 4-10 0-18M6-14c-3-5 3-8 0-14" fill="none" stroke="rgba(74,58,40,.5)" strokeWidth="1.1" strokeLinecap="round" />
          </g>
        )}
      </svg>
      <p className="empty-vignette-title">{title}</p>
      {children && <div className="empty-vignette-text">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- numbers */

/** A number that ticks to its new value like a scribe tallying. */
export function Tally({
  value,
  format = (n) => String(Math.round(n)),
  duration = 420,
  start,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  /** Count up from here on first show (a digest's totals); otherwise the first value shows as is. */
  start?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(start ?? value);
  const from = useRef(start ?? value);
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

/* ------------------------------------------------------------------ marks */

/** Code Clash's arms: a vermilion shield charged with a gilded C and a sword. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={`brand-mark${className ? ` ${className}` : ''}`} viewBox="0 0 36 40" aria-hidden>
      <path d="M18 1.5c6.5 0 15 2 15 2v14c0 9.5-6.6 16-15 20.5C9.6 33.5 3 27 3 17.5v-14s8.5-2 15-2Z" fill="#b8321f" stroke="#22180f" strokeWidth="1.6" />
      <path d="M18 4.2c5 0 11.8 1.5 11.8 1.5v11.8c0 7.8-5.2 13.3-11.8 17.2-6.6-3.9-11.8-9.4-11.8-17.2V5.7S13 4.2 18 4.2Z" fill="none" stroke="#d4a93e" strokeWidth="1" />
      <path d="M25 6v24M22.5 9.5h5" stroke="#efe4c8" strokeWidth="1.4" strokeLinecap="round" opacity=".75" />
      <path d="M19.6 14.4a6.6 6.6 0 1 0 0 10.2" fill="none" stroke="#f6dc8c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.6 14.4a6.6 6.6 0 1 0 0 10.2" fill="none" stroke="#8a6418" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity=".6" transform="translate(.6 .6)" />
    </svg>
  );
}

/** The sound seal: pressed into the wax to let the war be heard. Off until the player opts in. */
export function SoundSeal({ className }: { className?: string }) {
  const s = useSound();
  if (!s.available) return null;
  return (
    <button
      type="button"
      className={`icon-btn sound-seal${s.on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={s.on}
      aria-label={s.on ? 'Sound on. Press to silence the war' : 'Sound off. Press to hear the war'}
      title={s.on ? 'Silence' : 'Hear the war'}
      onClick={() => {
        s.set(!s.on);
        if (!s.on) setTimeout(() => sfx('ui.seal'), 30);
      }}
    >
      <Icon name={s.on ? 'horn' : 'horn-off'} size={20} />
    </button>
  );
}
