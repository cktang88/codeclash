import { DEEDS } from '../../rules/meta.ts';
import { InkLink } from '../ui/codex.tsx';
import { ago } from '../ui/format.ts';
import { profileOnce, useLoad } from './api.ts';
import { RankBadge } from './RankBadge.tsx';

/** Rank and Glory for a profile header. */
export function ProfileRank({ login }: { login: string }) {
  const { data } = useLoad(`profile:${login}`, () => profileOnce(login));
  if (!data?.rank) return null;
  return <RankBadge rank={data.rank} />;
}

/** The player's Deeds as seals: earned ones inked, the rest blind-stamped. */
export function DeedsSection({ login }: { login: string }) {
  const { data } = useLoad(`profile:${login}`, () => profileOnce(login));
  if (!data?.deeds) return null;
  const earned = new Map(data.deeds.map((d) => [d.id, d]));
  return (
    <section className="meta-deeds" aria-labelledby="deeds-title">
      <h2 className="block-title" id="deeds-title">
        Deeds <span className="muted num">{earned.size}/{DEEDS.length}</span>
      </h2>
      <ul className="meta-deeds-grid">
        {DEEDS.map((d) => {
          const e = earned.get(d.id);
          return (
            <li key={d.id} className={`meta-deed${e ? ' is-earned' : ''}`} title={e ? `${d.text} · ${ago(Date.now() - e.at)}${e.room ? ` in ${e.room}` : ''}` : d.text}>
              <span className="meta-deed-seal" aria-hidden />
              <span className="meta-deed-name">{d.name}</span>
              <span className="meta-deed-text muted">{d.text}</span>
              <span className="sr-only">{e ? 'Earned' : 'Not yet earned'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Head-to-head records against the players fought most. */
export function RivalriesSection({ login }: { login: string }) {
  const { data } = useLoad(`profile:${login}`, () => profileOnce(login));
  if (!data?.rivalries?.length) return null;
  return (
    <section className="meta-rivals" aria-labelledby="rivals-title">
      <h2 className="block-title" id="rivals-title">
        Rivalries
      </h2>
      <ul className="meta-rivals-list">
        {data.rivalries.map((r) => (
          <li key={r.rival.id}>
            <InkLink to={{ kind: 'profile', login: r.rival.login }}>@{r.rival.login}</InkLink>{' '}
            <span className={`num${r.wins > r.losses ? ' gilt' : ''}`}>
              {r.wins}–{r.losses}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
