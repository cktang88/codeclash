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

export async function postDigest(url: string, room: RoomRow, war: WarMeta, digest: Digest, publicUrl: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (!validWebhookUrl(url)) return;
  const text = digestText(room, war, digest, publicUrl);
  const body = new URL(url).hostname === 'hooks.slack.com' ? { text: text.replace(/\*\*/g, '*') } : { content: text.slice(0, 1990) };
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`webhook answered ${res.status}`);
}
