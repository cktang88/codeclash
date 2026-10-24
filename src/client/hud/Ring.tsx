import { useEffect, useState } from 'react';
import { TICK_MS } from '../../sim/api.ts';
import type { HudSnapshot, RingSummary } from '../store.ts';
import { centreName } from '../render/centre.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Link } from '../ui/Link.tsx';
import { Modal } from '../ui/Modal.tsx';
import { RingFigure } from '../ui/RingFigure.tsx';
import { clock, duration } from '../ui/format.ts';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { hueVar, sfx } from '../ui/codex.tsx';
import { useHudContext } from './context.ts';

type Tone = 'calm' | 'warn' | 'bad' | 'gilt';

/** What the ring means for the viewer right now, in one line and a tone. */
export function ringStatus(hud: HudSnapshot, ring: RingSummary, login: (p: number) => string): { title: string; text: string; tone: Tone } {
  const me = hud.viewerP;
  const left = (tick: number) => duration((tick - hud.tick) * TICK_MS);
  const held = (p: number) => ring.seats.filter((s) => s.holder === p).length;
  const claimed = ring.seats.filter((s) => s.holder >= 0).length;
  if (ring.victor >= 0) {
    return {
      title: ring.victor === me ? 'You hold the whole ring' : `${login(ring.victor)} holds the whole ring`,
      text: `The war is won and locked until the reset${hud.war ? ` at ${clock(hud.war.endsAt)}` : ''}.`,
      tone: 'gilt',
    };
  }
  if (me !== null && me >= 0) {
    const mine = held(me);
    const home = ring.seats.find((s) => s.founder === me);
    if (mine === 0 && home && home.holder >= 0) {
      return { title: 'Rise and retake your home', text: `${login(home.holder)} holds your capital. Every push you make now musters outside its walls.`, tone: 'bad' };
    }
    const besieged = ring.seats.find((s) => s.holder === me && s.besieged);
    if (besieged && hud.tick >= ring.siegesOpen && besieged.barredUntil < 0) {
      return { title: 'Your walls are besieged', text: `${besieged.founder === me ? 'Your home' : 'A capital you hold'} is under siege. Push to send relief.`, tone: 'bad' };
    }
    if (hud.tick < ring.siegesOpen) {
      return { title: `Sieges open in ${left(ring.siegesOpen)}`, text: 'Until then no walls can fall: take the border forts on your two fronts.', tone: 'calm' };
    }
    const barred = ring.seats.find((s) => s.holder === me && s.barredUntil > hud.tick);
    if (barred) return { title: `Your gates are barred for ${left(barred.barredUntil)}`, text: 'Your capital cannot be stormed until then. Your neighbours’ may be.', tone: 'calm' };
    return {
      title: `You hold ${mine} of ${claimed} capitals`,
      text: mine * 2 > claimed ? 'Hold the fort beside a foe’s walls, then storm them. The whole ring wins the war.' : 'Hold the fort beside a neighbour’s walls to besiege them. Each capital taken adds 25% to your army.',
      tone: 'warn',
    };
  }
  // A spectator: who leads the ring.
  let lead = -1;
  for (const s of ring.seats) if (s.holder >= 0 && (lead < 0 || held(s.holder) > held(lead))) lead = s.holder;
  if (hud.tick < ring.siegesOpen) return { title: `Sieges open in ${left(ring.siegesOpen)}`, text: 'The morning belongs to the border forts.', tone: 'calm' };
  if (lead >= 0 && held(lead) > 1) return { title: `${login(lead)} holds ${held(lead)} of ${claimed} capitals`, text: 'Whoever holds the whole ring wins the war.', tone: 'warn' };
  return { title: 'Walls can be stormed', text: 'Whoever holds the whole ring wins the war.', tone: 'warn' };
}

/** The ring diagram over the map: every capital in ring order, its holder, the fronts and the viewer's place. */
export function RingBar({ hud }: { hud: HudSnapshot }) {
  const { field, store } = useHudContext();
  const ring = hud.ring;
  if (!ring) return null;
  const login = (p: number) => `@${hud.roster[p]?.login ?? `army-${p + 1}`}`;
  const status = ringStatus(hud, ring, login);
  const pick = (slot: number) => {
    const site = store.world?.map.sites[ring.seats[slot]?.site ?? -1];
    if (site) field()?.focus(site.x, site.y, 1.1);
  };
  return (
    <section className={`ring-bar is-${status.tone}`} aria-label="The ring of capitals">
      <RingFigure
        slots={ring.slots}
        seats={ring.seats}
        forts={ring.forts}
        hueOf={(p) => hud.roster[p]?.hue ?? store.world?.players[p]?.hue ?? null}
        nameOf={login}
        viewer={hud.viewerP}
        fronts={ring.fronts}
        centreKind={ring.centreKind}
        victor={ring.victor}
        size={76}
        onPick={pick}
      />
      <div className="ring-bar-text" role="status">
        <span className="ring-bar-kicker">
          The ring · {centreName(ring.seed, ring.centreKind)}
        </span>
        <strong className="ring-bar-title">{status.title}</strong>
        <span className="ring-bar-sub">{status.text}</span>
      </div>
    </section>
  );
}

/**
 * The ring is won: once the field's set piece has toured the ring, a proclamation unrolls naming
 * the conqueror, says the war is locked until the reset, and leads to the digest.
 */
export function VictoryOverlay({ hud, digestWar }: { hud: HudSnapshot; digestWar?: number }) {
  const { store, slug, invite, mode } = useHudContext();
  const ring = hud.ring;
  const victor = ring?.victor ?? -1;
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string | null>(null);
  const key = `${hud.war?.id ?? 0}:${victor}`;
  const waiting = victor >= 0 && now < store.ceremonyUntil;
  useEffect(() => {
    if (!waiting) return;
    // The field may end its set piece early (or later, on a slow machine): look again twice a second.
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waiting, store]);
  useEffect(() => {
    if (victor >= 0 && !waiting && dismissed !== key) sfx('ui.open');
  }, [victor >= 0 && !waiting]);
  if (!ring || victor < 0 || waiting || dismissed === key) return null;
  const who = hud.roster[victor];
  const login = `@${who?.login ?? `army-${victor + 1}`}`;
  const capitals = ring.seats.filter((s) => s.holder >= 0).length;
  const fell = ring.seats.filter((s) => s.founder >= 0 && s.founder !== victor).length;
  const at = store.warStartMs > 0 ? clock(store.timeOfTick(ring.victoryTick)) : null;
  const war = hud.war?.status === 'ended' ? hud.war : (hud.endedWar ?? hud.war);
  const digestId = digestWar ?? (mode === 'live' && war && (hud.digestReady || war !== hud.war) ? war.id : null);
  const digestReady = !!slug && digestId !== null;
  const close = () => setDismissed(key);
  return (
    <Modal
      title="The Ring Is Won"
      subtitle={at ? `at ${at}, ${duration(ring.victoryTick * TICK_MS)} into the war` : undefined}
      variant="scroll"
      night
      className="victory-proclamation"
      onClose={close}
      footer={
        <>
          {digestReady ? (
            <Link className="btn btn-gilt" to={{ kind: 'digest', slug: slug!, warId: digestId!, invite }}>
              Read the digest
            </Link>
          ) : mode === 'live' ? (
            <span className="muted">The chroniclers are writing the digest…</span>
          ) : null}
          <button className={digestReady ? 'btn' : 'btn btn-primary'} onClick={close} autoFocus={!digestReady}>
            View the field
          </button>
        </>
      }
    >
      <div className="victory-body" style={hueVar(who?.hue)}>
        <span className="victory-crest" aria-hidden>
          <EventIcon kind="victory" size={44} />
        </span>
        <Avatar login={who?.login ?? '?'} url={who?.avatarUrl} hue={who?.hue} size={56} bot={who?.bot} />
        <p className="victory-line">
          <strong className="who">{login}</strong> holds every capital on the ring: all {capitals} of them
          {fell > 0 ? `, ${fell === 1 ? 'one' : fell} stormed from ${fell === 1 ? 'its founder' : 'their founders'}` : ''}.
        </p>
        <p className="victory-note">
          <Icon name="lock" size={15} /> The field stands still.{' '}
          {mode === 'replay' ? 'The war ended here.' : `Pushes, orders and new recruits wait for the next war, which begins at the reset${hud.war ? ` at ${clock(hud.war.endsAt)}` : ''}.`}
        </p>
      </div>
    </Modal>
  );
}
