import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILDINGS, MAX_LEVEL, type BuildingKey } from '../../game/city.ts';
import { FACTIONS } from '../../game/factions.ts';
import { DAILY_POINTS, GRAND_POINTS, HONOUR_POINTS } from '../../game/league.ts';
import { total, UNIT_COUNT } from '../../game/units.ts';
import type { BattleCard, CityView, LeagueDetail, MeResponse, MemberSummary } from '../../protocol.ts';
import { api } from '../api.ts';
import { clockTime, DAY_NAMES, duration, n, ROMAN, weekLabel } from '../format.ts';
import { go, linkProps } from '../route.ts';
import { hsl } from '../render/sprites.ts';
import { CityCanvas } from '../ui/CityCanvas.tsx';

function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const TABS = [
  ['city', 'Commandery'],
  ['battles', 'Battles'],
  ['standings', 'Standings'],
  ['rules', 'Rules of war'],
] as const;

/** Copies the invite link and says so; where the clipboard is refused, shows the link selected to copy by hand. */
function InviteLink({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  useEffect(() => {
    if (state !== 'copied') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);
  const copy = () => {
    if (!navigator.clipboard) return setState('manual');
    navigator.clipboard.writeText(url).then(() => setState('copied'), () => setState('manual'));
  };
  if (state === 'manual') {
    return (
      <label className="invite-manual small muted">
        Copy this invite link:
        <input readOnly value={url} autoFocus onFocus={(e) => e.currentTarget.select()} />
      </label>
    );
  }
  return <button onClick={copy}>{state === 'copied' ? 'Copied ✓' : 'Copy invite link'}</button>;
}

function Banner({ hue }: { hue: number }) {
  return <span className="swatch" style={{ background: hsl(hue, 55, 38) }} />;
}

export function LeaguePage({ slug, tab, member, me }: { slug: string; tab: string | null; member: number | null; me: MeResponse | null }) {
  const [loaded, setLoaded] = useState<{ slug: string; detail: LeagueDetail } | null>(null);
  const [failed, setFailed] = useState<{ slug: string; message: string } | null>(null);
  const now = useNow();
  // A response for a league we have since left is dropped, and state from another league is never shown.
  const current = useRef(slug);
  current.current = slug;
  const detail = loaded?.slug === slug ? loaded.detail : null;
  const error = failed?.slug === slug ? failed.message : null;
  const setError = useCallback((message: string) => setFailed({ slug, message }), [slug]);
  const load = useCallback(() => {
    api.league(slug).then(
      (d) => {
        if (current.current !== slug) return;
        setLoaded({ slug, detail: d });
        setFailed(null);
      },
      (e: Error) => current.current === slug && setError(e.message),
    );
  }, [slug, setError]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  // Fetch again just after each battle.
  useEffect(() => {
    if (!detail) return;
    const wait = detail.clock.nextBattleAt - Date.now() + 8000;
    if (wait <= 0 || wait > 2 ** 31 - 1) return;
    const t = setTimeout(load, wait);
    return () => clearTimeout(t);
  }, [detail, load]);

  // Once the league is shown, a failed refresh or action is reported above the tabs instead of replacing the page.
  if (error && !detail) return <div className="page"><p className="error">{error}</p></div>;
  if (!detail) return <div className="page"><p className="muted">Unrolling the muster…</p></div>;

  const signedIn = me?.user != null;
  const mine = detail.viewer.userId;
  const active = tab !== null && TABS.some(([k]) => k === tab) ? tab : detail.viewer.member ? 'city' : 'standings';
  const cityOf = member ?? (detail.viewer.member && mine !== null ? mine : detail.members[0]?.user.id ?? null);
  const left = detail.clock.nextBattleAt - now;
  const day = detail.clock.day;

  return (
    <div className="page league">
      <header className="league-head">
        <div>
          <div className="kicker">{detail.visibility === 'private' ? 'Private league' : 'League'} · battle at {String(detail.resetHour).padStart(2, '0')}:00 UTC</div>
          <h1>{detail.name}</h1>
        </div>
        <div className="countdown">
          <div className="kicker">Day {ROMAN[day]} of VII · {DAY_NAMES[day]}</div>
          <div className="big mono">{duration(left)}</div>
          <div className="muted">{detail.clock.grandNext ? 'until the last skirmish, and then the Grand Battle' : 'until tonight’s battle'}</div>
        </div>
      </header>
      <div className="league-actions">
        {!detail.viewer.member && signedIn && (
          <button className="primary" onClick={() => api.join(slug).then(load, (e: Error) => setError(e.message))}>Swear to this league</button>
        )}
        {!signedIn && me?.oauth && <a className="button primary" href={`/auth/github?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in with GitHub to join</a>}
        {detail.invite && (
          <InviteLink url={`${location.origin}/l/${slug}?invite=${detail.invite}`} />
        )}
        {detail.viewer.member && !detail.viewer.owner && (
          <button className="quiet" onClick={() => confirm('Leave this league?') && api.leave(slug).then(() => go('/'), (e: Error) => setError(e.message))}>Leave</button>
        )}
        {detail.viewer.owner && (
          <button className="quiet danger" onClick={() => confirm('Delete this league and its history for everyone?') && api.deleteLeague(slug).then(() => go('/'), (e: Error) => setError(e.message))}>Delete league</button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <nav className="tabs">
        {TABS.map(([k, label]) => (
          <a key={k} className={active === k ? 'on' : ''} {...linkProps(`/l/${slug}/${k}`)}>{label}</a>
        ))}
      </nav>
      {active === 'city' && cityOf !== null && <CityTab slug={slug} id={cityOf} detail={detail} />}
      {active === 'battles' && <BattlesTab detail={detail} />}
      {active === 'standings' && <StandingsTab detail={detail} slug={slug} />}
      {active === 'rules' && <RulesTab />}
    </div>
  );
}

// ------------------------------------------------------------------ the city

function CityTab({ slug, id, detail }: { slug: string; id: number; detail: LeagueDetail }) {
  // Keyed by the city it shows, so switching lords never shows the last lord's city under the new name.
  const key = `${slug}/${id}`;
  const [loaded, setLoaded] = useState<{ key: string; view: CityView } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      api.city(slug, id).then(
        (v) => {
          if (!live) return;
          setLoaded({ key, view: v });
          setFailed(null);
        },
        (e: Error) => live && setFailed({ key, message: e.message }),
      );
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [slug, id, key]);
  const view = loaded?.key === key ? loaded.view : null;
  const known = detail.members.some((m) => m.user.id === id);
  const picker = (
    <select value={id} onChange={(e) => go(`/l/${slug}/city/${e.target.value}`)}>
      {/* An id that is not a member gets a placeholder, so every real lord can still be picked. */}
      {!known && <option value={id} disabled>Choose a lord…</option>}
      {detail.members.map((m) => (
        <option key={m.user.id} value={m.user.id}>{m.user.login}{m.user.bot ? ' (sparring bot)' : ''}</option>
      ))}
    </select>
  );
  if (!view && failed?.key === key) {
    return (
      <div className="city">
        <div className="city-who">{picker}</div>
        <p className="error">{failed.message}</p>
      </div>
    );
  }
  if (!view) return <p className="muted">Riding out to the commandery…</p>;
  const { city, look } = view;
  const f = FACTIONS[look.faction];
  const levels = Object.fromEntries(city.buildings.map((b) => [b.key, b.level])) as Record<BuildingKey, number>;
  const today = total(city.today);
  const rate = total(city.ratePerHour);
  const grand = total(view.grand.counts);
  return (
    <div className="city">
      <div className="city-who">
        {picker}
        <span className="muted">{f.name} · <i>{f.motto}</i></span>
      </div>
      <div className="city-stage">
        <CityCanvas
          faction={look.faction}
          hue={look.hue}
          seed={id >>> 0}
          levels={levels}
          recruits={Math.ceil(today / 12)}
          mood={{
            idle: city.idle,
            streak: city.streak,
            wins: city.wins,
            army: city.today,
            progress: Object.fromEntries(city.buildings.map((b) => [b.key, b.progress])),
          }}
        />
      </div>
      <div className="city-grid">
        <div className="panel muster">
          <h3>Tonight’s army</h3>
          <div className="big mono">{n(today)} <small>men</small></div>
          <p className="muted">
            {city.todayLevy > 0 ? `${n(city.todayLevy)} of them levied by today’s work. ` : ''}
            Training {rate.toFixed(1)} an hour
            {city.granaryBonus > 0 ? `, +${Math.round(city.granaryBonus * 100)}% from a ${city.streak}-day streak` : ''}
            {city.boonBonus > 0 ? `, +${Math.round(city.boonBonus * 100)}% from ${city.wins} victor${city.wins === 1 ? 'y' : 'ies'}` : ''}.
          </p>
          {city.idle && city.waiting > 0 && <p className="warn">No push yet today: {n(city.waiting)} trained men will stay home tonight. One push musters them all.</p>}
          {total(city.produced) + today === 0 && <p className="muted">No work yet this week: the lots stand empty.</p>}
          <p className="muted">Morale +{Math.round(city.moraleBonus)}: Chapter House, Hospital, a {city.streak}-day streak{city.wins > 0 ? `, ${city.wins} victor${city.wins === 1 ? 'y' : 'ies'}` : ''}.</p>
          <UnitTable counts={city.today} faction={look.faction} />
        </div>
        <div className="panel muster">
          <h3>The Grand Battle, if fought now</h3>
          <div className="big mono">{n(grand)} <small>men</small></div>
          <p className="muted">
            {n(total(city.produced))} trained this week; {n(total(city.dead))} fell in daily battles, and the Hospital saves {Math.round(city.recovery * 100)}% of them.
            {total(view.grand.veterans) > 0 ? ` ${n(total(view.grand.veterans))} are veterans.` : ''}
          </p>
          <UnitTable counts={view.grand.counts} faction={look.faction} />
        </div>
      </div>
      <h2>Buildings</h2>
      <div className="buildings">
        {city.buildings.map((b) => {
          const def = BUILDINGS.find((d) => d.key === b.key)!;
          return (
            <div key={b.key} className={b.level === 0 ? 'panel building empty' : 'panel building'}>
              <div className="building-head">
                <span className="building-name">{f.buildings[b.key]}</span>
                <span className="level">{b.level === 0 ? '—' : ROMAN[b.level - 1]}</span>
              </div>
              <div className="bar"><div style={{ width: `${(b.level >= MAX_LEVEL ? 1 : b.progress) * 100}%` }} /></div>
              <p className="effect">{effectOf(b.key, b.level, city)}</p>
              <p className="muted small">Fed by {def.fedBy.toLowerCase()}.</p>
            </div>
          );
        })}
      </div>
      <h2>Work this week</h2>
      <p className="muted">
        {n(view.weekWork.code)} lines of credited code, {n(view.weekWork.complexity)} points of logic, {n(view.weekWork.tests)} test lines, {n(view.weekWork.docs + view.weekWork.comments)} docs and comments,
        {' '}{n(view.weekWork.removed)} lines refactored away; {city.activeDays} day{city.activeDays === 1 ? '' : 's'} at work.
      </p>
      {view.work.length === 0 ? (
        <p className="muted">No pushes yet this week. Push to a public repository and the city stirs within minutes.</p>
      ) : (
        <ul className="worklog">
          {view.work.map((w, i) => (
            <li key={i}>
              <span className="mono muted">{clockTime(w.at)}</span>
              <span className="repo">{w.repo}</span>
              <span className="msg">{w.message}</span>
              <span className="mono">{w.code >= 0 ? '+' : ''}{w.code} code{w.tests ? ` · ${w.tests} tests` : ''}{w.removed ? ` · −${w.removed}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function effectOf(key: BuildingKey, level: number, city: CityView['city']): string {
  const def = BUILDINGS.find((d) => d.key === key)!;
  if (level === 0) return `${def.effect}, once built.`;
  if (def.trains.length > 0) {
    const per = def.trains.reduce((a, [, r]) => a + r * level * city.pace, 0);
    return `${def.effect}: ${per.toFixed(1)} men an hour.`;
  }
  if (key === 'granary') return `A ${city.streak}-day streak: every building trains ${Math.round(city.granaryBonus * 100)}% faster.`;
  if (key === 'hospital') return `Saves ${Math.round(city.recovery * 100)}% of the daily fallen for the Grand Battle; +${(level * 0.5).toFixed(1)} morale.`;
  if (key === 'walls') return `Pavises turn ${Math.round(city.pavise * 100)}% of missile harm${city.stakes ? '; stakes before the archers' : '; stakes at level III'}.`;
  return def.effect;
}

function UnitTable({ counts, faction }: { counts: number[]; faction: keyof typeof FACTIONS }) {
  const f = FACTIONS[faction];
  const rows = [];
  for (let k = 0; k < UNIT_COUNT; k++) if ((counts[k] ?? 0) > 0) rows.push(k);
  if (rows.length === 0) return <p className="muted small">No one under arms yet.</p>;
  return (
    <table className="units">
      <tbody>
        {rows.map((k) => (
          <tr key={k}>
            <td>{f.units[k]}</td>
            <td className="mono">{n(counts[k]!)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ battles

function BattleRow({ b, detail }: { b: BattleCard; detail: LeagueDetail }) {
  const look = (id: number | undefined) => detail.members.find((m) => m.user.id === id);
  const side = (i: 0 | 1) => {
    const who = i === 0 ? b.a : b.b;
    const m = look(who?.id);
    return (
      <span className={b.winner === i ? 'won' : 'lost'}>
        {m && <Banner hue={m.hue} />}
        {who ? who.login : 'Brigands'}
        <span className="mono muted"> {n(b.men[i])}</span>
      </span>
    );
  };
  return (
    <li className={b.kind === 'grand' ? 'battle-row grand' : 'battle-row'}>
      <span className="kicker">{b.kind === 'grand' ? 'Grand Battle' : DAY_NAMES[b.day]}</span>
      <span className="versus">{side(0)} <i>against</i> {side(1)}</span>
      <span className="muted">{b.walkover ? 'unopposed' : `${n(b.dead[0] + b.dead[1])} fell`}</span>
      {!b.walkover && <a className="button small" {...linkProps(`/b/${b.id}`)}>Watch</a>}
    </li>
  );
}

function BattlesTab({ detail }: { detail: LeagueDetail }) {
  if (detail.battles.length === 0) {
    return <p className="muted">No battles yet. The first is fought at {clockTime(detail.clock.nextBattleAt)}, between whoever has soldiers by then.</p>;
  }
  return (
    <ul className="battles">
      {detail.battles.map((b) => (
        <BattleRow key={b.id} b={b} detail={detail} />
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ standings

function StandingsTab({ detail, slug }: { detail: LeagueDetail; slug: string }) {
  return (
    <>
      <div className="table-scroll">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Lord</th>
            <th title={`${DAILY_POINTS} a daily win, ${HONOUR_POINTS} an honourable defeat, ${GRAND_POINTS} the Grand Battle`}>Points</th>
            <th>Won</th>
            <th>Lost</th>
            <th>Trained this week</th>
            <th>Tonight</th>
            <th>Per hour</th>
          </tr>
        </thead>
        <tbody>
          {detail.members.map((m: MemberSummary, i) => (
            <tr key={m.user.id}>
              <td className="mono">{i + 1}</td>
              <td>
                <a {...linkProps(`/l/${slug}/city/${m.user.id}`)}>
                  <Banner hue={m.hue} />
                  {m.user.login}
                </a>
                {m.user.bot && <span className="tag">bot</span>}
                {m.idle && <span className="tag warn">no push today</span>}
              </td>
              <td className="mono">{m.points}</td>
              <td className="mono">{m.wins}</td>
              <td className="mono">{m.losses}</td>
              <td className="mono">{n(m.produced)}</td>
              <td className="mono">{n(m.today)}</td>
              <td className="mono">{m.rate.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {detail.weeks.length > 0 && (
        <>
          <h2>Past weeks</h2>
          <ul className="weeks">
            {detail.weeks.map((w) => (
              <li key={w.weekStart}>
                <span className="kicker">Week of {weekLabel(w.weekStart)}</span>
                <span className="champion">♛ {w.champion?.login ?? 'no champion'}</span>
                <span className="muted">{w.standings.slice(0, 4).map((s) => `${s.user.login} ${s.points}`).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ rules

function RulesTab() {
  const f = FACTIONS.templar;
  return (
    <div className="rules">
      <section className="panel">
        <h3>The week</h3>
        <p>A week runs Monday to Monday at the league’s battle hour. Every night at that hour each lord’s soldiers trained since the last battle meet another lord’s, paired by record. On the seventh night, after the last skirmish, comes the Grand Battle: every soldier trained that week, less the dead the Hospital could not save, first against second, third against fourth. Then every city is razed, and the next week begins from an empty field.</p>
        <p>A daily win is worth {DAILY_POINTS} points, makes the survivors veterans for the Grand Battle and raises the city’s output by 5% for the rest of the week (up to four wins). A defeat that cost the enemy at least 60% of what it cost you is honourable, worth {HONOUR_POINTS}. The Grand Battle is worth {GRAND_POINTS}; its first match crowns the champion.</p>
      </section>
      <section className="panel">
        <h3>The city</h3>
        <p>Pushes to public repositories are measured line by line. Formatting, moved code, copies, generated files and filler earn nothing; deleting and restoring earns nothing twice. What counts is credited work, and each kind feeds its own building:</p>
        <ul>
          {BUILDINGS.map((b) => (
            <li key={b.key}><b>{f.buildings[b.key]}</b> — fed by {b.fedBy.toLowerCase()}. {b.effect}.</li>
          ))}
        </ul>
        <p>A building’s level is the square root of its experience: twice the level takes four times the work, so breadth beats piling everything into one. Buildings train soldiers every hour, so work early in the week trains men for longer; fresh work also calls up a levy at once, for tonight’s battle. A day without a push and only 40% of that day’s garrison musters; the Fields grow with every day in a row you push. Code past 1,000 lines a day counts at 30%.</p>
      </section>
      <section className="panel">
        <h3>The battle</h3>
        <p>Every army fields the same classes: heavy infantry, spearmen, skirmishers, archers, crossbowmen, light cavalry, horse archers, knights, heavy shock foot and siege engines. Skirmishers screen; the lines close; knights wait for the lines to lock and strike the flanks; light horse hunt archers and engines. Losses, blows from behind and a fallen commander drain morale, and a broken regiment runs. Spears blunt the charge; pavises turn arrows; stakes break horses.</p>
        <p>The server fights the battle once and keeps the result; your browser fights the same battle again, tick for tick, to show it.</p>
      </section>
    </div>
  );
}
