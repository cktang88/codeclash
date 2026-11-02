import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FACTIONS } from '../game/factions.ts';
import type { MeResponse } from '../protocol.ts';
import { api } from './api.ts';
import { BattlePage } from './pages/BattlePage.tsx';
import { Demo } from './pages/Demo.tsx';
import { Home } from './pages/Home.tsx';
import { LeaguePage } from './pages/League.tsx';
import { linkProps, useRoute } from './route.ts';
import { hsl } from './render/sprites.ts';
import './styles.css';

function Account({ me, onChange }: { me: MeResponse; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const u = me.user!;
  return (
    <div className="account">
      <button className="quiet" onClick={() => setOpen((o) => !o)}>
        <span className="swatch" style={{ background: hsl(u.hue, 55, 38) }} />
        {u.login}
      </button>
      {open && (
        <div className="panel account-menu">
          <label>
            Faction
            <select value={u.faction} onChange={(e) => api.setLook(e.target.value, u.hue).then(onChange)}>
              {Object.values(FACTIONS).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label>
            Colours
            <input type="range" min={0} max={359} value={u.hue} onChange={(e) => api.setLook(u.faction, Number(e.target.value)).then(onChange)} style={{ accentColor: hsl(u.hue, 55, 45) }} />
          </label>
          <p className="muted small">
            GitHub: {u.github.status === 'ok' ? 'reading your public pushes on your own rate limit' : u.github.status === 'invalid' ? 'sign in again to keep reading your pushes' : 'not connected'}
          </p>
          <button onClick={() => api.logout().then(() => location.assign('/'))}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function App() {
  const route = useRoute();
  const [me, setMe] = useState<MeResponse | null>(null);
  const load = () => api.me().then(setMe, () => setMe({ user: null, leagues: [], oauth: false, devAuth: false }));
  useEffect(() => {
    void load();
  }, []);
  const full = route.page === 'battle' || route.page === 'demo';
  return (
    <div className={full ? 'app full' : 'app'}>
      <header className="topbar">
        <a className="brand" {...linkProps('/')}>
          <span className="cross" />
          Code Clash
        </a>
        <span className="sep" />
        <a {...linkProps('/demo')}>Watch a battle</a>
        {me?.user ? (
          <Account me={me} onChange={load} />
        ) : me?.oauth ? (
          <a className="button small" href={`/auth/github?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in with GitHub</a>
        ) : null}
      </header>
      <main>
        {route.page === 'home' && <Home me={me} />}
        {route.page === 'league' && <LeaguePage slug={route.slug} tab={route.tab} member={route.member} me={me} />}
        {route.page === 'battle' && <BattlePage id={route.id} />}
        {route.page === 'demo' && <Demo />}
        {route.page === 'notfound' && <div className="page"><h1>Lost in the desert</h1><p><a {...linkProps('/')}>Return to the commandery</a></p></div>}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
