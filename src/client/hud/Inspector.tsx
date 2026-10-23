import { Kind, PlatoonState, TICK_MS, type World } from '../../sim/api.ts';
import { platoonLabel, siteLabel } from '../../sim/chronicle.ts';
import { CAPTURE_TICKS, DOCTRINE_NAMES, HEART_CAPTURE_TICKS, STATS } from '../../sim/stats.ts';
import type { HudSnapshot } from '../store.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { BattalionFlag } from '../ui/Flag.tsx';
import { compact, duration, percent } from '../ui/format.ts';
import { Icon, UnitIcon } from '../ui/icons.tsx';
import { UnitChips, colorize } from './Chronicle.tsx';
import { STATE_NAMES } from './Command.tsx';
import { useHudContext } from './context.ts';
import { playerInfo } from './names.ts';

function aliveByKind(world: World, platoonId: number): number[] {
  const counts = new Array<number>(STATS.length).fill(0);
  for (const u of world.units) if (u.platoon === platoonId) counts[u.kind]!++;
  return counts;
}

function Meter({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <span className="bar bar-lg">
        <span className={`bar-fill bar-${kind}`} style={{ width: `${percent(value, max)}%` }} />
      </span>
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
    return (
      <section className="panel inspector" aria-label="Selected platoon">
        <header className="inspector-head">
          <BattalionFlag hue={owner.hue ?? 0} repo={ref?.[0] ?? '?'} language={ref?.[1] ?? null} size={44} ordinal={pl.ordinal} />
          <div className="inspector-title">
            <strong>{platoonLabel(store.names, pl.repo, pl.ordinal)}</strong>
            <span>
              <span style={{ color: owner.color }}>@{owner.login}</span> · {ref?.[0]}
            </span>
          </div>
          {close}
        </header>
        <div className="inspector-state">
          <span className={`state-pill state-${pl.state}`}>{STATE_NAMES[pl.state]}</span>
          {pl.state !== PlatoonState.Queued && pl.site >= 0 && (
            <span className="muted">
              → <strong className="text">{siteLabel(world, pl.site, store.names)}</strong>
            </span>
          )}
          {pl.champion && <span className="tag tag-gold">Champion leads</span>}
        </div>
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
    const owner = def.kind === 'capital' ? world.players.find((pl) => pl.slot === def.slot)?.p ?? -1 : st.owner;
    const info = playerInfo(hud.roster, owner);
    const capturer = playerInfo(hud.roster, st.capturer);
    const need = def.kind === 'heart' ? HEART_CAPTURE_TICKS : CAPTURE_TICKS;
    return (
      <section className="panel inspector" aria-label="Selected objective">
        <header className="inspector-head">
          <div className="inspector-title">
            <strong>{def.kind === 'heart' ? 'The Heart' : siteLabel(world, sel.id, store.names)}</strong>
            <span className="muted">
              {def.kind === 'capital' ? 'Capital' : `${def.kind === 'heart' ? 'Center of the map' : 'Shrine'} · ${def.renown} renown a minute`}
            </span>
          </div>
          {close}
        </header>
        <p>
          {owner >= 0 ? (
            <>
              Held by <strong style={{ color: info.color }}>@{info.login}</strong>
            </>
          ) : def.kind === 'capital' ? (
            'An empty slot, waiting for a new member.'
          ) : (
            'Unclaimed.'
          )}
        </p>
        {def.kind === 'heart' && !world.monolithFallen && <p className="muted">The Legacy Monolith guards the Heart. It must fall before anyone can capture it.</p>}
        {st.capturer >= 0 && st.progress > 0 && (
          <Meter label={`@${capturer.login} capturing`} value={Math.round((st.progress * TICK_MS) / 1000)} max={Math.round((need * TICK_MS) / 1000)} kind="capture" />
        )}
        {structure && structure.maxHp > 0 && (structure.p >= 0 || !world.monolithFallen) && (
          <Meter label={structure.p < 0 ? 'Monolith' : 'Walls'} value={Math.round(structure.hp)} max={structure.maxHp} kind="hp" />
        )}
        {structure && structure.ruinedUntil >= 0 && <p className="form-error">In ruins. Rebuilds in {duration((structure.ruinedUntil - world.tick) * TICK_MS)}.</p>}
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
          <strong style={{ color: info.color }}>@{info.login}</strong>
          <span className="muted">
            {DOCTRINE_NAMES[ps.doctrine]} doctrine · {compact(ps.renown)} renown
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
          <dt>Captures</dt>
          <dd className="num">{ps.captures}</dd>
        </div>
        <div>
          <dt>Sacks</dt>
          <dd className="num">{ps.sacks}</dd>
        </div>
      </dl>
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
