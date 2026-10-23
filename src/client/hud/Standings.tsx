import { armyColor } from '../../rules/heraldry.ts';
import { DOCTRINE_NAMES } from '../../sim/stats.ts';
import type { Standing } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { compact } from '../ui/format.ts';
import { DoctrineIcon, Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';

function Trend({ value }: { value: number }) {
  if (value <= 0) return <span className="trend trend-flat" aria-label="no change">–</span>;
  return (
    <span className="trend trend-up" aria-label={`up ${value} in the last minute`}>
      ▲{value}
    </span>
  );
}

export function Standings({ standings, viewerP }: { standings: readonly Standing[]; viewerP: number | null }) {
  const { field, store } = useHudContext();
  if (standings.length === 0) {
    return <p className="empty-note">No armies yet. The first push of the day raises the first banner.</p>;
  }
  return (
    <ol className="standings" aria-label="Standings by renown">
      {standings.map((s, i) => (
        <li key={s.p} className={`standing${s.p === viewerP ? ' is-me' : ''}`}>
          <button
            className="standing-btn"
            onClick={() => {
              field()?.focusPlayer(s.p);
              store.select({ kind: 'player', p: s.p });
            }}
            aria-label={`${s.login}, rank ${i + 1}, ${s.renown} renown. Show on map.`}
          >
            <span className="standing-rank num">{i + 1}</span>
            <span className="standing-swatch" style={{ background: armyColor(s.hue) }} aria-hidden />
            <Avatar login={s.login} url={s.avatarUrl} hue={s.hue} size={30} bot={s.bot} />
            <span className="standing-main">
              <span className="standing-name">
                <span className="truncate">{s.login}</span>
                {s.leader && (
                  <span className="tag tag-gold" title="Leader in renown. Kills on their soldiers count double.">
                    <Icon name="crown" size={13} /> Bounty
                  </span>
                )}
                {s.p === viewerP && <span className="tag">You</span>}
              </span>
              <span className="standing-sub">
                <span title="Soldiers alive">
                  <Icon name="sword" size={13} /> {s.alive}
                </span>
                <span title="Platoons in the field and waiting at the capital">
                  <Icon name="flag" size={13} /> {s.platoons}
                  {s.queued > 0 && <span className="muted"> +{s.queued} queued</span>}
                </span>
                <span title={`${DOCTRINE_NAMES[s.doctrine]} doctrine`} className="doctrine-mini">
                  <DoctrineIcon doctrine={s.doctrine} size={13} /> {DOCTRINE_NAMES[s.doctrine]}
                </span>
              </span>
            </span>
            <span className="standing-score">
              <span className="num renown">{compact(s.renown)}</span>
              <Trend value={s.trend} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
