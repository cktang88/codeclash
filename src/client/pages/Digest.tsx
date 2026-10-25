import { useEffect, useState, type ReactNode } from 'react';
import type { DigestResponse } from '../../protocol.ts';
import type { DigestPlayer } from '../../rules/digest.ts';
import { Kind, PURPOSES, PURPOSE_LABEL, TICK_MS, TICKS_PER_MINUTE, type Purpose } from '../../sim/api.ts';
import { ApiError, api } from '../net/api.ts';
import { UnitChips, colorize } from '../hud/Chronicle.tsx';
import { CopyButton } from '../hud/RoomSettings.tsx';
import { Avatar } from '../ui/Avatar.tsx';
import { BattalionFlag } from '../ui/Flag.tsx';
import { Link } from '../ui/Link.tsx';
import { clock, compact } from '../ui/format.ts';
import { GROUP_LABEL, groupLines } from '../ui/lines.ts';
import { EventIcon, Icon, UnitIcon } from '../ui/icons.tsx';
import { Notice } from './Notice.tsx';
import { DropCap, Fleuron, Tally, hueVar } from '../ui/codex.tsx';
import { Timelapse } from './Timelapse.tsx';
import { RingFigure } from '../ui/RingFigure.tsx';
import { centreName } from '../render/centre.ts';

/** Colors for the nine line categories, in Cat order. Paired with labels everywhere they appear. */
// Pigments from the palette: gold leaf, ultramarine, umber, verdigris, ochre, vermilion, and greys of old vellum.
export const CAT_COLORS = ['#d4a93e', '#2c4a9a', '#7b5a2e', '#2f7f6f', '#b9a477', '#b8321f', '#8e8269', '#a39880', '#c9bc9b'];
export const CAT_LABELS = ['Code', 'Tests', 'Comments', 'Docs', 'Config', 'Deleted', 'Generated', 'Vendored', 'Blank'];

const AWARD_ICON: Record<string, () => ReactNode> = {
  victor: () => <Icon name="crown" size={26} />,
  warlord: () => <Icon name="sword" size={26} />,
  'iron-wall': () => <UnitIcon kind={Kind.Paladin} size={26} title="" />,
  'test-legion': () => <UnitIcon kind={Kind.Warden} size={26} title="" />,
  scribe: () => <UnitIcon kind={Kind.Herald} size={26} title="" />,
  demolisher: () => <UnitIcon kind={Kind.Outrider} size={26} title="" />,
  siegebreaker: () => <UnitIcon kind={Kind.Trebuchet} size={26} title="" />,
  conqueror: () => <EventIcon kind="conquest" size={26} />,
  'last-stand': () => <Icon name="shield" size={26} />,
  phoenix: () => <EventIcon kind="rising" size={26} />,
  marcher: () => <EventIcon kind="capture" size={26} />,
  ghost: () => <Icon name="eye" size={26} />,
  bugslayer: () => <UnitIcon kind={Kind.Cleric} size={26} title="" />,
  architect: () => <UnitIcon kind={Kind.Knight} size={26} title="" />,
  dragonlord: () => <UnitIcon kind={Kind.Dragon} size={26} title="" />,
  dragonslayer: () => <EventIcon kind="dragon" size={26} />,
};

/**
 * Lines pushed, code first: code (and deletions) is the army at full height; tests, comments, docs and config are
 * drawn as the small support they are; generated, vendored and blank lines raised nothing.
 */
export function LinesBar({ lines }: { lines: readonly number[] }) {
  const groups = groupLines(lines);
  if (groups.length === 0) return <p className="muted small">No lines pushed.</p>;
  const label = groups.map((g) => `${GROUP_LABEL[g.group]}: ${g.cats.map(({ cat, n }) => `${CAT_LABELS[cat]} ${n.toLocaleString()}`).join(', ')}`).join('; ');
  return (
    <div className="lines">
      <div className="lines-bar" role="img" aria-label={label}>
        {groups.flatMap((g) =>
          g.cats.map(({ cat, n }) => (
            <span key={cat} className={`is-${g.group}`} style={{ flexGrow: n, background: CAT_COLORS[cat] }} title={`${CAT_LABELS[cat]} (${GROUP_LABEL[g.group].toLowerCase()}): ${n.toLocaleString()} lines`} />
          )),
        )}
      </div>
      <dl className="lines-legend">
        {groups.map((g) => (
          <div key={g.group} className={`lines-group is-${g.group}`}>
            <dt>{GROUP_LABEL[g.group]}</dt>
            {g.cats.map(({ cat, n }) => (
              <dd key={cat}>
                <span className="swatch" style={{ background: CAT_COLORS[cat] }} aria-hidden />
                {CAT_LABELS[cat]} <span className="num">{compact(n)}</span>
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}

type PurposeCounts = Partial<Record<Purpose, number>> | readonly number[];

/** Pushes by purpose, plus files touched and branch points: what earned this army its soldiers. */
function PushPurposes({ pl }: { pl: DigestPlayer & { purposes?: PurposeCounts; files?: number; branches?: number; complexity?: number } }) {
  const counts = PURPOSES.map((purpose, i) => [purpose, Array.isArray(pl.purposes) ? (pl.purposes[i] ?? 0) : ((pl.purposes as Partial<Record<Purpose, number>> | undefined)?.[purpose] ?? 0)] as const).filter(
    ([, n]) => n > 0,
  );
  if (counts.length === 0 && !pl.files && !pl.branches) return null;
  return (
    <div className="player-card-purposes">
      {counts.map(([purpose, n]) => (
        <span key={purpose} className={`purpose-tag p-${purpose}`}>
          {PURPOSE_LABEL[purpose]} <span className="num">{n}</span>
        </span>
      ))}
      {(pl.files ?? 0) > 0 && (
        <span className="muted small">
          {compact(pl.files!)} files · {pl.complexity !== undefined ? `complexity ${compact(pl.complexity)}` : `${compact(pl.branches ?? 0)} branch points`}
        </span>
      )}
    </div>
  );
}

type FairFields = { quality?: number; veterancy?: number; power?: number; churn?: number; filler?: number };
const RANKS = ['', 'I', 'II', 'III'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** The army's final quality: veteran rank or ragged, and how much work cancelled out or was filler. */
function ArmyQuality({ pl }: { pl: DigestPlayer & FairFields }) {
  if (pl.quality === undefined && pl.veterancy === undefined) return null;
  const vet = pl.veterancy ?? 0;
  const power = pl.power ?? (pl.quality ?? 1) * (1 + 0.1 * vet);
  const ragged = (pl.quality ?? 1) < 1;
  return (
    <div className="player-card-quality">
      {vet > 0 && <span className="tag tag-gold">Veteran {RANKS[vet]}</span>}
      {ragged && <span className="tag tag-ragged">Ragged</span>}
      <span className="muted small">
        soldiers at <span className="num">×{power.toFixed(2)}</span>
        {(pl.churn ?? 0) > 0 && <> · {compact(pl.churn!)} lines undone</>}
        {(pl.filler ?? 0) > 0 && <> · {compact(pl.filler!)} filler</>}
      </span>
    </div>
  );
}

function PlayerCard({ pl, repos }: { pl: DigestPlayer & FairFields; repos: { name: string; language: string | null }[] }) {
  const lang = pl.best ? (repos.find((r) => r.name === pl.best!.repo)?.language ?? null) : null;
  return (
    <article className="player-card panel" style={hueVar(pl.hue)}>
      <header className="player-card-head">
        <span className="place" aria-label={`Place ${pl.place}`}>{ROMAN[pl.place] ?? pl.place}</span>
        <Avatar login={pl.login} url={pl.bot ? null : `https://avatars.githubusercontent.com/u/${pl.id}?s=80`} hue={pl.hue} size={40} bot={pl.bot} />
        <div>
          <strong className="who">@{pl.login}</strong>
          <div className="muted small">
            {compact(pl.renown)} renown · {pl.pushes} {pl.pushes === 1 ? 'push' : 'pushes'}
          </div>
        </div>
      </header>
      <ArmyQuality pl={pl} />
      <PushPurposes pl={pl} />
      <LinesBar lines={pl.lines} />
      {pl.raised.some((n) => n > 0) && (
        <div className="player-card-units">
          <span className="meter-label">Raised</span>
          <UnitChips units={pl.raised} size={16} />
        </div>
      )}
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
          <dt>Forts taken</dt>
          <dd className="num">{pl.captures}</dd>
        </div>
        <div>
          <dt>Capitals stormed</dt>
          <dd className="num">{pl.conquests ?? 0}</dd>
        </div>
        <div>
          <dt>Capitals held</dt>
          <dd className="num">{pl.capitals ?? 0}</dd>
        </div>
        <div>
          <dt>Capitals lost</dt>
          <dd className="num">{pl.fallen ?? 0}</dd>
        </div>
        {(pl.retakes ?? 0) > 0 && (
          <div>
            <dt>Homes retaken</dt>
            <dd className="num">{pl.retakes}</dd>
          </div>
        )}
        {(pl.standBest ?? 0) >= TICKS_PER_MINUTE && (
          <div>
            <dt>Longest stand</dt>
            <dd className="num">{Math.floor(pl.standBest / TICKS_PER_MINUTE)} min</dd>
          </div>
        )}
      </dl>
      {pl.rising && <p className="player-card-rising">Ended the war as a rising, fighting to retake its home.</p>}
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

export function DigestPage({ slug, warId, invite = null }: { slug: string; warId: number; invite?: string | null }) {
  const [data, setData] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.digest(slug, warId, invite).then(
      (d) => !cancelled && setData(d),
      (err: unknown) => !cancelled && setError(err instanceof ApiError ? err.message : 'The digest could not be loaded.'),
    );
    return () => {
      cancelled = true;
    };
  }, [slug, warId, invite]);

  if (error) {
    return (
      <Notice title="No digest here" icon="history">
        <p>{error}</p>
        <Link className="btn btn-primary" to={{ kind: 'room', slug, invite }}>
          Back to the room
        </Link>
      </Notice>
    );
  }
  if (!data) {
    return (
      <main className="page-center" role="status">
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
    <main className="folio digest">
      <nav className="crumbs">
        <Link to={{ kind: 'room', slug, invite }}>
          ← {room.name}
        </Link>
        <Link to={{ kind: 'history', slug, invite }}>Past wars</Link>
      </nav>

      <header className="digest-head">
        <p className="eyebrow">The Daily Digest · {date}</p>
        <h1 className="digest-title">{colorize(d.headline, roster)}</h1>
        <Fleuron />
        <div className="digest-actions">
          <Link className="btn btn-gilt" to={{ kind: 'replay', slug, warId: war.id, tick: null, invite }}>
            <Icon name="play" size={16} /> Watch the replay
          </Link>
          <CopyButton text={location.href} label="Copy link" />
        </div>
      </header>

      {winner && (
        <section className="winner" style={hueVar(winner.hue)}>
          <span className="winner-medal">
            <Icon name="crown" size={40} className="winner-crown" />
            <Avatar login={winner.login} url={winner.bot ? null : `https://avatars.githubusercontent.com/u/${winner.id}?s=128`} hue={winner.hue} size={84} bot={winner.bot} />
          </span>
          <div>
            <p className="eyebrow">{d.victory?.p === winner.p ? 'Conqueror of the ring' : 'Victor of the day'}</p>
            <h2 className="winner-name who">@{winner.login}</h2>
            <p className="winner-renown">
              {d.victory?.p === winner.p ? (
                <>
                  took all <Tally value={(d.ring ?? []).filter((o) => o >= 0).length} start={0} duration={1000} /> capitals at {at(d.victory.tick)}
                </>
              ) : (
                <>
                  <Tally value={winner.capitals ?? 0} start={0} duration={1000} /> {winner.capitals === 1 ? 'capital' : 'capitals'} held ·{' '}
                  <Tally value={winner.renown} format={compact} start={0} duration={1400} /> renown
                </>
              )}
            </p>
          </div>
        </section>
      )}

      <DropCap
        className="digest-opening"
        text={`Here is set down the chronicle of the war of ${date}, fought in ${room.name} by ${d.players.length} ${d.players.length === 1 ? 'army' : 'armies'} raised from ${d.totals.pushes} ${d.totals.pushes === 1 ? 'push' : 'pushes'}. ${d.victory ? `At ${at(d.victory.tick)} the last of the ring's capitals fell to @${byP(d.victory.p)?.login ?? '?'}, and the field stood still.` : `No one held the whole ring when the reset came. ${winner ? `@${winner.login} ended the day holding the most of it.` : 'No banner held the field at sundown.'}`}`}
      />

      {(d.ring?.length ?? 0) > 0 && <RingStory data={data} at={at} roster={roster} invite={invite} />}

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
            <table className="table codex-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col" className="num">
                    Capitals
                  </th>
                  <th scope="col" className="num col-opt" title="Code lines the day counted: with capitals level, the larger share ranks higher">
                    Code
                  </th>
                  <th scope="col" className="num">
                    Renown
                  </th>
                  <th scope="col" className="num col-opt">
                    Pushes
                  </th>
                  <th scope="col" className="num">
                    Kills
                  </th>
                  <th scope="col" className="num col-opt">
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
                        <span className="standing-swatch" style={hueVar(pl.hue)} aria-hidden />
                        <span className="who" style={hueVar(pl.hue)}>
                          @{pl.login}
                        </span>
                        {pl.bot && <span className="tag">bot</span>}
                        {pl.rising && <span className="tag tag-rising">rising</span>}
                      </span>
                    </th>
                    <td className="num">{pl.capitals ?? '—'}</td>
                    <td className="num col-opt">{pl.contribution !== undefined ? pl.contribution.toLocaleString('en-US') : '—'}</td>
                    <td className="num">{compact(pl.renown)}</td>
                    <td className="num col-opt">{pl.pushes}</td>
                    <td className="num">{pl.kills}</td>
                    <td className="num col-opt">{pl.losses}</td>
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
              <dd>
                <Tally value={d.totals.pushes} start={0} duration={1200} />
              </dd>
            </div>
            <div>
              <dt>Soldiers raised</dt>
              <dd>
                <Tally value={d.totals.raised.reduce((a, b) => a + b, 0)} format={compact} start={0} duration={1200} />
              </dd>
            </div>
            <div>
              <dt>Fallen</dt>
              <dd>
                <Tally value={d.totals.kills} format={compact} start={0} duration={1200} />
              </dd>
            </div>
            <div>
              <dt>The ring</dt>
              <dd>{d.victory ? `won at ${at(d.victory.tick)}` : 'unconquered at the reset'}</dd>
            </div>
          </dl>
          <h3 className="section-label">Lines pushed, code first</h3>
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
                    <p className="award-who who" style={hueVar(pl?.hue)}>
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
                <Link className="timeline-item" to={{ kind: 'replay', slug, warId: war.id, tick: Math.max(0, h.tick - 75), invite }}>
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

/**
 * How the ring fell: the ring as it stood at the end, beside the war's turning points in order:
 * every capital stormed, every rising, and the victory if there was one.
 */
function RingStory({ data, at, roster, invite }: { data: DigestResponse; at(tick: number): string; roster: Parameters<typeof colorize>[1]; invite: string | null }) {
  const d = data.digest;
  const ring = d.ring ?? [];
  const slots = ring.length;
  const hueOf = (p: number) => d.players.find((pl) => pl.p === p)?.hue ?? null;
  const loginOf = (p: number) => `@${d.players.find((pl) => pl.p === p)?.login ?? '?'}`;
  const seats = ring.map((holder, slot) => ({ holder, founder: data.players.find((pl) => pl.slot === slot)?.p ?? -1 }));
  const turns = d.highlights.filter((h) => h.kind === 'conquest' || h.kind === 'rising' || h.kind === 'victory');
  const changed = seats.filter((s) => s.holder >= 0 && s.founder >= 0 && s.holder !== s.founder).length;
  return (
    <section className="digest-section ring-story">
      <h2 className="block-title">{d.victory ? 'How the ring fell' : 'The ring at the reset'}</h2>
      <div className="ring-story-body panel">
        <figure className="ring-story-figure">
          <RingFigure slots={slots} seats={seats} hueOf={hueOf} nameOf={loginOf} centreKind={data.map.centreKind} victor={d.victory?.p ?? -1} size={220} />
          <figcaption className="muted small">
            {slots} seats round {centreName(data.map.seed ?? 0, data.map.centreKind)}. {changed === 0 ? 'Every capital ended in its founder’s hands.' : `${changed} ${changed === 1 ? 'capital ended' : 'capitals ended'} under a conqueror’s banners.`}
          </figcaption>
        </figure>
        {turns.length > 0 ? (
          <ol className="timeline ring-story-turns">
            {turns.map((h, i) => (
              <li key={i}>
                <Link className="timeline-item" to={{ kind: 'replay', slug: data.room.slug, warId: data.war.id, tick: Math.max(0, h.tick - 75), invite }}>
                  <span className="timeline-time num">{at(h.tick)}</span>
                  <span className={`chron-icon chron-${h.kind}`}>
                    <EventIcon kind={h.kind} size={18} />
                  </span>
                  <span className="timeline-text">{colorize(h.text, roster)}</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted ring-story-quiet">No walls fell today. The armies fought for the border forts, and every banner flew over its own keep at the reset.</p>
        )}
      </div>
    </section>
  );
}
