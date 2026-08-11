import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../../db/index.js');

describe('settings maintenance clear-cache preserves user-defined route rules', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-settings-clear-cache-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const settingsRoutesModule = await import('./settings.js');

    db = dbModule.db;
    schema = dbModule.schema;

    app = Fastify();
    await app.register(settingsRoutesModule.settingsRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.routeGroupSources).run();
    await db.delete(schema.routeChannels).run();
    await db.delete(schema.tokenModelAvailability).run();
    await db.delete(schema.modelAvailability).run();
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.tokenRoutes).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.DATA_DIR;
  });

  const insertRoute = async (overrides: Record<string, unknown> = {}) => {
    type RouteRow = typeof schema.tokenRoutes.$inferInsert;
    const value: RouteRow = {
      modelPattern: 'gpt-4o',
      enabled: true,
      ...(overrides as RouteRow),
    };
    return await db.insert(schema.tokenRoutes).values(value).returning().get();
  };

  it('deletes auto-generated exact routes and their channels', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'site-a',
      url: 'https://site-a.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();
    const account = await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'user-a',
      accessToken: 'acc-a',
      status: 'active',
    }).returning().get();

    const route = await insertRoute({ modelPattern: 'gpt-4o' });
    await db.insert(schema.routeChannels).values({
      routeId: route.id,
      accountId: account.id,
      tokenId: null,
      enabled: true,
    }).run();

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/maintenance/clear-cache',
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().deletedTokenRoutes).toBe(1);
    expect(response.json().deletedRouteChannels).toBe(1);
    expect(response.json().preservedRoutes).toBe(0);

    const routes = await db.select().from(schema.tokenRoutes).all();
    expect(routes).toHaveLength(0);
    const channels = await db.select().from(schema.routeChannels).all();
    expect(channels).toHaveLength(0);
  });

  it('preserves a regex route (re:...)', async () => {
    const route = await insertRoute({ modelPattern: 're:^claude-.*$' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/maintenance/clear-cache',
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().deletedTokenRoutes).toBe(0);
    expect(response.json().preservedRoutes).toBe(1);

    const routes = await db.select().from(schema.tokenRoutes).all();
    expect(routes.map((r) => r.modelPattern)).toContain('re:^claude-.*$');
  });

  it('preserves a wildcard route and an explicit group plus its referenced exact source route', async () => {
    // Auto-generated exact source routes referenced by an explicit group.
    const sourceExact = await insertRoute({ modelPattern: 'gpt-4o' });
    const sourceExact2 = await insertRoute({ modelPattern: 'gpt-4o-mini' });
    // A wildcard user rule.
    const wildcard = await insertRoute({ modelPattern: 'gpt-4*' });
    // An explicit group referencing the two exact source routes.
    const group = await insertRoute({ modelPattern: 'my-group', routeMode: 'explicit_group' });
    await db.insert(schema.routeGroupSources).values([
      { groupRouteId: group.id, sourceRouteId: sourceExact.id },
      { groupRouteId: group.id, sourceRouteId: sourceExact2.id },
    ]).run();

    // An auto-generated exact route NOT referenced by any group (should be deleted).
    const ungroupedExact = await insertRoute({ modelPattern: 'claude-opus-4-6' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/maintenance/clear-cache',
    });
    expect(response.statusCode).toBe(202);
    // Only the ungrouped exact route is deleted.
    expect(response.json().deletedTokenRoutes).toBe(1);
    expect(response.json().preservedRoutes).toBe(4);

    const routes = await db.select().from(schema.tokenRoutes).all();
    const patterns = routes.map((r) => r.modelPattern);
    expect(patterns).toContain('gpt-4o');           // group member preserved
    expect(patterns).toContain('gpt-4o-mini');       // group member preserved
    expect(patterns).toContain('gpt-4*');            // wildcard preserved
    expect(patterns).toContain('my-group');          // group preserved
    expect(patterns).not.toContain('claude-opus-4-6'); // ungrouped auto route deleted
  });
});