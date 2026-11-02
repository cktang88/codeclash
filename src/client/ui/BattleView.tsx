import { useEffect, useRef, useState } from 'react';
import { Battle, State, TICK_S, TICKS_PER_SECOND, type BattleSetup } from '../../game/battle.ts';
import { FACTIONS } from '../../game/factions.ts';
import { UNIT_COUNT } from '../../game/units.ts';
import { BattleScene, MAX_ZOOM } from '../render/scene.ts';
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
  const [follow, setFollow] = useState(false);
  const [noGl] = useState(() => !BattleScene.supported());
  const [skipping, setSkipping] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [ticker, setTicker] = useState<Ticker[]>([]);
  const ctl = useRef({ speed, paused, skipping });
  ctl.current = { speed, paused, skipping };

  useEffect(() => {
    if (noGl) return;
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
    const STANCE_WORDS: Record<string, string> = {
      shieldwall: 'lock shields', pikewall: 'level their spears in a pike wall', wedge: 'form a wedge', loose: 'spread into loose order',
      braced: 'brace', column: 'form column', line: 'dress their line',
    };
    const say = (e: (typeof battle.events)[number]): string => {
      const army = e.team === 0 ? a : b;
      const f = FACTIONS[army.faction];
      const who = army.name;
      const unit = f.short[e.cls] ?? 'men';
      switch (e.kind) {
        case 'rout': return `${who}’s ${unit} break and run`;
        case 'commander': return `${who}’s ${f.commander} has fallen`;
        case 'charge': return `${who}’s ${unit} charge`;
        case 'contact': return `${who}’s line meets the enemy`;
        case 'waver': return `${who}’s ${unit} waver`;
        case 'rally': return `${who}’s ${unit} rally`;
        case 'shattered': return `${who}’s ${unit} are shattered`;
        case 'break': return `${who}’s army breaks`;
        case 'stance': return `${who}’s ${unit} ${STANCE_WORDS[e.stance ?? ''] ?? 'change formation'}`;
        case 'general-order': return `${f.commander} of ${who} ${e.note ?? 'gives orders'}`;
        default: return '';
      }
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
          scene.dispose();
          scene = new BattleScene(battle);
          scene.camera.zoom = sceneRef.current?.camera.zoom ?? 1;
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
          const fresh = battle.events.slice(seen).map((e, i) => ({ id: seen + i, tick: e.tick, team: e.team, text: say(e), grave: e.kind === 'commander' || e.kind === 'break' }));
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
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, ambient]);

  useEffect(() => {
    const s = sceneRef.current;
    if (s) {
      s.camera.zoom = zoom;
      s.scanlines = scan;
      s.follow = follow;
    }
  }, [zoom, scan, follow, live === null]);

  // Camera: drag (or one finger) pans, wheel and pinch zoom toward the point under them,
  // double-click or double-tap zooms in there; +/− zoom about the centre, ⤢ fits the field.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const wheelAcc = useRef(0);
  /** Device pixel of the canvas under a client point. */
  const dev = (clientX: number, clientY: number): [number, number] => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const k = c.width / Math.max(1, r.width);
    return [(clientX - r.left) * k, (clientY - r.top) * k];
  };
  const zoomTo = (level: number, clientX?: number, clientY?: number) => {
    const s = sceneRef.current;
    const c = canvasRef.current;
    if (!s || !c) return;
    const [x, y] = clientX === undefined ? [c.width / 2, c.height / 2] : dev(clientX, clientY!);
    s.zoomAt(c, level, x, y);
    setZoom(s.camera.zoom);
  };
  const stopFollow = () => follow && setFollow(false);
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (synthetic events); dragging still works without capture.
    }
    if (pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(p!.x - q!.x, p!.y - q!.y) };
    }
    if (e.pointerType === 'touch' && pointers.current.size === 1) {
      // The event's own timestamp: a busy frame must not stretch the gap between taps.
      const now = e.timeStamp;
      const l = lastTap.current;
      if (l && now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 30) {
        zoomTo((sceneRef.current?.camera.zoom ?? 1) + 1, e.clientX, e.clientY);
        lastTap.current = null;
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    const canvas = canvasRef.current;
    const prev = pointers.current.get(e.pointerId);
    if (!s || !canvas || !prev) return;
    const k = canvas.width / Math.max(1, canvas.clientWidth);
    const n = pointers.current.size;
    // With two fingers each moves the view by half its travel: together, the midpoint's.
    s.pan(((e.clientX - prev.x) * k) / n, ((e.clientY - prev.y) * k) / n);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopFollow();
    if (n === 2 && pinch.current) {
      const [p, q] = [...pointers.current.values()];
      const d = Math.hypot(p!.x - q!.x, p!.y - q!.y);
      const ratio = d / Math.max(1, pinch.current.dist);
      if (ratio > 1.3 || ratio < 0.77) {
        zoomTo(s.camera.zoom + (ratio > 1 ? 1 : -1), (p!.x + q!.x) / 2, (p!.y + q!.y) / 2);
        pinch.current = { dist: d };
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  // Wheel: a native listener, so the page doesn't scroll; trackpads accumulate small deltas.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || ambient) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = sceneRef.current;
      if (!s) return;
      wheelAcc.current += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(wheelAcc.current) < 50) return;
      const step = wheelAcc.current < 0 ? 1 : -1;
      wheelAcc.current = 0;
      zoomTo(s.camera.zoom + step, e.clientX, e.clientY);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, noGl]);

  const [a, b] = setup.armies;
  const seconds = live ? Math.floor(live.tick / TICKS_PER_SECOND) : 0;
  return (
    <div className={ambient ? 'battle ambient' : 'battle'}>
      <canvas
        ref={canvasRef}
        className="battle-canvas"
        style={ambient ? undefined : { touchAction: 'none' }}
        onPointerDown={ambient ? undefined : onPointerDown}
        onPointerMove={ambient ? undefined : onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={ambient ? undefined : (e) => zoomTo(zoom + 1, e.clientX, e.clientY)}
      />
      {noGl && <div className="verdict"><div className="verdict-kicker">This browser cannot draw the battle (WebGL2 is unavailable).</div></div>}
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
            <button onClick={() => zoomTo(zoom - 1)} disabled={zoom <= 1}>−</button>
            <span className="mono">{zoom}×</span>
            <button onClick={() => zoomTo(zoom + 1)} disabled={zoom >= MAX_ZOOM}>+</button>
            <button onClick={() => { sceneRef.current?.fit(); setZoom(1); }} title="Fit the field">⤢</button>
            <button className={scan ? 'on' : ''} onClick={() => setScan((x) => !x)} title="Scanlines">▤</button>
            <button className={follow ? 'on' : ''} onClick={() => setFollow((x) => !x)} title="Follow the fighting">◎</button>
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
