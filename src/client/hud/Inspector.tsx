import { useEffect } from 'react';
import { Kind, PlatoonState, TICK_MS, type World } from '../../sim/api.ts';
import { platoonLabel, siteLabel } from '../../sim/chronicle.ts';
import { CAPTURE_TICKS, STATS } from '../../sim/stats.ts';
import { besieging } from '../../sim/council.ts';
import { computeRing, frontOf } from '../../sim/ring.ts';
import { founderOf, gatesUnbarAt, siegesOpenAt } from '../ringinfo.ts';
import type { HudSnapshot } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { BattalionFlag } from '../ui/Flag.tsx';
import { compact, duration } from '../ui/format.ts';
import { CarvedBar, hueVar } from '../ui/codex.tsx';
import { Icon, UnitIcon } from '../ui/icons.tsx';
import { UnitChips, colorize } from './Chronicle.tsx';
import { STATE_NAMES } from './Army.tsx';
import { useHudContext } from './context.ts';
import { playerInfo } from './names.ts';
import { PurposeTag } from '../ui/PurposeTag.tsx';
import { platoonWait, waitContext } from '../../sim/stance.ts';
import { stateWord, statusLine, type BarkNames } from '../barks.ts';

function aliveByKind(world: World, platoonId: number): number[] {
  const counts = new Array<number>(STATS.length).fill(0);
  for (const u of world.units) if (u.platoon === platoonId) counts[u.kind]!++;
  return counts;
}

function Meter({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'hp' | 'strength' | 'morale' | 'capture' }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <CarvedBar value={value} max={max} kind={kind} size="lg" />
      <span className="num">
        {compact(value)}
        <span className="muted">/{compact(max)}</span>
      </span>
    </div>
  );
}

/** Details for whatever is selected on the map: a platoon, a site or a player. */
export function Inspector({ hud }: { hud: HudSnapshot }) {
  const { store } = useHudContext();
  const world = store.world;
  const sel = hud.selection;
  const open = !!sel;
  // Escape puts the details away, unless it belongs to a dialog or a field being typed in.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('[aria-modal="true"]'))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      store.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, store]);
  if (!world || !sel) return null;
  const close = (
    <button className="icon-btn icon-btn-sm" onClick={() => store.select(null)} aria-label="Close details">
      <Icon name="close" size={16} />
    </button>
  );

  if (sel.kind === 'platoon') {
    const pl = world.platoons.find((x) => x.id === sel.id);
    if (!pl) {
      return (
        <section className="panel inspector" aria-label="Selected platoon">
          <header className="inspector-head">
            <strong>Platoon fallen</strong>
            {close}
          </header>
          <p className="muted">This platoon is no longer on the field.</p>
        </section>
      );
    }
    const owner = playerInfo(hud.roster, pl.p);
    const ref = hud.repos[pl.repo];
    const alive = aliveByKind(world, pl.id);
    const names: BarkNames = {
      player: (p) => store.names.player(p),
      site: (k) => siteLabel(world, k, store.names),
      clock: (tick) => new Date(store.timeOfTick(tick)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    const wait = pl.state === PlatoonState.Queued ? null : platoonWait(waitContext(world), pl);
    const status = wait ? statusLine(wait, names) : 'Waiting at the gate to march out.';
    return (
      <section className="panel inspector" aria-label="Selected platoon">
        <header className="inspector-head">
          <BattalionFlag hue={owner.hue ?? 0} repo={ref?.[0] ?? '?'} language={ref?.[1] ?? null} size={44} ordinal={pl.ordinal} />
          <div className="inspector-title">
            <strong>{platoonLabel(store.names, pl.repo, pl.ordinal)}</strong>
            <span>
              <span className="who" style={hueVar(owner.hue)}>
                @{owner.login}
              </span> · {ref?.[0]}
            </span>
          </div>
          {close}
        </header>
        <div className="inspector-state">
          <span className={`state-pill state-${pl.state}`}>{wait ? stateWord(wait, names) : STATE_NAMES[pl.state]}</span>
          <PurposeTag purpose={pl.purpose} />
          {pl.state !== PlatoonState.Queued && pl.site >= 0 && (
            <span className="muted">
              → <strong className="text">{siteLabel(world, pl.site, store.names)}</strong>
            </span>
          )}
          {pl.champion && <span className="tag tag-gold">Champion leads</span>}
        </div>
        <p className="inspector-status" aria-live="polite">{status}</p>
        <Meter label="Strength" value={pl.state === PlatoonState.Queued ? pl.size : pl.alive} max={pl.size} kind="strength" />
        <Meter label="Morale" value={Math.max(0, Math.round(pl.morale))} max={100} kind="morale" />
        <div className="inspector-units">
          <span className="meter-label">{pl.state === PlatoonState.Queued ? 'Mustered' : 'Standing'}</span>
          <UnitChips units={pl.state === PlatoonState.Queued ? pl.mustered : alive} size={17} />
        </div>
        <p className="inspector-foot">
          <Icon name="skull" size={14} /> {pl.kills} kills · out for {duration((world.tick - pl.arrivedTick) * TICK_MS)}
        </p>
      </section>
    );
  }

  if (sel.kind === 'site') {
    const def = world.map.sites[sel.id];
    const st = world.sites[sel.id];
    if (!def || !st) return null;
    const structure = world.structures.find((s) => s.site === sel.id);
    // Capitals and forts alike: the site's owner is who holds it now (a capital may have been captured).
    const owner = st.owner;
    const info = playerInfo(hud.roster, owner);
    const capturer = playerInfo(hud.roster, st.capturer);
    const need = CAPTURE_TICKS;
    return (
      <section className="panel inspector" aria-label="Selected objective">
        <header className="inspector-head">
          <div className="inspector-title">
            <strong>{siteLabel(world, sel.id, store.names)}</strong>
            <span className="muted">
              {def.kind === 'capital' ? 'Capital' : `Border fort · ${def.renown} renown a minute`}
            </span>
          </div>
          {close}
        </header>
        <p>
          {owner >= 0 ? (
            <>
              Held by <strong className="who" style={hueVar(info.hue)}>@{info.login}</strong>
            </>
          ) : def.kind === 'capital' ? (
            'An open seat, waiting for a new member.'
          ) : (
            'Unclaimed.'
          )}
        </p>
        {st.capturer >= 0 && st.progress > 0 && (
          <Meter label={`@${capturer.login} capturing`} value={Math.round((st.progress * TICK_MS) / 1000)} max={Math.round((need * TICK_MS) / 1000)} kind="capture" />
        )}
        {structure && structure.maxHp > 0 && (
          <Meter label="Walls" value={Math.round(structure.hp)} max={structure.maxHp} kind="hp" />
        )}
        {def.kind === 'capital' && structure && <CapitalNotes world={world} site={sel.id} viewerP={hud.viewerP} />}
        {def.kind === 'fort' && <FortNotes world={world} site={sel.id} viewerP={hud.viewerP} />}
      </section>
    );
  }

  const ps = world.players[sel.p];
  if (!ps) return null;
  const info = playerInfo(hud.roster, sel.p);
  const raised = ps.raised.reduce((a, b) => a + b, 0);
  return (
    <section className="panel inspector" aria-label="Selected player">
      <header className="inspector-head">
        <Avatar login={info.login} url={info.avatarUrl} hue={info.hue} size={40} bot={info.bot} />
        <div className="inspector-title">
          <strong className="who" style={hueVar(info.hue)}>
            @{info.login}
          </strong>
          <span className="muted">
            {compact(ps.renown)} renown
          </span>
        </div>
        {close}
      </header>
      <dl className="stat-grid">
        <div>
          <dt>Pushes</dt>
          <dd className="num">{ps.pushes}</dd>
        </div>
        <div>
          <dt>Raised</dt>
          <dd className="num">{raised}</dd>
        </div>
        <div>
          <dt>Kills</dt>
          <dd className="num">{ps.kills}</dd>
        </div>
        <div>
          <dt>Losses</dt>
          <dd className="num">{ps.losses}</dd>
        </div>
        <div>
          <dt>Forts taken</dt>
          <dd className="num">{ps.captures}</dd>
        </div>
        <div>
          <dt>Capitals held</dt>
          <dd className="num">{ps.capitals}</dd>
        </div>
        <div>
          <dt>Capitals stormed</dt>
          <dd className="num">{ps.conquests}</dd>
        </div>
      </dl>
      {ps.rising && <p className="inspector-notes">Rising: it lost every capital and fights on outside its home to retake it.</p>}
      {world.victor === ps.p && <p className="inspector-notes">Holds the whole ring: the war is won.</p>}
      <div className="inspector-units">
        <span className="meter-label">Raised today</span>
        <UnitChips units={ps.raised} size={17} />
      </div>
      {ps.best && (
        <p className="inspector-foot">
          <UnitIcon kind={Kind.Champion} size={14} /> Deadliest: {colorize(platoonLabel(store.names, ps.best[0], ps.best[1]), hud.roster)} with {ps.best[2]} kills
        </p>
      )}
    </section>
  );
}

/** A capital's story for the inspector: whose home it is, its gates, its siege, and how it stands to the viewer. */
function CapitalNotes({ world, site, viewerP }: { world: World; site: number; viewerP: number | null }) {
  const { store } = useHudContext();
  const def = world.map.sites[site]!;
  const st = world.structures.find((x) => x.site === site);
  if (!st) return null;
  const founder = founderOf(world, def.slot);
  const notes: string[] = [];
  if (founder >= 0 && founder !== st.p) notes.push(`Home of ${store.names.player(founder)}, taken ${st.taken === 1 ? 'once' : `${st.taken} times`} today. Its founder's architecture stands under the conqueror's banners.`);
  else if (founder >= 0) notes.push(`Home of ${store.names.player(founder)}${st.taken > 0 ? `, retaken after it fell` : ''}.`);
  const unbar = gatesUnbarAt(world, st);
  const opens = siegesOpenAt(world);
  if (world.tick < opens) notes.push(`No walls can fall until the sieges open, in ${duration((opens - world.tick) * TICK_MS)}.`);
  else if (unbar > world.tick) notes.push(`Its gates are barred for ${duration((unbar - world.tick) * TICK_MS)}: no one is conquered in their sleep.`);
  if (st.siegeSince >= 0) notes.push(`Besieged for ${duration((world.tick - st.siegeSince) * TICK_MS)}.`);
  if (viewerP !== null && viewerP >= 0 && st.p !== viewerP) {
    const ring = computeRing(world);
    const front = frontOf(ring, world, viewerP, site);
    notes.push(front ? (besieging(world, ring, viewerP, def.slot) ? 'On your front, and you hold its approach: your platoons can storm it.' : 'On your front. Hold the border fort beside it to lay siege.') : 'Not on your fronts: you can only fight your ring neighbours.');
  }
  return (
    <ul className="inspector-notes">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/** A border fort: which front it lies on for the viewer. */
function FortNotes({ world, site, viewerP }: { world: World; site: number; viewerP: number | null }) {
  const { store } = useHudContext();
  if (viewerP === null || viewerP < 0) return null;
  const ring = computeRing(world);
  const front = frontOf(ring, world, viewerP, site);
  return <p className="inspector-notes muted">{front ? `On your front with ${store.names.player(front.foe)}.` : 'Not on your fronts: a quarrel between others.'}</p>;
}
