import type { WarMeta } from '../protocol.ts';
import type { Digest } from '../rules/digest.ts';
import type { RoomRow } from './db.ts';

const ALLOWED_HOSTS = ['hooks.slack.com', 'discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'];

/** Only Slack and Discord incoming webhooks over https, so a room cannot make the server call arbitrary hosts. */
export function validWebhookUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (!ALLOWED_HOSTS.includes(url.hostname)) return false;
    return url.hostname === 'hooks.slack.com' ? url.pathname.startsWith('/services/') : url.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

export function digestText(room: Pick<RoomRow, 'name' | 'slug'>, war: WarMeta, digest: Digest, publicUrl: string): string {
  const lines = [`**${room.name} · ${war.day}**`, digest.headline, ''];
  const top = digest.players.slice().sort((a, b) => a.place - b.place).slice(0, 5);
  for (const pl of top) lines.push(`${pl.place}. @${pl.login} · ${pl.renown} renown · ${pl.kills} kills · ${pl.pushes} pushes`);
  if (digest.awards.length > 0) {
    lines.push('');
    for (const a of digest.awards.slice(0, 6)) lines.push(`🏅 ${a.title}: @${digest.players[a.p]!.login}`);
  }
  lines.push('', `Full digest: ${publicUrl}/r/${room.slug}/day/${war.id}`);
  return lines.join('\n');
}

const WEBHOOK_ATTEMPTS = 3;

export async function postDigest(
  url: string, room: RoomRow, war: WarMeta, digest: Digest, publicUrl: string, fetchImpl: typeof fetch = fetch, retryDelayMs = 5_000,
): Promise<void> {
  if (!validWebhookUrl(url)) return;
  const text = digestText(room, war, digest, publicUrl);
  const body = new URL(url).hostname === 'hooks.slack.com' ? { text: text.replace(/\*\*/g, '*') } : { content: text.slice(0, 1990) };
  // The digest is posted once a day: retry a blip (network, 429, 5xx) rather than lose it.
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    let error: unknown;
    try {
      // A redirect would leave the allow-listed hosts, so it is refused rather than followed.
      res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      error = err;
    }
    if (res?.ok) return;
    if (res) error = new Error(`webhook answered ${res.status}`);
    const transient = !res || res.status === 429 || res.status >= 500;
    if (!transient || attempt >= WEBHOOK_ATTEMPTS) throw error;
    await new Promise((done) => setTimeout(done, retryDelayMs * attempt).unref());
  }
}
