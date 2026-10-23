import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClientMessage, MeResponse } from '../../protocol.ts';
import { Hud, type HudMode } from '../hud/context.ts';
import type { Runner } from '../net/runner.ts';
import type { GameStore } from '../store.ts';
import { BattlefieldView, type BattlefieldHandle } from '../ui/BattlefieldView.tsx';

/**
 * The battlefield plus a HUD context. Pages own the store and the runner; this
 * wires them to the renderer and to HUD components.
 */
export function BattleShell({
  store,
  runner,
  mode,
  slug,
  invite = null,
  me,
  send,
  children,
}: {
  store: GameStore;
  runner: () => Runner | null;
  mode: HudMode;
  slug: string | null;
  invite?: string | null;
  me: MeResponse | null;
  send?: (msg: ClientMessage) => void;
  children: ReactNode;
}) {
  const field = useRef<BattlefieldHandle | null>(null);
  const [, setReady] = useState(false);
  const onReady = useCallback((h: BattlefieldHandle | null) => {
    field.current = h;
    setReady(h !== null);
  }, []);
  const sendRef = useRef(send);
  sendRef.current = send;
  const ctx = useMemo(
    () => ({ store, mode, slug, invite, me, field: () => field.current, send: (msg: ClientMessage) => sendRef.current?.(msg) }),
    [store, mode, slug, invite, me],
  );
  return (
    <Hud.Provider value={ctx}>
      <div className="battle">
        <BattlefieldView store={store} getRunner={runner} onReady={onReady} />
        {children}
      </div>
    </Hud.Provider>
  );
}
