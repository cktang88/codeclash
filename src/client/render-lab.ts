// Development harness for the battlefield renderer: a browser-only sparring war.
// Open /render-lab.html?speed=8&bots=6&seed=7
import { startDemo, type LocalRunner } from './net/local.ts';
import { Battlefield } from './render/index.ts';
import { GameStore } from './store.ts';

const q = new URLSearchParams(location.search);
const store = new GameStore();
const runner: LocalRunner = startDemo(store, Number(q.get('bots') ?? 6), Number(q.get('seed') ?? 7));
runner.speed = Number(q.get('speed') ?? 4);
if (q.has('stress')) {
  // Every bot pushes a large, varied commit every few seconds, to fill the field.
  const r = runner as unknown as { inputs: (tick: number) => import('../sim/api.ts').SimInput[] };
  const base = r.inputs;
  r.inputs = (tick) => {
    const out = base(tick);
    if (tick > 20 && tick % 15 === 0) {
      for (const p of store.roster) out.push({ kind: 'push', p: p.p, repo: 0, lines: [400, 120, 60, 80, 40, 120, 1500, 400, 30], files: 8, branches: 50, churn: 0, filler: 0, commits: 3, msg: 'feat: stress' });
    }
    return out;
  };
}
if (q.has('big')) {
  // ?big=1: every bot raises the big elites early (Dragon, Troll, Bone Golem, Trebuchet,
  // Griffin Rider) and again every five minutes, so they can be inspected up close.
  const r = runner as unknown as { inputs: (tick: number) => import('../sim/api.ts').SimInput[] };
  const base = r.inputs;
  const waves: [number, number[]][] = [
    [25, [200, 80, 40, 20, 0, 0, 0, 0, 0]], // legendary: Dragon
    [45, [0, 0, 0, 0, 0, 0, 9000, 9000, 0]], // Bone Golems and a Troll
    [65, [0, 0, 0, 0, 900, 900, 0, 0, 0]], // Trebuchets and Griffin Riders
  ];
  r.inputs = (tick) => {
    const out = base(tick);
    for (const [at, lines] of waves) {
      if (tick % 1500 === at) for (const p of store.roster) out.push({ kind: 'push', p: p.p, repo: 0, lines, files: 14, branches: 90, churn: 0, filler: 0, commits: 1, msg: 'feat: big' });
    }
    return out;
  };
}
const skip = Number(q.get('skip') ?? 0);
if (skip > 0) runner.fastForward(skip);

const field = await Battlefield.create(document.getElementById('field')!, store, () => runner);
// ?tod=0..1 pins the hour: 0 dawn, 0.35 noon, 0.6 afternoon, 0.76 dusk, 0.9 night.
if (q.has('tod')) field.setTimeOverride(Number(q.get('tod')));
// ?zoom=…&x=…&y=… frames a shot, for screenshots.
if (q.has('zoom')) field.focus(Number(q.get('x') ?? 0), Number(q.get('y') ?? 0), Number(q.get('zoom')));
const stats = document.getElementById('stats')!;
let frames = 0;
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const fps = (frames * 1000) / (now - last);
  frames = 0;
  last = now;
  const w = store.world;
  stats.textContent = `${fps.toFixed(0)} fps · js ${field.frameMs.toFixed(2)}ms · tick ${w?.tick ?? 0} · ${w?.units.length ?? 0} units · ${w?.platoons.length ?? 0} platoons · follow ${store.following ? 'on' : 'off'}`;
}, 500);
const count = () => {
  frames++;
  requestAnimationFrame(count);
};
requestAnimationFrame(count);

document.getElementById('zin')!.onclick = () => field.focus(0, 0, 1.6);
document.getElementById('zout')!.onclick = () => field.focus(0, 0, 0.3);
document.getElementById('follow')!.onclick = () => store.setFollowing(!store.following);
Object.assign(window, { store, runner, battlefield: field });
