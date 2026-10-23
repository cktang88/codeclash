import { useEffect, useState, type ReactNode } from 'react';
import type { DigestResponse } from '../../protocol.ts';
import type { DigestPlayer } from '../../rules/digest.ts';
import { armyColor } from '../../rules/heraldry.ts';
import { CAT_NAMES, Kind, TICK_MS } from '../../sim/api.ts';
import { ApiError, api } from '../net/api.ts';
import { UnitChips, colorize } from '../hud/Chronicle.tsx';
import { Avatar } from '../ui/Avatar.tsx';
import { BattalionFlag } from '../ui/Flag.tsx';
import { Link } from '../ui/Link.tsx';
import { clock, compact } from '../ui/format.ts';
import { EventIcon, Icon, UnitIcon } from '../ui/icons.tsx';
import { Notice } from './Notice.tsx';
import { Timelapse } from './Timelapse.tsx';

/** Colors for the nine line categories, in Cat order. Paired with labels everywhere they appear. */
export const CAT_COLORS = ['#e8c15a', '#5fb3e8', '#b48ce8', '#7ed3a1', '#e8955f', '#e86a6a', '#8d939c', '#c58f5a', '#3a4049'];
export const CAT_LABELS = ['Code', 'Tests', 'Comments', 'Docs', 'Config', 'Deleted', 'Generated', 'Vendored', 'Blank'];

const AWARD_ICON: Record<string, () => ReactNode> = {
  victor: () => <Icon name="crown" size={26} />,
  warlord: () => <Icon name="sword" size={26} />,
  'iron-wall': () => <UnitIcon kind={Kind.Warden} size={26} title="" />,
  'test-legion': () => <UnitIcon kind={Kind.Paladin} size={26} title="" />,
  scribe: () => <UnitIcon kind={Kind.Wizard} size={26} title="" />,
  demolisher: () => <UnitIcon kind={Kind.Outrider} size={26} title="" />,
  siegebreaker: () => <UnitIcon kind={Kind.Trebuchet} size={26} title="" />,
  'monolith-slayer': () => <EventIcon kind="monolith" size={26} />,
  ghost: () => <Icon name="eye" size={26} />,
  'militia-mob': () => <UnitIcon kind={Kind.Skeleton} size={26} title="" />,
  'standard-bearer': () => <UnitIcon kind={Kind.Champion} size={26} title="" />,
  conqueror: () => <Icon name="flag" size={26} />,
};

export function LinesBar({ lines }: { lines: readonly number[] }) {
  const total = lines.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="muted small">No lines pushed.</p>;
  return (
    <div className="lines">
      <div className="lines-bar" role="img" aria-label={CAT_NAMES.map((_, c) => `${CAT_LABELS[c]} ${lines[c] ?? 0}`).join(', ')}>
        {lines.map((n, c) => (n > 0 ? <span key={c} style={{ flexGrow: n, background: CAT_COLORS[c] }} title={`${CAT_LABELS[c]}: ${n.toLocaleString()} lines`} /> : null))}
      </div>
      <ul className="lines-legend">
        {lines.map((n, c) =>
          n > 0 ? (
            <li key={c}>
              <span className="swatch" style={{ background: CAT_COLORS[c] }} aria-hidden />
              {CAT_LABELS[c]} <span className="num">{compact(n)}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function PlayerCard({ pl, repos }: { pl: DigestPlayer; repos: { name: string; language: string | null }[] }) {
  const lang = pl.best ? (repos.find((r) => r.name === pl.best!.repo)?.language ?? null) : null;
  return (
    <article className="player-card panel" style={{ borderTopColor: armyColor(pl.hue) }}>
      <header className="player-card-head">
        <span className="place num">#{pl.place}</span>
        <Avatar login={pl.login} url={pl.bot ? null : `https://avatars.githubusercontent.com/u/${pl.id}?s=80`} hue={pl.hue} size={40} bot={pl.bot} />
        <div>
          <strong style={{ color: armyColor(pl.hue, 70) }}>@{pl.login}</strong>
          <div className="muted small">
            {compact(pl.renown)} renown · {pl.pushes} {pl.pushes === 1 ? 'push' : 'pushes'}
          </div>
        </div>
      </header>
      <LinesBar lines={pl.lines} />
      <div className="player-card-units">
        <span className="meter-label">Raised</span>
        <UnitChips units={pl.raised} size={16} />
      </div>
      <dl className="stat-grid">
        <div>
          <dt>Kills</dt>
          <dd className="num">{pl.kills}</dd>
        </div>
        <div>
          <dt>Losses</dt>
          <dd className="num">{pl.losses}</dd>
        </div>
        <div>
          <dt>Captures</dt>
          <dd className="num">{pl.captures}</dd>
        </div>
        <div>
          <dt>Sacks</dt>
          <dd className="num">{pl.sacks}</dd>
        </div>
      </dl>
      {pl.best && (
        <div className="best-platoon">
          <BattalionFlag hue={pl.hue} repo={pl.best.repo} language={lang} size={36} ordinal={pl.best.ordinal} />
          <div>
            <span className="meter-label">Deadliest platoon · {pl.best.kills} kills</span>
            <div className="truncate">{pl.best.repo}</div>
            {pl.best.message && <q className="commit-msg">{pl.best.message}</q>}
          </div>
        </div>
      )}
    </article>
  );
}

export function DigestPage({ slug, warId }: { slug: string; warId: number }) {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.digest(slug, warId).then(
      (d) => !cancelled && setData(d),
      (err: unknown) => !cancelled && setError(err instanceof ApiError ? err.message : 'The digest could not be loaded.'),
    );
    return () => {
      cancelled = true;
    };
  }, [slug, warId]);

  if (error) {
    return (
      <Notice title="No digest here" icon="history">
        <p>{error}</p>
        <Link className="btn btn-primary" to={{ kind: 'room', slug, invite: null }}>
          Back to the room
        </Link>
      </Notice>
    );
  }
  if (!data) {
    return (
      <main className="page page-center" role="status">
        <span className="spinner" aria-hidden /> Reading the chronicle…
      </main>
    );
  }

  const { digest: d, room, war } = data;
  const byP = (p: number) => d.players.find((pl) => pl.p === p);
  const winner = d.winner !== null ? byP(d.winner) : undefined;
  const ranked = d.players.slice().sort((a, b) => a.place - b.place);
  const roster = d.players.map((pl) => ({ p: pl.p, login: pl.login, hue: pl.hue, id: pl.id, slot: 0, bot: pl.bot, avatarUrl: '' }));
  const date = new Date(d.startsAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const at = (tick: number) => clock(d.startsAt + tick * TICK_MS);

  return (
    <main className="page digest">
      <nav className="crumbs">
        <Link to={{ kind: 'room', slug, invite: null }}>
          ← {room.name}
        </Link>
        <Link to={{ kind: 'history', slug }}>Past wars</Link>
      </nav>

      <header className="digest-head">
        <p className="eyebrow">The Daily Digest · {date}</p>
        <h1 className="digest-title">{colorize(d.headline, roster)}</h1>
        <div className="digest-actions">
          <Link className="btn btn-primary" to={{ kind: 'replay', slug, warId: war.id, tick: null }}>
            <Icon name="play" size={16} /> Watch the replay
          </Link>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(location.href).catch(() => undefined)}>
            <Icon name="share" size={16} /> Copy link
          </button>
        </div>
      </header>

      {winner && (
        <section className="winner panel" style={{ borderColor: armyColor(winner.hue, 55) }}>
          <Icon name="crown" size={40} className="winner-crown" />
          <Avatar login={winner.login} url={winner.bot ? null : `https://avatars.githubusercontent.com/u/${winner.id}?s=128`} hue={winner.hue} size={72} bot={winner.bot} />
          <div>
            <p className="eyebrow">Victor of the day</p>
            <h2 className="winner-name" style={{ color: armyColor(winner.hue, 70) }}>
              @{winner.login}
            </h2>
            <p className="num winner-renown">{compact(winner.renown)} renown</p>
          </div>
        </section>
      )}

      {data.timelapse?.length > 0 && (
        <section className="digest-section">
          <h2 className="block-title">The day in fifteen seconds</h2>
          <Timelapse data={data} />
        </section>
      )}

      <section className="digest-grid">
        <div className="panel digest-block">
          <h2 className="block-title">Final standings</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col" className="num">
                    Renown
                  </th>
                  <th scope="col" className="num">
                    Pushes
                  </th>
                  <th scope="col" className="num">
                    Kills
                  </th>
                  <th scope="col" className="num">
                    Losses
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((pl) => (
                  <tr key={pl.p}>
                    <td className="num">{pl.place}</td>
                    <th scope="row">
                      <span className="who-cell">
                        <span className="standing-swatch" style={{ background: armyColor(pl.hue) }} aria-hidden />
                        <span style={{ color: armyColor(pl.hue, 70) }}>@{pl.login}</span>
                        {pl.bot && <span className="tag">bot</span>}
                      </span>
                    </th>
                    <td className="num">{compact(pl.renown)}</td>
                    <td className="num">{pl.pushes}</td>
                    <td className="num">{pl.kills}</td>
                    <td className="num">{pl.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel digest-block">
          <h2 className="block-title">The day in numbers</h2>
          <dl className="stat-grid stat-grid-big">
            <div>
              <dt>Pushes</dt>
              <dd className="num">{d.totals.pushes}</dd>
            </div>
            <div>
              <dt>Soldiers raised</dt>
              <dd className="num">{compact(d.totals.raised.reduce((a, b) => a + b, 0))}</dd>
            </div>
            <div>
              <dt>Fallen</dt>
              <dd className="num">{compact(d.totals.kills)}</dd>
            </div>
            <div>
              <dt>Monolith</dt>
              <dd>{d.monolith.fallen ? `fell at ${at(d.monolith.tick ?? 0)}` : 'stood'}</dd>
            </div>
          </dl>
          <h3 className="section-label">Code pushed, by kind</h3>
          <LinesBar lines={d.totals.lines} />
          <h3 className="section-label">Soldiers raised</h3>
          <UnitChips units={d.totals.raised} size={18} />
        </div>
      </section>

      {d.awards.length > 0 && (
        <section className="digest-section">
          <h2 className="block-title">Honors</h2>
          <div className="awards">
            {d.awards.map((a) => {
              const pl = byP(a.p);
              return (
                <article key={a.id} className="award panel">
                  <span className="award-icon" aria-hidden>
                    {AWARD_ICON[a.id]?.() ?? <Icon name="crown" size={26} />}
                  </span>
                  <div>
                    <h3 className="award-title">{a.title}</h3>
                    <p className="award-who" style={pl ? { color: armyColor(pl.hue, 70) } : undefined}>
                      @{pl?.login ?? '?'}
                    </p>
                    <p className="muted small">{a.blurb}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {d.highlights.length > 0 && (
        <section className="digest-section">
          <h2 className="block-title">Highlights</h2>
          <ol className="timeline">
            {d.highlights.map((h, i) => (
              <li key={i}>
                <Link className="timeline-item" to={{ kind: 'replay', slug, warId: war.id, tick: Math.max(0, h.tick - 75) }}>
                  <span className="timeline-time num">{at(h.tick)}</span>
                  <span className={`chron-icon chron-${h.kind}`}>
                    <EventIcon kind={h.kind} size={18} />
                  </span>
                  <span className="timeline-text">{colorize(h.text, roster)}</span>
                  <span className="timeline-go">
                    <Icon name="play" size={12} /> Watch
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="digest-section">
        <h2 className="block-title">Every army</h2>
        <div className="player-cards">
          {ranked.map((pl) => (
            <PlayerCard key={pl.p} pl={pl} repos={d.repos} />
          ))}
        </div>
      </section>

      {d.repos.length > 0 && (
        <section className="digest-section">
          <h2 className="block-title">Battalions in the field</h2>
          <ul className="repo-list">
            {d.repos.slice(0, 12).map((r) => {
              const pl = byP(r.p);
              return (
                <li key={r.name} className="panel">
                  <BattalionFlag hue={pl?.hue ?? 0} repo={r.name} language={r.language} size={34} />
                  <span className="truncate">{r.name}</span>
                  <span className="muted small">{r.language ?? ''}</span>
                  <span className="num">
                    {r.pushes} {r.pushes === 1 ? 'push' : 'pushes'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
