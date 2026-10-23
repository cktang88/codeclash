import { useState } from 'react';
import { botEmblem } from './emblem.ts';
import { EMBLEM_PATHS } from './Flag.tsx';
import { pigment } from './codex.tsx';

/** A player's avatar ringed in their army's pigment. Bots bear their own heraldic charge; missing avatars get initials. */
export function Avatar({ login, url, hue, size = 28, bot }: { login: string; url?: string | null; hue?: number | null; size?: number; bot?: boolean }) {
  // Remembers which URL failed, so a reused avatar (another player in the same slot) tries its own picture.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = !!url && brokenUrl === url;
  const ring = hue == null ? 'var(--rule-soft)' : pigment(hue);
  const style = { width: size, height: size, boxShadow: `0 0 0 2px ${ring}, 0 0 0 3px rgba(34, 24, 15, 0.55)` };
  if (url && !bot && !broken) return <img className="avatar" src={url} alt="" width={size} height={size} style={style} loading="lazy" onError={() => setBrokenUrl(url)} />;
  return (
    <span className="avatar avatar-initials" style={{ ...style, background: hue == null ? 'var(--ink-soft)' : pigment(hue, 'shade'), fontSize: size * 0.42 }} aria-hidden>
      {bot ? (
        <svg className="avatar-emblem" viewBox="-6 -6 12 12" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} aria-hidden>
          <path d={EMBLEM_PATHS[botEmblem(login)]} fill="#efe4c8" fillOpacity={0.92} stroke="#22180f" strokeWidth={0.7} strokeLinejoin="round" />
        </svg>
      ) : (
        login.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
