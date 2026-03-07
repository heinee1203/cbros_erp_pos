# Phase 2: Enterprise Guardrails + Desktop Admin — Approved Design

**Date:** 2026-03-07
**Status:** Approved (with ERP Consultant hardening + idempotency guardrail)

## Overview

Three database guardrails (stock journal, product families, vehicle compatibility) plus a Next.js admin shell with a high-density inventory manager UI.

## Database: New Tables

### stock_journal (Immutable Ledger)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| org_id | UUID FK → organizations | Multi-tenant |
| product_id | UUID FK → products | |
| location_id | UUID FK → locations | |
| user_id | UUID FK → users, nullable | null if SYSTEM |
| change_quantity | INTEGER | + for IN, - for OUT |
| balance_after | INTEGER | Snapshot after entry |
| reference_type | ENUM | SALE, RECEIVING, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT, RETURN, STOCKTAKE, VOID |
| reference_id | UUID | Source record |
| reference_line_id | UUID, nullable | Granular line-item |
| idempotency_key | VARCHAR(255), UNIQUE | Computed: `{reference_type}:{reference_id}:{reference_line_id or 'ROOT'}` |
| unit_cost_snapshot | NUMERIC(12,2) | Cost at time of movement |
| actor_type | ENUM | USER, SYSTEM |
| effective_at | TIMESTAMPTZ | When event occurred |
| notes | VARCHAR(500) | |
| created_at | TIMESTAMPTZ | No updated_at — immutable |

Indexes: B-Tree on (product_id, location_id), B-Tree on reference_type, B-Tree on effective_at.
Idempotency: UNIQUE on idempotency_key (prevents double-posting on retries).

### product_families

| Column | Type |
|--------|------|
| id | UUID PK |
| org_id | UUID FK → organizations |
| name | VARCHAR(255) |
| slug | VARCHAR(255) |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |

UNIQUE composite on (org_id, slug).

### vehicle_compatibility

| Column | Type |
|--------|------|
| id | UUID PK |
| product_id | UUID FK → products |
| make | VARCHAR(100) |
| model | VARCHAR(100) |
| year_start | INTEGER |
| year_end | INTEGER |
| engine | VARCHAR(100), nullable |
| notes | VARCHAR(255), nullable |
| created_at | TIMESTAMPTZ |

Indexes: B-Tree on product_id, composite on (make, model).

## Database: Modifications to Existing Tables

### products — add family_id
- `family_id UUID FK → product_families, nullable`
- Index on family_id

### inventory — add CHECK
- `CHECK (stock_level >= 0)`

### stock_transfer_items — add CHECK
- `CHECK (quantity > 0)`

## Shared Types Updates

New enums: JournalReferenceType, ActorType
New Zod schemas for journal entries, product families, vehicle compatibility

## Frontend: Next.js Admin Shell

Stack: Next.js 15 (App Router), Tailwind CSS v4, ShadcnUI, @apex/types

Layout: Sidebar nav + top bar + right-side detail drawer
Inventory page: Two tabs (Quick Search / Full Inventory), shared useInventorySearch() hook
Detail drawer: Product info, stock levels, journal history, compatibility list

Aesthetic: Geist font, neutral grays, 1px borders, stock status colors only
