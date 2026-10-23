import { useEffect, useRef, useState } from 'react';
import type { Runner } from '../net/runner.ts';
import type { GameStore } from '../store.ts';

/** The part of the renderer the HUD talks to. */
export interface BattlefieldHandle {
  destroy(): void;
  focus(x: number, y: number, zoom?: number): void;
  focusPlayer(p: number): void;
}

interface RenderModule {
  Battlefield: {
    create(host: HTMLElement, store: GameStore, getRunner: () => Runner | null, opts?: { reducedMotion?: boolean }): Promise<BattlefieldHandle>;
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
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let handle: BattlefieldHandle | null = null;
    let cancelled = false;
    let raf = 0;
    const fallbackPump = () => {
      getRunner()?.frame();
      store.pump();
      raf = requestAnimationFrame(fallbackPump);
    };
    const load = renderModules['../render/index.ts'];
    const fail = (why: string) => {
      if (cancelled) return;
      setFailed(why);
      ready.current(null);
      raf = requestAnimationFrame(fallbackPump);
    };
    if (!load || !host.current) {
      fail('The battlefield renderer is not available.');
    } else {
      load()
        .then((m) => m.Battlefield.create(host.current!, store, getRunner, { reducedMotion: prefersReducedMotion() }))
        .then((h) => {
          if (cancelled) {
            h.destroy();
            return;
          }
          handle = h;
          ready.current(h);
        })
        .catch((err: unknown) => fail(err instanceof Error ? err.message : 'The battlefield could not start.'));
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      handle?.destroy();
      ready.current(null);
    };
  }, [store, getRunner]);

  return (
    <div className="stage" ref={host}>
      {failed && (
        <div className="stage-fallback" role="status">
          <strong>The map could not be drawn.</strong>
          <span>{failed} The standings and chronicle still update live.</span>
        </div>
      )}
    </div>
  );
}
