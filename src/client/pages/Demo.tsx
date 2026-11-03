import { useEffect, useMemo, useState } from 'react';
import type { FactionId } from '../../game/factions.ts';
import { DEMO_SIZES, demoSetup } from '../demo.ts';
import { browserClick } from '../route.ts';
import { BattleView } from '../ui/BattleView.tsx';
import { ArtSelect, FactionSelect } from '../ui/ShowcaseControls.tsx';
import { ShowcaseCity } from './ShowcaseCity.tsx';
import { ShowcaseUnits } from './ShowcaseUnits.tsx';

// The public showcase: battles, towns and every figure, all drawn in the browser. No sign-in, no
// server: everything here is made from a seed on the client.

export type ShowcaseTab = 'battle' | 'city' | 'units';
const TABS: [ShowcaseTab, string][] = [
  ['battle', 'Battle'],
  ['city', 'Town'],
  ['units', 'Units'],
];

function tabOf(search: string): ShowcaseTab {
  const t = new URLSearchParams(search).get('tab');
  return t === 'city' || t === 'units' ? t : 'battle';
}

/** The tab, kept in the URL (/demo?tab=city) so a link or a reload lands on it. */
function useTab(): [ShowcaseTab, (t: ShowcaseTab) => void] {
  const [tab, setTab] = useState(() => tabOf(location.search));
  useEffect(() => {
    const on = () => setTab(tabOf(location.search));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const pick = (t: ShowcaseTab) => {
    const q = new URLSearchParams(location.search);
    if (t === 'battle') q.delete('tab');
    else q.set('tab', t);
    const s = q.toString();
    history.pushState(null, '', `${location.pathname}${s ? `?${s}` : ''}`);
    // Tell the app too (as route.ts go() does): its sign-in link returns to the address shown.
    window.dispatchEvent(new PopStateEvent('popstate'));
    setTab(t);
  };
  return [tab, pick];
}

const newSeed = () => Math.floor(Math.random() * 1e9);

function BattleTab() {
  const [seed, setSeed] = useState(newSeed);
  const [men, setMen] = useState(450);
  const [fa, setFa] = useState<FactionId | null>(null);
  const [fb, setFb] = useState<FactionId | null>(null);
  const setup = useMemo(() => demoSetup(seed, men, [fa, fb]), [seed, men, fa, fb]);
  return (
    <>
      <div className="showcase-bar">
        <FactionSelect label="Left" value={fa} onChange={setFa} />
        <FactionSelect label="Right" value={fb} onChange={setFb} />
        <label className="inline">
          <span>Size</span>
          <select value={men} onChange={(e) => setMen(Number(e.target.value))}>
            {DEMO_SIZES.map((s) => (
              <option key={s.men} value={s.men}>{s.label}</option>
            ))}
          </select>
        </label>
        <ArtSelect />
        <button type="button" onClick={() => setSeed(newSeed())}>Another battle</button>
      </div>
      <BattleView key={`${seed}:${men}:${fa}:${fb}`} setup={setup} title={men > 1500 ? 'The Grand Battle' : 'Sparring'} />
    </>
  );
}

export function Demo() {
  const [tab, setTab] = useTab();
  return (
    <div className={`battle-page showcase showcase-on-${tab}`}>
      <nav className="tabs showcase-tabs" aria-label="Showcase">
        {TABS.map(([k, label]) => (
          <a
            key={k}
            href={k === 'battle' ? '/demo' : `/demo?tab=${k}`}
            className={tab === k ? 'on' : ''}
            aria-current={tab === k ? 'page' : undefined}
            onClick={(e) => {
              if (browserClick(e)) return;
              e.preventDefault();
              setTab(k);
            }}
          >
            {label}
          </a>
        ))}
        <span className="showcase-note muted">Drawn in your browser; no sign-in needed.</span>
      </nav>
      {tab === 'battle' && <BattleTab />}
      {tab === 'city' && <ShowcaseCity />}
      {tab === 'units' && <ShowcaseUnits />}
    </div>
  );
}
