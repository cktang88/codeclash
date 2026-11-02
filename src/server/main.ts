import { existsSync } from 'node:fs';
import { createServer } from './app.ts';
import { configProblems, serveMisconfigured, withPersistedSessionSecret } from './boot.ts';
import { loadConfig, type Config } from './config.ts';
import { consoleLogger, errorMessage } from '../ingest/log.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const { env, madeAt } = withPersistedSessionSecret(process.env);
if (madeAt) consoleLogger.warn('SESSION_SECRET is not set: using the one kept beside the database', { file: madeAt });

let config: Config;
try {
  config = loadConfig(env);
} catch (err) {
  // Crash-looping leaves the host's proxy hanging and players looking at a blank page; say what is wrong instead.
  const problems = configProblems(err);
  consoleLogger.error('bad configuration; serving an explanation page until it is fixed', { problems });
  const port = Number(env.PORT) || 8787;
  const host = env.HOST?.trim() || '0.0.0.0';
  const page = serveMisconfigured(port, host, problems);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => page.close(() => process.exit(0)));
  await new Promise<never>(() => {});
}

const server = await createServer(config!);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    consoleLogger.info('shutting down', { signal });
    server.shutdown().then(
      () => process.exit(0),
      (err) => {
        consoleLogger.error('shutdown failed', { error: errorMessage(err) });
        process.exit(1);
      },
    );
  });
}

process.on('unhandledRejection', (err) => consoleLogger.error('unhandled rejection', { error: errorMessage(err) }));

await server.listen();
