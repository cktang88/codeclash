import { useEffect, useRef } from 'react';
import type { BuildingKey } from '../../game/city.ts';
import type { FactionId } from '../../game/factions.ts';
import { CityScene } from '../render/city.ts';

export function CityCanvas(props: { faction: FactionId; hue: number; seed: number; levels: Record<BuildingKey, number>; recruits: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef(props);
  state.current = props;
  useEffect(() => {
    const canvas = ref.current!;
    const scene = new CityScene(props.faction, props.hue, props.seed);
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      scene.draw(canvas, state.current.levels, state.current.recruits, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [props.faction, props.hue, props.seed]);
  return <canvas ref={ref} className="city-canvas" />;
}
