import { useEffect, useRef, useState } from 'react';
import { Battle, FIELD_H, FIELD_W, State, TICK_S, TICKS_PER_SECOND, type BattleSetup } from '../../game/battle.ts';
import { FACTIONS } from '../../game/factions.ts';
import { UNIT_COUNT } from '../../game/units.ts';
import { BattleScene } from '../render/scene.ts';
import { hsl } from '../render/sprites.ts';
import { n } from '../format.ts';

interface SideLive {
  fighting: number;
  routing: number;
  fallen: number;
  fled: number;
  total: number;
}

interface Live {
  tick: number;
  done: boolean;
  winner: 0 | 1 | null;
  sides: [SideLive, SideLive];
  /** Men alive per class, per side. */
  byClass: [number[], number[]];
}

interface Ticker {
  id: number;
  tick: number;
  text: string;
  team: number;
  grave: boolean;
}

const SPEEDS = [1, 2, 4, 8];

function measure(b: Battle): Live {
  const sides: [SideLive, SideLive] = [
    { fighting: 0, routing: 0, fallen: 0, fled: 0, total: 0 },
    { fighting: 0, routing: 0, fallen: 0, fled: 0, total: 0 },
  ];
  const byClass: [number[], number[]] = [new Array<number>(UNIT_COUNT).fill(0), new Array<number>(UNIT_COUNT).fill(0)];
  for (const s of b.soldiers) {
    const side = sides[s.team]!;
    side.total += b.scale;
    if (s.state === State.Fighting) {
      side.fighting += b.scale;
      if (!s.commander) byClass[s.team]![s.cls]! += b.scale;
    } else if (s.state === State.Routing) side.routing += b.scale;
    else if (s.state === State.Dead) side.fallen += b.scale;
    else side.fled += b.scale;
  }
  return { tick: b.tick, done: b.done(), winner: b.result?.winner ?? null, sides, byClass };
}

export function BattleView(props: {
  setup: BattleSetup;
  /** A background loop: no HUD, slow, restarts. */
  ambient?: boolean;
  title?: string;
  onDone?: () => void;
}) {
  const { setup, ambient } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const [speed, setSpeed] = useState(ambient ? 1 : 1);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [scan, setScan] = useState(true);
  const [skipping, setSkipping] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [ticker, setTicker] = useState<Ticker[]>([]);
  const ctl = useRef({ speed, paused, skipping });
  ctl.current = { speed, paused, skipping };

  useEffect(() => {
    const canvas = canvasRef.current!;
    let battle = new Battle(setup);
    let scene = new BattleScene(battle);
    sceneRef.current = scene;
    let seen = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    let restartAt = 0;
    const [a, b] = setup.armies;
    const say = (team: number, kind: string, cls: number): string => {
      const army = team === 0 ? a : b;
      const f = FACTIONS[army.faction];
      const who = army.name;
      if (kind === 'rout') return `${who}’s ${f.short[cls]} break and run`;
      if (kind === 'commander') return `${who}’s ${f.commander} has fallen`;
      if (kind === 'charge') return `${who}’s ${f.short[cls]} charge`;
      return '';
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = ctl.current;
      if (!c.paused && !battle.done()) {
        acc += dt * (c.skipping ? 120 : ambient ? 0.7 : c.speed);
        let steps = 0;
        const cap = c.skipping ? 160 : 24;
        while (acc >= TICK_S && steps < cap && !battle.done()) {
          scene.snapshot();
          battle.step();
          scene.afterStep();
          acc -= TICK_S;
          steps++;
        }
        if (steps >= cap) acc = 0;
      }
      if (battle.done() && ambient) {
        if (!restartAt) restartAt = now + 4000;
        else if (now > restartAt) {
          battle = new Battle({ ...setup, seed: (setup.seed + Math.floor(now)) >>> 0 });
          scene = new BattleScene(battle);
          sceneRef.current = scene;
          restartAt = 0;
          seen = 0;
        }
      }
      scene.draw(canvas, battle.done() ? 1 : Math.min(1, acc / TICK_S), dt);
      if (!ambient && now - hudAt > 200) {
        hudAt = now;
        setLive(measure(battle));
        if (battle.events.length > seen) {
          const fresh = battle.events.slice(seen).map((e, i) => ({ id: seen + i, tick: e.tick, team: e.team, text: say(e.team, e.kind, e.cls), grave: e.kind === 'commander' }));
          seen = battle.events.length;
          // Collapse a burst of routs into the latest few.
          setTicker((t) => [...fresh.reverse(), ...t].slice(0, 6));
        }
        if (battle.done() && c.skipping) setSkipping(false);
        if (battle.done()) props.onDone?.();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, ambient]);

  useEffect(() => {
    const s = sceneRef.current;
    if (s) {
      s.camera.zoom = zoom;
      s.scanlines = scan;
    }
  }, [zoom, scan, live === null]);

  // Drag to pan, wheel to zoom.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    const d = drag.current;
    const canvas = canvasRef.current;
    if (!s || !d || !canvas) return;
    const fit = Math.min(canvas.clientWidth / FIELD_W, canvas.clientHeight / FIELD_H) * s.camera.zoom;
    s.camera.cx -= (e.clientX - d.x) / fit;
    s.camera.cy -= (e.clientY - d.y) / fit;
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onWheel = (e: React.WheelEvent) => {
    if (ambient) return;
    const s = sceneRef.current;
    const canvas = canvasRef.current;
    if (s && canvas) {
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      const [wx, wy] = s.toWorld(canvas, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
      s.camera.cx = wx;
      s.camera.cy = wy;
    }
    setZoom((z) => Math.max(1, Math.min(4, z + (e.deltaY < 0 ? 1 : -1))));
  };

  const [a, b] = setup.armies;
  const seconds = live ? Math.floor(live.tick / TICKS_PER_SECOND) : 0;
  return (
    <div className={ambient ? 'battle ambient' : 'battle'}>
      <canvas
        ref={canvasRef}
        className="battle-canvas"
        onPointerDown={ambient ? undefined : onPointerDown}
        onPointerMove={ambient ? undefined : onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onWheel={onWheel}
      />
      {!ambient && live && (
        <>
          <div className="hud-top">
            {[a, b].map((army, i) => {
              const s = live.sides[i]!;
              const share = s.total > 0 ? s.fighting / s.total : 0;
              return (
                <div key={i} className={`hud-side side-${i}`}>
                  <div className="hud-name">
                    <span className="swatch" style={{ background: hsl(army.hue, 55, 38) }} />
                    {army.name}
                    <small>{FACTIONS[army.faction].name}</small>
                  </div>
                  <div className="hud-bar">
                    <div className="hud-bar-fill" style={{ width: `${share * 100}%`, background: hsl(army.hue, 50, 42) }} />
                  </div>
                  <div className="hud-counts">
                    <span title="still fighting">⚔ {n(s.fighting)}</span>
                    <span title="routing">⚑ {n(s.routing)}</span>
                    <span title="fallen" className="blood">✝ {n(s.fallen)}</span>
                  </div>
                </div>
              );
            })}
            <div className="hud-clock">
              {props.title && <div className="hud-title">{props.title}</div>}
              <div className="mono">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</div>
            </div>
          </div>
          <ul className="ticker">
            {ticker.map((t) => (
              <li key={t.id} className={t.grave ? 'grave' : ''}>
                <span className="swatch" style={{ background: hsl((t.team === 0 ? a : b).hue, 55, 38) }} />
                {t.text}
              </li>
            ))}
          </ul>
          <div className="hud-controls">
            <button onClick={() => setPaused((p) => !p)} disabled={live.done}>{paused ? '▶' : '❚❚'}</button>
            {SPEEDS.map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
            <button onClick={() => setSkipping(true)} disabled={live.done || skipping}>To the end ⏭</button>
            <span className="sep" />
            <button onClick={() => setZoom((z) => Math.max(1, z - 1))} disabled={zoom <= 1}>−</button>
            <span className="mono">{zoom}×</span>
            <button onClick={() => setZoom((z) => Math.min(4, z + 1))} disabled={zoom >= 4}>+</button>
            <button className={scan ? 'on' : ''} onClick={() => setScan((x) => !x)} title="Scanlines">▤</button>
          </div>
          {live.done && live.winner !== null && (
            <div className="verdict">
              <div className="verdict-kicker">The field belongs to</div>
              <div className="verdict-name" style={{ color: hsl((live.winner === 0 ? a : b).hue, 60, 62) }}>{(live.winner === 0 ? a : b).name}</div>
              <table className="casualties">
                <thead>
                  <tr><th /><th>Brought</th><th>Fell</th><th>Fled</th><th>Standing</th></tr>
                </thead>
                <tbody>
                  {[a, b].map((army, i) => (
                    <tr key={i}>
                      <td>{army.name}</td>
                      <td>{n(live.sides[i]!.total)}</td>
                      <td className="blood">{n(live.sides[i]!.fallen)}</td>
                      <td>{n(live.sides[i]!.fled + live.sides[i]!.routing)}</td>
                      <td>{n(live.sides[i]!.fighting)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
