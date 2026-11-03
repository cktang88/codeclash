import { useEffect, useMemo, useState } from 'react';
import type { LeagueCard, MeResponse } from '../../protocol.ts';
import { api } from '../api.ts';
import { demoSetup } from '../demo.ts';
import { go, linkProps } from '../route.ts';
import { BattleView } from '../ui/BattleView.tsx';

function LeagueList({ leagues, empty }: { leagues: LeagueCard[]; empty: string }) {
  if (leagues.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="league-list">
      {leagues.map((l) => (
        <li key={l.slug}>
          <a {...linkProps(`/l/${l.slug}`)}>
            <span className="league-name">{l.name}</span>
            <span className="muted">
              {l.players} {l.players === 1 ? 'lord' : 'lords'}
              {l.bots > 0 ? ` · ${l.bots} sparring` : ''} · battle at {String(l.resetHour).padStart(2, '0')}:00 UTC
              {l.visibility === 'private' ? ' · private' : ''}
            </span>
            {l.champion && <span className="champion">♛ {l.champion.login}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

function CreateLeague({ onDone }: { onDone: (slug: string) => void }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [resetHour, setResetHour] = useState(0);
  const [bots, setBots] = useState(2);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="panel create"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const l = await api.createLeague({ name, visibility, resetHour, bots });
          onDone(l.slug);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <h3>Found a league</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Night Watch" maxLength={48} required minLength={2} />
      </label>
      <div className="row">
        <label>
          Battle hour (UTC)
          <select value={resetHour} onChange={(e) => setResetHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </label>
        <label>
          Sparring bots
          <select value={bots} onChange={(e) => setBots(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          Who may watch
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
            <option value="private">Invite only</option>
            <option value="public">Anyone</option>
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">Raise the banner</button>
    </form>
  );
}

/** `onChange` reloads the signed-in player (their league list) after founding a league. */
export function Home({ me, onChange }: { me: MeResponse | null; onChange?: () => void }) {
  const [pub, setPub] = useState<LeagueCard[]>([]);
  const hero = useMemo(() => demoSetup(Math.floor(Math.random() * 1e9), 380), []);
  useEffect(() => {
    api.leagues().then(setPub, () => setPub([]));
  }, []);
  return (
    <div className="home">
      <section className="hero">
        <BattleView setup={hero} ambient />
        <div className="hero-copy">
          <h1>Code Clash</h1>
          <p className="lede">Your commits build a commandery. Your commandery trains an army. Every night at the bell, it marches.</p>
          <div className="hero-actions">
            {me?.user ? null : me?.oauth ? (
              <a className="button primary" href={`/auth/github?next=${encodeURIComponent('/')}`}>Sign in with GitHub</a>
            ) : me?.devAuth ? (
              <a className="button primary" href="/auth/dev?login=ana">Sign in (dev) as ana</a>
            ) : null}
            <a className="button" {...linkProps('/demo')}>Watch a battle</a>
            <a className="button" {...linkProps('/demo?tab=city')}>Explore a town</a>
            <a className="button" {...linkProps('/demo?tab=units')}>Meet the armies</a>
          </div>
          <p className="muted small hero-note">No sign-in needed: battles, towns and every soldier are drawn right here in your browser.</p>
        </div>
      </section>

      <section className="how">
        <div>
          <h3>Ⅰ · Code builds the city</h3>
          <p>Every push to a public repository is measured: real code raises the Sergeants’ Hall, logic raises the Archery Butts, refactors the Stables, tests the Hospital and Walls, docs the Chapter House. Filler and copy-paste count for nothing.</p>
        </div>
        <div>
          <h3>Ⅱ · The city trains soldiers</h3>
          <p>Buildings train men every hour, day and night; fresh work calls up a levy at once. Push every day: each day in a row makes the city train faster, and on a day without a push most of the garrison stays home.</p>
        </div>
        <div>
          <h3>Ⅲ · Every night, a battle</h3>
          <p>At the league’s hour each day’s soldiers meet another lord’s, one against one. Victory makes veterans and lifts the city’s output for the rest of the week.</p>
        </div>
        <div>
          <h3>Ⅳ · Every week, the Grand Battle</h3>
          <p>On the seventh night everyone trained that week takes the field at once. Then the cities are razed, and the next week begins from nothing.</p>
        </div>
      </section>

      {me?.user && (
        <section>
          <h2>Your leagues</h2>
          <LeagueList leagues={me.leagues} empty="You have not sworn to any league yet. Found one, or join a public one below." />
          <CreateLeague
            onDone={(slug) => {
              onChange?.();
              go(`/l/${slug}`);
            }}
          />
        </section>
      )}
      <section>
        <h2>Open leagues</h2>
        <LeagueList leagues={pub} empty="None yet." />
      </section>
    </div>
  );
}
