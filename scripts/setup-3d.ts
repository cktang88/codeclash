// Sets up the 3D art experiments: `pnpm setup:3d`.
//
// The CC0 packs (KayKit, Quaternius) are committed under playground/assets. Kevin Iglesias' "Human
// Melee Animations FREE" is free but may not be redistributed, so it isn't in git: this fetches it
// from itch.io for your own machine and unpacks it where the playground and the anim lab look:
//   playground/assets/kevin/       (pnpm playground → http://localhost:5174)
//   src/client/public/lab/kevin/   (pnpm dev:client → http://localhost:5173/anim-lab.html)
// Both paths are git-ignored, and neither is part of the game's build or its Docker image.
//
//   pnpm setup:3d            fetch and unpack (skips when already present)
//   pnpm setup:3d --force    fetch again
//   pnpm setup:3d --zip <path to the zip you downloaded by hand>
//   pnpm 3d                  set up if needed, then start the playground
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'https://kevdev.itch.io/human-melee-animatons-free';
/** The upload to take, by its name on the download page: the FBX build (the other is for Unity). */
const UPLOAD = /godot|unreal/i;
const TARGETS = [join(ROOT, 'playground/assets/kevin'), join(ROOT, 'src/client/public/lab/kevin')];
const MARKER = 'Textures/HumanAnimations_ColorPalette.png';

const args = process.argv.slice(2);
const force = args.includes('--force');
/** For `pnpm 3d`: a failed fetch only warns, since the CC0 units work without this pack. */
const optional = args.includes('--optional');
const zipArg = args.includes('--zip') ? args[args.indexOf('--zip') + 1] : undefined;

/** A fetch that keeps itch.io's session cookies, as the browser would. */
const jar = new Map<string, string>();
async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('user-agent', 'Mozilla/5.0 (codeclash setup-3d)');
  if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = await fetch(url, { ...init, headers, redirect: 'follow' });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const i = pair!.indexOf('=');
    jar.set(pair!.slice(0, i).trim(), pair!.slice(i + 1).trim());
  }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.split('?')[0]} → HTTP ${res.status}`);
  return res;
}

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
  body: new URLSearchParams(fields).toString(),
});

/** The free download flow the "Download" button runs, without a browser. */
async function download(): Promise<Uint8Array> {
  const page = await (await get(PAGE)).text();
  const csrf = page.match(/name="csrf_token" value="([^"]+)"/)?.[1] ?? page.match(/"csrf_token":"([^"]+)"/)?.[1];
  if (!csrf) throw new Error('no csrf token on the itch.io page');
  const { url: downloadPage } = (await (await get(`${PAGE}/download_url`, form({ csrf_token: csrf }))).json()) as { url: string };
  const html = await (await get(downloadPage)).text();
  const uploads = [...html.matchAll(/data-upload_id="(\d+)"[\s\S]*?class="name"[^>]*>([^<]+)</g)].map((m) => ({ id: m[1]!, name: m[2]! }));
  const pick = uploads.find((u) => UPLOAD.test(u.name));
  if (!pick) throw new Error(`no FBX upload among: ${uploads.map((u) => u.name).join(', ') || 'none'}`);
  console.log(`Fetching "${pick.name}" from itch.io…`);
  const { url } = (await (await get(`${PAGE}/file/${pick.id}?source=game_download&after_download_lightbox=1&as_props=1`, form({ csrf_token: csrf }))).json()) as { url?: string };
  if (!url) throw new Error('itch.io gave no file link');
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** Unpacks what the playground uses: models, textures, and the male clips (no root motion or strafes). */
function unpack(zip: Uint8Array, into: string): number {
  const files = unzipSync(zip, {
    filter: (f) => /(^|\/)(Models|Textures)\//.test(f.name) || (/\/Animations\//.test(`/${f.name}`) && /Human(M)?@[^/]+\.fbx$/.test(f.name) && !/RootMotion|Strafe/.test(f.name)),
  });
  rmSync(into, { recursive: true, force: true });
  let n = 0;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/') || !data.length) continue;
    // Drop any folder the zip wraps everything in; clips all go flat into anim/.
    const rel = /\.fbx$/.test(name) && /Animations\//.test(name) ? `anim/${name.split('/').pop()}` : name.slice(name.search(/(Models|Textures)\//));
    const out = join(into, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    n++;
  }
  return n;
}

async function main(): Promise<void> {
  if (!force && !zipArg && TARGETS.every((t) => existsSync(join(t, MARKER)))) {
    console.log('Kevin Iglesias pack already set up (pnpm setup:3d --force to fetch again).');
    return;
  }
  let zip: Uint8Array;
  if (zipArg) zip = new Uint8Array(readFileSync(zipArg));
  else {
    try {
      zip = await download();
    } catch (e) {
      console.error(`Couldn't fetch the pack automatically: ${(e as Error).message}`);
      console.error(`Download the "Godot/Unreal" zip by hand from ${PAGE} and run:\n  pnpm setup:3d --zip <path to the zip>`);
      process.exit(optional ? 0 : 1);
    }
  }
  for (const t of TARGETS) {
    const n = unpack(zip, t);
    if (!existsSync(join(t, MARKER))) throw new Error(`unpacked ${n} files into ${t} but ${MARKER} is missing: has the pack's layout changed?`);
    console.log(`Unpacked ${n} files into ${t.slice(ROOT.length + 1)}/`);
  }
  console.log('Done. Run `pnpm playground` and open http://localhost:5174 (the Kevin Iglesias units now appear).');
  console.log('This pack is for your own machine: its license does not allow redistributing it, so keep it out of git.');
}

await main();
