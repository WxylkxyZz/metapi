import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type ModelServiceModule = typeof import('./modelService.js');

describe('rebuildTokenRoutesFromAvailability re-matches channels on regex/wildcard routes', () => {
    let db: DbModule['db'];
    let schema: DbModule['schema'];
    let rebuildTokenRoutesFromAvailability: ModelServiceModule['rebuildTokenRoutesFromAvailability'];
    let dataDir = '';

    beforeAll(async () => {
        dataDir = mkdtempSync(join(tmpdir(), 'metapi-pattern-rematch-'));
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

    async function seedSiteWithAccount(credentialMode: 'apikey' | 'session') {
        const site = await db.insert(schema.sites).values({
            name: 'site-re',
            url: 'https://site-re.example.com',
            platform: 'new-api',
        }).returning().get();

        const account = credentialMode === 'session'
            ? await db.insert(schema.accounts).values({
                siteId: site.id,
                username: 'user-re-session',
                accessToken: 'session-token',
                apiToken: null,
                status: 'active',
                extraConfig: JSON.stringify({ credentialMode: 'session' }),
            }).returning().get()
            : await db.insert(schema.accounts).values({
                siteId: site.id,
                username: 'user-re-apikey',
                accessToken: '',
                apiToken: 'sk-re',
                status: 'active',
                extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
            }).returning().get();

        return { site, account };
    }

    it('re-populates channels on a regex route after they were emptied', async () => {
        const { account } = await seedSiteWithAccount('apikey');

        // A regex route whose rule matches any gpt-4o model
        await db.insert(schema.tokenRoutes).values({
            modelPattern: 're:^gpt-4o',
            enabled: true,
        }).run();

        // Model available upstream
        await db.insert(schema.modelAvailability).values({
            accountId: account.id,
            modelName: 'gpt-4o-mini',
            available: true,
            latencyMs: 500,
            checkedAt: '2026-03-12T00:00:00.000Z',
        }).run();

        // First rebuild: the regex route should gain a channel matching the pattern
        const first = await rebuildTokenRoutesFromAvailability();
        const regexRoute = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 're:^gpt-4o')).get();
        expect(regexRoute).toBeDefined();
        expect(first.models).toBe(1);

        let regexChannels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, regexRoute!.id)).all();
        // The regex route must carry the gpt-4o-mini channel (exact route also exists; both hold it)
        const regexHasChannel = regexChannels.some((c) => c.accountId === account.id);
        expect(regexHasChannel).toBe(true);

        // Empty the regex route's channels to simulate a stale/cleared state
        await db.delete(schema.routeChannels).run();

        // Second rebuild: the regex route should be re-populated from the pattern
        const second = await rebuildTokenRoutesFromAvailability();
        regexChannels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, regexRoute!.id)).all();
        expect(regexChannels.some((c) => c.accountId === account.id)).toBe(true);
        expect(second.removedChannels).toBe(0);
    });

    it('removes a regex-route channel for a token that was disabled', async () => {
        const { account } = await seedSiteWithAccount('session');

        const token = await db.insert(schema.accountTokens).values({
            accountId: account.id,
            name: 'default',
            token: 'sk-token-re',
            valueStatus: 'ready',
            enabled: true,
            isDefault: true,
        }).returning().get();

        await db.insert(schema.tokenRoutes).values({
            modelPattern: 're:^gpt-4o',
            enabled: true,
        }).run();
        const route = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 're:^gpt-4o')).get();
        expect(route).toBeDefined();

        // Token reports an available model matching the regex
        await db.insert(schema.tokenModelAvailability).values({
            tokenId: token.id,
            modelName: 'gpt-4o-mini',
            available: true,
            latencyMs: 500,
            checkedAt: '2026-03-12T00:00:00.000Z',
        }).run();

        // First rebuild: token channel appears on the regex route
        await rebuildTokenRoutesFromAvailability();
        let channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id)).all();
        expect(channels.some((c) => c.tokenId === token.id)).toBe(true);

        // Disable the token: its availability is filtered out, so the channel must be removed
        await db.update(schema.accountTokens).set({ enabled: false }).where(eq(schema.accountTokens.id, token.id)).run();

        await rebuildTokenRoutesFromAvailability();
        channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id)).all();
        expect(channels.some((c) => c.tokenId === token.id)).toBe(false);

        // Re-enable the token: its channel is re-matched and re-added
        await db.update(schema.accountTokens).set({ enabled: true }).where(eq(schema.accountTokens.id, token.id)).run();

        await rebuildTokenRoutesFromAvailability();
        channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id)).all();
        expect(channels.some((c) => c.tokenId === token.id)).toBe(true);
    });

    it('preserves manual channels while rebuilding automatic ones', async () => {
        const { account } = await seedSiteWithAccount('apikey');

        await db.insert(schema.tokenRoutes).values({
            modelPattern: 're:^gpt-4o',
            enabled: true,
        }).run();
        const route = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, 're:^gpt-4o')).get();
        expect(route).toBeDefined();

        // A manual channel that does NOT match the pattern — must be preserved
        await db.insert(schema.routeChannels).values({
            routeId: route!.id,
            accountId: account.id,
            sourceModel: 'claude-sonnet-4-5',
            priority: 0,
            weight: 10,
            enabled: true,
            manualOverride: true,
        }).run();

        await rebuildTokenRoutesFromAvailability();

        const channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id)).all();
        const manual = channels.find((c) => c.sourceModel === 'claude-sonnet-4-5');
        expect(manual).toBeDefined();
        expect(manual!.manualOverride).toBe(true);
    });
});