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
      for (const p of store.roster) out.push({ kind: 'push', p: p.p, repo: 0, lines: [400, 120, 60, 80, 40, 120, 1500, 400, 30], commits: 3, msg: 'stress' });
    }
    return out;
  };
}
const skip = Number(q.get('skip') ?? 0);
if (skip > 0) runner.fastForward(skip);

const field = await Battlefield.create(document.getElementById('field')!, store, () => runner);
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
