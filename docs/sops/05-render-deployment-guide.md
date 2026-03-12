# APEX POS — Render Deployment Guide

**Document:** SOP-DEPLOY-001
**Version:** 1.0
**Date:** 7 March 2026
**Classification:** Internal — IT Administration Only

---

## Prerequisites

Before starting, confirm these are complete:

| # | Item | ✓ |
|---|------|---|
| 1 | GitHub repository created with `main` and `staging` branches pushed | ☐ |
| 2 | Tag `v1.0.0-uat-ready` exists on the repository | ☐ |
| 3 | `.env` is listed in `.gitignore` (never committed) | ☐ |
| 4 | `render.yaml` exists in repo root (Production blueprint) | ☐ |
| 5 | `render-uat.yaml` exists in repo root (UAT blueprint) | ☐ |
| 6 | You have a Render account at [dashboard.render.com](https://dashboard.render.com) | ☐ |
| 7 | Payment method added to Render account (required for paid tiers) | ☐ |

---

## Part 1: UAT Sandbox Setup

### Step 1.1 — Connect GitHub to Render

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | Open [dashboard.render.com](https://dashboard.render.com) | Render Dashboard home |
| 2 | Click your **profile icon** (top-right) → **Account Settings** | Account settings page |
| 3 | Click **Git Providers** in the left sidebar | Git provider connections |
| 4 | Under **GitHub**, click **Connect** | GitHub OAuth authorization page |
| 5 | Select your GitHub account or organization | Repository permission request |
| 6 | Grant access to the **APEX_POS** repository (select specific repo, not "All repositories") | Authorization confirmed |
| 7 | You are redirected back to Render Dashboard | GitHub shows as "Connected" with your username |

> **Security Note:** Grant access to only the APEX_POS repository. Never grant blanket "All repositories" access for a business-critical deployment.

---

### Step 1.2 — Create the UAT Blueprint

Render Blueprints read a YAML file from your repository and provision all services and databases declared in it. Since `render-uat.yaml` is not the default filename (`render.yaml`), we must point Render to it explicitly.

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | From the Dashboard, click **Blueprints** in the left sidebar | Blueprints page (may be empty) |
| 2 | Click **New Blueprint Instance** | "Create a new Blueprint Instance" form |
| 3 | Under **Repository**, select your **APEX_POS** repo from the dropdown | Repository selected |
| 4 | Under **Branch**, type `staging` and select it | Branch set to `staging` |
| 5 | Under **Blueprint file path**, change from `render.yaml` to `render-uat.yaml` | File path updated |
| 6 | Under **Blueprint Name**, enter: `APEX POS — UAT Sandbox` | Name set |
| 7 | Click **Apply** | Blueprint parsing begins |

Render will now parse `render-uat.yaml` and show you a preview of all resources it will create:

```
Resources to create:
  ☐ Database:    apex-uat-db     (basic-1gb, Singapore)
  ☐ Web Service: apex-uat-api   (starter, Singapore)
  ☐ Web Service: apex-uat-web   (starter, Singapore)
```

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 8 | Review the resource list — confirm 1 database + 2 web services, all in **Singapore** | Resources listed correctly |
| 9 | Click **Apply** (or **Create Resources**) | Provisioning begins |

> **Provisioning Time:** The database takes 3–5 minutes. Web services build and deploy in 5–10 minutes. Total: ~15 minutes.

---

### Step 1.3 — Monitor the UAT Deployment

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | You are taken to the Blueprint status page | All 3 resources show as "Creating..." |
| 2 | Click on **apex-uat-db** | Database dashboard — status progresses: Creating → Available |
| 3 | Wait for status to show **Available** with a green indicator | Database is ready |
| 4 | Go back. Click on **apex-uat-api** | Build logs streaming in real-time |
| 5 | Watch for build output: `pnpm install --frozen-lockfile && pnpm build` | Dependencies install, TypeScript compiles |
| 6 | Watch for: `==> Build successful` followed by `==> Starting service` | Build succeeded |
| 7 | Watch for: `Apex API running on http://0.0.0.0:3000` | API server started |
| 8 | Render runs the health check: `GET /health` | Health check passes → status turns **green** |
| 9 | Go back. Click on **apex-uat-web** | Build logs for Next.js |
| 10 | Watch for: `pnpm install --frozen-lockfile && pnpm web:build` | Next.js builds |
| 11 | Watch for: `✓ Compiled successfully` and `==> Starting service` | Frontend started |

---

### Step 1.4 — Set the Frontend API URL

The Next.js frontend needs to know where the Fastify API lives. This is a `NEXT_PUBLIC_` variable, so it must be set **before the build** (it's baked into the client-side JavaScript bundle at build time).

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | Click on **apex-uat-api** in the Render Dashboard | API service page |
| 2 | Copy the service URL from the top of the page — it looks like: `https://apex-uat-api.onrender.com` | URL copied to clipboard |
| 3 | Navigate to **apex-uat-web** service | Web frontend service page |
| 4 | Click **Environment** in the left sidebar | Environment variables list |
| 5 | Find `NEXT_PUBLIC_API_URL` (it will show as empty) | Variable exists but is blank |
| 6 | Click **Edit** (pencil icon) next to it | Edit field opens |
| 7 | Paste: `https://apex-uat-api.onrender.com` (the URL from step 2, **no trailing slash**) | Value set |
| 8 | Click **Save Changes** | Variable saved |
| 9 | A banner appears: "Environment changed. Trigger a new deploy?" — Click **Yes, deploy** | Rebuild triggers |
| 10 | Wait for the rebuild to complete (~5 minutes) | Frontend rebuilds with the API URL baked in |

> **Why a rebuild?** Next.js `NEXT_PUBLIC_*` variables are embedded at **build time**, not runtime. Changing the value requires a fresh `next build` to take effect.

---

### Step 1.5 — Run Database Migrations on UAT

The database is empty — it needs the Drizzle schema migrations applied.

| # | Action | Command / Click Path |
|---|--------|---------------------|
| 1 | Click on **apex-uat-db** in Render Dashboard | Database page |
| 2 | Click **Connect** in the top-right | Connection details panel |
| 3 | Copy the **External Connection URL** (starts with `postgresql://apex:...@...singapore-postgres.render.com:5432/apex_uat`) | URL copied |
| 4 | On your **local machine**, set this temporarily: | |

```bash
# Terminal on your local machine — NOT on Render
export DATABASE_URL="postgresql://apex:PASSWORD@HOST:5432/apex_uat"
```

| # | Action | Command |
|---|--------|---------|
| 5 | Run Drizzle migrations: | |

```bash
cd /path/to/APEX_POS
pnpm db:migrate
```

| # | Action | Expected Output |
|---|--------|-----------------|
| 6 | Confirm output shows all migrations applied | `[✓] 0001_..., 0002_..., ... 0006_...` |
| 7 | Apply the staging tables migration (not tracked by Drizzle Kit): | |

```bash
psql "$DATABASE_URL" < packages/database/migrations/0007_phase9_migration_staging.sql
```

| # | Action | Expected Output |
|---|--------|-----------------|
| 8 | Confirm staging tables created | `CREATE TYPE`, `CREATE TABLE` × 7, `CREATE INDEX` × multiple |
| 9 | Seed the UAT database with test data: | |

```bash
pnpm db:seed
```

| # | Action | Expected Output |
|---|--------|-----------------|
| 10 | Confirm seed completes | `Seeded 1 org, 3 locations, 1 supplier, 50000 products, 150000 inventory rows` |
| 11 | **Clear the temporary env var** (do not leave production URLs in your shell): | |

```bash
unset DATABASE_URL
```

---

### Step 1.6 — Verify UAT Is Live

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 1 | Open `https://apex-uat-api.onrender.com/health` in your browser | `{"status":"ok"}` JSON response | ☐ |
| 2 | Open `https://apex-uat-web.onrender.com` in your browser | APEX POS login page renders | ☐ |
| 3 | Register an admin user via: `POST https://apex-uat-api.onrender.com/auth/register` with body `{"email":"admin@apex.com","password":"admin12345","orgName":"Apex Auto Parts"}` | 201 response with JWT token | ☐ |
| 4 | Log into the web app with `admin@apex.com` / `admin12345` | Dashboard loads, location selector appears | ☐ |
| 5 | Select a location, navigate to **POS** page | Product search works, 50k products searchable | ☐ |
| 6 | Search for a product by name (e.g., "brake") | Products appear with prices and stock levels | ☐ |

**UAT Sandbox is now live and ready for staff testing (SOP-UAT-001).**

---

## Part 2: Environment Variables & Secrets

### How Secrets Are Secured (Zero Exposure)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        SECRET FLOW DIAGRAM                          │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │  render.yaml │─── declares: JWT_SECRET: generateValue: true       │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────┐                                             │
│  │  Render Platform     │─── generates 64-char random secret         │
│  │  (at provision time) │    stores it encrypted in Render's vault   │
│  └──────┬──────────────┘                                             │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────┐                                             │
│  │  Service Runtime     │─── injected as process.env.JWT_SECRET      │
│  │  (apex-uat-api)      │    never written to disk, never in logs    │
│  └─────────────────────┘                                             │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │  render.yaml │─── declares: DATABASE_URL: fromDatabase: apex-db   │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────┐                                             │
│  │  Render Platform     │─── reads connection string from managed DB │
│  │  (at deploy time)    │    uses INTERNAL URL (private network)     │
│  └──────┬──────────────┘                                             │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────┐                                             │
│  │  Service Runtime     │─── injected as process.env.DATABASE_URL    │
│  │  (apex-uat-api)      │    traffic stays on Render's private net   │
│  └─────────────────────┘                                             │
│                                                                      │
│  WHAT IS NEVER EXPOSED:                                              │
│  ✗ No secrets in Git repository                                      │
│  ✗ No secrets in build logs                                          │
│  ✗ No secrets in source code                                         │
│  ✗ No .env file on Render servers                                    │
│  ✗ Database password never crosses the public internet                │
│    (internal URL = private network within Singapore region)          │
└──────────────────────────────────────────────────────────────────────┘
```

### Variable-by-Variable Breakdown

| Variable | Mechanism | Who Sets It | Where It Lives |
|----------|-----------|-------------|----------------|
| `DATABASE_URL` | `fromDatabase` directive in Blueprint | **Render automatically** — reads the internal connection string from the linked managed database | Render's encrypted vault → injected at runtime |
| `JWT_SECRET` | `generateValue: true` in Blueprint | **Render automatically** — generates a cryptographically random string at provision time | Render's encrypted vault → injected at runtime |
| `NODE_ENV` | Static value in Blueprint | **Blueprint YAML** — hardcoded to `production` | Visible in Blueprint file (not a secret) |
| `PORT` | Render convention | **Render automatically** — sets `PORT` to the dynamically assigned port for the service | Render runtime injection |
| `NEXT_PUBLIC_API_URL` | Manual entry in Dashboard | **IT Admin** — set after API service is deployed and its URL is known | Render Dashboard → Environment tab |

### How to View/Edit Secrets in Render Dashboard

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | Click on any service (e.g., `apex-uat-api`) | Service overview page |
| 2 | Click **Environment** in the left sidebar | List of all environment variables |
| 3 | `DATABASE_URL` — shows as "From apex-uat-db" (linked reference, not the raw value) | Connection string is hidden; Render resolves it at runtime |
| 4 | `JWT_SECRET` — shows as "Generated" with a masked value (`••••••••`) | Click the eye icon to reveal temporarily |
| 5 | To edit a value: click the pencil icon → modify → Save Changes | Triggers a redeploy prompt |

### Verifying Secrets Are Not Leaked

| Check | How | Expected | ✓ |
|-------|-----|----------|---|
| Git repository | `git log --all -p -- .env` | No results (`.env` was never committed) | ☐ |
| Build logs | Render Dashboard → Service → Events → click latest deploy → Build Logs | No `DATABASE_URL` or `JWT_SECRET` printed. Render redacts env vars from logs | ☐ |
| Browser DevTools | Open UAT web app → DevTools → Sources → search all files for "JWT_SECRET" | No matches. `NEXT_PUBLIC_API_URL` is visible (it's meant to be public) | ☐ |
| API response | `GET /health` | Does not expose any environment variables or internal URLs | ☐ |

---

## Part 3: The Cutover Trigger — Production Deployment

> **When to execute this:** Only after UAT testing is **signed off** (all 3 scenarios in SOP-UAT-001 passed) and the Go-Live Cutover Sequence (SOP-CUTOVER-001) has reached the Phase 5 GO decision.

### Step 3.1 — Create the Production Blueprint

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | From Render Dashboard, click **Blueprints** in the left sidebar | Blueprints page (UAT blueprint already listed) |
| 2 | Click **New Blueprint Instance** | "Create a new Blueprint Instance" form |
| 3 | Under **Repository**, select your **APEX_POS** repo | Repository selected |
| 4 | Under **Branch**, type `main` and select it | Branch set to `main` |
| 5 | Under **Blueprint file path**, keep the default: `render.yaml` | Production blueprint uses the default filename |
| 6 | Under **Blueprint Name**, enter: `APEX POS — Production` | Name set |
| 7 | Click **Apply** | Blueprint parsing begins |

Render will show the resource preview:

```
Resources to create:
  ☐ Database:    apex-db      (pro-4gb, Singapore, HA: enabled)
  ☐ Web Service: apex-api     (standard, Singapore)
  ☐ Web Service: apex-web     (standard, Singapore)
```

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 8 | Verify: database shows **pro-4gb** with **High Availability: enabled** | HA is on — this is critical |
| 9 | Verify: both web services show **standard** plan and **Singapore** region | Correct tier and region |
| 10 | Verify: Auto-deploy shows **No** for both services | Manual deploy only — never auto-deploy to production |
| 11 | Click **Apply** (or **Create Resources**) | Provisioning begins |

> **Provisioning Time:** Pro-tier database with HA takes 5–8 minutes. Web services build in 5–10 minutes. Total: ~15 minutes.

---

### Step 3.2 — Wait for Database, Then Run Migrations

| # | Action | Details |
|---|--------|---------|
| 1 | Wait for `apex-db` status to show **Available** | Green indicator on Database page |
| 2 | Verify **High Availability** is shown as **Enabled** in the database settings | Critical safety check |
| 3 | Click **Connect** → copy the **External Connection URL** | For running migrations from your local machine |

```bash
# On your local machine — temporary
export DATABASE_URL="postgresql://apex:PASSWORD@HOST:5432/apex_prod"

# Run Drizzle migrations
pnpm db:migrate

# Apply staging tables
psql "$DATABASE_URL" < packages/database/migrations/0007_phase9_migration_staging.sql

# Clear the env var immediately
unset DATABASE_URL
```

| # | Action | Expected |
|---|--------|----------|
| 4 | Confirm all migrations applied cleanly | `[✓]` for each migration file |
| 5 | Confirm staging tables created | `CREATE TABLE` × 7 |

> **Do NOT run `pnpm db:seed` on production.** Real data comes from the ETL migration pipeline during the cutover weekend.

---

### Step 3.3 — Set the Frontend API URL (Production)

| # | Click Path | What You'll See |
|---|------------|-----------------|
| 1 | Click on **apex-api** in Render Dashboard | Production API service page |
| 2 | Copy the service URL: `https://apex-api.onrender.com` | URL copied |
| 3 | Navigate to **apex-web** service | Production web frontend |
| 4 | Click **Environment** in the left sidebar | Environment variables |
| 5 | Find `NEXT_PUBLIC_API_URL` → click Edit | Edit field opens |
| 6 | Paste: `https://apex-api.onrender.com` (**no trailing slash**) | Value set |
| 7 | Click **Save Changes** → **Yes, deploy** when prompted | Frontend rebuilds with production API URL |

---

### Step 3.4 — Register the Production Organization

| # | Action | Command |
|---|--------|---------|
| 1 | Once `apex-api` shows healthy (green), register the admin account: | |

```bash
curl -X POST https://apex-api.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@apex.com",
    "password": "USE_A_STRONG_PASSWORD_HERE",
    "orgName": "Your Real Company Name"
  }'
```

| # | Action | Expected |
|---|--------|----------|
| 2 | Response: `201 Created` with a JWT token and org details | Admin user created |
| 3 | **Record the admin password securely** (password manager, not a sticky note) | — |

---

### Step 3.5 — Execute the ETL Migration (Cutover Weekend)

This follows SOP-CUTOVER-001, Phase 3. The steps here are infrastructure-specific:

| # | Action | Details |
|---|--------|---------|
| 1 | Copy the `apex-db` **External Connection URL** from Render Dashboard | For the ETL runner |
| 2 | On the migration machine, set the connection: | |

```bash
export DATABASE_URL="postgresql://apex:PASSWORD@HOST:5432/apex_prod"
export ORG_ID="the-org-id-from-registration-step"
```

| # | Action | Command |
|---|--------|---------|
| 3 | Place all 6 data files in `tools/migration/data/` | CSV/Excel files |
| 4 | Run the full pipeline: | |

```bash
cd tools/migration
pnpm migrate
```

| # | Action | Expected |
|---|--------|----------|
| 5 | Pipeline completes all 5 phases | Extract → Stage → Validate → Promote → Reconcile |
| 6 | Review `tools/migration/data/reconciliation-report.txt` | Promotion rate ≥ 98% |
| 7 | Clear the env vars immediately: | |

```bash
unset DATABASE_URL
unset ORG_ID
```

---

### Step 3.6 — Create Staff User Accounts

After the admin is registered and data is migrated, create accounts for each staff member:

```bash
# Log in as admin to get a JWT token
TOKEN=$(curl -s -X POST https://apex-api.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@apex.com","password":"YOUR_PASSWORD"}' \
  | jq -r '.token')

# Create a Manager account
curl -X POST https://apex-api.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "manager@yourcompany.com",
    "password": "STRONG_PASSWORD",
    "orgName": "Your Real Company Name"
  }'

# Repeat for each staff member with appropriate roles
```

> **Note:** Assign each user their primary location. Provide credentials to staff during the Monday morning briefing (SOP-CUTOVER-001, Phase 5).

---

### Step 3.7 — Final Production Verification

| # | Action | Expected Result | ✓ |
|---|--------|-----------------|---|
| 1 | `GET https://apex-api.onrender.com/health` | `{"status":"ok"}` | ☐ |
| 2 | Open `https://apex-web.onrender.com` | Login page renders | ☐ |
| 3 | Log in as admin | Dashboard loads | ☐ |
| 4 | Select a location | Location header updates | ☐ |
| 5 | Navigate to POS → search for a migrated product by SKU | Product found with correct price | ☐ |
| 6 | Navigate to Inventory → verify stock level matches `balances.csv` | Stock level correct | ☐ |
| 7 | Create and complete a test sale (1 product, qty 1) | Sale completes, stock deducted | ☐ |
| 8 | Navigate to Reports → verify KPIs populate | Revenue, job count visible | ☐ |
| 9 | Check Render Dashboard → `apex-db` → **High Availability: Enabled** | HA confirmed active | ☐ |
| 10 | Check Render Dashboard → `apex-db` → **Recovery** tab → PITR available | PITR retention shows 7 days | ☐ |

---

## Quick Reference: URL Map

| Environment | Service | URL |
|-------------|---------|-----|
| **UAT** | Frontend | `https://apex-uat-web.onrender.com` |
| **UAT** | API | `https://apex-uat-api.onrender.com` |
| **UAT** | API Health | `https://apex-uat-api.onrender.com/health` |
| **Production** | Frontend | `https://apex-web.onrender.com` |
| **Production** | API | `https://apex-api.onrender.com` |
| **Production** | API Health | `https://apex-api.onrender.com/health` |

> **Note:** Actual Render URLs may include a random suffix (e.g., `apex-api-abc1.onrender.com`). The above are illustrative. Use the real URLs shown in your Render Dashboard.

---

## Operational Runbook: Common Tasks

### Deploying a Code Fix to Production

| # | Action |
|---|--------|
| 1 | Merge the fix PR into `main` on GitHub |
| 2 | Open Render Dashboard → `apex-api` → **Manual Deploy** → select **Deploy latest commit** |
| 3 | Wait for build + health check to pass |
| 4 | If the fix includes frontend changes: repeat for `apex-web` |

### Deploying a Code Fix to UAT

| # | Action |
|---|--------|
| 1 | Merge the fix into `staging` on GitHub |
| 2 | UAT services auto-deploy (no manual action needed) |
| 3 | Monitor build logs for any failures |

### Rolling Back a Bad Production Deploy

| # | Action |
|---|--------|
| 1 | Open Render Dashboard → `apex-api` → **Events** tab |
| 2 | Find the **previous successful deploy** in the event list |
| 3 | Click the **three-dot menu** (⋮) next to it → **Rollback to this deploy** |
| 4 | Service redeploys the previous build instantly (no rebuild required) |
| 5 | Repeat for `apex-web` if needed |

### Checking Database Recovery (PITR)

| # | Action |
|---|--------|
| 1 | Open Render Dashboard → `apex-db` → **Recovery** tab |
| 2 | Select a target timestamp within the 7-day retention window |
| 3 | Click **Recover** — Render provisions a **new** database instance with the restored data |
| 4 | Update `apex-api` environment's `DATABASE_URL` to point to the recovered instance |
| 5 | Trigger a manual deploy to pick up the new connection string |

---

*End of Document — SOP-DEPLOY-001*
