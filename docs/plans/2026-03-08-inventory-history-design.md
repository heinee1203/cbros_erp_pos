# Inventory History — Full-Stack Design

**Date:** 2026-03-08
**Status:** Approved

## Summary

Build the authoritative stock movement audit trail as a full-stack feature: a new `GET /inventory/journal` backend endpoint backed by the existing `stock_journal` table, plus a dense frontend page at `/procurement/inventory-history` with shared components reusable by Stock Adjustments and future product views.

## Backend

### Endpoint: `GET /inventory/journal`

New module: `apps/api/src/modules/stock-journal/` (routes.ts + service.ts).
Registered in `app.ts` with prefix `/inventory/journal`.

### Scope & Auth

- Default: scoped to `storeContext.locationId` (respects X-Location-ID header)
- Optional `allLocations=true` param for cross-location viewing (admin/manager only)
- Multi-tenant isolation via `storeContext.orgId` always

### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| cursor | UUID | — | Keyset cursor (last entry ID) |
| limit | 1-100 | 50 | Page size |
| allLocations | boolean | false | Cross-location (admin/manager only) |
| locationId | UUID | — | Override to specific location |
| search | string | — | ILIKE on product name, exact on SKU |
| referenceType | enum | — | SALE, RECEIVING, ADJUSTMENT, etc. |
| direction | IN\|OUT | — | Filter by change_quantity sign |
| dateFrom | ISO | — | effective_at >= |
| dateTo | ISO | — | effective_at <= |
| reasonCode | enum | — | Adjustment reason filter |
| productId | UUID | — | Specific product filter |

### Pagination

Compound keyset on `(effective_at DESC, id DESC)`. Cursor is the entry `id`; query looks up cursor entry's `effective_at` and filters `WHERE (effective_at, id) < (cursorEffAt, cursorId)`.

### Joins

- products → name, sku, mnemonic_sku
- locations → name, type
- users → full_name (LEFT JOIN, nullable for SYSTEM actors)

### Response Shape

```typescript
PaginatedResponse<{
  id: string;
  effectiveAt: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  locationId: string;
  locationName: string;
  locationType: string;
  changeQuantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  referenceLineId: string | null;
  reasonCode: string | null;
  notes: string | null;
  actorType: string;
  actorName: string | null;
  reversalOfJournalId: string | null;
  createdAt: string;
}>
```

No `unitCostSnapshot` in response (no raw cost exposure).

### Search Strategy

Product search uses ILIKE `%search%` on product name (leverages existing pg_trgm GIN index). Also checks exact match on product SKU and mnemonic_sku via OR condition.

## Frontend

### Route

`/procurement/inventory-history` (existing shell, preserves IA consistency).

### Shared Components

1. **`hooks/use-stock-journal.ts`** — `useInfiniteQuery` wrapping `GET /inventory/journal` with all filter params. Reusable for Inventory History, Stock Adjustments history, product detail views.

2. **`components/journal-table.tsx`** — Dense reusable 11-column table: Date/Time, Product, SKU, Location, Movement Type (badge), Direction (badge), Qty Change (signed/colored), Balance After, Actor, Reference, Notes.

### Page Structure

- Header: icon, title, subtitle
- Filter bar: Location, Search, Reference Type, Direction, Date From/To, Reason Code, Clear
- Dense audit table with sticky header
- "Load More" infinite pagination
- Footer with count + status
- Empty state for no results

### Movement Type Badges

Color-coded by reference type category:
- Commerce: SALE, RETURN (blue tones)
- Supply chain: RECEIVING, TRANSFER_IN, TRANSFER_OUT (teal/cyan)
- Corrections: ADJUSTMENT, STOCKTAKE (amber)
- Service: JOB_CARD_ISSUE, JOB_CARD_RETURN (purple)
- System: VOID, OPENING_BALANCE (gray)

### Stock Adjustments Upgrade

After shared layer is built, Stock Adjustments page switches from mock data to:
```typescript
useStockJournal({ referenceType: "ADJUSTMENT" })
```

## Files to Create/Modify

### Backend (create)
- `apps/api/src/modules/stock-journal/service.ts`
- `apps/api/src/modules/stock-journal/routes.ts`

### Backend (modify)
- `apps/api/src/app.ts` — register new module

### Frontend (create)
- `apps/web/src/hooks/use-stock-journal.ts`
- `apps/web/src/components/journal-table.tsx`

### Frontend (modify)
- `apps/web/src/app/procurement/inventory-history/page.tsx`
- `apps/web/src/app/procurement/stock-adjustments/page.tsx` (switch off mock data)
