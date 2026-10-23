import { useState } from 'react';
import type { RoomDetail, Visibility } from '../../protocol.ts';
import { ApiError, api } from '../net/api.ts';
import { navigate } from '../route.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Modal } from '../ui/Modal.tsx';
import { resetHourOptions } from '../ui/format.ts';
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
      <Icon name="copy" size={15} /> <span aria-live="polite">{done ? 'Copied' : label}</span>
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

type Section = 'save' | 'invite' | 'members' | 'delete' | 'leave';

/** Owner settings, and leaving the room for everyone else. */
export function RoomSettings({ room, onClose, onChanged }: { room: RoomDetail; onClose(): void; onChanged(room: RoomDetail): void }) {
  const owner = room.viewer.owner;
  const [name, setName] = useState(room.name);
  const [visibility, setVisibility] = useState<Visibility>(room.visibility);
  // The UTC hour itself: converting through a local hour would round half-hour zones and drift it on each save.
  const [resetHour, setResetHour] = useState(room.resetHour);
  const [bots, setBots] = useState(room.bots);
  const [webhook, setWebhook] = useState(room.webhookUrl ?? '');
  const [busy, setBusy] = useState(false);
  // Each error is shown beside the control that caused it: this modal scrolls, and a message at its foot goes unseen.
  const [error, setError] = useState<{ at: Section; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = async (at: Section, fn: () => Promise<RoomDetail | void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fn();
      if (r) onChanged(r);
      if (at === 'save') setSaved(true);
    } catch (err) {
      setError({ at, text: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  const errorAt = (at: Section) =>
    error?.at === at ? (
      <p className="form-error" role="alert">
        {error.text}
      </p>
    ) : null;

  if (!owner) {
    return (
      <Modal title={room.name} subtitle="Room membership" onClose={onClose}>
        {room.viewer.member ? (
          <>
            <p>You fight in this room. Leaving takes effect at the next reset. Today’s army stays on the field.</p>
            <button className="btn btn-danger" disabled={busy} onClick={() => void act('leave', async () => { await api.leaveRoom(room.slug); navigate({ kind: 'home' }); })}>
              Leave this room
            </button>
          </>
        ) : (
          <p>You are watching this room.</p>
        )}
        {errorAt('leave')}
      </Modal>
    );
  }

  return (
    <Modal title="Room settings" subtitle={room.name} onClose={onClose} wide>
      <form
        className="form"
        onChange={() => setSaved(false)}
        onSubmit={(e) => {
          e.preventDefault();
          void act('save', () =>
            api.updateRoom(room.slug, {
              name: name.trim(),
              visibility,
              resetHour,
              bots,
              webhookUrl: webhook.trim() === '' ? null : webhook.trim(),
            }),
          );
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} maxLength={48} minLength={2} required onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="field">
          <legend>Visibility</legend>
          <div className="segmented">
            {(['public', 'private'] as const).map((v) => (
              <button key={v} type="button" className={visibility === v ? 'is-on' : ''} aria-pressed={visibility === v} onClick={() => { setVisibility(v); setSaved(false); }}>
                {v === 'public' ? 'Public: listed in the lobby' : 'Private: invite link only'}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field-row">
          <label className="field">
            <span>Daily reset (your time)</span>
            <select className="select" value={resetHour} onChange={(e) => setResetHour(Number(e.target.value))}>
              {resetHourOptions().map((o) => (
                <option key={o.utc} value={o.utc}>
                  {o.label}
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
          <button className="btn btn-primary" type="submit" disabled={busy || name.trim().length < 2}>
            Save settings
          </button>
          {saved && (
            <span className="form-ok" role="status">
              Saved.
            </span>
          )}
        </div>
        {errorAt('save')}
      </form>

      {room.invite && (
        <section className="settings-block">
          <h3 className="section-label">Invite link</h3>
          <div className="copy-field">
            <input className="input mono" readOnly value={inviteLink(room)} aria-label="Invite link" />
            <CopyButton text={inviteLink(room)} />
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={() => void act('invite', () => api.rotateInvite(room.slug))}>
            New invite code
          </button>
          <span className="muted small"> The old link stops working.</span>
          {errorAt('invite')}
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
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void act('members', () => api.removeMember(room.slug, m.id))} aria-label={`Remove @${m.login}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {errorAt('members')}
      </section>

      <section className="settings-block danger-zone">
        <h3 className="section-label">Danger zone</h3>
        {confirmDelete ? (
          <div className="form-actions">
            <span>This deletes the room and its history for everyone.</span>
            <button className="btn btn-danger" disabled={busy} onClick={() => void act('delete', async () => { await api.deleteRoom(room.slug); navigate({ kind: 'home' }); })}>
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
        {errorAt('delete')}
      </section>
    </Modal>
  );
}
