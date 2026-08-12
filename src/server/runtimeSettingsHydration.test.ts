import { afterEach, describe, expect, it } from 'vitest';

import { config, DEFAULT_ADMIN_TOKEN } from './config.js';
import { applyRuntimeSettings } from './runtimeSettingsHydration.js';

const originalConfig = structuredClone(config);

afterEach(() => {
  Object.assign(config, structuredClone(originalConfig));
});

describe('applyRuntimeSettings', () => {
  it('hydrates persisted runtime settings that should survive restarts', () => {
    config.disableCrossProtocolFallback = false;
    config.responsesCompactFallbackToResponsesEnabled = false;
    config.webhookEnabled = true;
    config.barkEnabled = true;
    config.globalAllowedModels = [];

    applyRuntimeSettings(new Map([
      ['disable_cross_protocol_fallback', JSON.stringify(true)],
      ['responses_compact_fallback_to_responses_enabled', JSON.stringify(true)],
      ['webhook_enabled', JSON.stringify(false)],
      ['bark_enabled', JSON.stringify(false)],
      ['global_allowed_models', JSON.stringify(['gpt-5.4', ' claude-3.7-sonnet '])],
    ]));

    expect(config.disableCrossProtocolFallback).toBe(true);
    expect(config.responsesCompactFallbackToResponsesEnabled).toBe(true);
    expect(config.webhookEnabled).toBe(false);
    expect(config.barkEnabled).toBe(false);
    expect(config.globalAllowedModels).toEqual(['gpt-5.4', 'claude-3.7-sonnet']);
  });

  it('hydrates legacy double-encoded global model allowlist values', () => {
    config.globalAllowedModels = [];

    applyRuntimeSettings(new Map([
      ['global_allowed_models', JSON.stringify(JSON.stringify(['model-alpha', ' model-beta ', 'model-gamma']))],
    ]));

    expect(config.globalAllowedModels).toEqual(['model-alpha', 'model-beta', 'model-gamma']);
  });

  it('hydrates a persisted account-credential secret when the key is the public default', () => {
    config.accountCredentialSecret = DEFAULT_ADMIN_TOKEN;
    config.accountCredentialSecretExplicit = false;

    applyRuntimeSettings(new Map([
      ['account_credential_secret_v1', JSON.stringify('metapi-persisted-strong-secret')],
    ]));

    expect(config.accountCredentialSecret).toBe('metapi-persisted-strong-secret');
  });

  it('does not hydrate a persisted secret when ACCOUNT_CREDENTIAL_SECRET is explicit', () => {
    config.accountCredentialSecret = 'operator-set';
    config.accountCredentialSecretExplicit = true;

    applyRuntimeSettings(new Map([
      ['account_credential_secret_v1', JSON.stringify('metapi-persisted-strong-secret')],
    ]));

    expect(config.accountCredentialSecret).toBe('operator-set');
  });

  it('does not hydrate a persisted secret when AUTH_TOKEN is the current key', () => {
    config.accountCredentialSecret = 'insecure-auth-token';
    config.accountCredentialSecretExplicit = false;

    applyRuntimeSettings(new Map([
      ['account_credential_secret_v1', JSON.stringify('metapi-persisted-strong-secret')],
    ]));

    expect(config.accountCredentialSecret).toBe('insecure-auth-token');
  });
});
