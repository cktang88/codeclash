import { useState } from 'react';
import { Icon } from './icons.tsx';
import { pigment } from './codex.tsx';

/** A player's avatar ringed in their army's pigment. Bots and missing avatars get initials. */
export function Avatar({ login, url, hue, size = 28, bot }: { login: string; url?: string | null; hue?: number | null; size?: number; bot?: boolean }) {
  const [broken, setBroken] = useState(false);
  const ring = hue == null ? 'var(--rule-soft)' : pigment(hue);
  const style = { width: size, height: size, boxShadow: `0 0 0 2px ${ring}, 0 0 0 3px rgba(34, 24, 15, 0.55)` };
  if (url && !bot && !broken) return <img className="avatar" src={url} alt="" width={size} height={size} style={style} loading="lazy" onError={() => setBroken(true)} />;
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: hue == null ? 'var(--ink-soft)' : pigment(hue, 'shade'), fontSize: size * 0.42 }} aria-hidden>
      {bot ? <Icon name="gear" size={Math.round(size * 0.6)} /> : login.slice(0, 1).toUpperCase()}
    </span>
  );
}
