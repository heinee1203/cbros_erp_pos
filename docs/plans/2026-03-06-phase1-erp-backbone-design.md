# Phase 1: ERP Backbone — Approved Design

**Date:** 2026-03-06
**Status:** Approved (with Project Lead additions)

## Overview

Cloud-native, multi-store ERP backend for automotive retail. pnpm monorepo with Fastify modular monolith, PostgreSQL via Drizzle ORM, Docker Compose for local dev, Render for deployment.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | pnpm | Fast, disk-efficient, workspace support |
| Local DB | Docker Compose (Postgres 16) | Portable, no local install |
| Multi-tenancy | Shared DB + org_id column | Simpler for 1-100 stores under one org |
| Architecture | Modular Monolith + Fastify plugins | Clean encapsulation, simple deployment |
| Monorepo | Yes (pnpm workspaces) | Share types between API, future POS, Web Admin |

## Workspace Structure

```
apex-pos/
├── pnpm-workspace.yaml
├── package.json                 # Root scripts, shared devDeps
├── tsconfig.base.json
├── docker-compose.yml           # Postgres 16
├── render.yaml                  # Render deployment blueprint
├── apps/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── app.ts           # Fastify instance + plugin registration
│           ├── server.ts        # Entry point
│           ├── plugins/
│           │   ├── auth.ts      # JWT auth hook
│           │   └── store-context.ts  # X-Location-ID middleware
│           └── modules/
│               ├── health/routes.ts
│               └── auth/
│                   ├── routes.ts
│                   └── service.ts
├── packages/
│   ├── database/
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.ts         # DB client export
│   │   │   ├── schema/          # One file per table
│   │   │   │   ├── organizations.ts
│   │   │   │   ├── locations.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── products.ts
│   │   │   │   ├── inventory.ts
│   │   │   │   ├── suppliers.ts
│   │   │   │   ├── stock-transfers.ts
│   │   │   │   └── index.ts
│   │   │   └── seed.ts          # 50k product generator
│   │   └── migrations/
│   └── types/
│       └── src/
│           ├── index.ts
│           ├── enums.ts
│           └── schemas.ts       # Zod validation schemas
```

## Database Schema

### organizations
- id (UUID PK), name, slug (UNIQUE), created_at, updated_at

### locations
- id (UUID PK), org_id (FK → organizations), name, type (enum: WAREHOUSE | RETAIL_STORE), address, created_at, updated_at
- Index: B-Tree on org_id

### users
- id (UUID PK), org_id (FK), primary_location_id (FK → locations), email (UNIQUE), password_hash, role (enum: ADMIN | MANAGER | CASHIER | WAREHOUSE_STAFF), created_at, updated_at

### products
- id (UUID PK), org_id (FK), name, sku, mnemonic_sku (VARCHAR(10), strict 10-char), category (enum: TIRES | LUBRICANTS | HARD_PARTS | ACCESSORIES | LABOR_SERVICES), unit_price (DECIMAL), cost_price (DECIMAL), created_at, updated_at
- Index: B-Tree on sku + mnemonic_sku
- Index: GIN trigram on name (pg_trgm extension)

### inventory
- id (UUID PK), product_id (FK), location_id (FK), stock_level (INT), reorder_point (INT), lead_time_days (INT), created_at, updated_at
- UNIQUE composite on (product_id, location_id)

### suppliers
- id (UUID PK), org_id (FK), name, contact_email, contact_phone, address, avg_lead_time_days (INT), created_at, updated_at
- Index: B-Tree on org_id

### stock_transfers (Phase 2 readiness)
- id (UUID PK), org_id (FK), source_location_id (FK → locations), destination_location_id (FK → locations), status (enum: DRAFT | PENDING | IN_TRANSIT | RECEIVED | CANCELLED), notes, created_by (FK → users), created_at, updated_at

### stock_transfer_items
- id (UUID PK), transfer_id (FK → stock_transfers), product_id (FK → products), quantity (INT), received_quantity (INT, nullable)

## Key Patterns

### Store-Context Middleware
- Fastify onRequest hook on all routes except /health and /auth/*
- Extracts X-Location-ID header, validates location belongs to user's org
- Decorates request with { locationId, orgId, locationType }

### JWT Auth
- @fastify/jwt, payload: { userId, orgId, role, primaryLocationId }
- POST /auth/register — creates org + first admin user
- POST /auth/login — email + password → JWT
- bcrypt for password hashing

### Keyset Pagination
- All list endpoints: ?cursor=<last_id>&limit=50
- WHERE id > cursor ORDER BY id ASC LIMIT limit+1
- Returns { data, nextCursor, hasMore }

### Mnemonic SKU
- Strictly typed as VARCHAR(10), 10-character constraint
- Maps to business's 10-letter pricing code (K=1, I=2, etc.)

## Seed Script
- Uses @faker-js/faker
- Generates 50,000 unique products with realistic automotive names
- Creates 1 Warehouse + 2 Retail Stores
- Distributes inventory across all locations
- Includes premium tire brands (Hankook, Nitto, etc.)

## Infrastructure
- docker-compose.yml: Postgres 16, port 5432, persistent volume
- render.yaml: Web Service (apps/api) + PostgreSQL
- Scripts: pnpm dev, pnpm db:generate, pnpm db:migrate, pnpm db:seed

## Verification Target
- GET /products with X-Location-ID returns paginated 50k items in <200ms
