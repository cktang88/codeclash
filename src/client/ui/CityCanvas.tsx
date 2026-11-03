import { useEffect, useRef, useState } from 'react';
import type { BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { CityScene, MAX_ZOOM, MIN_ZOOM, type CityMood } from '../render/city.ts';
import { cityArt } from '../settings.ts';
import { useArtMode } from './useArtMode.ts';
import { canvasSize } from './canvasSize.ts';
import { CITY_SPEEDS, SpeedControls } from './SpeedControls.tsx';

/**
 * The living commandery. Wheel or the buttons zoom by whole pixels, drag pans, pinch zooms and
 * one finger pans on touch; the reset button fits the whole city again. Pause and ¼×–4× scale the
 * time handed to the scene (townsfolk, beasts, flags, smoke, lights).
 *
 * `hoursPerSecond` runs a day/night time-lapse: from `mood.hour` the clock moves on by that many
 * hours per second of (scaled) city time. Without it the hour is `mood.hour`, or the viewer's clock.
 */
export function CityCanvas(props: {
  faction: FactionId;
  hue: number;
  seed: number;
  levels: Record<BuildingKey, number>;
  recruits: number;
  mood?: CityMood;
  hoursPerSecond?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const state = useRef({ ...props, speed, paused });
  state.current = { ...props, speed, paused };
  // Classic or HD art (settings.ts; HD 64 is a battle mode, its city is HD); the scene is rebuilt
  // when the player switches.
  // useArtMode follows a change made in another tab too (the storage event), as the art picker does.
  const mode = cityArt(useArtMode()[0]);
  useEffect(() => {
    const canvas = ref.current!;
    const scene = new CityScene(props.faction, props.hue, props.seed, mode);
    sceneRef.current = scene;
    // The canvas in device pixels, each a whole number k × k of the screen's (canvasSize: k = 2 on
    // a 3x phone, where 1.5 × 1.5 made the art's rows and columns uneven), sized from its holder
    // (the canvas's own size is set here, so measuring it would feed back).
    const holder = canvas.parentElement!;
    const resize = () => {
      const r = holder.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      const { w, h, cssW, cssH } = canvasSize(Math.round(r.width * d), Math.round(r.height * d), d);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);
    // A change of devicePixelRatio alone (a window dragged to another screen, a page zoom).
    let mq: MediaQueryList | null = null;
    const onDpr = () => {
      mq?.removeEventListener('change', onDpr);
      mq = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      mq?.addEventListener('change', onDpr);
      resize();
    };
    onDpr();

    // Pointers: one drags, two pinch.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    /** A client point in canvas pixels. */
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const k = canvas.width / Math.max(1, r.width);
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (pts.size === 1) scene.panBy(p.x - prev.x, p.y - prev.y);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        // A whole zoom step each time the fingers spread or close by 40%.
        if (pinch0 > 0 && (d / pinch0 > 1.4 || d / pinch0 < 1 / 1.4)) {
          scene.zoomAt(d > pinch0 ? 1 : -1, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
          pinch0 = d;
        }
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch0 = 0;
    };
    let wheelAcc = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < 60) return;
      const p = local(e as unknown as PointerEvent);
      scene.zoomAt(wheelAcc < 0 ? 1 : -1, p.x, p.y);
      wheelAcc = 0;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    // The time-lapse clock: restarts from mood.hour whenever that changes.
    let lapseFrom: number | undefined;
    let lapse = 0;
    let shown = -1;
    // Scripted checks (?probe): the city time drawn so far, in (scaled) seconds.
    const probe = /[?&]probe\b/.test(location.search) ? ((window as unknown as { cityProbe?: { t: number } }).cityProbe = { t: 0 }) : null;
    const loop = (now: number) => {
      const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const s = state.current;
      const dt = s.paused ? 0 : real * s.speed;
      let mood = s.mood;
      if (s.hoursPerSecond) {
        const from = s.mood?.hour ?? 12;
        if (from !== lapseFrom) {
          lapseFrom = from;
          lapse = from;
        }
        lapse = (lapse + dt * s.hoursPerSecond) % 24;
        mood = { ...s.mood, hour: lapse };
        // The clock face, in quarter hours (a re-render per quarter, not per frame).
        const q = Math.floor(lapse * 4);
        if (q !== shown) {
          shown = q;
          setClock(q / 4);
        }
      } else if (shown !== -1) {
        shown = -1;
        lapseFrom = undefined;
        setClock(null);
      }
      scene.draw(canvas, s.levels, s.recruits, dt, mood);
      if (probe) probe.t += dt;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mq?.removeEventListener('change', onDpr);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      sceneRef.current = null;
    };
  }, [props.faction, props.hue, props.seed, mode]);
  const zoom = (k: number) => sceneRef.current?.zoomAt(k);
  return (
    <div className="city-view">
      {/* The picture's own box: the canvas is sized from it, and on a phone the controls sit below it, not on it. */}
      <div className="city-pic">
        <canvas ref={ref} className="city-canvas" style={{ touchAction: 'none', cursor: 'grab' }} />
      </div>
      <div className="city-zoom" role="group" aria-label="Zoom the commandery">
        <button type="button" onClick={() => zoom(1)} title={`Zoom in (up to ${MAX_ZOOM}×)`} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(-1)} title={`Zoom out (to ${MIN_ZOOM}×)`} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => sceneRef.current?.resetView()} title="Show the whole commandery" aria-label="Fit the whole city">⤢</button>
      </div>
      <div className="city-speed">
        <SpeedControls speeds={CITY_SPEEDS} speed={speed} paused={paused} onSpeed={setSpeed} onPause={setPaused} />
        {clock !== null && <span className="mono city-clock">{String(Math.floor(clock)).padStart(2, '0')}:{String(Math.round((clock % 1) * 60)).padStart(2, '0')}</span>}
      </div>
    </div>
  );
}
