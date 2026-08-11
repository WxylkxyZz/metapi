<div align="center">

<img src="docs/logos/logo-full.png" alt="Metapi" width="240">

# Metapi (private fork)

**Personal use · Meta-aggregation gateway for AI relay sites**

Aggregate multiple AI relay sites (New API / One API / Sub2API, etc.) into
**one endpoint, one API key**, with automatic model discovery, smart routing,
balance tracking, and auto check-in.

<p align="center">
  <a href="README.md"><strong>中文</strong></a> ·
  <a href="README_EN.md">English</a>
</p>

</div>

---

## ⚠️ Note

This is a **private fork** of Metapi for **personal use only**, not for public
distribution.

- This fork is maintained independently on top of the original Metapi codebase,
  without depending on upstream updates.
- Runtime ties to the original author's upstream have been cut (update-center
  polling, image pull, etc. are disabled).
- Maintenance is done personally, cherry-picking upstream community patches as
  needed.

---

## Why Metapi

The AI ecosystem has many aggregation relay sites based on New API / One API.
Metapi unifies them into a single entry point, so all downstream tools
(Cursor, Claude Code, Codex, etc.) only need one `/v1/*` URL and one key.

| Problem | Metapi's solution |
| --- | --- |
| 🔑 One key per site, lots of config | **Unified proxy entry**, models auto-aggregated to `/v1/*` |
| 💸 Don't know which site is cheapest | **Smart routing** by cost / balance / utilization |
| 🔄 Manual failover is painful | **Auto failover**, cooldown and switch on failure |
| 📊 Balance scattered | **Central dashboard** |
| ✅ Daily check-ins for quota | **Auto check-in** on schedule |
| 🤷 Don't know which models exist | **Auto model discovery**, zero-config |

---

## Quick Start (Docker)

```bash
git clone https://github.com/WxylkxyZz/metapi.git && cd metapi/docker

# Set AUTH_TOKEN (admin login token) and PROXY_TOKEN (downstream /v1/* token)
cp .env.example .env
# Edit .env with your AUTH_TOKEN and PROXY_TOKEN

docker compose build   # build locally (does not pull upstream image)
docker compose up -d
```

Visit `http://localhost:4000` and log in with `AUTH_TOKEN`.

> [!IMPORTANT]
> Change `AUTH_TOKEN` and `PROXY_TOKEN` — do not use the defaults. Data is
> stored in `./data`.

---

## Local Development

```bash
npm install
npm run db:migrate     # initialize database
npm run dev            # hot-reload (backend :4000 + frontend :5173)
```

```bash
npm test               # run all tests
npm run typecheck      # type-check (web / server / desktop)
npm run repo:drift-check  # architecture / debt gate
npm run build          # build frontend + backend
```

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Fastify (Node.js) |
| Frontend | React 18 + Vite |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite / MySQL / PostgreSQL + Drizzle ORM |
| Data viz | VChart |
| Scheduling | node-cron |
| Container | Docker + Docker Compose |
| Testing | Vitest |

---

## Data & Privacy

Fully self-hosted. All data (accounts, tokens, routes, logs) is stored in your
local database and is never sent to any third party. Proxy requests travel
directly between your server and the upstream sites.

---

## License

[MIT](LICENSE)