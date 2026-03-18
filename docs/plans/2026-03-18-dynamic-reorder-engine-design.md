# Dynamic Reorder Engine (Layer 2) — Design

**Date:** 2026-03-18
**Status:** Approved

## Overview

Data-driven reorder engine that computes per-SKU dynamic reorder points and suggested order quantities using sales velocity, supplier lead times, and ABC classification. Replaces static reorder points. Consumes Layer 1 stock_metrics and supplier_metrics.

## Schema

### reorder_suggestions table
orgId, productId (unique per org+product), sku, productName (denormalized), supplierId, supplierName, currentStock, pendingInbound, avgDailyDemand, demandStdDev, avgLeadTime, serviceLevelZ, safetyStock, reorderPoint, suggestedQty, targetStock, abcClass (A/B/C), priority (CRITICAL/URGENT/NORMAL enum), status (PENDING/ORDERED/DISMISSED enum), notes, computedAt, actionedAt, actionedBy.

### reorder_settings table
orgId + settingKey (unique), settingValue (text/JSON), updatedAt. Defaults: service_level=0.95, order_cycle_days=14, default_lead_time=7, abc_service_levels={"A":0.98,"B":0.95,"C":0.90}.

### Products table additions
reorderEnabled (boolean default true), customReorderPoint (integer nullable).

## Computation

Single refreshReorderSuggestions(orgId):
1. Refresh Layer 1 if stale (> 1 hour)
2. ABC classes from 90-day revenue: A=top 20% cumulative, B=next 30%, C=rest
3. Demand std dev: cross join (product_ids x generate_series dates) LEFT JOIN daily sales, then STDDEV_POP per product. Zero-sale days counted as 0.
4. Pending inbound: SUM(ordered_qty - received_accepted_qty) from open POs
5. Per product: resolve supplier, lead time, service level by ABC, compute ROP + SOQ
6. DELETE old PENDING, INSERT new. Preserve ORDERED/DISMISSED.

## API (prefix: /inventory/reorder)

- GET / — paginated suggestions with summary counts + total value
- GET /counts — lightweight badge counts {critical, urgent}
- GET /export — CSV
- GET /settings — org reorder settings
- PATCH /settings — update settings (ADMIN)
- POST /refresh — trigger recomputation
- PATCH /:id/dismiss — mark dismissed
- PATCH /:id/qty — update suggested qty
- POST /create-pos — bulk: group by supplier, create draft POs with cost prices pre-filled, mark ORDERED

## Frontend

Main page at /procurement/suggested-orders. Summary cards, filter bar, sortable table with inline qty editing, bulk select + Create POs, infinite scroll. Settings sub-page. Badge count on sidebar for critical+urgent.

## User Feedback (incorporated)

- ABC computed inline on each refresh (consistent 90-day window)
- Demand std dev uses product x date cross join to include zero-sale days
- POST /create-pos pre-fills cost prices from products table
- GET /counts endpoint for sidebar badge (lightweight, no full query)
