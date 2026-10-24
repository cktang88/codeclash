import { useEffect, useRef, useState } from 'react';
import { LedgerPanel } from '../ui/fairPlay.tsx';
import { PlatoonState, TICK_MS, type World } from '../../sim/api.ts';
import { roman, siteLabel } from '../../sim/chronicle.ts';
import { computeRing, frontOf } from '../../sim/ring.ts';
import { DOCTRINE_COOLDOWN, DOCTRINE_NAMES, RALLY_COOLDOWN } from '../../sim/stats.ts';
import { ApiError, api } from '../net/api.ts';
import type { HudSnapshot } from '../store.ts';
import { BattalionFlag } from '../ui/Flag.tsx';
import { duration } from '../ui/format.ts';
import { CarvedBar, sfx } from '../ui/codex.tsx';
import { DoctrineIcon, EventIcon, Icon } from '../ui/icons.tsx';
import { useHudContext } from './context.ts';

export const DOCTRINE_EFFECTS = [
  'No modifiers. The war council weighs every objective on your fronts evenly.',
  '+15% damage. Presses on to your neighbours’ capitals.',
  '20% less damage taken near the border forts you hold. Defends what you hold.',
  '+50% damage to walls. Lays siege to your neighbours’ capitals.',
  '+20% speed. Picks the lightly held forts and walls on your fronts.',
];

export const STATE_NAMES = ['Waiting at the capital', 'Marching', 'Fighting', 'Holding', 'Routing'];

function cooldownLeft(at: number, cooldown: number, tick: number): number {
  return at < 0 ? 0 : Math.max(0, (at + cooldown - tick) * TICK_MS);
}

type CommandKind = 'doctrine' | 'rally' | 'cry';
/** How long an accepted order may take to show up in the world before its control unlocks anyway. */
const PENDING_MS = 8_000;

/**
 * Whether an accepted order is still on its way: the server stamps it a few ticks ahead, so until the world shows
 * it (its cooldown stamp moves) the control would look ready and invite a second, refused order.
 */
export function orderPending(sent: { stamp: number | boolean; at: number } | undefined, stamp: number | boolean, now: number): boolean {
  return !!sent && sent.stamp === stamp && now - sent.at < PENDING_MS;
}

function useCommand(slug: string | null, stampOf: (kind: CommandKind) => number | boolean, onEnded: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<Partial<Record<CommandKind, { stamp: number | boolean; at: number }>>>({});
  const run = async (label: string, cmd: Parameters<typeof api.command>[1]) => {
    if (!slug || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const stamp = stampOf(cmd.kind);
    try {
      await api.command(slug, cmd);
      setSent((s) => ({ ...s, [cmd.kind]: { stamp, at: Date.now() } }));
      setNotice(`${label} ordered. It takes effect in a moment.`);
    } catch (err) {
      // The war's last second: the panel is about to close with the war, so say so where it will still be seen.
      if (err instanceof ApiError && err.code === 'ended') onEnded();
      setError(err instanceof ApiError ? err.message : 'The order did not reach the field. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const pending = (kind: CommandKind) => orderPending(sent[kind], stampOf(kind), Date.now());
  return { busy, error, notice, run, pending };
}

/** The viewer's three scarce levers: doctrine, rally and war cry. */
export function CommandBar({ hud }: { hud: HudSnapshot }) {
  const { store, slug } = useHudContext();
  const world = store.world;
  const p = hud.viewerP;
  const [rallyPick, setRallyPick] = useState(false);
  const [rallyPickError, setRallyPickError] = useState<string | null>(null);
  const player = world && p !== null ? world.players[p] : undefined;
  const { busy: sending, error, notice, run, pending } = useCommand(
    slug,
    (kind) => (!player ? -1 : kind === 'doctrine' ? player.doctrineAt : kind === 'rally' ? player.rallyAt : player.cryUsed),
    () => store.addToast('leader', -1, 'The day is done. Your order came too late for today’s war.'),
  );
  // Cooldowns are read from the local world; while it is catching up with the server they would be stale.
  const catchingUp = hud.conn.phase !== 'live';
  const busy = sending || catchingUp;
  // The selection when "Pick on map" was armed: only a site chosen after that is a rally order.
  const armedOn = useRef<HudSnapshot['selection']>(null);

  useEffect(() => {
    if (!rallyPick || hud.selection?.kind !== 'site' || hud.selection === armedOn.current) return;
    setRallyPick(false);
    const w = store.world;
    const site = hud.selection.id;
    const def = w?.map.sites[site];
    if (!w || !def || p === null) return;
    const r = computeRing(w);
    const ok = (def.kind === 'capital' && r.owner[def.slot] === p) || frontOf(r, w, p, site) !== null;
    if (!ok) {
      setRallyPickError(`${siteLabel(w, site, store.names)} is not on your fronts. Rally on a border fort between you and a neighbour, a neighbour’s capital, or a capital you hold.`);
      return;
    }
    setRallyPickError(null);
    void run('Rally', { kind: 'rally', site });
  }, [hud.selection, rallyPick]);

  useEffect(() => {
    if (!rallyPick) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setRallyPick(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rallyPick]);

  if (!world || !player) return null;
  const tick = world.tick;
  if (world.victor >= 0) {
    return (
      <section className="command" aria-label="Your orders">
        <p className="command-locked">
          <Icon name="lock" size={16} /> The ring is won and the war is locked until the reset. Doctrine, rallies and the War Cry wait for the next war.
        </p>
      </section>
    );
  }
  // A rally holds only on a site on one of your fronts (a border fort on the road, or the foe's
  // capital at its end) or on a capital you hold; anything else would wait, so it is not offered.
  const ring = computeRing(world);
  const rallyable = (site: number) => {
    const def = world.map.sites[site];
    if (!def) return false;
    if (def.kind === 'capital' && ring.owner[def.slot] === p) return true;
    return frontOf(ring, world, p!, site) !== null;
  };
  const frontSites: { site: number; note: string }[] = [];
  for (const f of ring.fronts[p!] ?? []) {
    const foe = store.names.player(f.foe);
    for (const k of f.forts) if (!frontSites.some((x) => x.site === k)) frontSites.push({ site: k, note: `on your front with ${foe}` });
    const cap = world.map.sites.findIndex((d) => d.kind === 'capital' && d.slot === f.to);
    if (cap >= 0 && !frontSites.some((x) => x.site === cap)) frontSites.push({ site: cap, note: f.dir === 0 ? 'your lost home: retake it' : `${foe}’s walls` });
  }
  const ownCapitals = world.map.sites.filter((d) => d.kind === 'capital' && ring.owner[d.slot] === p);
  const beyond = world.map.sites.filter((d) => !rallyable(d.id) && (d.kind === 'fort' || ring.owner[d.slot]! >= 0));
  const rallyError = rallyPickError;
  const doctrineWait = cooldownLeft(player.doctrineAt, DOCTRINE_COOLDOWN, tick);
  const rallyWait = cooldownLeft(player.rallyAt, RALLY_COOLDOWN, tick);
  const doctrineSent = pending('doctrine');
  const rallySent = pending('rally');
  const crySent = pending('cry');
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
              disabled={busy || doctrineSent || player.doctrine === d || doctrineWait > 0}
              onClick={() => {
                sfx('ui.seal');
                void run(`${name} doctrine`, { kind: 'doctrine', doctrine: d });
              }}
              title={`${name}: ${DOCTRINE_EFFECTS[d]}`}
            >
              <DoctrineIcon doctrine={d} size={22} />
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
            disabled={busy || rallySent || rallyWait > 0}
            value=""
            onChange={(e) => {
              const site = Number(e.target.value);
              if (Number.isInteger(site) && e.target.value !== '' && rallyable(site)) {
                sfx('ui.quill');
                setRallyPickError(null);
                void run('Rally', { kind: 'rally', site });
              }
            }}
          >
            <option value="">{frontSites.length > 0 ? 'Choose an objective on your fronts…' : 'No front to rally on yet…'}</option>
            {frontSites.length > 0 && (
              <optgroup label="Your fronts">
                {frontSites.map(({ site, note }) => (
                  <option key={site} value={site}>
                    {siteLabel(world, site, store.names)} · {note}
                  </option>
                ))}
              </optgroup>
            )}
            {ownCapitals.length > 0 && (
              <optgroup label="Capitals you hold">
                {ownCapitals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {siteLabel(world, d.id, store.names)} · defend
                  </option>
                ))}
              </optgroup>
            )}
            {beyond.length > 0 && (
              <optgroup label="Beyond your fronts (cannot rally)">
                {beyond.map((d) => (
                  <option key={d.id} value={d.id} disabled>
                    {siteLabel(world, d.id, store.names)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            className={`btn${rallyPick ? ' is-on' : ''}`}
            disabled={busy || rallySent || rallyWait > 0}
            onClick={() => {
              armedOn.current = hud.selection;
              setRallyPick((v) => !v);
            }}
            aria-pressed={rallyPick}
          >
            <Icon name="target" size={16} /> {rallyPick ? 'Click a site…' : 'Pick on map'}
          </button>
        </div>
        <p className="command-hint">
          {rallying ? (
            <>
              Rallying on <strong>{siteLabel(world, player.rallySite, store.names)}</strong> for {duration((player.rallyUntil - tick) * TICK_MS)}.{' '}
            </>
          ) : (
            'Every platoon marches on one objective on your fronts for 2 hours. '
          )}
          {rallyWait > 0 && <strong>Ready in {duration(rallyWait)}.</strong>}
        </p>
        {rallyError && (
          <p className="form-error" role="alert">
            {rallyError}
          </p>
        )}
      </div>
      <div className="command-group">
        <h3 className="command-label">War Cry</h3>
        <button
          className="btn btn-cry"
          disabled={busy || crySent || player.cryUsed}
          onClick={() => {
            sfx('ui.seal');
            void run('War Cry', { kind: 'cry' });
          }}
        >
          <Icon name="horn" size={20} /> {crying ? `Sounding! ${duration((player.cryUntil - tick) * TICK_MS)}` : player.cryUsed ? 'Used today' : crySent ? 'Sounding…' : 'Sound the War Cry'}
        </button>
        <p className="command-hint">+30% damage and +25% speed for 60 seconds. Once per war.</p>
      </div>
      {catchingUp && (
        <p className="command-hint" role="status">
          Catching up with the field… orders open again in a moment.
        </p>
      )}
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
