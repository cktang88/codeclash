import { useState } from 'react';
import { armyColor } from '../../rules/heraldry.ts';

/** A player's avatar ringed in their army color. Bots and missing avatars get initials. */
export function Avatar({ login, url, hue, size = 28, bot }: { login: string; url?: string | null; hue?: number | null; size?: number; bot?: boolean }) {
  const [broken, setBroken] = useState(false);
  const ring = hue == null ? 'var(--line-strong)' : armyColor(hue);
  const style = { width: size, height: size, boxShadow: `0 0 0 2px ${ring}` };
  if (url && !bot && !broken) return <img className="avatar" src={url} alt="" width={size} height={size} style={style} loading="lazy" onError={() => setBroken(true)} />;
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: hue == null ? 'var(--ink-3)' : armyColor(hue, 30), fontSize: size * 0.42 }} aria-hidden>
      {bot ? '⚙' : login.slice(0, 1).toUpperCase()}
    </span>
  );
}
