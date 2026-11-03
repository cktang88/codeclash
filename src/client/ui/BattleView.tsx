import { useEffect, useRef, useState } from 'react';
import { ART_LABEL, useArtMode } from './useArtMode.ts';
import { nextArt } from '../settings.ts';
import { Battle, State, TICK_S, TICKS_PER_SECOND, type BattleSetup } from '../../game/battle.ts';
import { FACTIONS } from '../../game/factions.ts';
import { UNIT_COUNT } from '../../game/units.ts';
import { BattleScene, MAX_ZOOM } from '../render/scene.ts';
import type { Insets } from '../render/fit.ts';
import { hsl } from '../render/sprites.ts';
import { n } from '../format.ts';
import { BATTLE_SPEEDS, SpeedControls } from './SpeedControls.tsx';
import { canvasSize } from './canvasSize.ts';

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

/**
 * Device px of `canvas` under the HUD: the banner along the top, the controls along the bottom
 * (and a little air), or null while the HUD is not up yet.
 */
function hudInsets(canvas: HTMLCanvasElement): Insets | null {
  const root = canvas.closest('.battle');
  const top = root?.querySelector('.hud-top');
  const bottom = root?.querySelector('.hud-controls');
  if (!top || !bottom) return null;
  const r = canvas.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const k = canvas.height / r.height;
  const air = 6;
  const t = top.getBoundingClientRect();
  const b = bottom.getBoundingClientRect();
  return { top: Math.max(0, t.bottom + air - r.top) * k, bottom: Math.max(0, r.bottom - b.top + air) * k, left: 0, right: 0 };
}

export function BattleView(props: {
  setup: BattleSetup;
  /** A background loop: no HUD, slow, restarts. */
  ambient?: boolean;
  title?: string;
  onDone?: () => void;
}) {
  const { setup, ambient } = props;
  // The canvas is made by the effect, inside this holder, and dropped with its WebGL context when
  // the effect is cleaned up: a context outlives its scene otherwise (browsers cap them, and lose
  // the oldest), and a remount (React's development double-mount) gets a fresh canvas.
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<BattleScene | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [scan, setScan] = useState(true);
  const [follow, setFollow] = useState(false);
  const [art, setArt] = useArtMode();
  const artRef = useRef(art);
  artRef.current = art;
  const [noGl] = useState(() => !BattleScene.supported());
  const [skipping, setSkipping] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [ticker, setTicker] = useState<Ticker[]>([]);
  const ctl = useRef({ speed, paused, skipping });
  ctl.current = { speed, paused, skipping };
  const onDoneRef = useRef(props.onDone);
  onDoneRef.current = props.onDone;
  // The default view (BattleScene.frame: the armies framed clear of the HUD) is taken once the HUD
  // is up, and again when the canvas resizes, until the viewer pans, zooms or follows; ⤢ asks again.
  const untouched = useRef(true);
  const reframe = useRef(true);

  useEffect(() => {
    if (noGl) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'battle-canvas';
    holderRef.current!.appendChild(canvas);
    canvasRef.current = canvas;
    let battle = new Battle(setup);
    let sceneArt = artRef.current;
    let scene = new BattleScene(battle, sceneArt);
    sceneRef.current = scene;
    let seen = 0;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    // The battle and tick the HUD last showed: paused, it is not re-rendered for nothing.
    let hudBattle: Battle | null = null;
    let hudTick = -1;
    let restartAt = 0;
    let doneSent = false;
    // The canvas size the view was last framed for.
    let framedW = 0;
    let framedH = 0;
    untouched.current = true;
    reframe.current = true;
    // Scripted checks (?probe): the battle, its scene and the draw alpha of the latest frame.
    const probe = !ambient && /[?&]probe\b/.test(location.search) ? ((window as unknown as { battleProbe?: { at?: unknown } }).battleProbe = {} as { at?: unknown }) : null;
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
        case 'chase': return `${who}’s ${unit} break ranks to run down the fugitives`;
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
    // The canvas in device pixels, so each of its pixels is a whole number of the screen's: the
    // holder's size in device px (exact where the browser reports it; it also reports a change of
    // devicePixelRatio, a window dragged to another screen or a page zoom, with no layout change).
    // Above 2 device px per CSS px (phones) the canvas takes every k-th: k = 2 on a 3x screen, and
    // the browser shows each canvas pixel as exactly k × k device pixels (not 1.5 × 1.5).
    const holder = holderRef.current!;
    let devW = 0;
    let devH = 0;
    const measureHolder = () => {
      const r = holder.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      devW = Math.round(r.width * dpr);
      devH = Math.round(r.height * dpr);
    };
    const resize = () => {
      const { w, h, cssW, cssH } = canvasSize(devW, devH, window.devicePixelRatio || 1);
      // Setting a canvas's size, even to the same, clears it and reallocates its buffers.
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      // Exactly w·k × h·k device px (100% of the holder could be a device px more or less, and
      // the browser would stretch the whole picture by it).
      const cw = `${cssW}px`;
      const ch = `${cssH}px`;
      if (canvas.style.width !== cw) canvas.style.width = cw;
      if (canvas.style.height !== ch) canvas.style.height = ch;
    };
    measureHolder();
    resize();
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1]!;
      const box = e.devicePixelContentBoxSize?.[0];
      measureHolder();
      // The exact device size where the browser gives one that agrees with the layout's (an
      // emulated devicePixelRatio, as in headless test runs, reports CSS px there).
      if (box && Math.abs(box.inlineSize - devW) <= 1 && Math.abs(box.blockSize - devH) <= 1) {
        devW = box.inlineSize;
        devH = box.blockSize;
      }
      resize();
    });
    try {
      ro.observe(holder, { box: 'device-pixel-content-box' });
    } catch {
      ro.observe(holder);
    }
    // Where the observer cannot see device pixels (Safari), a change of devicePixelRatio alone.
    let mq: MediaQueryList | null = null;
    const onDpr = () => {
      mq?.removeEventListener('change', onDpr);
      mq = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      mq?.addEventListener('change', onDpr);
      measureHolder();
      resize();
    };
    onDpr();

    const loop = (now: number) => {
      // A frame's timestamp can precede the performance.now() taken when the effect ran: never step backwards
      // (a negative dt made `acc`, and so the draw alpha, negative and the renderer asked for frame -1).
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const c = ctl.current;
      // Speed only sets how many fixed ticks run per real second; the sim steps exactly as at 1×, and
      // the draw interpolates positions and animation frames between ticks (alpha), so ¼× stays smooth.
      const rate = c.paused ? 0 : c.skipping ? 120 : ambient ? 0.7 : c.speed;
      if (!c.paused && !battle.done()) {
        acc += dt * rate;
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
          scene = new BattleScene(battle, sceneArt);
          const prev = sceneRef.current;
          scene.camera.zoom = prev?.camera.zoom ?? 1;
          // Keep the viewer's choices across the ambient restart.
          if (prev) {
            scene.scanlines = prev.scanlines;
            scene.follow = prev.follow;
          }
          sceneRef.current = scene;
          restartAt = 0;
          seen = 0;
        }
      }
      if (artRef.current !== sceneArt) {
        // The pixel-art setting changed: redraw the same battle with the other painter, keeping the view.
        const prev = scene;
        sceneArt = artRef.current;
        prev.dispose();
        // The camera, facings and wounds carry over; the zoom is the new art's level nearest the
        // old scale (classic adds a pixel a level, HD doubles: the same level number would jump).
        scene = new BattleScene(battle, sceneArt, prev);
        scene.matchZoom(prev, canvas.width, canvas.height);
        sceneRef.current = scene;
        setZoom(scene.camera.zoom);
      }
      if (!ambient && untouched.current && (reframe.current || canvas.width !== framedW || canvas.height !== framedH)) {
        const insets = hudInsets(canvas);
        if (insets) {
          scene.frame(canvas.width, canvas.height, insets);
          reframe.current = false;
          framedW = canvas.width;
          framedH = canvas.height;
          setZoom(scene.camera.zoom);
        }
      }
      // Dust, blood and smoke drift at the battle's pace too (frozen while paused).
      const alpha = battle.done() ? 1 : Math.min(1, acc / TICK_S);
      scene.draw(canvas, alpha, Math.min(0.25, dt * (battle.done() ? 1 : rate)));
      if (probe) probe.at = { battle, scene, alpha, now };
      if (!ambient && now - hudAt > 200 && (battle !== hudBattle || battle.tick !== hudTick)) {
        hudAt = now;
        hudBattle = battle;
        hudTick = battle.tick;
        setLive(measure(battle));
        if (battle.events.length > seen) {
          const fresh = battle.events.slice(seen).map((e, i) => ({ id: seen + i, tick: e.tick, team: e.team, text: say(e), grave: e.kind === 'commander' || e.kind === 'break' }));
          seen = battle.events.length;
          // Collapse a burst of routs into the latest few.
          setTicker((t) => [...fresh.reverse(), ...t].slice(0, 6));
        }
        if (battle.done() && c.skipping) setSkipping(false);
        // Once per battle, not on every HUD refresh after it ends; the latest callback, not the first render's.
        if (battle.done() && !doneSent) {
          doneSent = true;
          onDoneRef.current?.();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mq?.removeEventListener('change', onDpr);
      scene.dispose(true);
      canvas.remove();
      if (canvasRef.current === canvas) canvasRef.current = null;
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
  /** One zoom level in (+1) or out (-1), about a client point or the centre. */
  const zoomBy = (dir: 1 | -1, clientX?: number, clientY?: number) => {
    const s = sceneRef.current;
    const c = canvasRef.current;
    if (!s || !c) return;
    untouched.current = false;
    const [x, y] = clientX === undefined ? [c.width / 2, c.height / 2] : dev(clientX, clientY!);
    s.zoomAt(c, s.nextZoom(dir), x, y);
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
        zoomBy(1, e.clientX, e.clientY);
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
    if (e.clientX !== prev.x || e.clientY !== prev.y) untouched.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stopFollow();
    if (n === 2 && pinch.current) {
      const [p, q] = [...pointers.current.values()];
      const d = Math.hypot(p!.x - q!.x, p!.y - q!.y);
      const ratio = d / Math.max(1, pinch.current.dist);
      if (ratio > 1.3 || ratio < 0.77) {
        zoomBy(ratio > 1 ? 1 : -1, (p!.x + q!.x) / 2, (p!.y + q!.y) / 2);
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
    const c = holderRef.current;
    if (!c || ambient) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = sceneRef.current;
      if (!s) return;
      wheelAcc.current += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(wheelAcc.current) < 50) return;
      const step: 1 | -1 = wheelAcc.current < 0 ? 1 : -1;
      wheelAcc.current = 0;
      zoomBy(step, e.clientX, e.clientY);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambient, noGl]);

  const [a, b] = setup.armies;
  const seconds = live ? Math.floor(live.tick / TICKS_PER_SECOND) : 0;
  return (
    <div className={ambient ? 'battle ambient' : 'battle'}>
      <div
        ref={holderRef}
        className="battle-surface"
        onPointerDown={ambient ? undefined : onPointerDown}
        onPointerMove={ambient ? undefined : onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={ambient ? undefined : (e) => zoomBy(1, e.clientX, e.clientY)}
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
          {/* Two groups that never split inside: on a narrow screen they stack as two rows. */}
          <div className="hud-controls">
            <SpeedControls speeds={BATTLE_SPEEDS} speed={speed} paused={paused} onSpeed={setSpeed} onPause={setPaused} done={live.done}>
              <button onClick={() => setSkipping(true)} disabled={live.done || skipping} title="To the end" aria-label="To the end"><span className="hud-label">To the end </span>⏭</button>
            </SpeedControls>
            <span className="hud-group">
              <button onClick={() => zoomBy(-1)} disabled={zoom <= (sceneRef.current?.minZoom ?? 1)} aria-label="Zoom out">−</button>
              <span className="mono">{zoom < 1 ? `${Math.round(zoom * 100)}%` : `${zoom}×`}</span>
              <button onClick={() => zoomBy(1)} disabled={zoom >= (sceneRef.current?.maxZoom ?? MAX_ZOOM)} aria-label="Zoom in">+</button>
              <button onClick={() => { untouched.current = true; reframe.current = true; setFollow(false); }} title="Frame the armies" aria-label="Frame the armies">⤢</button>
              <button className={scan ? 'on' : ''} onClick={() => setScan((x) => !x)} title="Scanlines" aria-label="Scanlines" aria-pressed={scan}>▤</button>
              <button className={follow ? 'on' : ''} onClick={() => { untouched.current = false; setFollow((x) => !x); }} title="Follow the fighting" aria-label="Follow the fighting" aria-pressed={follow}>◎</button>
              <button className={art !== 'classic' ? 'on' : ''} onClick={() => setArt(nextArt(art))} title={`Pixel art: ${ART_LABEL[art]} (switch to ${ART_LABEL[nextArt(art)]})`} aria-label={`Pixel art: ${ART_LABEL[art]}; switch to ${ART_LABEL[nextArt(art)]}`}>{art === 'hd64' ? 'HD64' : 'HD'}</button>
            </span>
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
