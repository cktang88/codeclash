// Whether this build can replay a stored battle, and what to say when it cannot (pure).

/**
 * 'same': this build replays it. 'older': fought under rules this build no longer has (the
 * result stands). 'newer': fought under rules newer than this page knows: the game was updated
 * since the page loaded, and a reload replays it.
 */
export type ReplayFit = 'same' | 'older' | 'newer';

export function replayFit(stored: number, current: number): ReplayFit {
  return stored === current ? 'same' : stored > current ? 'newer' : 'older';
}
