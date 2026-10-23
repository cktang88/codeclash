import { useEffect, useRef, useState } from 'react';
import type { HudSnapshot } from '../store.ts';
import { Link } from '../ui/Link.tsx';
import { Modal } from '../ui/Modal.tsx';
import { compact, duration, percent } from '../ui/format.ts';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { api } from '../net/api.ts';
import { summarizeAway, lastSeenKey, readNumber, writeNumber, type AwaySummary } from './away.ts';
import { colorize } from './Chronicle.tsx';
import { useHudContext } from './context.ts';
import { CarvedBar, hueVar, sfx, sfxCue } from '../ui/codex.tsx';

/** Big moments, announced across the top of the map. */
export function Toasts({ hud }: { hud: HudSnapshot }) {
  const { field } = useHudContext();
  // A soft bell as each new scroll unrolls.
  const newest = hud.toasts[hud.toasts.length - 1]?.id ?? null;
  const rung = useRef<number | null>(newest);
  useEffect(() => {
    if (newest === null || newest === rung.current) return;
    rung.current = newest;
    sfx(hud.toasts[hud.toasts.length - 1]?.kind === 'order' ? 'ui.coin' : 'ui.toast');
  }, [newest]);
  // The live region stays mounted while empty: one inserted together with its first toast is often not announced.
  return (
    <div className="toasts" role="status" aria-live="polite">
      {hud.toasts.map((t) => {
        const actor = t.p >= 0 ? hud.roster[t.p] : undefined;
        return (
          <button
            key={t.id}
            className={`toast toast-${t.kind}`}
            style={hueVar(actor?.hue)}
            onClick={() => Number.isFinite(t.x) && (t.x !== 0 || t.y !== 0 || t.kind === 'monolith') && field()?.focus(t.x, t.y, 1.2)}
          >
            <span className="toast-paper">
              <span className="toast-icon chron-icon">
                <EventIcon kind={t.kind} size={24} />
              </span>
              <span className={`toast-text${t.title.startsWith('@') ? '' : ' has-cap'}`}>{colorize(t.title, hud.roster)}</span>
            </span>
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
      <CarvedBar value={m.hp} max={m.maxHp} kind="hp" size="lg" label="Monolith health" valueText={`${pct}%`} />
      <span className="num">
        {compact(m.hp)} <span className="muted">/ {compact(m.maxHp)}</span>
      </span>
    </button>
  );
}

export function DayOverBanner({ hud }: { hud: HudSnapshot }) {
  const { slug } = useHudContext();
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (!hud.war || !slug) return null;
  // The server opens the next war right after ending one, so the ended war usually lives on only
  // in `endedWar` while the new day is already being fought.
  const ended = hud.war.status === 'ended' ? hud.war : hud.endedWar;
  if (!ended || ended.id === dismissed) return null;
  const ready = ended === hud.war ? hud.digestReady : true;
  return (
    <div className="day-over" role="status">
      <strong>{ended === hud.war ? 'The day is done.' : 'The last war is over. A new one has begun.'}</strong>
      <span>{ready ? 'The chroniclers have written the digest.' : 'The chroniclers are writing the digest…'}</span>
      {ready && (
        <Link className="btn btn-gilt" to={{ kind: 'digest', slug, warId: ended.id }}>
          Read the digest
        </Link>
      )}
      {ended !== hud.war && (
        <button className="icon-btn icon-btn-sm" onClick={() => setDismissed(ended.id)} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
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
              (<Icon name={prevRank > myRank ? 'up' : 'down'} size={11} /> {prevRank > myRank ? 'up' : 'down'} from #{prevRank})
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

/** Countdown to the room's daily reset. Ticks on its own, whatever the HUD's refresh rate. */
export function Countdown({ endsAt }: { endsAt: number }) {
  const { store } = useHudContext();
  const [now, setNow] = useState(() => store.serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(store.serverNow()), 1000);
    return () => clearInterval(id);
  }, [store]);
  const left = endsAt - now;
  return (
    <span className={`countdown${left < 3600_000 ? ' is-soon' : ''}`} title={`The war ends at ${new Date(endsAt).toLocaleTimeString()}`}>
      <Icon name="clock" size={15} />
      <span className="num">{left > 0 ? duration(left) : 'ended'}</span>
    </span>
  );
}

/**
 * Sounds the day's winner's chosen fanfare when a war ends while the viewer is watching.
 * A war that had already ended when the page opened stays quiet.
 */
export function VictoryFanfare({ hud }: { hud: HudSnapshot }) {
  const leader = useRef<number | null>(null);
  const heard = useRef<number | null | undefined>(undefined);
  const ended = hud.war?.status === 'ended' ? hud.war : hud.endedWar;
  if (hud.war?.status === 'active' && hud.standings[0]) leader.current = hud.standings[0].p;
  if (hud.war?.status === 'ended' && hud.standings[0]) leader.current = hud.standings[0].p;
  useEffect(() => {
    const id = ended?.id ?? null;
    if (heard.current === undefined) {
      heard.current = id;
      return;
    }
    if (id === null || id === heard.current) return;
    heard.current = id;
    const winner = leader.current === null ? undefined : hud.roster[leader.current];
    sfxCue(`fanfare-${winner?.heraldry?.fanfare ?? 'horn'}`);
  }, [ended?.id]);
  return null;
}
