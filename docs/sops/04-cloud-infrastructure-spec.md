# APEX POS — Cloud Infrastructure Specification (Render)

**Document:** SOP-INFRA-001
**Version:** 1.0
**Date:** 7 March 2026
**Classification:** Internal — IT Administration & Management
**Region:** Singapore (Asia-Pacific)

---

## 1. Environment Layout

APEX POS uses **two fully isolated Render environments** — each with its own services, database, and secrets. They share nothing except the Git repository (different branches).

```
┌─────────────────────────────────────────────────────────────────┐
│                     Git Repository (GitHub)                      │
│                                                                  │
│   main branch ──────► PRODUCTION Environment                     │
│   staging branch ───► UAT SANDBOX Environment                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌──── UAT SANDBOX (Render) ─────┐   ┌──── PRODUCTION (Render) ─────┐
│                                │   │                               │
│  apex-uat-web    (Next.js)     │   │  apex-web      (Next.js)      │
│  apex-uat-api    (Fastify)     │   │  apex-api      (Fastify)      │
│  apex-uat-db     (PostgreSQL)  │   │  apex-db       (PostgreSQL)   │
│                                │   │                               │
│  Branch: staging               │   │  Branch: main                 │
│  Auto-deploy: YES              │   │  Auto-deploy: NO (manual)     │
│                                │   │                               │
└────────────────────────────────┘   └───────────────────────────────┘
```

### Key Isolation Rules

| Property | UAT Sandbox | Production |
|----------|-------------|------------|
| **Git Branch** | `staging` | `main` |
| **Auto-Deploy** | Yes (every push to `staging`) | No — manual deploy only |
| **Database** | Separate instance, separate credentials | Separate instance, HA enabled |
| **JWT_SECRET** | Auto-generated (unique to UAT) | Auto-generated (unique to Prod) |
| **DATABASE_URL** | Points to `apex-uat-db` | Points to `apex-db` |
| **Seeded Data** | Test data via `pnpm db:seed` | Real data via ETL migration pipeline |
| **Purpose** | Staff training, UAT testing, safe experimentation | Live business operations |
| **Can be wiped?** | Yes — reset anytime | Never without rollback procedure |

### Why Two Render Blueprints?

Render supports Infrastructure-as-Code via `render.yaml` Blueprint files. We maintain **two blueprint files**:

- `render.yaml` — Production blueprint (deployed from `main`)
- `render-uat.yaml` — UAT Sandbox blueprint (deployed from `staging`)

Each blueprint is a self-contained declaration of all services, databases, and environment variables for that environment.

---

## 2. Sizing Tiers

### Recommended Configuration

| Component | UAT Sandbox | Production | Rationale |
|-----------|-------------|------------|-----------|
| **Next.js Frontend** | Starter ($7/mo) | Standard ($25/mo) | UAT has ≤5 concurrent users. Production serves all POS terminals, service desks, and warehouse stations simultaneously. Standard provides 2GB RAM for SSR rendering under load. |
| **Fastify API** | Starter ($7/mo) | Standard ($25/mo) | UAT runs single-user test scripts. Production handles concurrent POS checkouts, PO receiving, job card transitions, and BI report queries. Standard provides 1 CPU + 2GB RAM for sustained API throughput. |
| **PostgreSQL** | Basic-1gb ($19/mo) | Pro-4gb ($55/mo) | UAT needs only 50k seed products for testing. Production holds 46k live SKUs, daily transaction journals, customer records, and requires HA + PITR. Pro tier unlocks High Availability. |
| **Storage (DB)** | 10 GB ($3/mo) | 25 GB ($7.50/mo) | UAT data is disposable. Production needs headroom for 46k products, 150k+ inventory rows, growing journal entries, and staging tables during future re-migrations. |

### Monthly Cost Summary

| | UAT Sandbox | Production |
|---|---|---|
| Next.js Frontend | $7 | $25 |
| Fastify API | $7 | $25 |
| PostgreSQL (compute) | $19 | $55 |
| PostgreSQL (storage) | $3 | $7.50 |
| **Total** | **$36/mo** | **$112.50/mo** |
| **Combined** | | **$148.50/mo** |

### Scaling Path (When Needed)

If daily transaction volume exceeds ~500 sales/day or response times degrade:

| Upgrade | From → To | Cost Delta | Trigger |
|---------|-----------|------------|---------|
| API tier | Standard → Pro | +$60/mo | API p95 latency > 200ms on POS checkout |
| DB tier | Pro-4gb → Pro-8gb | +$45/mo | Connection pool exhaustion (>100 active connections) or query latency > 50ms on product search |
| Web tier | Standard → Pro | +$60/mo | SSR rendering p95 > 500ms under concurrent users |
| DB storage | 25GB → 50GB | +$7.50/mo | Storage utilization > 80% |

> **Note:** Render's Pro PostgreSQL tier supports up to **100 connections** — more than sufficient for the API's `max: 5` connection pool. Even with 10 concurrent API instances, you'd use only 50 connections.

---

## 3. Database Safety Configuration

### 3a. High Availability (HA)

| Setting | Value | Notes |
|---------|-------|-------|
| **Enabled** | Yes (Production only) | Pro tier includes HA capability |
| **Failover** | Automatic | Render promotes standby replica if primary fails |
| **Standby Region** | Same region (Singapore) | Render manages within the region |
| **RPO** | Near-zero | Synchronous replication to standby |
| **RTO** | < 60 seconds | Automatic failover with DNS update |

> **UAT does NOT need HA.** The Basic tier does not support it, and UAT downtime is acceptable.

### 3b. Point-in-Time Recovery (PITR)

| Setting | UAT Sandbox | Production |
|---------|-------------|------------|
| **Enabled** | Yes (automatic on all paid plans) | Yes (automatic) |
| **Retention** | 3 days | 7 days (Pro tier) |
| **Granularity** | Per-second | Per-second |
| **Restore Method** | Render Dashboard → Create Recovery → select timestamp | Same |

**PITR Procedure (Production):**

1. Open Render Dashboard → `apex-db` → Recovery
2. Select the target timestamp (e.g., "2 hours before data corruption")
3. Render creates a **new database instance** with the restored data
4. Update `DATABASE_URL` in the API service to point to the restored instance
5. Verify data integrity, then decommission the corrupted instance

> **PITR does NOT overwrite the existing database.** It creates a new instance. This is safe — you can compare both databases before switching.

### 3c. Automated Backups

| Setting | Value |
|---------|-------|
| **Daily snapshots** | Automatic (managed by Render) |
| **Snapshot retention** | 7 days (Pro tier) |
| **Manual backup** | `pg_dump` via external connection URL |
| **Backup verification** | Restore drill required before Go-Live (see Section 5) |

**Manual Backup Command (for off-platform archival):**

```bash
# From your local machine or a CI runner — NOT from the Render service
pg_dump "$RENDER_EXTERNAL_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="apex-backup-$(date +%Y%m%d-%H%M%S).dump"
```

> Store manual backups in a separate location (e.g., encrypted cloud storage). Render's PITR covers most scenarios, but off-platform backups protect against Render-level incidents.

### 3d. Connection Security

| Setting | Value |
|---------|-------|
| **Internal URL** | Used by Render services in the same region (no internet traversal) |
| **External URL** | Used only for manual `pg_dump`, migrations, and Drizzle Studio |
| **SSL** | Enforced on all connections (Render default) |
| **IP Allowlist** | Not applicable (Render uses private networking for internal connections) |

---

## 4. Environment Variables & Secrets

### 4a. Variable Inventory

Every APEX POS deployment requires these environment variables:

| Variable | Source | UAT Value | Production Value |
|----------|--------|-----------|------------------|
| `DATABASE_URL` | Render auto-inject | `fromDatabase: apex-uat-db` | `fromDatabase: apex-db` |
| `JWT_SECRET` | Render auto-generate | `generateValue: true` | `generateValue: true` |
| `NODE_ENV` | Static | `production` | `production` |
| `PORT` | Render auto-set | (Render sets this) | (Render sets this) |
| `NEXT_PUBLIC_API_URL` | Manual | `https://apex-uat-api.onrender.com` | `https://apex-api.onrender.com` |

### 4b. Secret Management Rules

| Rule | Details |
|------|---------|
| **Never commit secrets to Git** | `.env` is in `.gitignore`. Secrets live only in Render Dashboard or render.yaml `generateValue`. |
| **Never share secrets between UAT and Production** | Each environment auto-generates its own `JWT_SECRET`. Database URLs are auto-injected per environment. |
| **Never expose database external URLs** | External URLs are for admin use only (migrations, backups). Services use internal URLs exclusively. |
| **Rotate JWT_SECRET annually** | Generate a new value in Render Dashboard → Environment → `JWT_SECRET` → Edit. All active sessions will be invalidated (users must re-login). |
| **No `.env` files on Render** | Render injects environment variables directly into the service runtime. The `dotenv` import in `server.ts` is a no-op in production because `DATABASE_URL` is already in `process.env`. |

### 4c. Environment Group (Optional Optimization)

Render supports **Environment Groups** — shared variable sets that can be attached to multiple services. For APEX POS, this reduces duplication:

```
Environment Group: "apex-prod-shared"
  ├── NODE_ENV = production
  └── JWT_SECRET = (generated)

Attached to:
  ├── apex-api (inherits NODE_ENV, JWT_SECRET)
  └── apex-web (inherits NODE_ENV)
```

> Each service still gets its own `DATABASE_URL` and `NEXT_PUBLIC_API_URL` as service-level variables.

### 4d. The `.env` File — Local Development Only

```bash
# .env (monorepo root — NEVER committed, NEVER deployed)
DATABASE_URL=postgresql://apex:apex_secret@localhost:5433/apex_dev
JWT_SECRET=change-me-in-production-use-a-64-char-random-string
PORT=3000
NODE_ENV=development
```

This file is used **only** for local `pnpm dev`. Render deployments ignore it entirely.

---

## 5. Go-Live Infrastructure Checklist

### Drill 1: Backup & Restore Verification

**Purpose:** Prove that your database can be recovered from a catastrophic failure.
**When:** At least 3 days before Go-Live, after ETL migration has been tested on UAT.
**Duration:** ~30 minutes.

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Seed the UAT database (`pnpm db:seed`) | 50k products, 3 locations, 150k inventory rows | ☐ |
| 2 | Create 5 test sales via the UAT web app | 5 completed sales with stock deductions | ☐ |
| 3 | Record current timestamp: `______:______` | — | ☐ |
| 4 | **Simulate corruption:** Delete all products via Drizzle Studio or SQL: `DELETE FROM products WHERE org_id = '...'` | Products table is empty (catastrophic loss) | ☐ |
| 5 | Open Render Dashboard → `apex-uat-db` → Recovery | Recovery interface loads | ☐ |
| 6 | Select the timestamp from Step 3 (before the DELETE) | Render begins creating a recovery instance | ☐ |
| 7 | Wait for the recovery instance to provision (~5–10 min) | New database instance is "Available" | ☐ |
| 8 | Update `apex-uat-api` service's `DATABASE_URL` to point to the recovered database | API restarts with new connection | ☐ |
| 9 | Open UAT web app → search for a product | Products are restored — all 50k present | ☐ |
| 10 | Verify the 5 test sales still exist | Sales data intact from before corruption | ☐ |
| 11 | Delete the corrupted (old) database instance | Clean up | ☐ |

**Drill 1 Result:** ☐ PASS / ☐ FAIL — Date: __________

---

### Drill 2: Failover & Latency Verification

**Purpose:** Confirm that the Singapore-region deployment serves your POS terminals with acceptable latency, and that the API recovers from a restart.
**When:** At least 2 days before Go-Live.
**Duration:** ~15 minutes.

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | From a POS terminal at the shop, open browser DevTools → Network tab | Network tab visible | ☐ |
| 2 | Navigate to the APEX POS login page | Page loads. Note total load time: ______ms | ☐ |
| 3 | Log in and navigate to the POS page | Dashboard renders. Note API response time for initial data fetch: ______ms | ☐ |
| 4 | Search for a product by mnemonic SKU | Product appears. Note `/products?mnemonic_sku=` response time: ______ms | ☐ |
| 5 | **Acceptable latency thresholds:** | Page load < 3s, API calls < 500ms, Product search < 200ms | ☐ |
| 6 | In Render Dashboard, manually restart `apex-uat-api` (Deploy → Manual Deploy or Restart) | Service restarts | ☐ |
| 7 | Wait for health check: `GET /health` returns 200 | Service is healthy within 60 seconds | ☐ |
| 8 | Repeat product search from the POS terminal | Product search works normally after restart | ☐ |
| 9 | **Simulate network drop:** Disconnect POS terminal's WiFi for 30 seconds, then reconnect | — | ☐ |
| 10 | Retry product search after reconnection | Search succeeds. No data corruption or duplicate transactions | ☐ |

**Drill 2 Result:** ☐ PASS / ☐ FAIL — Date: __________

---

### Drill 3: Full ETL Migration Pipeline on Production-Equivalent Infrastructure

**Purpose:** Validate that the ETL pipeline completes successfully on Render's managed PostgreSQL (not just local Docker) with real production data files.
**When:** At least 1 day before Go-Live (during the cutover weekend's Saturday).
**Duration:** ~45 minutes (depends on data volume).

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1 | Provision a **temporary** Pro-4gb PostgreSQL instance on Render (same spec as production) | Instance available in Singapore region | ☐ |
| 2 | Run `pnpm db:migrate` against the temporary instance | All migrations applied (including `0007_phase9_migration_staging.sql`) | ☐ |
| 3 | Create an organization via `POST /auth/register` on a temporary API pointed at this DB | Org created, admin user exists | ☐ |
| 4 | Place the **real production data files** (locations, suppliers, products, customers, vehicles, balances) in `tools/migration/data/` | 6 files present | ☐ |
| 5 | Set `DATABASE_URL` to the temporary instance's external URL | Connection verified | ☐ |
| 6 | Run `pnpm migrate` (full pipeline) | Pipeline completes: Extract → Stage → Validate → Promote → Reconcile | ☐ |
| 7 | Note pipeline duration: ______ minutes | Expected: < 15 min for 46k products | ☐ |
| 8 | Review reconciliation report | Promotion rate ≥ 98% | ☐ |
| 9 | Spot-check 10 products via SQL on the temporary DB | Names, SKUs, prices, KINGSCOBRA codes correct | ☐ |
| 10 | Spot-check 5 inventory rows | Opening quantities match `balances.csv` | ☐ |
| 11 | Spot-check `stock_journal` entries with `reference_type = 'OPENING_BALANCE'` | Count matches `balances.csv` row count | ☐ |
| 12 | **Delete the temporary instance** (not needed for production — production gets its own fresh run) | Clean up to avoid unnecessary billing | ☐ |

**Drill 3 Result:** ☐ PASS / ☐ FAIL — Date: __________

---

### All Drills Complete

| Drill | Result | Date | Signed By |
|-------|--------|------|-----------|
| 1. Backup & Restore | ☐ PASS / ☐ FAIL | __________ | ______________ |
| 2. Failover & Latency | ☐ PASS / ☐ FAIL | __________ | ______________ |
| 3. ETL on Render Postgres | ☐ PASS / ☐ FAIL | __________ | ______________ |

**All 3 drills must PASS before Go-Live is authorized.**

| | |
|---|---|
| **Infrastructure Approved By:** | _________________________________ |
| **Date:** | _________________________________ |
| **Go-Live Authorized:** | ☐ YES &nbsp;&nbsp;&nbsp; ☐ NO — Drill(s) failed, re-test required |

---

*End of Document — SOP-INFRA-001*
