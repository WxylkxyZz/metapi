import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

const getModelsMock = vi.fn();

vi.mock('./platforms/index.js', () => ({
  getAdapter: () => ({
    getModels: (...args: unknown[]) => getModelsMock(...args),
    getApiToken: () => null,
    getApiTokens: () => [],
    getModelsDiscovery: (...args: unknown[]) => getModelsMock(...args),
  }),
}));

type DbModule = typeof import('../db/index.js');
type ModelServiceModule = typeof import('./modelService.js');

describe('refreshModelsAndRebuildRoutes after disabling a model (full user flow)', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let refreshModelsAndRebuildRoutes: ModelServiceModule['refreshModelsAndRebuildRoutes'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-disable-fullflow-'));
    process.env.DATA_DIR = dataDir;

    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    const modelService = await import('./modelService.js');
    db = dbModule.db;
    schema = dbModule.schema;
    refreshModelsAndRebuildRoutes = modelService.refreshModelsAndRebuildRoutes;
  });

  beforeEach(async () => {
    getModelsMock.mockReset();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.siteDisabledModels).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(() => {
    delete process.env.DATA_DIR;
  });

  it('removes a disabled model after a full refreshModelsAndRebuildRoutes pass', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'site-full',
      url: 'https://site-full.example.com',
      platform: 'new-api',
    }).returning().get();

    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'user-full',
      accessToken: '',
      apiToken: 'sk-full',
      status: 'active',
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();

    // First pass: upstream returns two models
    getModelsMock.mockResolvedValue(['gpt-4o', 'claude-sonnet-4-5-20250929']);
    const first = await refreshModelsAndRebuildRoutes();
    expect((first as any).rebuild.models).toBe(2);

    // Disable gpt-4o for this site
    await db.insert(schema.siteDisabledModels).values({
      siteId: site.id,
      modelName: 'gpt-4o',
    }).run();

    // Second pass: upstream STILL returns gpt-4o (it's still available upstream),
    // but the site-level disable should prevent its route/channel.
    getModelsMock.mockResolvedValue(['gpt-4o', 'claude-sonnet-4-5-20250929']);
    const second = await refreshModelsAndRebuildRoutes();
    expect((second as any).rebuild.models).toBe(1);

    const gptRoute = await db.select().from(schema.tokenRoutes)
      .where(eq(schema.tokenRoutes.modelPattern, 'gpt-4o')).get();
    expect(gptRoute).toBeUndefined();

    const claudeRoute = await db.select().from(schema.tokenRoutes)
      .where(eq(schema.tokenRoutes.modelPattern, 'claude-sonnet-4-5-20250929')).get();
    expect(claudeRoute).toBeDefined();
  });

  it('removes a disabled-model channel from a wildcard route on rebuild (Gap B)', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'site-wild',
      url: 'https://site-wild.example.com',
      platform: 'new-api',
    }).returning().get();

    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'user-wild',
      accessToken: '',
      apiToken: 'sk-wild',
      status: 'active',
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();

    // A wildcard route with a channel pinned to the soon-to-be-disabled model.
    const route = await db.insert(schema.tokenRoutes).values({
      modelPattern: 'gpt-4*',
      enabled: true,
    }).returning().get();
    const channel = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: account.id,
      tokenId: null,
      sourceModel: 'gpt-4o',
      priority: 0,
      weight: 10,
      enabled: true,
    }).returning().get();

    // A second channel on a different site serving a different model must survive.
    const site2 = await db.insert(schema.sites).values({
      name: 'site-wild2',
      url: 'https://site-wild2.example.com',
      platform: 'new-api',
    }).returning().get();
    const account2 = await db.insert(schema.accounts).values({
      siteId: site2.id,
      username: 'user-wild2',
      accessToken: '',
      apiToken: 'sk-wild2',
      status: 'active',
      extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
    }).returning().get();
    const channel2 = await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: account2.id,
      tokenId: null,
      sourceModel: 'gpt-4o-mini',
      priority: 0,
      weight: 10,
      enabled: true,
    }).returning().get();

    // Disable gpt-4o for site 1 only.
    await db.insert(schema.siteDisabledModels).values({
      siteId: site.id,
      modelName: 'gpt-4o',
    }).run();

    await refreshModelsAndRebuildRoutes();

    const remaining = await db.select().from(schema.routeChannels).all();
    expect(remaining.map((c) => c.id)).not.toContain(channel.id);
    expect(remaining.map((c) => c.id)).toContain(channel2.id);
  });
});