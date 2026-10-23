import { CUE_NAMES, sound } from './index.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const groups: Record<string, string[]> = { Codex: [], Combat: [], 'Set pieces': [] };
for (const name of CUE_NAMES) {
  if (name.startsWith('ui.')) groups.Codex!.push(name);
  else if (/^(swing|hit-|bow-|arrow-|tower-|fireball-|trebuchet-|boulder-|dragon-breath|heal|death|troll-|march-)/.test(name)) groups.Combat!.push(name);
  else groups['Set pieces']!.push(name);
}
const host = $<HTMLDivElement>('cues');
for (const [title, names] of Object.entries(groups)) {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = name;
    // Hold shift to fire a burst, as a big clash would.
    b.onclick = (e) => {
      const x = Number($<HTMLInputElement>('pan').value);
      const times = e.shiftKey ? 40 : 1;
      for (let i = 0; i < times; i++) setTimeout(() => sound.play(name, { x, y: 0 }), i * 12);
    };
    row.append(b);
  }
  host.append(h, row);
}

const render = () => {
  $('power').textContent = sound.enabled() ? 'Turn sound off' : 'Turn sound on';
  $('music').textContent = `Music: ${sound.musicEnabled() ? 'on' : 'off'}`;
  $<HTMLInputElement>('volume').value = String(sound.volume());
  $('volume-v').textContent = sound.volume().toFixed(2);
  $('status').textContent = `samples loaded: ${sound.loaded}`;
};
sound.subscribe(render);
setInterval(render, 500);
render();

$('power').onclick = () => sound.setEnabled(!sound.enabled());
$('music').onclick = () => sound.setMusicEnabled(!sound.musicEnabled());
$<HTMLInputElement>('volume').oninput = (e) => sound.setVolume(Number((e.target as HTMLInputElement).value));
const slider = (id: string, apply: (v: number) => void) => {
  $<HTMLInputElement>(id).oninput = (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    $(`${id}-v`).textContent = String(v);
    apply(v);
  };
};
slider('intensity', (v) => sound.setBattleIntensity(v));
slider('time', (v) => sound.setTimeOfDay(v));
slider('pan', () => undefined);
sound.setListener(0, 0, 1);
