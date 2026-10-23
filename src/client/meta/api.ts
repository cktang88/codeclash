import { useEffect, useState } from 'react';
import type { ArmoryResponse, LegendsResponse, OrdersResponse, ProfileResponse, SeasonResponse } from '../../protocol.ts';
import type { Heraldry } from '../../rules/meta.ts';
import { ApiError, api } from '../net/api.ts';

/** An ApiError that keeps the response body, for refusals that still carry a result (a partly saved Armory). */
export class MetaApiError extends ApiError {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(status, code, message);
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
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; message?: string };
    throw new MetaApiError(res.status, err.error ?? 'error', err.message ?? `Request failed (${res.status}).`, json);
  }
  return json as T;
}

const enc = encodeURIComponent;

export const metaApi = {
  armory: () => call<ArmoryResponse>('GET', '/api/me/armory'),
  /** Wears what the rank allows. A locked choice comes back as ApiError 'locked'; the rest is saved. */
  setArmory: (req: Partial<Heraldry>) => call<ArmoryResponse>('POST', '/api/me/armory', req),
  legends: (slug: string) => call<LegendsResponse>('GET', `/api/rooms/${enc(slug)}/legends`),
  season: (slug: string) => call<SeasonResponse>('GET', `/api/rooms/${enc(slug)}/season`),
  orders: (slug: string) => call<OrdersResponse>('GET', `/api/rooms/${enc(slug)}/orders`),
};

export type Loaded<T> = { data: T | null; error: string | null; reload(): void };

/** Fetches once per key; `error` holds a reader-facing message. */
export function useLoad<T>(key: string, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key, data: null, error: null });
  const [gen, setGen] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (err: unknown) => !cancelled && setState({ key, data: null, error: err instanceof ApiError ? err.message : 'This page could not be fetched.' }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, gen]);
  const fresh = state.key === key;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, reload: () => setGen((g) => g + 1) };
}

const profiles = new Map<string, { at: number; promise: Promise<ProfileResponse> }>();

/** One profile fetch shared by the sections that read it on the same page. */
export function profileOnce(login: string): Promise<ProfileResponse> {
  const hit = profiles.get(login);
  if (hit && Date.now() - hit.at < 30_000) return hit.promise;
  const promise = api.profile(login);
  profiles.set(login, { at: Date.now(), promise });
  promise.catch(() => profiles.delete(login));
  return promise;
}
