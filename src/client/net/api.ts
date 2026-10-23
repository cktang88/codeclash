import type {
  CommandRequest,
  CreateRoomRequest,
  DigestResponse,
  HookResponse,
  KeyframeResponse,
  LobbyResponse,
  MeResponse,
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

export const api = {
  me: () => call<MeResponse>('GET', '/api/me'),
  lobby: () => call<LobbyResponse>('GET', '/api/rooms'),
  createRoom: (req: CreateRoomRequest) => call<{ slug: string }>('POST', '/api/rooms', req),
  room: (slug: string, invite?: string | null) => call<RoomDetail>('GET', `/api/rooms/${enc(slug)}${invite ? `?invite=${enc(invite)}` : ''}`),
  updateRoom: (slug: string, req: UpdateRoomRequest) => call<RoomDetail>('PATCH', `/api/rooms/${enc(slug)}`, req),
  deleteRoom: (slug: string) => call<void>('DELETE', `/api/rooms/${enc(slug)}`),
  joinRoom: (slug: string, invite?: string | null) => call<RoomDetail>('POST', `/api/rooms/${enc(slug)}/join`, { invite: invite ?? null }),
  leaveRoom: (slug: string) => call<void>('POST', `/api/rooms/${enc(slug)}/leave`),
  rotateInvite: (slug: string) => call<RoomDetail>('POST', `/api/rooms/${enc(slug)}/invite`),
  removeMember: (slug: string, userId: number) => call<RoomDetail>('DELETE', `/api/rooms/${enc(slug)}/members/${userId}`),
  command: (slug: string, cmd: CommandRequest) => call<{ tick: number }>('POST', `/api/rooms/${enc(slug)}/command`, cmd),
  wars: (slug: string) => call<{ wars: WarSummary[] }>('GET', `/api/rooms/${enc(slug)}/wars`),
  digest: (slug: string, warId: number) => call<DigestResponse>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/digest`),
  replay: (slug: string, warId: number) => call<Replay>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/replay`),
  keyframe: (slug: string, warId: number, tick: number) => call<KeyframeResponse | null>('GET', `/api/rooms/${enc(slug)}/wars/${warId}/keyframe?tick=${tick}`),
  chronicleSince: (slug: string, since: number) => call<{ entries: ChronicleEntry[] }>('GET', `/api/rooms/${enc(slug)}/chronicle?since=${since}`),
  profile: (login: string) => call<ProfileResponse>('GET', `/api/users/${enc(login)}`),
  setResting: (on: boolean) => call<void>('POST', '/api/me/rest', { on }),
  rotateHook: () => call<HookResponse>('POST', '/api/me/hook'),
  logout: () => call<void>('POST', '/auth/logout'),
};
