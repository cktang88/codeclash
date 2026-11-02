import { useEffect, useRef } from 'react';
import type { BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { CityScene, MAX_ZOOM, MIN_ZOOM, type CityMood } from '../render/city.ts';

/**
 * The living commandery. Wheel or the buttons zoom by whole pixels, drag pans, pinch zooms and
 * one finger pans on touch; the reset button fits the whole city again.
 */
export function CityCanvas(props: { faction: FactionId; hue: number; seed: number; levels: Record<BuildingKey, number>; recruits: number; mood?: CityMood }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const state = useRef(props);
  state.current = props;
  useEffect(() => {
    const canvas = ref.current!;
    const scene = new CityScene(props.faction, props.hue, props.seed);
    sceneRef.current = scene;
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr()));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr()));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pointers: one drags, two pinch.
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * dpr(), y: (e.clientY - r.top) * dpr() };
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
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const s = state.current;
      scene.draw(canvas, s.levels, s.recruits, dt, s.mood);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      sceneRef.current = null;
    };
  }, [props.faction, props.hue, props.seed]);
  const zoom = (k: number) => sceneRef.current?.zoomAt(k);
  return (
    <div className="city-view">
      <canvas ref={ref} className="city-canvas" style={{ touchAction: 'none', cursor: 'grab' }} />
      <div className="city-zoom" role="group" aria-label="Zoom the commandery">
        <button type="button" onClick={() => zoom(1)} title={`Zoom in (up to ${MAX_ZOOM}×)`} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(-1)} title={`Zoom out (to ${MIN_ZOOM}×)`} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => sceneRef.current?.resetView()} title="Show the whole commandery" aria-label="Fit the whole city">⤢</button>
      </div>
    </div>
  );
}
