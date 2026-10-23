export type ResyncReason = 'behind' | 'desync' | 'late-input';

export type ConnState =
  | { phase: 'connecting'; attempt: number }
  /** `attempt`: failed connects before this one, carried so a socket dropped before going live keeps backing off. */
  | { phase: 'syncing'; attempt?: number }
  | { phase: 'live' }
  | { phase: 'resyncing'; reason: ResyncReason; attempt?: number }
  | { phase: 'offline'; attempt: number; retryAt: number }
  | { phase: 'refused'; reason: string };

export type ConnEvent =
  | { type: 'hello' }
  | { type: 'caught-up' }
  | { type: 'resync'; reason: ResyncReason }
  /** `jitter` in [0, 1) spreads reconnects so a server restart is not met by every viewer at once. */
  | { type: 'closed'; now: number; jitter?: number }
  | { type: 'retry' }
  | { type: 'refused'; reason: string };

export const INITIAL_CONN: ConnState = { phase: 'connecting', attempt: 0 };

export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
}

export function transition(state: ConnState, event: ConnEvent): ConnState {
  if (state.phase === 'refused') return state;
  switch (event.type) {
    case 'hello': {
      if (state.phase !== 'connecting' && state.phase !== 'resyncing' && state.phase !== 'live') return state;
      const attempt = state.phase === 'live' ? 0 : (state.attempt ?? 0);
      return attempt > 0 ? { phase: 'syncing', attempt } : { phase: 'syncing' };
    }
    case 'caught-up':
      return state.phase === 'syncing' ? { phase: 'live' } : state;
    case 'resync':
      if (state.phase === 'live') return { phase: 'resyncing', reason: event.reason };
      if (state.phase === 'syncing') return state.attempt ? { phase: 'resyncing', reason: event.reason, attempt: state.attempt } : { phase: 'resyncing', reason: event.reason };
      return state;
    case 'closed': {
      if (state.phase === 'offline') return state;
      // Only a session that went live resets the backoff. A socket dropped while still syncing
      // (e.g. a slow link the server cuts off after each snapshot) keeps backing off, or it
      // would fetch a full snapshot every second forever.
      const attempt = state.phase === 'live' ? 1 : (state.attempt ?? 0) + 1;
      const delay = Math.round(backoffMs(attempt) * (1 + 0.5 * Math.min(1, Math.max(0, event.jitter ?? 0))));
      return { phase: 'offline', attempt, retryAt: event.now + delay };
    }
    case 'retry':
      return state.phase === 'offline' ? { phase: 'connecting', attempt: state.attempt } : state;
    case 'refused':
      return { phase: 'refused', reason: event.reason };
  }
}
