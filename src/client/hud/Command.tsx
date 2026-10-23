import { useEffect, useState } from 'react';
import { PlatoonState, TICK_MS, type World } from '../../sim/api.ts';
import { roman, siteLabel } from '../../sim/chronicle.ts';
import { DOCTRINE_COOLDOWN, DOCTRINE_NAMES, RALLY_COOLDOWN } from '../../sim/stats.ts';
import { ApiError, api } from '../net/api.ts';
import type { HudSnapshot } from '../store.ts';
import { BattalionFlag } from '../ui/Flag.tsx';
import { duration, percent } from '../ui/format.ts';
import { DoctrineIcon, Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';

export const DOCTRINE_EFFECTS = [
  'No modifiers. The war council weighs every objective evenly.',
  '+15% damage. Marches on enemy capitals and the Heart.',
  '20% less damage taken near your shrines. Defends what you hold.',
  '+50% damage to structures. Targets enemy capitals.',
  '+20% speed. Picks lightly held objectives.',
];

export const STATE_NAMES = ['Waiting at the capital', 'Marching', 'Fighting', 'Holding', 'Routing'];

function cooldownLeft(at: number, cooldown: number, tick: number): number {
  return at < 0 ? 0 : Math.max(0, (at + cooldown - tick) * TICK_MS);
}

function useCommand(slug: string | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (label: string, cmd: Parameters<typeof api.command>[1]) => {
    if (!slug) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.command(slug, cmd);
      setNotice(`${label} ordered. It takes effect in a moment.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The order did not reach the field. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, notice, run };
}

/** The viewer's three scarce levers: doctrine, rally and war cry. */
export function CommandBar({ hud }: { hud: HudSnapshot }) {
  const { store, slug } = useHudContext();
  const world = store.world;
  const p = hud.viewerP;
  const [rallyPick, setRallyPick] = useState(false);
  const { busy, error, notice, run } = useCommand(slug);
  const player = world && p !== null ? world.players[p] : undefined;

  useEffect(() => {
    if (!rallyPick || hud.selection?.kind !== 'site') return;
    setRallyPick(false);
    void run('Rally', { kind: 'rally', site: hud.selection.id });
  }, [hud.selection, rallyPick]);

  if (!world || !player) return null;
  const tick = world.tick;
  const doctrineWait = cooldownLeft(player.doctrineAt, DOCTRINE_COOLDOWN, tick);
  const rallyWait = cooldownLeft(player.rallyAt, RALLY_COOLDOWN, tick);
  const rallying = player.rallySite >= 0 && player.rallyUntil > tick;
  const crying = player.cryUntil > tick;

  return (
    <section className="command" aria-label="Your orders">
      <div className="command-group">
        <h3 className="command-label">Doctrine</h3>
        <div className="doctrines" role="radiogroup" aria-label="Doctrine">
          {DOCTRINE_NAMES.map((name, d) => (
            <button
              key={name}
              role="radio"
              aria-checked={player.doctrine === d}
              className={`doctrine${player.doctrine === d ? ' is-on' : ''}`}
              disabled={busy || player.doctrine === d || doctrineWait > 0}
              onClick={() => void run(`${name} doctrine`, { kind: 'doctrine', doctrine: d })}
              title={`${name}: ${DOCTRINE_EFFECTS[d]}`}
            >
              <DoctrineIcon doctrine={d} size={18} />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <p className="command-hint">
          {DOCTRINE_EFFECTS[player.doctrine]} {doctrineWait > 0 && <strong>Change again in {duration(doctrineWait)}.</strong>}
        </p>
      </div>
      <div className="command-group">
        <h3 className="command-label">Rally</h3>
        <div className="command-row">
          <select
            className="select"
            aria-label="Rally every platoon on"
            disabled={busy || rallyWait > 0}
            value=""
            onChange={(e) => {
              const site = Number(e.target.value);
              if (Number.isInteger(site) && e.target.value !== '') void run('Rally', { kind: 'rally', site });
            }}
          >
            <option value="">Choose an objective…</option>
            {world.map.sites.map((s) =>
              s.kind === 'capital' && !world.players.some((pl) => pl.slot === s.slot) ? null : (
                <option key={s.id} value={s.id}>
                  {siteLabel(world, s.id, store.names)}
                </option>
              ),
            )}
          </select>
          <button className={`btn${rallyPick ? ' is-on' : ''}`} disabled={busy || rallyWait > 0} onClick={() => setRallyPick((v) => !v)} aria-pressed={rallyPick}>
            <Icon name="target" size={16} /> {rallyPick ? 'Click a site…' : 'Pick on map'}
          </button>
        </div>
        <p className="command-hint">
          {rallying ? (
            <>
              Rallying on <strong>{siteLabel(world, player.rallySite, store.names)}</strong> for {duration((player.rallyUntil - tick) * TICK_MS)}.{' '}
            </>
          ) : (
            'Every platoon marches on one objective for 2 hours. '
          )}
          {rallyWait > 0 && <strong>Ready in {duration(rallyWait)}.</strong>}
        </p>
      </div>
      <div className="command-group">
        <h3 className="command-label">War Cry</h3>
        <button className="btn btn-cry" disabled={busy || player.cryUsed} onClick={() => void run('War Cry', { kind: 'cry' })}>
          <Icon name="bolt" size={18} /> {crying ? `Sounding! ${duration((player.cryUntil - tick) * TICK_MS)}` : player.cryUsed ? 'Used today' : 'Sound the War Cry'}
        </button>
        <p className="command-hint">+30% damage and +25% speed for 60 seconds. Once per war.</p>
      </div>
      {(error || notice) && (
        <p className={error ? 'form-error' : 'form-ok'} role={error ? 'alert' : 'status'}>
          {error ?? notice}
        </p>
      )}
    </section>
  );
}

export function platoonsByBattalion(world: World, p: number): { repo: number; raised: number; platoons: World['platoons'] }[] {
  const player = world.players[p];
  if (!player) return [];
  return player.battalions.map(([repo, raised]) => ({
    repo,
    raised,
    platoons: world.platoons.filter((pl) => pl.p === p && pl.repo === repo),
  }));
}

/** The viewer's army: battalions per repository, platoons per push. */
export function ArmyPanel({ hud }: { hud: HudSnapshot }) {
  const { store, field } = useHudContext();
  const world = store.world;
  const p = hud.viewerP;
  if (!world || p === null || !world.players[p]) return null;
  const hue = world.players[p]!.hue;
  const battalions = platoonsByBattalion(world, p);
  const queue = world.players[p]!.queue.length;
  if (battalions.length === 0) {
    return <p className="empty-note">Push to a public repository and your first platoon marches out of your capital.</p>;
  }
  return (
    <div className="army">
      {queue > 0 && (
        <p className="army-queue">
          <Icon name="clock" size={15} /> {queue} {queue === 1 ? 'platoon waits' : 'platoons wait'} at the capital for room on the field.
        </p>
      )}
      {battalions.map((b) => {
        const ref = hud.repos[b.repo];
        const name = ref?.[0] ?? 'repository';
        return (
          <div key={b.repo} className="battalion">
            <div className="battalion-head">
              <BattalionFlag hue={hue} repo={name} language={ref?.[1] ?? null} size={34} />
              <div className="battalion-title">
                <strong className="truncate">{name.slice(name.indexOf('/') + 1)} Battalion</strong>
                <span className="muted">
                  {b.raised} raised today · {b.platoons.length} standing
                </span>
              </div>
            </div>
            {b.platoons.length > 0 && (
              <ul className="platoons">
                {b.platoons.map((pl) => (
                  <li key={pl.id}>
                    <button
                      className={`platoon-row${hud.selection?.kind === 'platoon' && hud.selection.id === pl.id ? ' is-on' : ''}`}
                      onClick={() => {
                        store.select({ kind: 'platoon', id: pl.id });
                        if (pl.state !== PlatoonState.Queued) field()?.focus(pl.x, pl.y, 1.4);
                      }}
                    >
                      <span className="platoon-num">{roman(pl.ordinal)}</span>
                      <span className="platoon-state">{STATE_NAMES[pl.state]}</span>
                      <span className="bars">
                        <span className="bar" title={`Strength ${pl.alive}/${pl.size}`}>
                          <span className="bar-fill bar-strength" style={{ width: `${percent(pl.alive, pl.size)}%` }} />
                        </span>
                        <span className="bar" title={`Morale ${Math.max(0, Math.round(pl.morale))}`}>
                          <span className="bar-fill bar-morale" style={{ width: `${percent(pl.morale, 100)}%` }} />
                        </span>
                      </span>
                      <span className="num muted">
                        {pl.state === PlatoonState.Queued ? pl.size : pl.alive}/{pl.size}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
