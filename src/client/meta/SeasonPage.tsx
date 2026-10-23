import { SEASON_POINTS } from '../../rules/meta.ts';
import { Notice } from '../pages/Notice.tsx';
import { Avatar } from '../ui/Avatar.tsx';
import { EmptyVignette, InkLink, VellumPanel } from '../ui/codex.tsx';
import { metaApi, useLoad } from './api.ts';

/** This week's Season table for the room, and last week's Victor. */
export function SeasonPage({ slug, invite = null }: { slug: string; invite?: string | null }) {
  const { data, error } = useLoad(`season:${slug}`, () => metaApi.season(slug, invite));
  if (error) {
    return (
      <Notice title="No season here">
        <p>{error}</p>
        <InkLink to={{ kind: 'home' }}>← Back to the lobby</InkLink>
      </Notice>
    );
  }
  if (!data) {
    return (
      <main className="page page-center" role="status">
        <span className="spinner" aria-hidden /> Tallying the season…
      </main>
    );
  }
  return (
    <main className="page meta-season">
      <nav className="crumbs">
        <InkLink to={{ kind: 'room', slug, invite }}>← Back to the war</InkLink>
      </nav>
      <h1 className="page-title">Season {data.season}</h1>
      {data.champion && (
        <VellumPanel className="meta-season-champion" aria-label="Last season's Victor">
          <p className="rubric">Victor of {data.champion.season}</p>
          <p>
            <Avatar login={data.champion.user.login} url={data.champion.user.avatarUrl} size={32} />{' '}
            <InkLink to={{ kind: 'profile', login: data.champion.user.login }}>@{data.champion.user.login}</InkLink>
            <span className="muted"> · their monument stands at the Heart</span>
          </p>
        </VellumPanel>
      )}
      <p className="muted">
        Seven days make a season. Each day pays {SEASON_POINTS.join(', ')} points to the first five, and 1 to everyone else who fought.
      </p>
      {data.standings.length === 0 ? (
        <EmptyVignette kind="ledger" title="The ledger is open, and blank">
          <p>No day of this season has ended yet. The first reset writes the first line.</p>
        </EmptyVignette>
      ) : (
        <div className="table-wrap">
          <table className="codex-table meta-season-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">Points</th>
                <th scope="col" className="num">Days won</th>
                <th scope="col" className="num">Days fought</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((s, i) => (
                <tr key={s.user.id} className={i === 0 ? 'is-first' : undefined}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <Avatar login={s.user.login} url={s.user.avatarUrl} size={20} />{' '}
                    <InkLink to={{ kind: 'profile', login: s.user.login }}>@{s.user.login}</InkLink>
                  </td>
                  <td className="num">{s.points}</td>
                  <td className="num">{s.wins}</td>
                  <td className="num">{s.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
