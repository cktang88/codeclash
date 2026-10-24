import { LedgerPanel } from '../ui/fairPlay.tsx';
import { PlatoonState, type World } from '../../sim/api.ts';
import { roman } from '../../sim/chronicle.ts';
import type { HudSnapshot } from '../store.ts';
import { BattalionFlag } from '../ui/Flag.tsx';
import { CarvedBar } from '../ui/codex.tsx';
import { EventIcon, Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';

export const STATE_NAMES = ['Waiting at the capital', 'Marching', 'Fighting', 'Holding', 'Routing'];

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
  const ledger = <LedgerPanel player={world.players[p]!} />;
  const me = world.players[p]!;
  const home = world.map.sites[me.slot];
  const rising = me.rising && home ? (
    <div className="rising-note" role="status">
      <EventIcon kind="rising" size={26} />
      <p>
        <strong>Rise and retake your home.</strong> {store.names.player(world.structures.find((st) => st.site === home.id)?.p ?? -1)} holds your capital. Every push you make now
        musters on the road outside its walls; take the forts beside it and storm it back.{' '}
        <button className="btn btn-sm btn-ghost" onClick={() => field()?.focus(home.x, home.y, 1.1)}>
          Show it
        </button>
      </p>
    </div>
  ) : null;
  if (battalions.length === 0) {
    return (
      <div className="army">
        {rising}
        <p className="empty-note">Push to a public repository and your first platoon marches out of your capital.</p>
        {ledger}
      </div>
    );
  }
  return (
    <div className="army">
      {rising}
      {ledger}
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
                        <CarvedBar value={pl.alive} max={pl.size} kind="strength" />
                        <CarvedBar value={Math.max(0, pl.morale)} max={100} kind="morale" />
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
