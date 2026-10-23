import { createContext, useContext } from 'react';
import type { ClientMessage, MeResponse } from '../../protocol.ts';
import type { GameStore } from '../store.ts';
import type { BattlefieldHandle } from '../ui/BattlefieldView.tsx';

export type HudMode = 'live' | 'demo' | 'replay';

export interface HudContext {
  store: GameStore;
  mode: HudMode;
  slug: string | null;
  me: MeResponse | null;
  field(): BattlefieldHandle | null;
  send(msg: ClientMessage): void;
}

export const Hud = createContext<HudContext | null>(null);

export function useHudContext(): HudContext {
  const ctx = useContext(Hud);
  if (!ctx) throw new Error('HUD component rendered outside a room');
  return ctx;
}
