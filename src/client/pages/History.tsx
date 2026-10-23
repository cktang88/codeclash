import { useEffect, useState } from 'react';
import type { RoomDetail, WarSummary } from '../../protocol.ts';
import { ApiError, api } from '../net/api.ts';
import { Link } from '../ui/Link.tsx';
import { compact } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';
import { Notice } from './Notice.tsx';
import { EmptyVignette, hueVar } from '../ui/codex.tsx';

export function HistoryPage({ slug, invite }: { slug: string; invite: string | null }) {
  const [wars, setWars] = useState<WarSummary[] | null>(null);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.wars(slug, invite).then(
      (r) => !cancelled && setWars(r.wars),
      (err: unknown) => !cancelled && setError(err instanceof ApiError ? err.message : 'The war records could not be loaded.'),
    );
    api.room(slug, invite).then(
      (r) => !cancelled && setRoom(r),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [slug, invite]);

  if (error) {
    return (
      <Notice title="No records" icon="history">
        <p>{error}</p>
        <Link className="btn btn-primary" to={{ kind: 'home' }}>
          Back to the lobby
        </Link>
      </Notice>
    );
  }
  return (
    <main className="folio history">
      <nav className="crumbs">
        <Link to={{ kind: 'room', slug, invite }}>← {room?.name ?? 'Back to the room'}</Link>
        <Link to={{ kind: 'season', slug, invite }}>The season</Link>
        <Link to={{ kind: 'hall', slug, invite }}>Hall of Legends</Link>
      </nav>
      <p className="eyebrow">The annals</p>
      <h1 className="page-title">Past wars{room ? ` of ${room.name}` : ''}</h1>
      {wars === null ? (
        <p className="muted" role="status">
          Opening the archive…
        </p>
      ) : wars.length === 0 ? (
        <EmptyVignette kind="brazier" title="No war has yet been written">
          <p>The first one ends at this room’s next reset.</p>
        </EmptyVignette>
      ) : (
        <ol className="war-list">
          {wars.map((w) => (
            <li key={w.id} className="war-row">
              <div className="war-date">
                <strong>{new Date(w.startsAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
                <span className="muted small">{w.status === 'active' ? 'In progress' : `${w.players} ${w.players === 1 ? 'army' : 'armies'} · ${w.pushes} ${w.pushes === 1 ? 'push' : 'pushes'}`}</span>
              </div>
              <div className="war-winner">
                {w.winner ? (
                  <>
                    <Icon name="crown" size={18} />
                    <span className="who" style={hueVar(w.winner.hue)}>
                      @{w.winner.login}
                    </span>
                    <span className="num muted">{compact(w.winner.renown)}</span>
                  </>
                ) : (
                  <span className="muted">{w.status === 'active' ? 'Battle rages' : 'No victor'}</span>
                )}
              </div>
              <div className="war-links">
                {w.status === 'active' ? (
                  <Link className="btn btn-sm btn-primary" to={{ kind: 'room', slug, invite }}>
                    Watch live
                  </Link>
                ) : (
                  <>
                    <Link className="btn btn-sm" to={{ kind: 'digest', slug, warId: w.id, invite }}>
                      Digest
                    </Link>
                    <Link className="btn btn-sm" to={{ kind: 'replay', slug, warId: w.id, tick: null, invite }}>
                      <Icon name="play" size={14} /> Replay
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
