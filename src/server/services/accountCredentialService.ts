import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config, DEFAULT_ADMIN_TOKEN } from '../config.js';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

// Per-boot random fallback so the key is never a publicly-known constant. Used only
// if boot-time secret provisioning failed (ensureAccountCredentialSecret) — normally
// the deployment-unique secret is loaded before any account is encrypted.
const RUNTIME_FALLBACK_SECRET = randomBytes(32).toString('base64url');

function buildKey(): Buffer {
  const secret = (config.accountCredentialSecret || '').trim();
  const effective = secret && secret !== DEFAULT_ADMIN_TOKEN
    ? secret
    : ((config.authToken || '').trim() && config.authToken !== DEFAULT_ADMIN_TOKEN
      ? config.authToken
      : RUNTIME_FALLBACK_SECRET);
  return createHash('sha256').update(effective).digest();
}

export function encryptAccountPassword(password: string): string {
  const key = buildKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptAccountPassword(cipherText: string): string | null {
  const parts = (cipherText || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const [, ivRaw, tagRaw, dataRaw] = parts;
    const key = buildKey();
    const iv = Buffer.from(ivRaw, 'base64url');
    const tag = Buffer.from(tagRaw, 'base64url');
    const data = Buffer.from(dataRaw, 'base64url');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
