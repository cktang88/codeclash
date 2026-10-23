import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeResponse } from '../../protocol.ts';
import { RoomHud } from '../hud/RoomHud.tsx';
import { startDemo, type LocalRunner } from '../net/local.ts';
import { GameStore } from '../store.ts';
import { useHud } from '../ui/store.ts';
import { Link } from '../ui/Link.tsx';
import { BattleShell } from './Battle.tsx';

const SPEEDS = [1, 4, 16] as const;

export function SpeedPicker({ speeds, value, onChange, label = 'Speed' }: { speeds: readonly number[]; value: number; onChange(v: number): void; label?: string }) {
  return (
    <div className="segmented segmented-sm" role="radiogroup" aria-label={label}>
      {speeds.map((s) => (
        <button key={s} role="radio" aria-checked={value === s} className={value === s ? 'is-on' : ''} onClick={() => onChange(s)}>
          {s}×
        </button>
      ))}
    </div>
  );
}

/** A sparring war between bots, simulated entirely in the browser. */
export function DemoPage({ me }: { me: MeResponse | null }) {
  const [store] = useState(() => new GameStore());
  const runner = useRef<LocalRunner | null>(null);
  const [speed, setSpeed] = useState(4);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const hud = useHud(store);

  useEffect(() => {
    const r = startDemo(store);
    r.speed = speedRef.current;
    runner.current = r;
    store.publish();
    return () => r.stop();
  }, [store]);

  useEffect(() => {
    if (runner.current) runner.current.speed = speed;
  }, [speed]);

  const getRunner = useCallback(() => runner.current, []);
  const banner = (
    <div className="cta-banner" role="note">
      <span>
        <strong>Demo war.</strong> {hud.roster.length || 'Five'} bots push code on a loop. {me?.user ? 'Create a room to fight with your own pushes.' : 'Sign in to fight with your own pushes.'}
      </span>
      {me?.user ? (
        <Link className="btn btn-primary" to={{ kind: 'home' }}>
          Your rooms
        </Link>
      ) : (
        <a className="btn btn-primary" href="/auth/github">
          Sign in with GitHub
        </a>
      )}
    </div>
  );
  return (
    <BattleShell store={store} runner={getRunner} mode="demo" slug={null} me={me}>
      <RoomHud
        hud={hud}
        title="Demo war"
        subtitle="Sparring bots, simulated in your browser"
        banner={banner}
        dock={
          <div className="dock-group">
            <span className="dock-label">Speed</span>
            <SpeedPicker speeds={SPEEDS} value={speed} onChange={setSpeed} />
          </div>
        }
      />
    </BattleShell>
  );
}
