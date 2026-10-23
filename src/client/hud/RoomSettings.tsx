import { useState } from 'react';
import type { RoomDetail, Visibility } from '../../protocol.ts';
import { ApiError, api } from '../net/api.ts';
import { navigate } from '../route.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Modal } from '../ui/Modal.tsx';
import { hourLabel, localHourOfUtc, utcHourOfLocal } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';

export function inviteLink(room: Pick<RoomDetail, 'slug' | 'invite' | 'visibility'>): string {
  const base = `${location.origin}/r/${room.slug}`;
  return room.visibility === 'private' && room.invite ? `${base}?invite=${encodeURIComponent(room.invite)}` : base;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-sm"
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          },
          () => undefined,
        );
      }}
    >
      <Icon name="copy" size={15} /> {done ? 'Copied' : label}
    </button>
  );
}

export function ShareModal({ room, onClose }: { room: RoomDetail; onClose(): void }) {
  const link = inviteLink(room);
  return (
    <Modal title="Share this war" subtitle={room.visibility === 'private' ? 'Anyone with this link can watch and join.' : 'Anyone can watch. Signed-in players can join.'} onClose={onClose}>
      <div className="copy-field">
        <input className="input mono" readOnly value={link} aria-label="Room link" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={link} />
      </div>
      {room.visibility === 'private' && !room.invite && <p className="muted small">Only members can see the invite code.</p>}
    </Modal>
  );
}

/** Owner settings, and leaving the room for everyone else. */
export function RoomSettings({ room, onClose, onChanged }: { room: RoomDetail; onClose(): void; onChanged(room: RoomDetail): void }) {
  const owner = room.viewer.owner;
  const [name, setName] = useState(room.name);
  const [visibility, setVisibility] = useState<Visibility>(room.visibility);
  const [localHour, setLocalHour] = useState(() => localHourOfUtc(room.resetHour));
  const [bots, setBots] = useState(room.bots);
  const [webhook, setWebhook] = useState(room.webhookUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = async (fn: () => Promise<RoomDetail | void>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn();
      if (r) onChanged(r);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!owner) {
    return (
      <Modal title={room.name} subtitle="Room membership" onClose={onClose}>
        {room.viewer.member ? (
          <>
            <p>You fight in this room. Leaving takes effect at the next reset. Today’s army stays on the field.</p>
            <button className="btn btn-danger" disabled={busy} onClick={() => void act(async () => { await api.leaveRoom(room.slug); navigate({ kind: 'home' }); })}>
              Leave this room
            </button>
          </>
        ) : (
          <p>You are watching this room.</p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal title="Room settings" subtitle={room.name} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() =>
            api.updateRoom(room.slug, {
              name: name.trim(),
              visibility,
              resetHour: utcHourOfLocal(localHour),
              bots,
              webhookUrl: webhook.trim() === '' ? null : webhook.trim(),
            }),
          );
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} maxLength={48} required onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend>Visibility</legend>
          <div className="segmented">
            {(['public', 'private'] as const).map((v) => (
              <button key={v} type="button" className={visibility === v ? 'is-on' : ''} aria-pressed={visibility === v} onClick={() => setVisibility(v)}>
                {v === 'public' ? 'Public: listed in the lobby' : 'Private: invite link only'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field-row">
          <label className="field">
            <span>Daily reset (your time)</span>
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
                  {n === 0 ? 'None' : n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">Changes to the reset hour and bots take effect at the next reset.</p>
        <label className="field">
          <span>Slack or Discord webhook for the daily digest</span>
          <input className="input mono" type="url" placeholder="https://hooks.slack.com/services/…" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Save settings
          </button>
          {saved && <span className="form-ok">Saved.</span>}
        </div>
      </form>

      {room.invite && (
        <section className="settings-block">
          <h3 className="section-label">Invite link</h3>
          <div className="copy-field">
            <input className="input mono" readOnly value={inviteLink(room)} aria-label="Invite link" />
            <CopyButton text={inviteLink(room)} />
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => api.rotateInvite(room.slug))}>
            New invite code
          </button>
          <span className="muted small"> The old link stops working.</span>
        </section>
      )}

      <section className="settings-block">
        <h3 className="section-label">Members · {room.members.length}</h3>
        <ul className="member-list">
          {room.members.map((m) => (
            <li key={m.id}>
              <Avatar login={m.login} url={m.avatarUrl} size={26} />
              <span className="truncate">@{m.login}</span>
              {m.role === 'owner' ? (
                <span className="tag tag-gold">Owner</span>
              ) : (
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void act(() => api.removeMember(room.slug, m.id))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-block danger-zone">
        <h3 className="section-label">Danger zone</h3>
        {confirmDelete ? (
          <div className="form-actions">
            <span>This deletes the room and its history for everyone.</span>
            <button className="btn btn-danger" disabled={busy} onClick={() => void act(async () => { await api.deleteRoom(room.slug); navigate({ kind: 'home' }); })}>
              Delete forever
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)}>
            Delete room…
          </button>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
