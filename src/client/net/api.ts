import type {
  CreateRoomRequest,
  DigestResponse,
  HookResponse,
  KeyframeResponse,
  LobbyResponse,
  MeResponse,
  PreviewResponse,
  ProfileResponse,
  RoomDetail,
  UpdateRoomRequest,
  WarSummary,
} from '../../protocol.ts';
import type { ChronicleEntry } from '../../sim/chronicle.ts';
import type { Replay } from '../../sim/replay.ts';

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
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', 'The war office did not answer. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error ?? 'error', err.message ?? `Request failed (${res.status}).`);
  }
  return json as T;
}

const enc = encodeURIComponent;
/** `?invite=` (or `&invite=` after other parameters) for a guest of a private room; empty for everyone else. */
export const inviteQuery = (invite: string | null | undefined, sep: '?' | '&' = '?') => (invite ? `${sep}invite=${enc(invite)}` : '');

export const api = {
  me: () => call<MeResponse>('GET', '/api/me'),
  lobby: () => call<LobbyResponse>('GET', '/api/rooms'),
  preview: (owner: string, repo: string, branch: string | null) =>
    call<PreviewResponse>('GET', `/api/preview/${enc(owner)}/${enc(repo)}${branch ? `?branch=${enc(branch)}` : ''}`),
  createRoom: (req: CreateRoomRequest) => call<{ slug: string }>('POST', '/api/rooms', req),
  room: (slug: string, invite?: string | null) => call<RoomDetail>('GET', `/api/rooms/${enc(slug)}${inviteQuery(invite)}`),
  updateRoom: (slug: string, req: UpdateRoomRequest) => call<RoomDetail>('PATCH', `/api/rooms/${enc(slug)}`, req),
  deleteRoom: (slug: string) => call<void>('DELETE', `/api/rooms/${enc(slug)}`),
  joinRoom: (slug: string, invite?: string | null) => call<RoomDetail>('POST', `/api/rooms/${enc(slug)}/join`, { invite: invite ?? null }),
  leaveRoom: (slug: string) => call<void>('POST', `/api/rooms/${enc(slug)}/leave`),
  rotateInvite: (slug: string) => call<RoomDetail>('POST', `/api/rooms/${enc(slug)}/invite`),
  removeMember: (slug: string, userId: number) => call<RoomDetail>('DELETE', `/api/rooms/${enc(slug)}/members/${userId}`),
  wars: (slug: string, invite?: string | null) => call<{ wars: WarSummary[] }>('GET', `/api/rooms/${enc(slug)}/wars${inviteQuery(invite)}`),
  digest: (slug: string, warId: number, invite?: string | null) => call<DigestResponse>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/digest${inviteQuery(invite)}`),
  replay: (slug: string, warId: number, invite?: string | null) => call<Replay>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/replay${inviteQuery(invite)}`),
  keyframe: (slug: string, warId: number, tick: number, invite?: string | null) =>
    call<KeyframeResponse | null>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/keyframe?tick=${tick}${inviteQuery(invite, '&')}`),
  chronicleSince: (slug: string, since: number, invite?: string | null) =>
    call<{ entries: ChronicleEntry[] }>('GET', `/api/rooms/${enc(slug)}/chronicle?since=${since}${inviteQuery(invite, '&')}`),
  profile: (login: string) => call<ProfileResponse>('GET', `/api/users/${enc(login)}`),
  setResting: (on: boolean) => call<void>('POST', '/api/me/rest', { on }),
  rotateHook: () => call<HookResponse>('POST', '/api/me/hook'),
  logout: () => call<void>('POST', '/auth/logout'),
  /** Deletes the stored GitHub sign-in token (signing out keeps it). */
  disconnectGithub: () => call<void>('DELETE', '/api/me/github'),
  deleteAccount: () => call<void>('DELETE', '/api/me'),
};
