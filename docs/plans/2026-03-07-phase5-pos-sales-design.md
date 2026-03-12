# Phase 5: POS / Sales Sync — Design

## Summary
Build the POS checkout engine: sales state machine, line-level location validation, automotive-first lookup, idempotent checkout, and lightweight customer/vehicle model.

## Requirements (Locked)
1. State machine: QUOTE → OPEN → COMPLETED. Stock deducted ONLY on COMPLETED.
2. Line-level location: every sale line tied to active location, no global pooling.
3. Automotive-first: vehicle lookup + mnemonic-only for cashiers (no cost price).
4. Idempotent checkout: same TanStack Query pattern as Phase 4.
5. Optional customer/vehicle: nullable FKs, non-blocking attachment.
6. REFUNDED appends RETURN journal entries, never overwrites original.

## New Tables
- customers (id, orgId, name, phone, notes)
- customer_vehicles (id, orgId, customerId, make, model, year?, plateNo?, notes?)
- sales (id, orgId, saleNo, locationId, status, customerId?, customerVehicleId?, totals, user tracking, idempotencyKey?)
- sale_lines (id, saleId, orgId, productId, locationId, quantity, unitPrice, overridePrice?, discountAmount, lineTotal, notes?)

## State Transitions
- QUOTE → OPEN, VOIDED
- OPEN → COMPLETED, PARKED, VOIDED
- PARKED → OPEN, VOIDED
- COMPLETED → REFUNDED (admin/manager only)

## Backend Endpoints
- POST /sales, GET /sales/:id, GET /sales/by-number/:saleNo
- POST /sales/:id/park, /resume, /complete, /void, /refund
- GET /customers/search, POST /customers, POST /customers/:id/vehicles

## Frontend
- /pos route with split-panel layout
- Product search (mnemonic/SKU + vehicle-first lookup)
- Cart with optional customer attachment
- Idempotent checkout button
