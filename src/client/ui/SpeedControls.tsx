import type { ReactNode } from 'react';

/** Playback speeds of the battle: a fixed-tick sim run at more or fewer ticks per real second. */
export const BATTLE_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;
/** Playback speeds of the living city (the dt handed to CityScene.draw is scaled by these). */
export const CITY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function speedLabel(s: number): string {
  return s === 0.25 ? '¼×' : s === 0.5 ? '½×' : `${s}×`;
}

/**
 * Pause and a row of speeds, as one `hud-group` (it never splits inside; see styles.css).
 * `children` go at the end of the group (the battle's "to the end").
 */
export function SpeedControls(props: {
  speeds: readonly number[];
  speed: number;
  paused: boolean;
  onSpeed: (s: number) => void;
  onPause: (paused: boolean) => void;
  /** The pause button is disabled (a finished battle). */
  done?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { speeds, speed, paused, onSpeed, onPause, done } = props;
  return (
    <span className={`hud-group speed-group${props.className ? ` ${props.className}` : ''}`} role="group" aria-label="Speed">
      <button type="button" onClick={() => onPause(!paused)} disabled={done} className={paused ? 'on' : ''} title={paused ? 'Play' : 'Pause'} aria-label={paused ? 'Play' : 'Pause'}>
        {paused ? '▶' : '❚❚'}
      </button>
      {speeds.map((s) => (
        <button
          type="button"
          key={s}
          className={speed === s ? 'on' : ''}
          aria-pressed={speed === s}
          title={s < 1 ? `Slow motion (${speedLabel(s)})` : `Speed ${speedLabel(s)}`}
          onClick={() => {
            onSpeed(s);
            if (paused) onPause(false);
          }}
        >
          {speedLabel(s)}
        </button>
      ))}
      {props.children}
    </span>
  );
}
