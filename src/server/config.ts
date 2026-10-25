import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// An empty value (`DEV_AUTH=` in a .env file) means unset, not a boot failure.
const flag = (fallback: '0' | '1') =>
  z.enum(['', '0', '1', 'true', 'false']).default(fallback).transform((v) => (v === '' ? fallback === '1' : v === '1' || v === 'true'));
const optionalString = z.string().trim().min(1).optional().catch(undefined);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(0).default(8787),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_PATH: z.string().default('data/pushfront.db'),
    PUBLIC_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
    CLIENT_DIR: z.string().default('dist/client'),
    GITHUB_TOKEN: optionalString,
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    SESSION_SECRET: optionalString,
    DEV_AUTH: flag('0'),
    COMMONS: flag('1'),
    DAY_MINUTES: z.coerce.number().positive().optional().catch(undefined),
    MAX_ROOMS_PER_USER: z.coerce.number().int().min(1).default(5),
    MAX_LIVE_ROOMS: z.coerce.number().int().min(1).default(200),
    /** 0 is the service worker's kill switch: pages unregister it and drop its caches. */
    SERVICE_WORKER: flag('1'),
    /** Where local mirrors for the difficulty bonus's fallback live; unset: no mirrors. */
    MIRROR_DIR: optionalString,
    /** Worker threads that parse pushes; 0 parses on the main thread. Unset: up to 2 (none under test). */
    PARSE_WORKERS: z.coerce.number().int().min(0).max(16).optional().catch(undefined),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'must be at least 32 characters in production' });
    }
    // OAuth redirects, secure cookies and digest links are all built from it; localhost is never right here.
    if (!env.PUBLIC_URL) ctx.addIssue({ code: 'custom', path: ['PUBLIC_URL'], message: 'must be set to the public origin in production' });
    if (env.DEV_AUTH) ctx.addIssue({ code: 'custom', path: ['DEV_AUTH'], message: 'dev auth cannot run in production' });
  });

export interface Config {
  production: boolean;
  port: number;
  host: string;
  databasePath: string;
  publicUrl: string;
  clientDir: string;
  githubToken: string | null;
  oauth: { clientId: string; clientSecret: string } | null;
  sessionSecret: string;
  sessionSecretGenerated: boolean;
  devAuth: boolean;
  /** Seed a public room with sparring bots at boot. */
  commons: boolean;
  /** Overrides the daily cycle with wars of this length, for local testing. */
  dayMs: number | null;
  maxRoomsPerUser: number;
  maxLiveRooms: number;
  /** Offer the service worker; false serves a self-unregistering one instead (the kill switch). */
  serviceWorker: boolean;
  /** Local mirrors for the difficulty bonus's fallback (MIRROR_DIR); null: none. */
  mirrorDir: string | null;
  /** Parse worker threads; null: the default (up to 2). */
  parseWorkers: number | null;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = EnvSchema.parse(env);
  return {
    production: e.NODE_ENV === 'production',
    port: e.PORT,
    host: e.HOST,
    databasePath: e.DATABASE_PATH,
    publicUrl: (e.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    clientDir: e.CLIENT_DIR,
    githubToken: e.GITHUB_TOKEN ?? null,
    oauth: e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET ? { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET } : null,
    sessionSecret: e.SESSION_SECRET ?? randomBytes(32).toString('hex'),
    sessionSecretGenerated: !e.SESSION_SECRET,
    devAuth: e.DEV_AUTH,
    commons: e.COMMONS,
    dayMs: e.DAY_MINUTES ? Math.round(e.DAY_MINUTES * 60_000) : null,
    maxRoomsPerUser: e.MAX_ROOMS_PER_USER,
    maxLiveRooms: e.MAX_LIVE_ROOMS,
    serviceWorker: e.SERVICE_WORKER,
    mirrorDir: e.MIRROR_DIR ?? null,
    // Tests parse inline unless they ask for workers.
    parseWorkers: e.PARSE_WORKERS ?? (e.NODE_ENV === 'test' || env.VITEST ? 0 : null),
  };
}
