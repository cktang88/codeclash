import { useEffect, useState } from 'react';
import { armyColor } from '../../rules/heraldry.ts';
import type { HudSnapshot } from '../store.ts';
import { Link } from '../ui/Link.tsx';
import { Modal } from '../ui/Modal.tsx';
import { compact, duration, percent } from '../ui/format.ts';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { api } from '../net/api.ts';
import { summarizeAway, lastSeenKey, readNumber, writeNumber, type AwaySummary } from './away.ts';
import { colorize } from './Chronicle.tsx';
import { useHudContext } from './context.ts';

/** Big moments, announced across the top of the map. */
export function Toasts({ hud }: { hud: HudSnapshot }) {
  const { field } = useHudContext();
  if (hud.toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {hud.toasts.map((t) => {
        const actor = t.p >= 0 ? hud.roster[t.p] : undefined;
        return (
          <button
            key={t.id}
            className={`toast toast-${t.kind}`}
            style={actor ? { borderColor: armyColor(actor.hue, 55) } : undefined}
            onClick={() => (t.x !== 0 || t.y !== 0 || t.kind === 'monolith') && field()?.focus(t.x, t.y, 1.2)}
          >
            <span className="toast-icon" style={actor ? { color: armyColor(actor.hue, 66) } : undefined}>
              <EventIcon kind={t.kind} size={22} />
            </span>
            <span className="toast-text">{colorize(t.title, hud.roster)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MonolithBar({ hud }: { hud: HudSnapshot }) {
  const { field } = useHudContext();
  const m = hud.monolith;
  if (m.fallen || m.maxHp <= 1 || !hud.war) return null;
  const pct = percent(m.hp, m.maxHp);
  return (
    <button className="monolith-bar" onClick={() => field()?.focus(0, 0, 1)} title="The Legacy Monolith guards the Heart. Everyone attacks it together.">
      <span className="monolith-label">
        <EventIcon kind="monolith" size={16} /> Legacy Monolith
      </span>
      <span className="bar bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={m.maxHp} aria-valuenow={Math.round(m.hp)} aria-label="Monolith health">
        <span className="bar-fill bar-hp" style={{ width: `${pct}%` }} />
      </span>
      <span className="num">
        {compact(m.hp)} <span className="muted">/ {compact(m.maxHp)}</span>
      </span>
    </button>
  );
}

export function DayOverBanner({ hud }: { hud: HudSnapshot }) {
  const { slug } = useHudContext();
  if (!hud.war || hud.war.status !== 'ended' || !slug) return null;
  return (
    <div className="day-over" role="status">
      <strong>The day is done.</strong>
      <span>{hud.digestReady ? 'The chroniclers have written the digest.' : 'The chroniclers are writing the digest…'}</span>
      {hud.digestReady && (
        <Link className="btn btn-primary" to={{ kind: 'digest', slug, warId: hud.war.id }}>
          Read the digest
        </Link>
      )}
    </div>
  );
}

const AWAY_MS = 10 * 60_000;

/** "While you were away": a recap of the chronicle since the viewer last looked. */
export function AwayModal({ hud }: { hud: HudSnapshot }) {
  const { slug, mode } = useHudContext();
  const [summary, setSummary] = useState<{ since: number; s: AwaySummary } | null>(null);
  const rankKey = slug ? `pf:lastRank:${slug}` : '';
  const myRank = hud.viewerP === null ? null : hud.standings.findIndex((s) => s.p === hud.viewerP) + 1 || null;
  const [prevRank] = useState(() => (rankKey ? readNumber(rankKey) : null));

  useEffect(() => {
    if (mode !== 'live' || !slug) return;
    const key = lastSeenKey(slug);
    const since = readNumber(key);
    const mark = () => writeNumber(key, Date.now());
    const onVisibility = () => document.visibilityState === 'hidden' && mark();
    window.addEventListener('pagehide', mark);
    document.addEventListener('visibilitychange', onVisibility);
    let cancelled = false;
    if (since !== null && Date.now() - since > AWAY_MS) {
      api
        .chronicleSince(slug, since)
        .then((r) => {
          if (!cancelled && r.entries.length > 0) setSummary({ since, s: summarizeAway(r.entries, hud.viewerP) });
        })
        .catch(() => undefined);
    } else mark();
    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', mark);
      document.removeEventListener('visibilitychange', onVisibility);
      mark();
    };
    // Only on entering the room; the HUD mounts this after the first hello, so viewerP is settled.
  }, [slug, mode]);

  useEffect(() => {
    if (rankKey && myRank !== null) writeNumber(rankKey, myRank);
  }, [rankKey, myRank]);

  if (!summary || !slug) return null;
  const { s, since } = summary;
  const dismiss = () => {
    writeNumber(lastSeenKey(slug), Date.now());
    setSummary(null);
  };
  const lines: string[] = [];
  if (s.mustered > 0) lines.push(`${s.mustered} of your pushes raised ${s.musteredSoldiers} soldiers.`);
  if (s.captured > 0) lines.push(`Your army captured ${s.captured} ${s.captured === 1 ? 'objective' : 'objectives'}.`);
  if (s.lost > 0) lines.push(`You lost ${s.lost} ${s.lost === 1 ? 'objective' : 'objectives'} to rivals.`);
  if (s.sacked > 0) lines.push(`You sacked ${s.sacked} ${s.sacked === 1 ? 'capital' : 'capitals'}!`);
  if (s.sackedBy > 0) lines.push(`Your capital was sacked ${s.sackedBy === 1 ? 'once' : `${s.sackedBy} times`}.`);
  if (s.wiped > 0 || s.routed > 0) lines.push(`${s.wiped} of your platoons fell and ${s.routed} broke and fled.`);
  if (s.monolithFell) lines.push('The Legacy Monolith fell. The Heart is open.');
  if (s.leaderChanges > 0) lines.push(`The lead changed hands ${s.leaderChanges === 1 ? 'once' : `${s.leaderChanges} times`}.`);
  if (lines.length === 0) lines.push(`${s.entries} things happened on the field.`);
  return (
    <Modal
      title="While you were away"
      subtitle={`${duration(Date.now() - since)} since you last looked`}
      onClose={dismiss}
      footer={
        <button className="btn btn-primary" onClick={dismiss} autoFocus>
          To the field
        </button>
      }
    >
      {myRank !== null && (
        <p className="away-rank">
          You are <strong>#{myRank}</strong>
          {prevRank !== null && prevRank !== myRank && (
            <span className={prevRank > myRank ? 'good' : 'bad'}>
              {' '}
              ({prevRank > myRank ? '▲ up' : '▼ down'} from #{prevRank})
            </span>
          )}
          .
        </p>
      )}
      <ul className="away-list">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {s.moments.length > 0 && (
        <>
          <h3 className="section-label">Big moments</h3>
          <ul className="away-moments">
            {s.moments.map((e, i) => (
              <li key={i}>
                <EventIcon kind={e.kind} size={16} /> {colorize(e.text, hud.roster)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Countdown to the room's daily reset. */
export function Countdown({ endsAt, now }: { endsAt: number; now: number }) {
  const left = endsAt - now;
  return (
    <span className={`countdown${left < 3600_000 ? ' is-soon' : ''}`} title={`The war ends at ${new Date(endsAt).toLocaleTimeString()}`}>
      <Icon name="clock" size={15} />
      <span className="num">{left > 0 ? duration(left) : 'ended'}</span>
    </span>
  );
}
