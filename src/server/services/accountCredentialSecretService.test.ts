import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, DEFAULT_ADMIN_TOKEN } from '../config.js';

type DbModule = typeof import('../db/index.js');
type SecretServiceModule = typeof import('./accountCredentialSecretService.js');

describe('accountCredentialSecretService', () => {
  let dataDir = '';
  let dbModule: DbModule;
  let service: SecretServiceModule;

  const originalConfig = {
    accountCredentialSecret: config.accountCredentialSecret,
    accountCredentialSecretExplicit: config.accountCredentialSecretExplicit,
    authToken: config.authToken,
  };

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-cred-secret-'));
    process.env.DATA_DIR = dataDir;
    await import('../db/migrate.js');
    dbModule = await import('../db/index.js');
    service = await import('./accountCredentialSecretService.js');
  });

  afterEach(async () => {
    Object.assign(config, {
      accountCredentialSecret: originalConfig.accountCredentialSecret,
      accountCredentialSecretExplicit: originalConfig.accountCredentialSecretExplicit,
      authToken: originalConfig.authToken,
    });
    await dbModule.db.delete(dbModule.schema.settings).run();
  });

  afterAll(() => {
    delete process.env.DATA_DIR;
  });

  it('generates and persists a strong secret when the key would be the public default', async () => {
    config.accountCredentialSecret = DEFAULT_ADMIN_TOKEN;
    config.accountCredentialSecretExplicit = false;
    config.authToken = DEFAULT_ADMIN_TOKEN;

    const secret = await service.ensureAccountCredentialSecret();

    expect(secret).toBeTruthy();
    expect(secret).not.toBe(DEFAULT_ADMIN_TOKEN);
    expect(secret).toMatch(/^canopy-/);

    const [row] = await dbModule.db.select().from(dbModule.schema.settings)
      .where((table: typeof dbModule.schema.settings) => table.key === service.ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY)
      .all();
    expect(row).toBeTruthy();
    expect(JSON.parse((row as any).value as string)).toBe(secret);
    expect(config.accountCredentialSecret).toBe(secret);
  });

  it('is idempotent across boots: reuses the persisted secret', async () => {
    config.accountCredentialSecret = DEFAULT_ADMIN_TOKEN;
    config.accountCredentialSecretExplicit = false;
    config.authToken = DEFAULT_ADMIN_TOKEN;

    const first = await service.ensureAccountCredentialSecret();
    // Simulate a restart: reset the in-memory value back to the default.
    config.accountCredentialSecret = DEFAULT_ADMIN_TOKEN;
    const second = await service.ensureAccountCredentialSecret();

    expect(second).toBe(first);
  });

  it('keeps an AUTH_TOKEN-derived key unchanged (compat with existing ciphertexts)', async () => {
    config.accountCredentialSecret = 'custom-auth-token';
    config.accountCredentialSecretExplicit = false;
    config.authToken = 'custom-auth-token';

    const secret = await service.ensureAccountCredentialSecret();

    expect(secret).toBe('custom-auth-token');
    const [row] = await dbModule.db.select().from(dbModule.schema.settings)
      .where((table: typeof dbModule.schema.settings) => table.key === service.ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY)
      .all();
    expect(row).toBeUndefined();
  });

  it('never overwrites an explicitly configured ACCOUNT_CREDENTIAL_SECRET', async () => {
    config.accountCredentialSecret = 'operator-set-secret';
    config.accountCredentialSecretExplicit = true;
    config.authToken = DEFAULT_ADMIN_TOKEN;

    const secret = await service.ensureAccountCredentialSecret();

    expect(secret).toBe('operator-set-secret');
    const [row] = await dbModule.db.select().from(dbModule.schema.settings)
      .where((table: typeof dbModule.schema.settings) => table.key === service.ACCOUNT_CREDENTIAL_SECRET_SETTING_KEY)
      .all();
    expect(row).toBeUndefined();
  });

  it('generateStrongSecret produces unique strong values', () => {
    const a = service.generateStrongSecret();
    const b = service.generateStrongSecret();
    expect(a).toMatch(/^canopy-/);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40);
  });

  it('isUsingFallbackCredentialSecret detects the public default', () => {
    config.accountCredentialSecret = DEFAULT_ADMIN_TOKEN;
    expect(service.isUsingFallbackCredentialSecret()).toBe(true);

    config.accountCredentialSecret = 'canopy-strong-secret';
    expect(service.isUsingFallbackCredentialSecret()).toBe(false);
  });
});