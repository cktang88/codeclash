/**
 * The simulation and protocol version this build was made from (scripts/sim-version.ts), baked in
 * at build time. 'dev' when run from source without a build (tsx); a 'dev' side never forces a
 * reload, so local development is not caught in a loop.
 */
declare const __SIM_VERSION__: string | undefined;

export const SIM_VERSION: string = typeof __SIM_VERSION__ === 'string' ? __SIM_VERSION__ : 'dev';

/** Whether a client built at `client` must reload to talk to a server at `server`. */
export function mustReload(client: string, server: string | null | undefined): boolean {
  return typeof server === 'string' && server !== '' && server !== 'dev' && client !== 'dev' && server !== client;
}
