export interface Logger {
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

// GitHub's token formats (classic and fine-grained PATs, OAuth, app and refresh tokens) and any
// bearer credential: none of them may ever reach a log line or an error a client sees.
const TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,})\b|((?:bearer|token)\s+)[A-Za-z0-9_.~+/=-]{16,}/gi;

/** Replaces anything shaped like a GitHub token or bearer credential with `[redacted]`. */
export function redactTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, (_m, prefix: string | undefined) => `${prefix ?? ''}[redacted]`);
}

function line(level: string, msg: string, extra?: Record<string, unknown>): string {
  return redactTokens(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

export const consoleLogger: Logger = {
  info: (msg, extra) => console.log(line('info', msg, extra)),
  warn: (msg, extra) => console.warn(line('warn', msg, extra)),
  error: (msg, extra) => console.error(line('error', msg, extra)),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export function errorMessage(err: unknown): string {
  return redactTokens(err instanceof Error ? err.message : String(err));
}
