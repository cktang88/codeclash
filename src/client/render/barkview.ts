import { PlatoonState, type World } from '../../sim/api.ts';
import { platoonLabel } from '../../sim/chronicle.ts';
import type { WaitInfo } from '../../sim/stance.ts';
import { BarkRank, BarkScheduler, barkLine, stateWord, type BarkCandidate, type BarkNames } from '../barks.ts';
import { MapLabel, type LabelLayer } from './labels.ts';

// Commander barks on the chart: a small vellum speech scroll over a platoon's banner with a line in
// its commander's voice (barks.ts decides who speaks and when), and a name scroll under the hovered
// or selected platoon saying what it is doing ("Besieging @grace-bot", "Massing 24/50"). Both are
// map labels: counter-scaled, lettered in ink, and giving way to each other and to the sites'
// names through the label layer's collision.

/** Label priorities: the site names sit at 1 to 10. */
const PRIORITY = { selectedState: 30, hoverState: 26, selectedBark: 24, followedBark: 9, mineBark: 8, bark: 3 };

export interface BarkFrame {
  world: World;
  waits: ReadonlyMap<number, WaitInfo>;
  centroids: ReadonlyMap<number, { x: number; y: number; n: number }>;
  top: (id: number) => { x: number; y: number } | null;
  names: BarkNames;
  /** "@login" and the battalion's name, for the state scroll's second line. */
  platoonName: (pl: World['platoons'][number]) => string;
  now: number;
  zoom: number;
  far: boolean;
  reducedMotion: boolean;
  selected: number | null;
  followed: number | null;
  hovered: number | null;
  viewer: number | null;
  inView: (x: number, y: number) => boolean;
}

export class BarkLayer {
  private scheduler = new BarkScheduler();
  private labels = new Map<number, MapLabel>();
  private stateLabels: MapLabel[] = [];
  private cands: BarkCandidate[] = [];

  constructor(private readonly layer: LabelLayer) {}

  update(f: BarkFrame): void {
    const { world } = f;
    const cands = this.cands;
    cands.length = 0;
    for (const pl of world.platoons) {
      if (pl.state === PlatoonState.Queued || pl.alive <= 0) continue;
      const w = f.waits.get(pl.id);
      if (!w) continue;
      const top = f.top(pl.id);
      const rank =
        pl.id === f.selected ? BarkRank.Selected
        : pl.id === f.followed ? BarkRank.Followed
        : top && pl.p === f.viewer ? BarkRank.Mine
        : top && f.inView(top.x, top.y) ? BarkRank.OnScreen
        : 0;
      cands.push({ id: pl.id, kind: w.kind, rank: top ? rank : 0 });
    }
    const shown = this.scheduler.update(cands, f.now, { far: f.far, reducedMotion: f.reducedMotion });
    const live = new Set<number>();
    for (const b of shown) {
      const pl = world.platoons.find((x) => x.id === b.id);
      const w = f.waits.get(b.id);
      const top = f.top(b.id);
      if (!pl || !w || !top) continue;
      live.add(b.id);
      let label = this.labels.get(b.id);
      if (!label) {
        label = this.layer.add(new MapLabel(15, 'bark'));
        this.labels.set(b.id, label);
      }
      // A line stays the same while it shows, even as the numbers it quotes tick on.
      label.set(barkLine(pl.id, pl.p, { ...w, kind: b.kind }, b.nth, world.tick, f.names), '');
      label.x = top.x;
      label.y = top.y;
      label.wanted = true;
      label.root.alpha = b.alpha;
      label.priority = pl.id === f.selected ? PRIORITY.selectedBark : pl.id === f.followed ? PRIORITY.followedBark : pl.p === f.viewer ? PRIORITY.mineBark : PRIORITY.bark;
    }
    for (const [id, label] of this.labels) {
      if (live.has(id)) continue;
      this.layer.remove(label);
      this.labels.delete(id);
    }
    // The state scroll under the selected platoon, and under the one the pointer is over.
    const want = [f.selected, f.hovered !== f.selected ? f.hovered : null];
    for (let i = 0; i < want.length; i++) {
      let label = this.stateLabels[i];
      if (!label) {
        label = this.layer.add(new MapLabel(16));
        this.stateLabels[i] = label;
      }
      const id = want[i];
      const pl = id === null || id === undefined ? undefined : world.platoons.find((x) => x.id === id);
      const w = pl ? f.waits.get(pl.id) : undefined;
      const c = pl ? f.centroids.get(pl.id) : undefined;
      if (!pl || !w || !c || pl.state === PlatoonState.Queued) {
        label.wanted = false;
        continue;
      }
      label.set(stateWord(w, f.names), f.platoonName(pl));
      // Under the formation: the scroll hangs below its rear rank.
      label.x = c.x;
      label.y = c.y + Math.max(24, pl.length * 0.6) + (label.height + 6) / f.zoom;
      label.wanted = true;
      label.root.alpha = 1;
      label.priority = i === 0 ? PRIORITY.selectedState : PRIORITY.hoverState;
    }
  }

  reset(): void {
    this.scheduler.reset();
    for (const label of this.labels.values()) this.layer.remove(label);
    this.labels.clear();
  }

  destroy(): void {
    this.reset();
    for (const l of this.stateLabels) this.layer.remove(l);
    this.stateLabels = [];
  }
}

/** "@ada-bot · analytical-engine #2": who a platoon belongs to, for its state scroll. */
export function platoonName(names: { player(p: number): string; repo(index: number): string }, pl: World['platoons'][number]): string {
  return `${names.player(pl.p)} · ${platoonLabel(names, pl.repo, pl.ordinal)}`;
}
