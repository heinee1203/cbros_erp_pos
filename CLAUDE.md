# Apex POS — Automotive ERP & POS Suite

## Project Structure
pnpm monorepo with 3 packages:
- `apps/api` — Fastify 5 modular monolith (the backend)
- `packages/database` — Drizzle ORM schema, migrations, seed
- `packages/types` — Shared enums, Zod schemas, TS interfaces

## Commands
- `pnpm dev` — Start API dev server (port 3000)
- `pnpm build` — Build API for production
- `pnpm db:generate` — Generate Drizzle migrations from schema changes
- `pnpm db:migrate` — Run pending migrations against Postgres
- `pnpm db:seed` — Seed 50k products (1 warehouse + 2 retail stores)
- `pnpm db:studio` — Open Drizzle Studio for DB exploration
- `docker compose up -d` — Start local Postgres (port 5433)

## Architecture
- **Multi-tenant:** Shared DB, every query filtered by `org_id`
- **Store-context:** `X-Location-ID` header required on all data routes; validated in global middleware
- **Auth:** JWT via `@fastify/jwt`; global `onRequest` hook authenticates all non-public routes
- **Pagination:** Keyset cursor-based (`?cursor=<uuid>&limit=50`), never OFFSET
- **Plugins:** Each feature module is a Fastify plugin registered in `app.ts`

## Key Files
- `apps/api/src/app.ts` — Fastify app builder, plugin registration order matters
- `apps/api/src/plugins/auth.ts` — Global JWT auth (runs first, populates `request.user`)
- `apps/api/src/plugins/store-context.ts` — Validates X-Location-ID, populates `request.storeContext`
- `packages/database/src/schema/` — One file per table, barrel export from `index.ts`
- `packages/database/drizzle.config.ts` — Drizzle Kit config (reads DATABASE_URL from .env)

## Code Conventions
- Feature modules: `apps/api/src/modules/<feature>/routes.ts` + optional `service.ts`
- Schema files: `packages/database/src/schema/<table>.ts`
- Shared types: `packages/types/src/` (enums.ts, schemas.ts)
- All tables have `created_at` and `updated_at` timestamps with timezone
- `mnemonic_sku` is VARCHAR(10) with DB CHECK constraint (`char_length = 10`)
- Module resolution: `"moduleResolution": "Bundler"` — extensionless imports within packages

## Database
- PostgreSQL 16 (Docker on port **5433** locally, Render in prod)
- Drizzle ORM with `postgres` (postgresjs) driver
- `pg_trgm` extension for product name trigram search
- Key indexes: B-Tree on sku/mnemonic_sku/org_id, GIN trigram on products.name, B-Tree on inventory.location_id
- Performance: 50k products paginated in <25ms

## Environment
- `.env` lives at monorepo root (not in packages)
- `apps/api/src/server.ts` loads dotenv with explicit root path before importing app
- Docker Postgres: user=apex, password=apex_secret, db=apex_dev
- Seed admin: admin@apex.com / admin12345

## Public Routes (no auth required)
- `GET /health`
- `POST /auth/login`
- `POST /auth/register`


# Screenshot & Image Rules

## CRITICAL: Avoid Image Dimension Errors

When testing or interacting with the Android emulator, UI, or any visual interface:

1. **Do NOT take screenshots unless explicitly asked.** Always prefer text-based validation:
   - Read logs, DOM elements, or terminal output instead of capturing screenshots
   - Use `adb shell dumpsys activity` or `adb shell uiautomator dump` to inspect UI state
   - Parse XML/HTML output to verify element presence and content

2. **If a screenshot is absolutely necessary:**
   - Capture ONLY the relevant portion, not the full screen
   - Resize any captured image to a maximum of 1500px on the longest side before viewing
   - Use: `adb exec-out screencap -p | convert - -resize 1500x1500\> resized_screenshot.png`
   - Never accumulate more than 2 screenshots in a single session

3. **Between test flows:**
   - Do not carry over screenshots from previous test steps
   - Summarize visual results in text rather than re-viewing images
   - If context is getting heavy with images, notify the user to start a fresh session

4. **For UI testing validation, prefer these methods (in order):**
   - `adb shell uiautomator dump /dev/tty` → parse XML for element verification
   - `adb logcat -d -s TAG` → check app logs for success/error states
   - `adb shell am broadcast` → trigger and verify app state via intents
   - Screenshot as absolute last resort, resized before viewing

## How to Apply

## Paste this into your project's `CLAUDE.md` file so these rules are automatically loaded every session. Or paste it at the start of any Claude Code session as your first message.
