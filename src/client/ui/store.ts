import { useSyncExternalStore } from 'react';
import type { GameStore, HudSnapshot } from '../store.ts';

export function useHud(store: GameStore): HudSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
