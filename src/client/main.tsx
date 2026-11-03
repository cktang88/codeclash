import { StrictMode, useEffect, useRef, useState } from 'react';
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
import { ART_LABEL, useArtMode } from './ui/useArtMode.ts';
import { ART_MODES, parseArt } from './settings.ts';
import './styles.css';

function Account({ me, onChange }: { me: MeResponse; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [art, setArt] = useArtMode();
  const u = me.user!;
  // The slider follows the hand at once and saves once it rests: a request per input event lagged the thumb
  // behind the round trip (snapping it back while dragging) and could land out of order.
  const [hue, setHue] = useState(u.hue);
  const saveHue = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setHue(u.hue), [u.hue]);
  useEffect(() => () => clearTimeout(saveHue.current), []);
  const pickHue = (h: number) => {
    setHue(h);
    clearTimeout(saveHue.current);
    saveHue.current = setTimeout(() => void api.setLook(u.faction, h).then(onChange, onChange), 250);
  };
  // The menu closes on Escape (focus back on its button) and on a press anywhere outside it.
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    const press = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', press);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', press);
    };
  }, [open]);
  return (
    <div className="account" ref={box}>
      <button ref={toggle} className="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="account-menu">
        <span className="swatch" style={{ background: hsl(u.hue, 55, 38) }} />
        {u.login}
      </button>
      {open && (
        <div className="panel account-menu" id="account-menu">
          <label>
            Faction
            <select value={u.faction} onChange={(e) => api.setLook(e.target.value, hue).then(onChange, onChange)}>
              {Object.values(FACTIONS).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label>
            Colours
            <input type="range" min={0} max={359} value={hue} onChange={(e) => pickHue(Number(e.target.value))} style={{ accentColor: hsl(hue, 55, 45) }} />
          </label>
          <label>
            Pixel art
            <select value={art} onChange={(e) => setArt(parseArt(e.target.value))}>
              {ART_MODES.map((m) => (
                <option key={m} value={m}>{ART_LABEL[m]}</option>
              ))}
            </select>
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
        {route.page === 'home' && <Home me={me} onChange={load} />}
        {route.page === 'league' && <LeaguePage slug={route.slug} tab={route.tab} member={route.member} me={me} onChange={load} />}
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
