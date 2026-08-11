import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type ModelServiceModule = typeof import('./modelService.js');

describe('rebuildTokenRoutesFromAvailability removes pre-existing routes for newly-disabled models', () => {
    let db: DbModule['db'];
    let schema: DbModule['schema'];
    let rebuildTokenRoutesFromAvailability: ModelServiceModule['rebuildTokenRoutesFromAvailability'];
    let dataDir = '';

    beforeAll(async () => {
        dataDir = mkdtempSync(join(tmpdir(), 'metapi-site-disable-removal-'));
        process.env.DATA_DIR = dataDir;

        await import('../db/migrate.js');
        const dbModule = await import('../db/index.js');
        const modelService = await import('./modelService.js');

        db = dbModule.db;
        schema = dbModule.schema;
        rebuildTokenRoutesFromAvailability = modelService.rebuildTokenRoutesFromAvailability;
    });

    beforeEach(async () => {
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

    it('removes a route/channel that already existed before the model was disabled', async () => {
        const site = await db.insert(schema.sites).values({
            name: 'site-a',
            url: 'https://site-a.example.com',
            platform: 'new-api',
        }).returning().get();

        const account = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'user-a',
            accessToken: '',
            apiToken: 'sk-test',
            status: 'active',
            extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
        }).returning().get();

        await db.insert(schema.modelAvailability).values({
            accountId: account.id,
            modelName: 'gpt-4o',
            available: true,
            latencyMs: 500,
            checkedAt: '2026-03-12T00:00:00.000Z',
        }).run();

        // First rebuild: model is available, route + channel get created
        const first = await rebuildTokenRoutesFromAvailability();
        expect(first.models).toBe(1);

        const routeBefore = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 'gpt-4o')).get();
        expect(routeBefore).toBeDefined();
        const channelsBefore = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, routeBefore!.id)).all();
        expect(channelsBefore).toHaveLength(1);

        // Now disable the model for this site
        await db.insert(schema.siteDisabledModels).values({
            siteId: site.id,
            modelName: 'gpt-4o',
        }).run();

        // Second rebuild: the pre-existing route/channel should be removed
        const second = await rebuildTokenRoutesFromAvailability();
        expect(second.models).toBe(0);

        const routeAfter = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 'gpt-4o')).get();
        expect(routeAfter).toBeUndefined();

        const channelsAfter = await db.select().from(schema.routeChannels).all();
        expect(channelsAfter).toHaveLength(0);
    });

    it('removes a pre-existing token-path (session/session-type) route/channel for a newly-disabled model', async () => {
        const site = await db.insert(schema.sites).values({
            name: 'sub2api-site',
            url: 'https://sub2api.example.com',
            platform: 'sub2api',
        }).returning().get();

        const account = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'user-s',
            accessToken: 'session-token',
            apiToken: null,
            status: 'active',
            extraConfig: JSON.stringify({ credentialMode: 'session' }),
        }).returning().get();

        const token = await db.insert(schema.accountTokens).values({
            accountId: account.id,
            name: 'default',
            token: 'sk-token-s',
            valueStatus: 'ready',
            enabled: true,
            isDefault: true,
        }).returning().get();

        await db.insert(schema.tokenModelAvailability).values({
            tokenId: token.id,
            modelName: 'claude-sonnet-4-5-20250929',
            available: true,
            latencyMs: 300,
            checkedAt: '2026-03-12T00:00:00.000Z',
        }).run();

        // First rebuild: creates route + channel via token path
        const first = await rebuildTokenRoutesFromAvailability();
        expect(first.models).toBe(1);

        const routeBefore = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 'claude-sonnet-4-5-20250929')).get();
        expect(routeBefore).toBeDefined();
        const channelsBefore = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, routeBefore!.id)).all();
        expect(channelsBefore).toHaveLength(1);

        // Disable the model for this site
        await db.insert(schema.siteDisabledModels).values({
            siteId: site.id,
            modelName: 'claude-sonnet-4-5-20250929',
        }).run();

        const second = await rebuildTokenRoutesFromAvailability();
        expect(second.models).toBe(0);

        const routeAfter = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 'claude-sonnet-4-5-20250929')).get();
        expect(routeAfter).toBeUndefined();

        const channelsAfter = await db.select().from(schema.routeChannels).all();
        expect(channelsAfter).toHaveLength(0);
    });

    it('blocks a disabled model regardless of case differences between availability and disabled record', async () => {
        const site = await db.insert(schema.sites).values({
            name: 'site-case',
            url: 'https://site-case.example.com',
            platform: 'new-api',
        }).returning().get();

        const account = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'user-case',
            accessToken: '',
            apiToken: 'sk-case',
            status: 'active',
            extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
        }).returning().get();

        // Availability stored with original case, disabled record with different case
        await db.insert(schema.modelAvailability).values({
            accountId: account.id,
            modelName: 'gpt-4o',
            available: true,
            latencyMs: 500,
            checkedAt: '2026-03-12T00:00:00.000Z',
        }).run();
        await db.insert(schema.siteDisabledModels).values({
            siteId: site.id,
            modelName: 'GPT-4O',
        }).run();

        const rebuild = await rebuildTokenRoutesFromAvailability();
        expect(rebuild.models).toBe(0);
        const routes = await db.select().from(schema.tokenRoutes).all();
        expect(routes).toHaveLength(0);
    });
});