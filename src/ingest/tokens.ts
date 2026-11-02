// Players' GitHub sign-in tokens, encrypted at rest.
//
// A token is sealed with AES-256-GCM under a key derived (HKDF-SHA256) from TOKEN_KEY, with a fresh
// 96-bit nonce per seal and the owner's user id as additional data, so a sealed token copied onto
// another user's row does not open. The plaintext exists only in memory, inside that player's GitHub
// client (server/githubPool.ts); it is never logged, never sent to a browser, and redacted from errors
// (log.ts `redactTokens`).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** TOKEN_KEY must carry at least this many bytes. */
export const TOKEN_KEY_MIN_BYTES = 32;

export type TokenKeySource = 'TOKEN_KEY' | 'SESSION_SECRET' | 'random';

export class TokenVault {
  private constructor(
    private readonly key: Buffer,
    /** Where the key came from: a random per-boot key cannot open what an earlier boot sealed. */
    readonly source: TokenKeySource,
  ) {}

  /** The vault for this server: TOKEN_KEY, else (outside production) SESSION_SECRET, else a random per-boot key. */
  static fromSecrets(s: { tokenKey: string | null; sessionSecret: string | null }): TokenVault {
    if (s.tokenKey) return new TokenVault(derive(s.tokenKey, 'codeclash token key v1'), 'TOKEN_KEY');
    if (s.sessionSecret) return new TokenVault(derive(s.sessionSecret, 'codeclash token key from session secret v1'), 'SESSION_SECRET');
    return new TokenVault(randomBytes(32), 'random');
  }

  /** A sealed token: `v1.<nonce>.<tag>.<ciphertext>`, base64url, bound to `userId`. */
  seal(token: string, userId: number): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad(userId));
    const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
  }

  /** The token, or null when the blob is malformed, sealed for someone else, or sealed under another key. */
  open(blob: string, userId: number): string | null {
    const [version, iv, tag, ct] = blob.split('.');
    if (version !== VERSION || !iv || !tag || ct === undefined) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'), { authTagLength: TAG_BYTES });
      decipher.setAAD(aad(userId));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}

function aad(userId: number): Buffer {
  return Buffer.from(`codeclash-user:${userId}`, 'utf8');
}

function derive(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('codeclash', 'utf8'), Buffer.from(info, 'utf8'), 32));
}
