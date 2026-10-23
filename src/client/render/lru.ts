/** Marks `key` as just used: a Map iterates in insertion order, so the least recently used comes first. */
export function touch<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.delete(key);
  map.set(key, value);
}

/**
 * Trims a recency-ordered map (see `touch`) to `max` entries, oldest first, skipping any entry
 * `keep` says is still on screen. Returns how many were disposed.
 */
export function pruneLru<K, V>(map: Map<K, V>, max: number, keep: (value: V) => boolean, dispose: (value: V) => void): number {
  let excess = map.size - max;
  if (excess <= 0) return 0;
  let freed = 0;
  for (const [key, value] of map) {
    if (excess <= 0) break;
    if (keep(value)) continue;
    map.delete(key);
    dispose(value);
    excess--;
    freed++;
  }
  return freed;
}
