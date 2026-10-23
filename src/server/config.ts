import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const flag = z.enum(['0', '1', 'true', 'false']).default('0').transform((v) => v === '1' || v === 'true');
const optionalString = z.string().trim().min(1).optional().catch(undefined);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(0).default(8787),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_PATH: z.string().default('data/pushfront.db'),
    PUBLIC_URL: z.url().default('http://localhost:5173'),
    CLIENT_DIR: z.string().default('dist/client'),
    GITHUB_TOKEN: optionalString,
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    SESSION_SECRET: optionalString,
    DEV_AUTH: flag,
    COMMONS: z.enum(['0', '1', 'true', 'false']).default('1').transform((v) => v === '1' || v === 'true'),
    DAY_MINUTES: z.coerce.number().positive().optional().catch(undefined),
    MAX_ROOMS_PER_USER: z.coerce.number().int().min(1).default(5),
    MAX_LIVE_ROOMS: z.coerce.number().int().min(1).default(200),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'must be at least 32 characters in production' });
    }
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
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = EnvSchema.parse(env);
  return {
    production: e.NODE_ENV === 'production',
    port: e.PORT,
    host: e.HOST,
    databasePath: e.DATABASE_PATH,
    publicUrl: e.PUBLIC_URL.replace(/\/$/, ''),
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
  };
}
