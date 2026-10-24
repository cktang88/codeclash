import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHAT_MAX, type Emote } from '../../protocol.ts';
import type { HudSnapshot } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { clock } from '../ui/format.ts';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';
import { sfx } from '../ui/codex.tsx';

const CHEER_GAP_MS = 2000;

/**
 * Cheers: reactions for the room, nothing more. Each has a word on it so nobody mistakes it for an
 * order (there are none: your code is your only command). The glyph floats over the sender's
 * capital and up the screen with the word and the sender's name.
 */
export const CHEERS: Record<Emote, { label: string; icon: ReactNode }> = {
  '🎉': { label: 'Huzzah!', icon: <Icon name="horn" size={18} /> },
  '⚔️': { label: 'What a fight!', icon: <EventIcon kind="clash" size={18} /> },
  '🛡️': { label: 'Well held!', icon: <Icon name="shield" size={18} /> },
  '🏹': { label: 'Nice shot!', icon: <Icon name="target" size={18} /> },
  '🔥': { label: 'On fire!', icon: <EventIcon kind="conquest" size={18} /> },
  '👑': { label: 'All hail!', icon: <Icon name="crown" size={18} /> },
  '😱': { label: 'Gasp!', icon: <Icon name="eye" size={18} /> },
  '💀': { label: 'Ouch!', icon: <Icon name="skull" size={18} /> },
};

const CHEER_ORDER = Object.keys(CHEERS) as Emote[];

/**
 * The Cheer button at the foot of the chronicle and chat: it opens a small palette of labelled
 * cheers. Purely social; it sends nothing to the armies.
 */
export function Cheers({ canSend }: { canSend: boolean }) {
  const { send, store, mode } = useHudContext();
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  if (!canSend) return null;
  const cheer = (emote: Emote) => {
    if (cooling) return;
    sfx('ui.click');
    if (mode === 'live') send({ type: 'emote', emote });
    else store.addEmote('you', store.viewerP, emote);
    setOpen(false);
    setCooling(true);
    setTimeout(() => setCooling(false), CHEER_GAP_MS);
  };
  return (
    <div className="cheers" ref={root}>
      {open && (
        <div className="cheer-palette" id="cheer-palette" role="group" aria-label="Cheers, just for show">
          {CHEER_ORDER.map((e) => (
            <button key={e} className="cheer" onClick={() => cheer(e)} disabled={cooling}>
              {CHEERS[e].icon}
              <span>{CHEERS[e].label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className={`btn btn-sm cheer-toggle${open ? ' is-on' : ''}`}
        aria-expanded={open}
        aria-controls="cheer-palette"
        disabled={cooling && !open}
        onClick={() => {
          sfx(open ? 'ui.close' : 'ui.click');
          setOpen((v) => !v);
        }}
      >
        <Icon name="horn" size={16} /> Cheer
      </button>
      <span className="cheer-hint">Cheer your armies — just for show</span>
    </div>
  );
}

/** Cheers float up from the bottom of the screen for a few seconds, with their word and who sent them. */
export function EmoteRain({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="emote-rain" aria-hidden>
      {hud.emotes.map((e) => (
        <span key={e.id} className="emote-float" style={{ left: `${12 + ((e.id * 37) % 76)}%` }}>
          <span className="emote-glyph">{e.emote}</span>
          <span className="emote-who">
            {CHEERS[e.emote]?.label ?? ''} @{e.login}
          </span>
        </span>
      ))}
    </div>
  );
}

/** How long a sent message may take to come back from the room before it is treated as dropped. */
const CHAT_ECHO_MS = 5_000;

export function Chat({ hud, canSend }: { hud: HudSnapshot; canSend: boolean }) {
  const { send, me } = useHudContext();
  const [text, setText] = useState('');
  // The server drops a message silently (sending too fast, no longer a member, socket gone), so a sent message
  // is held until the room echoes it back; if it never does, it is restored to the input with a note.
  const [pending, setPending] = useState<{ text: string; seen: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const live = hud.conn.phase === 'live';
  const down = hud.conn.phase === 'offline' || hud.conn.phase === 'refused';
  const lastId = hud.chat[hud.chat.length - 1]?.id ?? 0;
  useEffect(() => {
    const el = list.current;
    // Follow new messages only when the reader is already at the bottom, not while they scroll back.
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    if (!pending) return;
    const mine = me?.user?.login;
    if (hud.chat.some((m) => m.id > pending.seen && m.user.login === mine && m.text === pending.text)) setPending(null);
  }, [lastId, pending]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(null);
      setFailed(true);
      setText((cur) => cur || pending.text);
    }, CHAT_ECHO_MS);
    return () => clearTimeout(t);
  }, [pending]);
  const submit = () => {
    const t = text.trim().slice(0, CHAT_MAX);
    if (!t || !live || pending) return;
    sfx('ui.quill');
    send({ type: 'chat', text: t });
    setPending({ text: t, seen: lastId });
    setFailed(false);
    setText('');
  };
  return (
    <div className="chat">
      {hud.chat.length === 0 ? (
        <p className="empty-note">No messages yet. Say hello to the room.</p>
      ) : (
        <ol className="chat-list" ref={list} aria-live="polite">
          {hud.chat.map((m) => {
            const r = hud.roster.find((x) => x.login === m.user.login);
            return (
              <li key={m.id} className="chat-msg">
                <Avatar login={m.user.login} url={m.user.avatarUrl} hue={r?.hue ?? null} size={22} />
                <span className="chat-body">
                  <strong className="who">{m.user.login}</strong> <span className="chat-time">{clock(m.at)}</span>
                  <span className="chat-text">{m.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {canSend ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="input"
            value={text}
            maxLength={CHAT_MAX}
            onChange={(e) => {
              setText(e.target.value);
              setFailed(false);
            }}
            placeholder="Say something to the room…"
            aria-label="Chat message"
          />
          <button className="btn" type="submit" disabled={!text.trim() || !live || !!pending}>
            {pending ? 'Sending…' : 'Send'}
          </button>
          {(failed || down) && (
            <p className="form-error chat-error" role="alert">
              {down ? 'Reconnecting. Your message will wait here.' : 'That message did not reach the room. Wait a moment and send it again.'}
            </p>
          )}
        </form>
      ) : (
        <p className="muted small">Members of this room can chat.</p>
      )}
    </div>
  );
}

export function Presence({ hud }: { hud: HudSnapshot }) {
  const total = hud.presence.reduce((n, p) => n + p.count, 0);
  if (total === 0) return null;
  const known = hud.presence.filter((p) => p.login);
  return (
    <span className="presence" title={known.map((p) => p.login).join(', ')}>
      <span className="presence-faces" aria-hidden>
        {known.slice(0, 4).map((p) => (
          <Avatar key={p.login} login={p.login!} url={p.avatarUrl} size={22} />
        ))}
      </span>
      <Icon name="eye" size={15} />
      <span className="num">{total}</span>
      <span className="presence-label">watching</span>
    </span>
  );
}
