import { useEffect, useMemo, useState } from 'react';
import { BUILDINGS, MAX_LEVEL, type BuildingKey } from '../../game/city.ts';
import { FACTIONS, type FactionId } from '../../game/factions.ts';
import type { CityMood } from '../render/city.ts';
import { CityCanvas } from '../ui/CityCanvas.tsx';
import { ArtSelect, FactionSelect } from '../ui/ShowcaseControls.tsx';

// The showcase's town: any faction at any stage, hour and mood, drawn wholly in the browser.

type Levels = Record<BuildingKey, number>;
const L = (b: number, r: number, s: number, w: number, c: number, g: number, h: number, wl: number): Levels => ({
  barracks: b, range: r, stables: s, workshop: w, chapter: c, granary: g, hospital: h, walls: wl,
});
const army = (k: number) => [k * 4, k * 3, k, k * 2, k, k, k, k, k, 0];
const all = (n: number): Levels => Object.fromEntries(BUILDINGS.map((b) => [b.key, n])) as Levels;

interface Preset {
  name: string;
  levels: Levels;
  recruits: number;
  mood: CityMood;
}

/** The stages of src/client/city-preview.ts (kept in step by hand: that page is a dev tool). */
const PRESETS: Preset[] = [
  { name: 'Fresh', levels: L(0, 0, 0, 0, 0, 0, 0, 0), recruits: 0, mood: { hour: 11, idle: true } },
  { name: 'Early', levels: L(3, 2, 1, 2, 4, 1, 2, 3), recruits: 6, mood: { hour: 10, streak: 1, army: army(1), progress: { chapter: 0.8 } } },
  { name: 'Mid', levels: L(8, 6, 7, 5, 9, 6, 5, 10), recruits: 16, mood: { hour: 15, streak: 2, army: army(3) } },
  { name: 'Late', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 13, streak: 6, wins: 3, army: army(6) } },
  { name: 'Mid, idle', levels: L(8, 6, 7, 5, 9, 2, 5, 10), recruits: 8, mood: { hour: 14, idle: true, army: army(2) } },
  { name: 'Late, night', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 23, streak: 6, army: army(6) } },
  { name: 'Mid, dusk', levels: L(8, 6, 7, 5, 9, 6, 5, 10), recruits: 16, mood: { hour: 19.2, streak: 3, army: army(3) } },
  { name: 'Late, marching out at dawn', levels: L(18, 14, 15, 12, 20, 16, 13, 17), recruits: 32, mood: { hour: 6.6, streak: 6, army: army(6), marching: true } },
];

type Time = 'live' | 'dawn' | 'day' | 'dusk' | 'night' | 'cycle' | 'hour';
const TIMES: [Time, string, number | undefined][] = [
  ['live', 'Live (your clock)', undefined],
  ['dawn', 'Dawn', 6.6],
  ['day', 'Day', 12],
  ['dusk', 'Dusk', 19.2],
  ['night', 'Night', 23],
  ['cycle', 'Day and night (time-lapse)', undefined],
  ['hour', 'Pick the hour', undefined],
];
/** Time-lapse: a whole day in 48 seconds at 1×. */
const LAPSE_HOURS_PER_SECOND = 0.5;

const hourText = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

function timeOf(hour: number | undefined): Time {
  const hit = TIMES.find(([, , h]) => h !== undefined && h === hour);
  return hit ? hit[0] : hour === undefined ? 'live' : 'hour';
}

export function ShowcaseCity() {
  const [faction, setFaction] = useState<FactionId>('templar');
  const [seed, setSeed] = useState(1234);
  const [hue, setHue] = useState(200);
  // Either a preset (index) or every building at one level (null).
  const [preset, setPreset] = useState<number | null>(3);
  const [level, setLevel] = useState(12);
  // The town follows the slider once the thumb rests: each new set of levels is a whole rebuild (HD
  // builds in a worker, one after another), so a drag across twenty levels must not queue twenty.
  const [built, setBuilt] = useState(12);
  useEffect(() => {
    const t = setTimeout(() => setBuilt(level), 250);
    return () => clearTimeout(t);
  }, [level]);
  const [time, setTime] = useState<Time>('day');
  const [hour, setHour] = useState(12);
  const [festive, setFestive] = useState(true);
  const [idle, setIdle] = useState(false);
  const [marching, setMarching] = useState(false);

  const pickPreset = (i: number) => {
    const p = PRESETS[i]!;
    setPreset(i);
    setFestive((p.mood.streak ?? 0) >= 3);
    setIdle(!!p.mood.idle);
    setMarching(!!p.mood.marching);
    const t = timeOf(p.mood.hour);
    setTime(t);
    if (p.mood.hour !== undefined) setHour(p.mood.hour);
  };

  const view = useMemo(() => {
    const base: Preset =
      preset !== null
        ? PRESETS[preset]!
        : { name: `Level ${built}`, levels: all(built), recruits: built * 2, mood: { army: army(Math.ceil(built / 3)), wins: Math.floor(built / 6) } };
    const streak = festive ? Math.max(6, base.mood.streak ?? 0) : Math.min(2, base.mood.streak ?? 0);
    const fixed = TIMES.find(([k]) => k === time)?.[2];
    const h = time === 'live' ? undefined : time === 'hour' ? hour : time === 'cycle' ? hour : fixed;
    const mood: CityMood = { ...base.mood, streak, idle, marching, hour: h };
    return { levels: base.levels, recruits: idle ? Math.ceil(base.recruits / 2) : base.recruits, mood };
  }, [preset, built, festive, idle, marching, time, hour]);

  return (
    <>
      <div className="showcase-bar">
        <FactionSelect label="Faction" value={faction} random={false} onChange={(f) => f && setFaction(f)} />
        <ArtSelect />
        <label className="inline">
          <span>Stage</span>
          <select value={preset ?? ''} onChange={(e) => (e.target.value === '' ? setPreset(null) : pickPreset(Number(e.target.value)))}>
            {PRESETS.map((p, i) => (
              <option key={p.name} value={i}>{p.name}</option>
            ))}
            <option value="">Every building at one level</option>
          </select>
        </label>
        <label className="inline range">
          <span>Town level <b className="mono">{preset === null ? level : '–'}</b></span>
          <input
            type="range"
            min={0}
            max={MAX_LEVEL}
            value={level}
            aria-label="Town level: every building"
            onChange={(e) => {
              setLevel(Number(e.target.value));
              setPreset(null);
            }}
          />
        </label>
        <label className="inline">
          <span>Time</span>
          <select value={time} onChange={(e) => setTime(e.target.value as Time)}>
            {TIMES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        {(time === 'hour' || time === 'cycle') && (
          <label className="inline range">
            <span>{time === 'cycle' ? 'From' : 'Hour'} <b className="mono">{hourText(hour)}</b></span>
            <input type="range" min={0} max={23.75} step={0.25} value={hour} aria-label="Hour of day" onChange={(e) => setHour(Number(e.target.value))} />
          </label>
        )}
        <span className="showcase-toggles" role="group" aria-label="Mood">
          <button type="button" className={festive ? 'on' : ''} aria-pressed={festive} onClick={() => setFestive((x) => !x)} title="A streak of three days or more: bunting and banners">Festive</button>
          <button type="button" className={idle ? 'on' : ''} aria-pressed={idle} onClick={() => setIdle((x) => !x)} title="No push today: a quiet town">Idle</button>
          <button type="button" className={marching ? 'on' : ''} aria-pressed={marching} onClick={() => setMarching((x) => !x)} title="The army marches out to battle">Marching out</button>
        </span>
        <button
          type="button"
          onClick={() => {
            setSeed((s) => (s * 16807 + 11) % 2147483647);
            setHue((h) => (h + 97) % 360);
          }}
          title="Another lord's town: new colours and layout"
        >
          Another town
        </button>
      </div>
      <div className="showcase-scroll">
        <div className="showcase-city">
          <div className="city-who">
            <h2>{FACTIONS[faction].name}</h2>
            <span className="muted"><i>{FACTIONS[faction].motto}</i></span>
          </div>
          <div className="city-stage">
            <CityCanvas
              faction={faction}
              hue={hue}
              seed={seed}
              levels={view.levels}
              recruits={view.recruits}
              mood={view.mood}
              hoursPerSecond={time === 'cycle' ? LAPSE_HOURS_PER_SECOND : undefined}
            />
          </div>
          <p className="muted small showcase-help">Drag to pan, wheel or pinch to zoom. The buttons at the foot slow the town down to a quarter or speed it up to four times.</p>
        </div>
      </div>
    </>
  );
}
