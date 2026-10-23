import { useEffect, useState } from 'react';
import type { HookResponse, LobbyResponse, MeResponse, RoomCard, Visibility } from '../../protocol.ts';
import { ApiError, api } from '../net/api.ts';
import { CopyButton } from '../hud/RoomSettings.tsx';
import { navigate } from '../route.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Link } from '../ui/Link.tsx';
import { Modal } from '../ui/Modal.tsx';
import { duration, hourLabel, parseInvite, utcHourOfLocal } from '../ui/format.ts';
import { Icon, UnitIcon } from '../ui/icons.tsx';

export function RoomCardView({ room, now }: { room: RoomCard; now: number }) {
  return (
    <Link className="room-card panel" to={{ kind: 'room', slug: room.slug, invite: null }}>
      <div className="room-card-head">
        <h3 className="room-card-name">
          {room.visibility === 'private' && <Icon name="lock" size={15} title="Private" />} {room.name}
        </h3>
        {room.viewers > 0 && (
          <span className="live-badge">
            <span className="conn-dot" aria-hidden /> {room.viewers} watching
          </span>
        )}
      </div>
      <dl className="room-card-stats">
        <div>
          <dt>Members</dt>
          <dd className="num">
            {room.members}
            {room.bots > 0 && <span className="muted"> +{room.bots} bots</span>}
          </dd>
        </div>
        <div>
          <dt>Resets in</dt>
          <dd className="num">{room.war ? duration(room.war.endsAt - now) : '—'}</dd>
        </div>
        <div>
          <dt>Leading</dt>
          <dd className="truncate">{room.war?.leader ? `@${room.war.leader}` : 'Nobody yet'}</dd>
        </div>
        <div>
          <dt>On the field</dt>
          <dd className="num">{room.war ? room.war.units : 0}</dd>
        </div>
      </dl>
      <div className="room-card-foot">
        <Avatar login={room.owner.login} url={room.owner.avatarUrl} size={20} />
        <span className="muted small">Hosted by @{room.owner.login}</span>
      </div>
    </Link>
  );
}

function CreateRoomModal({ onClose }: { onClose(): void }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [localHour, setLocalHour] = useState(0);
  const [bots, setBots] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { slug } = await api.createRoom({ name: name.trim(), visibility, resetHour: utcHourOfLocal(localHour), bots });
      navigate({ kind: 'room', slug, invite: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The room could not be created.');
      setBusy(false);
    }
  };
  return (
    <Modal title="Raise a new room" subtitle="A room runs one war a day for its members." onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} maxLength={48} minLength={3} required autoFocus placeholder="Night Owls Guild" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend>Who can find it</legend>
          <div className="segmented">
            {(['private', 'public'] as const).map((v) => (
              <button key={v} type="button" className={visibility === v ? 'is-on' : ''} aria-pressed={visibility === v} onClick={() => setVisibility(v)}>
                <Icon name={v === 'private' ? 'lock' : 'users'} size={15} /> {v === 'private' ? 'Private, by invite link' : 'Public, in the lobby'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field-row">
          <label className="field">
            <span>Daily reset, your time</span>
            <select className="select" value={localHour} onChange={(e) => setLocalHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)} ({hourLabel(utcHourOfLocal(h))} UTC)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sparring bots</span>
            <select className="select" value={bots} onChange={(e) => setBots(Number(e.target.value))}>
              {Array.from({ length: 7 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'None' : `${n} bot${n === 1 ? '' : 's'}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">Bots push synthetic code all day, so the field is never empty while your team is heads-down.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || name.trim().length < 3}>
            {busy ? 'Raising banners…' : 'Create room'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsModal({ me, onClose, onChanged }: { me: NonNullable<MeResponse['user']>; onClose(): void; onChanged(): void }) {
  const [hook, setHook] = useState<HookResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Your settings" subtitle={`Signed in as @${me.login}`} onClose={onClose}>
      <section className="settings-block">
        <h3 className="section-label">Rest day</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={me.resting}
            disabled={busy}
            onChange={(e) => {
              const on = e.target.checked;
              void act(async () => {
                await api.setResting(on);
                onChanged();
              });
            }}
          />
          <span>Resting today. Your streak is kept even if you push nothing.</span>
        </label>
        <p className="muted small">Current streak: {me.streak} {me.streak === 1 ? 'day' : 'days'} with at least one push.</p>
      </section>
      <section className="settings-block">
        <h3 className="section-label">Faster armies: repository webhook</h3>
        <p>
          GitHub’s public activity feed can lag by minutes or hours. Add a webhook to any public repository and your platoons march within seconds of a push.
        </p>
        {hook ? (
          <>
            <div className="copy-field">
              <input className="input mono" readOnly value={hook.hookUrl} aria-label="Payload URL" />
              <CopyButton text={hook.hookUrl} />
            </div>
            <div className="copy-field">
              <input className="input mono" readOnly value={hook.secret} aria-label="Secret" />
              <CopyButton text={hook.secret} />
            </div>
            <p className="form-ok">Copy the secret now. It is shown only once.</p>
            <ol className="steps">
              <li>
                Open your repository on GitHub, then <strong>Settings → Webhooks → Add webhook</strong>.
              </li>
              <li>
                Paste the <strong>Payload URL</strong> above and set the content type to <code>application/json</code>.
              </li>
              <li>
                Paste the <strong>Secret</strong>.
              </li>
              <li>
                Choose <strong>Just the push event</strong> and save.
              </li>
            </ol>
          </>
        ) : (
          <button className="btn" disabled={busy} onClick={() => void act(async () => setHook(await api.rotateHook()))}>
            {me.hookUrl ? 'Generate a new secret' : 'Create my webhook'}
          </button>
        )}
        {me.hookUrl && !hook && <p className="muted small">You already have a webhook. A new secret replaces the old one.</p>}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          className="btn btn-ghost"
          onClick={() =>
            void act(async () => {
              await api.logout();
              onChanged();
              onClose();
            })
          }
        >
          Sign out
        </button>
      </div>
    </Modal>
  );
}

function JoinByLink() {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="join-link"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseInvite(text);
        if (!parsed) {
          setError('Paste an invite link like https://…/r/room-name?invite=…');
          return;
        }
        navigate({ kind: 'room', slug: parsed.slug, invite: parsed.invite });
      }}
    >
      <label className="sr-only" htmlFor="invite-link">
        Invite link
      </label>
      <input id="invite-link" className="input" placeholder="Paste an invite link" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn" type="submit" disabled={!text.trim()}>
        Open
      </button>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

const HOW = [
  { kind: 0, title: 'Push', text: 'Every push to a public repo is read line by line: code, tests, docs, config, deletions.' },
  { kind: 1, title: 'Muster', text: 'Each kind of line raises its own soldier. A push becomes a platoon under your repo’s banner.' },
  { kind: 8, title: 'War', text: 'Platoons march from your capital to fight in the middle. The war resets daily with a digest.' },
];

export function HomePage({ me, meError, onMeChanged }: { me: MeResponse | null; meError: boolean; onMeChanged(): void }) {
  const [lobby, setLobby] = useState<LobbyResponse | null>(null);
  const [lobbyError, setLobbyError] = useState(false);
  const [modal, setModal] = useState<'create' | 'settings' | null>(null);
  const [devLogin, setDevLogin] = useState('');
  const [now, setNow] = useState(Date.now());
  const params = new URLSearchParams(location.search);
  const signInError = params.get('error');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.lobby().then(
        (l) => {
          if (cancelled) return;
          setLobby(l);
          setLobbyError(false);
        },
        () => !cancelled && setLobbyError(true),
      );
    void load();
    const t = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(tick);
    };
  }, []);

  const user = me?.user ?? null;
  const offline = meError && lobbyError;
  const mine = me?.rooms ?? [];
  const publicRooms = (lobby?.rooms ?? []).filter((r) => !mine.some((m) => m.slug === r.slug));

  return (
    <main className="page home">
      <header className="home-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden>
            ⛨
          </span>
          <span className="brand-name">Pushfront</span>
        </span>
        <nav className="home-nav-actions">
          {user ? (
            <>
              <Link className="nav-user" to={{ kind: 'profile', login: user.login }}>
                <Avatar login={user.login} url={user.avatarUrl} size={28} />
                <span>@{user.login}</span>
              </Link>
              <button className="icon-btn" onClick={() => setModal('settings')} aria-label="Your settings">
                <Icon name="gear" size={20} />
              </button>
            </>
          ) : (
            !offline && (
              <a className="btn btn-sm" href="/auth/github">
                <Icon name="github" size={16} /> Sign in
              </a>
            )
          )}
        </nav>
      </header>

      <section className="hero">
        <h1 className="hero-title">Your pushes are an army.</h1>
        <p className="hero-lede">
          Pushfront is an all-day war fought with real code. Your tests become shield walls, your docs become heralds, your deletions become cavalry. Rooms of friends and teams
          fight from morning to reset, and every day ends with a digest.
        </p>
        <ol className="how">
          {HOW.map((h, i) => (
            <li key={h.title} className="how-step panel">
              <span className="how-num num">{i + 1}</span>
              <UnitIcon kind={h.kind} size={28} title="" />
              <strong>{h.title}</strong>
              <span>{h.text}</span>
            </li>
          ))}
        </ol>
        <div className="hero-actions">
          {!user && !offline && (
            <a className="btn btn-primary btn-lg" href="/auth/github">
              <Icon name="github" size={20} /> Sign in with GitHub
            </a>
          )}
          {user && (
            <button className="btn btn-primary btn-lg" onClick={() => setModal('create')}>
              Create a room
            </button>
          )}
          <Link className="btn btn-lg" to={{ kind: 'demo' }}>
            Watch a demo war
          </Link>
        </div>
        {signInError && (
          <p className="form-error" role="alert">
            {signInError === 'too_new'
              ? 'GitHub accounts must be at least 30 days old to enlist.'
              : signInError === 'bot'
                ? 'Bot accounts cannot enlist.'
                : 'Sign-in did not complete. Please try again.'}
          </p>
        )}
        {me?.devAuth && !user && (
          <form className="dev-login" action="/auth/dev" method="get">
            <label htmlFor="dev-login">Dev sign-in as</label>
            <input id="dev-login" className="input" name="login" placeholder="github-login" value={devLogin} onChange={(e) => setDevLogin(e.target.value)} pattern="[A-Za-z0-9-]{1,39}" required />
            <button className="btn btn-sm" type="submit">
              Sign in
            </button>
          </form>
        )}
      </section>

      {offline && (
        <section className="panel offline-note" role="status">
          <strong>The war office is offline.</strong> Rooms and sign-in are unavailable right now, but the demo war runs entirely in your browser.
        </section>
      )}

      {user && (
        <section className="home-section">
          <div className="section-head">
            <h2>Your rooms</h2>
            <JoinByLink />
          </div>
          {mine.length === 0 ? (
            <div className="empty-card panel">
              <p>You’re not in any room yet. Create one for your team, join a public room below, or open an invite link.</p>
              <button className="btn btn-primary" onClick={() => setModal('create')}>
                Create a room
              </button>
            </div>
          ) : (
            <div className="room-grid">
              {mine.map((r) => (
                <RoomCardView key={r.slug} room={r} now={now} />
              ))}
            </div>
          )}
        </section>
      )}

      {!offline && (
        <section className="home-section">
          <div className="section-head">
            <h2>Public rooms</h2>
            {!user && <JoinByLink />}
          </div>
          {lobby === null && !lobbyError ? (
            <p className="muted">Scouting the lobby…</p>
          ) : publicRooms.length === 0 ? (
            <div className="empty-card panel">
              <p>No public wars right now. {user ? 'Start one and invite your friends.' : 'Sign in to start the first one.'}</p>
            </div>
          ) : (
            <div className="room-grid">
              {publicRooms.map((r) => (
                <RoomCardView key={r.slug} room={r} now={now} />
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="home-foot muted small">
        Pushfront reads only public activity. Lines changed are not quality. The game rewards a healthy shape of work and slows down as volume grows.
      </footer>

      {modal === 'create' && <CreateRoomModal onClose={() => setModal(null)} />}
      {modal === 'settings' && user && <SettingsModal me={user} onClose={() => setModal(null)} onChanged={onMeChanged} />}
    </main>
  );
}
