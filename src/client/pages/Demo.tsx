import { useMemo, useState } from 'react';
import { demoSetup } from '../demo.ts';
import { BattleView } from '../ui/BattleView.tsx';

export function Demo() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [men, setMen] = useState(450);
  const setup = useMemo(() => demoSetup(seed, men), [seed, men]);
  return (
    <div className="battle-page">
      <div className="battle-crumbs">
        <span>A sparring battle between two commanderies, fought in your browser.</span>
        <span className="sep" />
        <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>Another</button>
        <select value={men} onChange={(e) => setMen(Number(e.target.value))}>
          <option value={150}>A skirmish (150 men)</option>
          <option value={450}>A daily battle (450 men)</option>
          <option value={1200}>A strong day (1,200 men)</option>
          <option value={4000}>A Grand Battle (4,000 men)</option>
        </select>
      </div>
      <BattleView key={`${seed}:${men}`} setup={setup} title={men > 1500 ? 'The Grand Battle' : 'Sparring'} />
    </div>
  );
}
