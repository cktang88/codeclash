import { useEffect, useState } from 'react';
import type { ProfileResponse } from '../../protocol.ts';
import { AWARDS } from '../../rules/digest.ts';
import { ApiError, api } from '../net/api.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Link } from '../ui/Link.tsx';
import { compact } from '../ui/format.ts';
import { Notice } from './Notice.tsx';
import { DeedsSection, ProfileRank, RivalriesSection } from '../meta/index.ts';
import { DropCap, Fleuron, Tally } from '../ui/codex.tsx';

export function ProfilePage({ login }: { login: string }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.profile(login).then(
      (p) => !cancelled && setProfile(p),
      (err: unknown) => !cancelled && setError(err instanceof ApiError ? err.message : 'This profile could not be loaded.'),
    );
    return () => {
      cancelled = true;
    };
  }, [login]);
  if (error) {
    return (
      <Notice title="No such soldier" icon="users">
        <p>{error}</p>
        <Link className="btn btn-primary" to={{ kind: 'home' }}>
          Back to the lobby
        </Link>
      </Notice>
    );
  }
  if (!profile) {
    return (
      <main className="page-center" role="status">
        <span className="spinner" aria-hidden /> Fetching the service record…
      </main>
    );
  }
  const totals = profile.records.reduce(
    (t, r) => ({ days: t.days + r.days, wins: t.wins + r.wins, kills: t.kills + r.kills, best: Math.max(t.best, r.bestStreak) }),
    { days: 0, wins: 0, kills: 0, best: 0 },
  );
  return (
    <main className="folio profile">
      <nav className="crumbs">
        <Link to={{ kind: 'home' }}>← Lobby</Link>
      </nav>
      <header className="profile-head">
        <span className="profile-medal">
          <Avatar login={profile.user.login} url={profile.user.avatarUrl} size={96} />
        </span>
        <div className="profile-titles">
          <p className="eyebrow">The codex of deeds of</p>
          <h1 className="page-title page-title-login">@{profile.user.login}</h1>
          <ProfileRank login={profile.user.login} />
          {profile.titles.length > 0 && (
            <ul className="titles">
              {profile.titles.map((t) => (
                <li key={t} className="tag tag-gold">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>
      <Fleuron />
      <DropCap
        className="profile-opening"
        text={
          totals.days === 0
            ? `No war has yet been written under this name. The first push of a day in any room begins the record.`
            : `In ${totals.days} ${totals.days === 1 ? 'day' : 'days'} of war across ${profile.records.length} ${profile.records.length === 1 ? 'room' : 'rooms'}, this house has carried the field ${totals.wins} ${totals.wins === 1 ? 'time' : 'times'} and put ${compact(totals.kills)} foes to flight or the sword.`
        }
      />
      <dl className="stat-grid stat-grid-big">
        <div>
          <dt>Days fought</dt>
          <dd>
            <Tally value={totals.days} start={0} duration={900} />
          </dd>
        </div>
        <div>
          <dt>Days won</dt>
          <dd>
            <Tally value={totals.wins} start={0} duration={900} />
          </dd>
        </div>
        <div>
          <dt>Kills</dt>
          <dd>
            <Tally value={totals.kills} format={compact} start={0} duration={900} />
          </dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>
            <Tally value={totals.best} start={0} duration={900} />
          </dd>
        </div>
      </dl>
      <DeedsSection login={profile.user.login} />
      <RivalriesSection login={profile.user.login} />
      <h2 className="block-title">Rooms</h2>
      {profile.records.length === 0 ? (
        <p className="empty-note">No wars fought yet.</p>
      ) : (
        <div className="records">
          {profile.records.map((r) => (
            <article key={r.room.slug} className="record panel">
              <h3>
                <Link to={{ kind: 'room', slug: r.room.slug, invite: null }}>{r.room.name}</Link>
              </h3>
              <p className="muted small">
                {r.days} days · {r.wins} won · streak {r.streak} (best {r.bestStreak}) · {compact(r.renown)} renown
              </p>
              {Object.keys(r.awards).length > 0 && (
                <ul className="award-counts">
                  {Object.entries(r.awards)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, n]) => (
                      <li key={id} className="tag">
                        {n}× {AWARDS.find((a) => a.id === id)?.title ?? id}
                      </li>
                    ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
