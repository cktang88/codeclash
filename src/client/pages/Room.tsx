import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeResponse, RoomDetail } from '../../protocol.ts';
import { RoomHud } from '../hud/RoomHud.tsx';
import { ApiError, api } from '../net/api.ts';
import { LockstepRunner } from '../net/runner.ts';
import { connectWebSocket } from '../net/transport.ts';
import { GameStore } from '../store.ts';
import { useHud } from '../ui/store.ts';
import { Link } from '../ui/Link.tsx';
import { Icon } from '../ui/icons.tsx';
import { BattleShell } from './Battle.tsx';
import { Notice } from './Notice.tsx';

function streamPath(slug: string, invite: string | null): string {
  return `/ws?room=${encodeURIComponent(slug)}${invite ? `&invite=${encodeURIComponent(invite)}` : ''}`;
}

export function RoomPage({ slug, invite, me, onMeChanged }: { slug: string; invite: string | null; me: MeResponse | null; onMeChanged(): void }) {
  const [store] = useState(() => new GameStore());
  const runner = useRef<LockstepRunner | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [roomError, setRoomError] = useState<ApiError | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const hud = useHud(store);

  useEffect(() => {
    let cancelled = false;
    api.room(slug, invite).then(
      (r) => !cancelled && setRoom(r),
      (err: unknown) => !cancelled && setRoomError(err instanceof ApiError ? err : new ApiError(0, 'offline', 'The war office did not answer.')),
    );
    return () => {
      cancelled = true;
    };
  }, [slug, invite, epoch]);

  useEffect(() => {
    const r = new LockstepRunner(connectWebSocket(streamPath(slug, invite)), store);
    runner.current = r;
    r.start();
    return () => {
      r.stop();
      runner.current = null;
    };
  }, [slug, invite, store, epoch]);

  // The server pushes room changes (renames, new members) over the socket.
  // The broadcast strips viewer-specific fields (membership, owner tools, invite), so keep ours
  // until a refetch brings this viewer's own copy; adopting it raw showed the owner a Join banner.
  useEffect(() => {
    const next = hud.room;
    if (!next) return;
    let cancelled = false;
    setRoom((prev) => (prev ? { ...next, viewer: prev.viewer, invite: prev.invite, webhookUrl: prev.webhookUrl } : next));
    api.room(slug, invite).then(
      (r) => !cancelled && setRoom(r),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [hud.room, slug, invite]);

  const getRunner = useCallback(() => runner.current, []);
  const send = useCallback((msg: Parameters<LockstepRunner['send']>[0]) => runner.current?.send(msg), []);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const r = await api.joinRoom(slug, invite);
      setRoom(r);
      onMeChanged();
      setEpoch((e) => e + 1);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : 'Could not join. Try again.');
    } finally {
      setJoining(false);
    }
  };

  if (hud.conn.phase === 'refused' || (roomError && roomError.status === 404) || (roomError && roomError.status === 403)) {
    const forbidden = roomError?.status === 403 || (hud.conn.phase === 'refused' && /private|invite|forbidden/i.test(hud.conn.reason));
    return (
      <Notice title={forbidden ? 'This room is private' : 'No such room'} icon="lock">
        <p>{forbidden ? 'You need an invite link from one of its members to watch this war.' : 'This room does not exist, or it was deleted.'}</p>
        <Link className="btn btn-primary" to={{ kind: 'home' }}>
          Back to the lobby
        </Link>
      </Notice>
    );
  }

  const signedIn = !!me?.user;
  const member = room?.viewer.member ?? false;
  let banner = null;
  if (room && !member) {
    banner = (
      <div className="cta-banner" role="region" aria-label="Join this war">
        <span>
          <strong>Watching {room.name}.</strong> {signedIn ? 'Join to send your own pushes into battle.' : 'Sign in with GitHub to fight with your own pushes.'}
        </span>
        {signedIn ? (
          <button className="btn btn-primary" onClick={() => void join()} disabled={joining}>
            {joining ? 'Joining…' : 'Join this war'}
          </button>
        ) : (
          <a className="btn btn-primary" href={`/auth/github?next=${encodeURIComponent(location.pathname + location.search)}`}>
            <Icon name="github" size={18} /> Sign in with GitHub
          </a>
        )}
        {joinError && (
          <span className="form-error" role="alert">
            {joinError}
          </span>
        )}
      </div>
    );
  } else if (room && member && hud.war?.status === 'active' && hud.viewerP === null && hud.conn.phase === 'live') {
    banner = (
      <div className="cta-banner is-quiet" role="status">
        <span>
          <strong>You’re in.</strong> Your banner rises with your first public push today. Every slot on today’s map may be taken. In that case you join at the next reset.
        </span>
      </div>
    );
  }

  const war = hud.war;
  const subtitle = war ? `Day of ${new Date(war.startsAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Connecting…';
  return (
    <BattleShell store={store} runner={getRunner} mode="live" slug={slug} me={me} send={send}>
      <RoomHud hud={hud} title={room?.name ?? hud.room?.name ?? slug} subtitle={subtitle} banner={banner} room={room} onRoomChanged={setRoom} />
      {!hud.war && hud.conn.phase !== 'live' && (
        <div className="loading-veil" role="status">
          <span className="spinner" aria-hidden />
          {hud.conn.phase === 'offline' ? 'The war office is unreachable. Retrying…' : 'Marching to the front…'}
        </div>
      )}
    </BattleShell>
  );
}
