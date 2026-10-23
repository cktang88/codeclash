import { useCallback, useEffect, useRef, useState } from 'react';
import type { DigestResponse, MeResponse } from '../../protocol.ts';
import { TICK_MS } from '../../sim/api.ts';
import { restore } from '../../sim/index.ts';
import type { Replay } from '../../sim/replay.ts';
import { RoomHud } from '../hud/RoomHud.tsx';
import { ApiError, api } from '../net/api.ts';
import { startReplay, type LocalRunner } from '../net/local.ts';
import { GameStore } from '../store.ts';
import { useHud } from '../ui/store.ts';
import { clock } from '../ui/format.ts';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { Link } from '../ui/Link.tsx';
import { BattleShell } from './Battle.tsx';
import { SpeedPicker } from './Demo.tsx';
import { Notice } from './Notice.tsx';

const SPEEDS = [1, 4, 16, 64, 256] as const;
const SEEK_SLICE_TICKS = 25;
/** Main-thread budget per seek slice; a busy war can take milliseconds per tick. */
const SEEK_SLICE_MS = 40;
/** Jumps further ahead than this (ten minutes of war) start from a server keyframe. */
const KEYFRAME_JUMP_TICKS = 3000;

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plays a finished war back from its replay file: the seed plus every input. */
export function ReplayPage({ slug, warId, tick, me }: { slug: string; warId: number; tick: number | null; me: MeResponse | null }) {
  const [store] = useState(() => new GameStore());
  const runner = useRef<LocalRunner | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(16);
  const [playing, setPlaying] = useState(true);
  const [seeking, setSeeking] = useState<{ to: number; at: number } | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const seekToken = useRef(0);
  const appliedTick = useRef<number | null>(null);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const hud = useHud(store);

  useEffect(() => {
    let cancelled = false;
    api.replay(slug, warId).then(
      (r) => !cancelled && setReplay(r),
      (err: unknown) => !cancelled && setError(err instanceof ApiError ? err.message : 'The replay could not be loaded.'),
    );
    api.digest(slug, warId).then(
      (d) => !cancelled && setDigest(d),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [slug, warId]);

  const endTick = replay ? Math.floor((replay.endsAt - replay.startsAt) / replay.tickMs) : 0;

  const keyframeFrom = useCallback(
    async (to: number) => {
      try {
        const kf = await api.keyframe(slug, warId, to);
        return kf && kf.tick <= to ? { tick: kf.tick, world: restore(kf.snapshot) } : null;
      } catch {
        return null;
      }
    },
    [slug, warId],
  );

  const seek = useCallback(
    async (target: number) => {
      if (!replay) return;
      const token = ++seekToken.current;
      const to = Math.max(0, Math.min(endTick, Math.round(target)));
      let r = runner.current;
      if (r) r.speed = 0;
      const rewinding = !r || r.tick > to;
      // Long jumps start from the server's nearest keyframe instead of re-simulating the whole day.
      if (rewinding || to - r!.tick > KEYFRAME_JUMP_TICKS) {
        setSeeking({ to, at: r?.tick ?? 0 });
        const kf = await keyframeFrom(to);
        if (token !== seekToken.current) return;
        if (kf && (rewinding || kf.tick > r!.tick)) {
          r?.stop();
          r = startReplay(store, replay, kf.world);
        } else if (rewinding) {
          r?.stop();
          r = startReplay(store, replay);
        }
        runner.current = r!;
        r!.speed = 0;
      }
      const run = r!;
      const stepChunk = () => {
        if (token !== seekToken.current) return;
        const started = performance.now();
        do {
          run.fastForward(Math.min(to, run.tick + SEEK_SLICE_TICKS));
        } while (run.tick < to && performance.now() - started < SEEK_SLICE_MS);
        setSeeking({ to, at: run.tick });
        if (run.tick < to) {
          setTimeout(stepChunk, 0);
          return;
        }
        setSeeking(null);
        run.speed = playingRef.current ? speedRef.current : 0;
        store.publish();
      };
      stepChunk();
    },
    [replay, endTick, store, keyframeFrom],
  );

  useEffect(() => {
    if (!replay) return;
    runner.current = startReplay(store, replay);
    store.publish();
    appliedTick.current = tick;
    if (tick !== null && tick > 0) void seek(tick);
    else runner.current.speed = speed;
    return () => runner.current?.stop();
    // Starting a replay is keyed to the file; speed and play state apply through the effect below.
  }, [replay]);

  // Back/forward between two times of the same replay changes ?t= without remounting.
  useEffect(() => {
    if (!replay || tick === appliedTick.current) return;
    appliedTick.current = tick;
    if (tick !== null) void seek(tick);
  }, [tick, replay, seek]);

  useEffect(() => {
    playingRef.current = playing;
    speedRef.current = speed;
    if (runner.current && !seeking) runner.current.speed = playing ? speed : 0;
  }, [playing, speed, seeking]);

  const getRunner = useCallback(() => runner.current, []);

  if (error) {
    return (
      <Notice title="Replay unavailable" icon="history">
        <p>{error}</p>
        <Link className="btn btn-primary" to={{ kind: 'history', slug }}>
          Past wars
        </Link>
      </Notice>
    );
  }

  const current = scrub ?? (seeking ? seeking.at : hud.tick);
  const startsAt = replay?.startsAt ?? 0;
  const markers = digest?.digest.highlights ?? [];
  const dock = replay && (
    <div className="replay-dock panel panel-night">
      <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} disabled={!!seeking}>
        <Icon name={playing ? 'pause' : 'play'} size={20} />
      </button>
      <span className="num replay-time">{clock(startsAt + current * TICK_MS)}</span>
      <div className="scrubber">
        <input
          type="range"
          min={0}
          max={endTick}
          step={50}
          value={current}
          aria-label="Time of day"
          aria-valuetext={clock(startsAt + current * TICK_MS)}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={() => {
            if (scrub !== null) void seek(scrub);
            setScrub(null);
          }}
          onKeyUp={() => {
            if (scrub !== null) void seek(scrub);
            setScrub(null);
          }}
        />
        <div className="scrub-markers" aria-hidden={markers.length === 0}>
          {markers.map((m, i) => (
            <button
              key={i}
              className={`scrub-marker chron-${m.kind}`}
              style={{ left: `${(m.tick / Math.max(1, endTick)) * 100}%` }}
              onClick={() => void seek(Math.max(0, m.tick - 50))}
              title={`${clock(startsAt + m.tick * TICK_MS)}: ${m.text}`}
              aria-label={`Jump to ${m.text}`}
            >
              <EventIcon kind={m.kind} size={12} />
            </button>
          ))}
        </div>
      </div>
      <SpeedPicker speeds={SPEEDS} value={speed} onChange={setSpeed} />
      <button className="icon-btn" onClick={() => downloadJson(`pushfront-${slug}-war-${warId}.json`, replay)} aria-label="Download the replay file" title="Download replay JSON">
        <Icon name="download" size={18} />
      </button>
      {seeking && (
        <span className="seek-progress" role="status">
          Rewinding history… {Math.round((seeking.at / Math.max(1, seeking.to)) * 100)}%
        </span>
      )}
    </div>
  );

  return (
    <BattleShell store={store} runner={getRunner} mode="replay" slug={slug} me={me}>
      <RoomHud
        hud={hud}
        title={digest?.room.name ?? 'Replay'}
        subtitle={replay ? `Replay of ${new Date(replay.startsAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Loading the replay…'}
        banner={
          <div className="cta-banner is-quiet">
            <span>
              <strong>Replay.</strong> Rebuilt in your browser from the war’s seed and its {replay?.inputs.length ?? '…'} recorded inputs.
            </span>
            <Link className="btn btn-sm" to={{ kind: 'digest', slug, warId }}>
              Digest
            </Link>
          </div>
        }
        dock={dock}
      />
      {!replay && (
        <div className="loading-veil" role="status">
          <span className="spinner" aria-hidden /> Unrolling the scroll…
        </div>
      )}
    </BattleShell>
  );
}
