import type { BattleView, CityView, CreateLeagueRequest, LeagueCard, LeagueDetail, MeResponse } from '../protocol.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? res.statusText);
  return data as T;
}

const invite = () => new URLSearchParams(location.search).get('invite');
const withInvite = (url: string) => (invite() ? `${url}?invite=${encodeURIComponent(invite()!)}` : url);

export const api = {
  me: () => call<MeResponse>('GET', '/api/me'),
  setLook: (faction: string, hue: number) => call<void>('POST', '/api/me/look', { faction, hue }),
  leagues: () => call<LeagueCard[]>('GET', '/api/leagues'),
  createLeague: (req: CreateLeagueRequest) => call<LeagueCard>('POST', '/api/leagues', req),
  league: (slug: string) => call<LeagueDetail>('GET', withInvite(`/api/leagues/${slug}`)),
  join: (slug: string) => call<void>('POST', `/api/leagues/${slug}/join`, { invite: invite() }),
  leave: (slug: string) => call<void>('POST', `/api/leagues/${slug}/leave`),
  deleteLeague: (slug: string) => call<void>('DELETE', `/api/leagues/${slug}`),
  city: (slug: string, id: number) => call<CityView>('GET', withInvite(`/api/leagues/${slug}/city/${id}`)),
  battle: (id: number) => call<BattleView>('GET', withInvite(`/api/battles/${id}`)),
  logout: () => call<void>('POST', '/auth/logout'),
};
