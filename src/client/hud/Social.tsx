import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, EMOTES, type Emote } from '../../protocol.ts';
import type { HudSnapshot } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { clock } from '../ui/format.ts';
import { Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';

const EMOTE_GAP_MS = 2000;

export function EmoteBar({ canSend }: { canSend: boolean }) {
  const { send, store, mode } = useHudContext();
  const [cooling, setCooling] = useState(false);
  const fire = (emote: Emote) => {
    if (cooling) return;
    if (mode === 'live') send({ type: 'emote', emote });
    else store.addEmote('you', store.viewerP, emote);
    setCooling(true);
    setTimeout(() => setCooling(false), EMOTE_GAP_MS);
  };
  if (!canSend) return null;
  return (
    <div className="emote-bar" role="toolbar" aria-label="Send a cheer">
      {EMOTES.map((e) => (
        <button key={e} className="emote-btn" onClick={() => fire(e)} disabled={cooling} aria-label={`Send ${e}`}>
          <span aria-hidden>{e}</span>
        </button>
      ))}
    </div>
  );
}

/** Emotes float up from the bottom of the screen for a few seconds. */
export function EmoteRain({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="emote-rain" aria-hidden>
      {hud.emotes.map((e) => (
        <span key={e.id} className="emote-float" style={{ left: `${12 + ((e.id * 37) % 76)}%` }}>
          <span className="emote-glyph">{e.emote}</span>
          <span className="emote-who">@{e.login}</span>
        </span>
      ))}
    </div>
  );
}

export function Chat({ hud, canSend }: { hud: HudSnapshot; canSend: boolean }) {
  const { send } = useHudContext();
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hud.chat.length]);
  const submit = () => {
    const t = text.trim().slice(0, CHAT_MAX);
    if (!t) return;
    send({ type: 'chat', text: t });
    setText('');
  };
  return (
    <div className="chat">
      {hud.chat.length === 0 ? (
        <p className="empty-note">No messages yet. Cheer your platoons on.</p>
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
            onChange={(e) => setText(e.target.value)}
            placeholder="Say something to the room…"
            aria-label="Chat message"
          />
          <button className="btn" type="submit" disabled={!text.trim()}>
            Send
          </button>
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
