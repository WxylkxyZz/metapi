import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config, DEFAULT_ADMIN_TOKEN } from '../config.js';
import { db, schema } from '../db/index.js';
import { upsertSetting } from '../db/upsertSetting.js';

export const ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY = 'account_credential_secret_v1';

/**
 * Ensure a strong, deployment-unique secret is available for encrypting account
 * credentials. The lookup order is:
 *
 *   1. Operator-set ACCOUNT_CREDENTIAL_SECRET env (highest precedence, never
 *      overwritten by boot).
 *   2. A persisted secret generated on a previous first boot.
 *   3. A freshly generated random secret, persisted so it survives restarts.
 *
 * The public default token (123456) is NEVER used as an encryption key once the
 * database is available — otherwise stored account passwords would be decryptable
 * by anyone who knows the shipped default.
 *
 * IMPORTANT: if AUTH_TOKEN is set (the common case), the credential key continues
 * to derive from it (unchanged behaviour) so existing ciphertexts stay decryptable.
 * A random secret is only generated when the current key is the PUBLIC default
 * (i.e. neither ACCOUNT_CREDENTIAL_SECRET nor AUTH_TOKEN is configured).
 */
export async function ensureAccountCredentialSecret(): Promise<string> {
  if (config.accountCredentialSecretExplicit) {
    return config.accountCredentialSecret;
  }

  // If the key derives from AUTH_TOKEN (not the public default), keep it — existing
  // ciphertexts depend on it and it is not a publicly-known value.
  if (config.accountCredentialSecret && config.accountCredentialSecret !== DEFAULT_ADMIN_TOKEN) {
    return config.accountCredentialSecret;
  }

  const [row] = await db.select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY))
    .all();

  if (row && typeof row.value === 'string' && row.value) {
    let persisted: string | null = null;
    try {
      persisted = JSON.parse(row.value) as string;
    } catch {
      persisted = null;
    }
    if (typeof persisted === 'string' && persisted) {
      config.accountCredentialSecret = persisted;
      return persisted;
    }
  }

  const generated = generateStrongSecret();
  await upsertSetting(ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY, generated);
  config.accountCredentialSecret = generated;
  return generated;
}

export function generateStrongSecret(): string {
  return `canopy-${randomBytes(32).toString('base64url')}`;
}

export function isUsingFallbackCredentialSecret(): boolean {
  const secret = (config.accountCredentialSecret || '').trim();
  return !secret || secret === DEFAULT_ADMIN_TOKEN;
}