import type { Standing } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { compact } from '../ui/format.ts';
import { ArmyMark } from '../ui/fairPlay.tsx';
import { Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';
import { Tally, hueVar } from '../ui/codex.tsx';

function Trend({ value }: { value: number }) {
  if (value <= 0)
    return (
      <span className="trend trend-flat" aria-label="no change">
        —
      </span>
    );
  return (
    <span className="trend trend-up" aria-label={`up ${value} in the last minute`}>
      <Icon name="up" size={10} />
      {value}
    </span>
  );
}

export function Standings({ standings, viewerP }: { standings: readonly Standing[]; viewerP: number | null }) {
  const { field, store } = useHudContext();
  if (standings.length === 0) {
    return <p className="empty-note">No armies yet. The first push of the day raises the first banner.</p>;
  }
  return (
    <ol className="standings" aria-label="Standings: capitals held, then renown">
      {standings.map((s, i) => (
        <li key={s.p} className={`standing${s.p === viewerP ? ' is-me' : ''}`} style={hueVar(s.hue)}>
          <button
            className="standing-btn"
            onClick={() => {
              field()?.focusPlayer(s.p);
              store.select({ kind: 'player', p: s.p });
            }}
            aria-label={`${s.login}, rank ${i + 1}, ${s.capitals} ${s.capitals === 1 ? 'capital' : 'capitals'}, ${s.renown} renown${s.rising ? ', rising' : ''}. Show on map.`}
          >
            <span className="standing-rank num">{i + 1}</span>
            <span className="standing-swatch" aria-hidden />
            <Avatar login={s.login} url={s.avatarUrl} hue={s.hue} size={30} bot={s.bot} />
            <span className="standing-main">
              <span className="standing-name">
                <span className="truncate who">{s.login}</span>
                {store.world && store.world.victor === s.p && (
                  <span className="tag tag-victor" title="Holds the whole ring: the war is won" aria-label="Conqueror of the ring">
                    <Icon name="crown" size={13} />
                  </span>
                )}
                {s.rising && (
                  <span className="tag tag-rising" title="Lost every capital: fights on outside its home to retake it">
                    Rising
                  </span>
                )}
                {s.p === viewerP && <span className="tag">You</span>}
              </span>
              {store.roster[s.p]?.heraldry?.title && <span className="standing-title">{store.roster[s.p]!.heraldry!.title}</span>}
              <span className="standing-sub">
                <span title="Soldiers alive">
                  <Icon name="sword" size={13} /> {s.alive}
                </span>
                <span title="Platoons in the field and waiting at the capital">
                  <Icon name="flag" size={13} /> {s.platoons}
                  {s.queued > 0 && <span className="muted"> +{s.queued} queued</span>}
                </span>
                {store.world?.players[s.p] && <ArmyMark player={store.world.players[s.p]!} />}
              </span>
            </span>
            <span className="standing-score">
              <span className={`capitals${s.capitals === 0 ? ' is-none' : ''}`} title={`${s.capitals} ${s.capitals === 1 ? 'capital' : 'capitals'} held${s.conquests > 0 ? `, ${s.conquests} stormed today` : ''}`}>
                <Icon name="keep" size={16} />
                <Tally value={s.capitals} />
              </span>
              <span className="renown-line">
                <Tally className="renown" value={s.renown} format={compact} />
                <Trend value={s.trend} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
