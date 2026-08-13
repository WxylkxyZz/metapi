# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Canopy is a **meta-aggregation layer** for AI API proxy sites. It sits *above* aggregation panels (New API, One API, OneHub, DoneHub, Veloera, AnyRouter, Sub2API) plus direct provider/OAuth upstreams (OpenAI/Claude/Gemini compatible, Codex, Claude, Gemini CLI, Antigravity, cliproxyapi), and exposes them as a single OpenAI- and Claude-compatible endpoint. Downstream clients (Cursor, Claude Code, Codex, etc.) point at one `/v1/*` base URL with one key; Canopy discovers upstream models, routes requests by cost/balance/utilization, fails over, tracks balances, and auto-checks-in.

Full-stack TypeScript: Fastify backend + React 18/Vite frontend, packaged as a single Docker container or Electron desktop app.

## Commands

```bash
npm run dev              # backend (tsx watch, :4000) + frontend (vite, :5173) concurrently
npm run dev:server       # backend only
npm run db:migrate       # apply SQLite migrations — run before first dev boot
npm test                 # full vitest run (this is what CI runs)
npm run test:watch       # vitest watch mode
npm run typecheck        # typecheck all 4 tsconfig projects (web, web:test, server, desktop)
npm run build            # build web + server + desktop
```

Run a single test file or pattern:
```bash
npx vitest run src/server/services/tokenRouter.test.ts
npx vitest run -t "cooldown"          # by test name
```

Schema / drift tooling (see architecture notes):
```bash
npm run schema:generate  # db:generate (drizzle) + schema:contract — regenerate after schema.ts edits
npm run repo:drift-check  # architecture/debt lint; CI runs this and it must pass
npm run smoke:db:mysql    # / :postgres / :sqlite — exercise a real DB dialect end-to-end
```

Node **25+** is required (`package.json` engines); the README/CONTRIBUTING mention lower versions but the build targets 25.

## Two authentication planes

Everything hinges on this split (`src/server/index.ts`, `src/server/middleware/auth.ts`):

- **`/api/*`** — admin/management API, guarded by `authMiddleware` (the `AUTH_TOKEN`). Serves the React dashboard. `isPublicApiRoute` in `desktop.ts` exempts a few routes.
- **`/v1/*`** — the downstream proxy surface, guarded by `proxyAuthMiddleware`. Accepts either the global `PROXY_TOKEN` or a per-project **managed downstream API key** (`downstreamApiKeyService`), which carries its own `DownstreamRoutingPolicy` restricting which upstreams/models it can reach.

When adding a route, register it in `index.ts` under the correct plane. `/v1/*` and `/api/*` are excluded from the SPA fallback.

## Backend architecture

### Platform adapters — `src/server/services/platforms/`
One adapter per upstream type, all implementing `PlatformAdapter` (`base.ts`): model enumeration, balance, token management, and (where supported) login/checkin/user-info. **Order in `index.ts` matters** — specific forks are listed before generic adapters so auto-detection (`detectPlatform`) picks the most specific match. Detection tries URL hint → title hint → per-adapter `detect()`. Platform name aliases live in `src/shared/platformIdentity`.

### Proxy core — `src/server/proxy-core/`
The request routing + execution engine, kept separate from the thin `routes/proxy/*` HTTP handlers:
- **`surfaces/`** — per-endpoint orchestration (chat, responses, models, files, gemini…). Route files delegate here; **do not inline protocol logic in `routes/proxy/*.ts`** (enforced by `architecture-boundaries.test.ts` / `architecture-semantic-boundaries.test.ts`).
- **`orchestration/endpointFlow.ts`** — drives an upstream attempt with retry/failover.
- **`conductor/`**, **`executors/`**, **`providers/`**, **`cliProfiles/`** — provider-specific execution (Claude/Codex/Gemini CLI/Antigravity), retry policy, stream termination, OAuth session runtimes.

### Routing — `src/server/services/tokenRouter.ts`
`TokenRouter` (singleton `tokenRouter`) selects a channel per request. It weighs cost/balance/utilization, applies per-site runtime health (circuit breakers), cools down recently-failed channels, and produces auditable `RouteDecisionExplanation`s. Routes are rebuilt from discovered models at startup and refreshed via `routeRefreshWorkflow`. Model-pattern matching supports exact, wildcard, and regex patterns.

### Transformers — `src/server/transformers/`
Convert between wire formats. Requests normalize through a **canonical** envelope (`canonical/`), then out to `openai/` (chat + responses), `anthropic/` (messages), or `gemini/`. `shared/` holds format-agnostic helpers (endpoint strategy, reasoning transport, think-tag parsing, tool-name shortening). This is what lets a Claude-format downstream call an OpenAI-format upstream (and vice versa), including SSE streaming.

### Database — `src/server/db/`
Drizzle ORM over **SQLite / MySQL / PostgreSQL**, all through drizzle's `*-proxy` drivers (`index.ts`) so one schema (`schema.ts`) targets three dialects. Key pieces:
- **Runtime DB switching**: the active dialect/URL can be changed at runtime from settings (`switchRuntimeDatabase`); `index.ts` (server entry) reads saved DB config from `settings` and switches on boot, with rollback on failure.
- **Compatibility columns**: `ensure*CompatibilityColumns` / `ensure*Column` functions additively patch older databases on boot instead of relying solely on migrations.
- **Schema contract**: `schemaContract.ts` + `schema:contract` generate a dialect-independent contract from the schema; parity/upgrade/runtime tests (`schemaParity*`, `schemaUpgrade*`, `runtimeSchemaBootstrap*`) verify all three dialects agree. **After editing `schema.ts`, run `npm run schema:generate`.**

Drizzle migrations (`drizzle.config.ts`, `drizzle/`) are SQLite-only and applied via `db:migrate`; MySQL/Postgres rely on runtime bootstrap + compatibility patching.

### Background schedulers
Started in `index.ts` and stopped in the `onClose` hook: checkin (`CHECKIN_CRON`), balance refresh (`BALANCE_REFRESH_CRON`), site-announcement polling, model-availability and channel-recovery probes, sub2api managed refresh, update-center polling, usage aggregation, admin-snapshot warming, WebDAV backup, proxy file/log retention. Add new schedulers to both the start block and `onClose`.

## `src/shared/` — cross-cutting gotcha
Code shared between server and web is authored as **`.js` + hand-written `.d.ts`** (e.g. `platformIdentity.js` / `.d.ts`), **not `.ts`**, so both the Vite (web) and tsc (server) builds consume it directly without a separate build step. When editing shared logic, edit the `.js` and keep the `.d.ts` in sync — there is no `.ts` source to compile. Each has a colocated `.test.ts`.

## Frontend — `src/web/`
React 18 + React Router (`App.tsx`, routes lazy-loaded), Tailwind CSS v4, VChart for dataviz. `api.ts` is the single API client against `/api/*`. Pages live in `pages/`, shared UI in `components/`. Web tests run under jsdom via the same `npm test`.

## Testing conventions
Tests are colocated (`*.test.ts` / `*.test.tsx`, ~445 files) and run with Vitest. Notable categories beyond unit tests:
- **Architecture tests** (`*.architecture.test.ts`, `architecture-boundaries.test.ts`) assert file-boundary rules by reading source text — respect them when moving code between routes and surfaces.
- **`.live.test.ts`** (schema parity/upgrade) and **`smoke:db:*`** exercise real MySQL/Postgres; the default `npm test` covers the SQLite path.
- CI (`.github/workflows/ci.yml`) runs `npm test`, `build:web`, `build:server`, and `repo:drift-check` — the drift check must stay green.
