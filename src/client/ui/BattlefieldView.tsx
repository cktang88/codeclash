import { useEffect, useRef, useState } from 'react';
import type { Runner } from '../net/runner.ts';
import type { GameStore } from '../store.ts';

/** The part of the renderer the HUD talks to. */
export interface BattlefieldHandle {
  destroy(): void;
  focus(x: number, y: number, zoom?: number): void;
  focusPlayer(p: number): void;
  /** Resolves when the painted map first reaches the screen. */
  readonly drawn?: Promise<void>;
}

interface RenderModule {
  Battlefield: {
    create(host: HTMLElement, store: GameStore, getRunner: () => Runner | null, opts?: { reducedMotion?: boolean; signal?: AbortSignal }): Promise<BattlefieldHandle>;
  };
}

// Loaded lazily so the HUD bundle stays small and the page shell paints first.
const renderModules = import.meta.glob<RenderModule>('../render/index.ts');

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Mounts the PixiJS battlefield. When the renderer cannot start (no WebGL), it
 * still pumps the store so the HUD keeps updating.
 */
export function BattlefieldView({ store, getRunner, onReady }: { store: GameStore; getRunner: () => Runner | null; onReady(handle: BattlefieldHandle | null): void }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // The map paints for a moment on first load (terrain, fonts, unit art): an illuminated
  // leaf holds the stage meanwhile, never a blank canvas.
  const [loading, setLoading] = useState<'on' | 'leaving' | 'off'>('on');
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let handle: BattlefieldHandle | null = null;
    let cancelled = false;
    let raf = 0;
    // StrictMode mounts twice in development: abort the first start before it bakes WebGL.
    const abort = new AbortController();
    const fallbackPump = () => {
      getRunner()?.frame();
      store.pump();
      raf = requestAnimationFrame(fallbackPump);
    };
    const load = renderModules['../render/index.ts'];
    const fail = (why: string) => {
      if (cancelled) return;
      setFailed(why);
      setLoading('off');
      ready.current(null);
      raf = requestAnimationFrame(fallbackPump);
    };
    if (!load || !host.current) {
      fail('The battlefield renderer is not available.');
    } else {
      load()
        .then((m) => m.Battlefield.create(host.current!, store, getRunner, { reducedMotion: prefersReducedMotion(), signal: abort.signal }))
        .then((h) => {
          if (cancelled) {
            h.destroy();
            return;
          }
          handle = h;
          ready.current(h);
          void (h.drawn ?? Promise.resolve()).then(() => {
            if (cancelled) return;
            setLoading('leaving');
            setTimeout(() => !cancelled && setLoading('off'), 420);
          });
        })
        .catch((err: unknown) => {
          if (cancelled || (err instanceof Error && err.name === 'AbortError')) return;
          fail(err instanceof Error ? err.message : 'The battlefield could not start.');
        });
    }
    return () => {
      cancelled = true;
      abort.abort();
      cancelAnimationFrame(raf);
      handle?.destroy();
      ready.current(null);
    };
  }, [store, getRunner]);

  return (
    <div className="stage" ref={host}>
      {loading !== 'off' && !failed && (
        <div className={`stage-loading${loading === 'leaving' ? ' is-leaving' : ''}`} role="status" aria-live="polite">
          <svg className="stage-loading-rose" viewBox="-50 -50 100 100" aria-hidden="true">
            <circle r="44" className="rose-ring" />
            <circle r="38" className="rose-ring thin" />
            <g className="rose-points">
              <path d="M0-40 L7-7 L0 0 Z" className="lit" />
              <path d="M0-40 L-7-7 L0 0 Z" className="shade" />
              <path d="M40 0 L7 7 L0 0 Z" className="lit" />
              <path d="M40 0 L7-7 L0 0 Z" className="shade" />
              <path d="M0 40 L-7 7 L0 0 Z" className="lit" />
              <path d="M0 40 L7 7 L0 0 Z" className="shade" />
              <path d="M-40 0 L-7-7 L0 0 Z" className="lit" />
              <path d="M-40 0 L-7 7 L0 0 Z" className="shade" />
            </g>
            <circle r="4" className="rose-boss" />
          </svg>
          <strong className="stage-loading-title">The scribe inks the field</strong>
          <span className="stage-loading-line">grinding pigments, gilding the banners…</span>
        </div>
      )}
      {failed && (
        <div className="stage-fallback" role="status">
          <strong>The map could not be drawn.</strong>
          <span>{failed}</span>
          <span>The standings and chronicle still update live.</span>
        </div>
      )}
    </div>
  );
}
