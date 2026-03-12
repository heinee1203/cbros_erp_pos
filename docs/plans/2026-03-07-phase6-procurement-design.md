# Phase 6: Procurement / Purchase Orders — Design

## State Machine

```
DRAFT ──→ SUBMITTED ──→ PARTIALLY_RECEIVED ──→ FULLY_RECEIVED (terminal)
  │           │               │
  └→ CANCELLED └→ CANCELLED   └→ CLOSED_WITH_VARIANCE (terminal)
```

| From | To | Trigger |
|------|----|---------|
| DRAFT | SUBMITTED | Manager/Admin submits |
| DRAFT | CANCELLED | Cancel before submission |
| SUBMITTED | PARTIALLY_RECEIVED | First receipt (not all lines fulfilled) |
| SUBMITTED | FULLY_RECEIVED | Single receipt fulfills all lines |
| SUBMITTED | CANCELLED | Cancel before any receipt |
| PARTIALLY_RECEIVED | PARTIALLY_RECEIVED | Additional receipt (still incomplete) |
| PARTIALLY_RECEIVED | FULLY_RECEIVED | Final receipt completes all lines |
| PARTIALLY_RECEIVED | CLOSED_WITH_VARIANCE | Manager closes remaining undelivered |

**Stock rule:** DRAFT and SUBMITTED = zero inventory effect. Only accepted receipt events touch inventory.

## Database Tables

### `purchase_orders`
- id, orgId, poNo (unique per org, e.g. PO-000001)
- supplierId FK → suppliers
- destinationLocationId FK → locations
- status pgEnum (DRAFT, SUBMITTED, PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED_WITH_VARIANCE, CANCELLED)
- expectedDeliveryDate (nullable)
- notes
- createdByUserId, submittedByUserId, closedByUserId
- submittedAt, completedAt, createdAt, updatedAt

### `po_lines`
- id, poId FK CASCADE, orgId, productId FK
- orderedQty (CHECK > 0)
- unitCost numeric(12,2)
- receivedAcceptedQty int default 0 (running total)
- rejectedQty int default 0 (permanently closed out items only)
- createdAt, updatedAt

### `po_receipt_events` (immutable ledger)
- id, orgId, poId FK, poLineId FK, locationId FK
- receivedAcceptedQty int (CHECK >= 0)
- rejectedQty int (CHECK >= 0)
- CHECK (received_accepted_qty + rejected_qty > 0) — at least one must be > 0
- unitCost numeric(12,2)
- receivedByUserId FK
- notes
- createdAt only (no updatedAt)

### Product schema changes
- Add `currentCostPrice` numeric(12,2) — Last Received Cost
- Add `mnemonicCostCode` varchar(10) — deterministic cipher of currentCostPrice

## Mnemonic Cost Code Algorithm

Cipher word: **KINGSCOBRA**
```
K=1, I=2, N=3, G=4, S=5, C=6, O=7, B=8, R=9, A=0
```

`generateCostCode(costPrice: string): string`
1. Parse to integer centavos: "3152.50" → 315250
2. Left-pad to 10 digits: "0000315250"
3. Map each digit: 0→A, 0→A, 0→A, 0→A, 3→N, 1→K, 5→S, 2→I, 5→S, 0→A
4. Result: "AAAANKSIS A" → "AAAANKSISA"

Helper location: `packages/types/src/mnemonic.ts`

## Receiving Transaction — Concurrency & Accounting

All within a single `db.transaction()`:

1. **Lock PO** via SELECT ... FOR UPDATE
2. Validate status is SUBMITTED or PARTIALLY_RECEIVED
3. **Sort receipt lines by poLineId** (deterministic lock ordering)
4. For each receipt line (in sorted order):
   a. **Lock po_line** via SELECT ... FOR UPDATE (ordered by id)
   b. Validate: `accepted + rejected > 0` per line
   c. Validate: `(line.receivedAcceptedQty + accepted) + (line.rejectedQty + rejected) <= orderedQty`
   d. **Insert po_receipt_event** (immutable)
   e. Update po_line: increment receivedAcceptedQty and rejectedQty
   f. **If accepted > 0:**
      - Lock inventory row (create-or-select race-safe, then FOR UPDATE)
      - Increase stockLevel by accepted qty
      - Insert RECEIVING journal entry with:
        - referenceId = **po_receipt_event.id** (not PO header)
        - referenceLineId = poLineId
        - unitCostSnapshot = unitCost
        - idempotencyKey = `${batchKey}:RECEIVE:${poLineId}`
      - **Lock product row** via SELECT ... FOR UPDATE
      - Update product.currentCostPrice = unitCost
      - Regenerate product.mnemonicCostCode via generateCostCode()
   g. **If accepted = 0 (rejected-only):** do NOT update product cost
5. **Enforce receiving location** = PO's destinationLocationId (hardcoded for Phase 6)
6. Recompute PO status
7. Return updated PO with receipt events

### rejectedQty semantics
- Only counts items **permanently closed out** (defective, wrong item)
- Damaged items awaiting supplier replacement → capture in receipt `notes`, do NOT increment rejectedQty (leaves balance open for future delivery)

### Idempotency
- `receivePOSchema` requires `idempotencyKey`
- Per-line journal keys: `${idempotencyKey}:RECEIVE:${poLineId}`
- 409 on duplicate journal key = already processed
- TanStack Query mutation hook follows same 409/423/5xx pattern

## API Routes

| Method | Path | Action |
|--------|------|--------|
| POST | /purchase-orders | Create DRAFT with lines |
| POST | /purchase-orders/:id/submit | DRAFT → SUBMITTED |
| POST | /purchase-orders/:id/receive | Accept/reject delivery (critical path) |
| POST | /purchase-orders/:id/close-variance | Close with undelivered |
| POST | /purchase-orders/:id/cancel | Cancel (DRAFT/SUBMITTED only) |
| GET | /purchase-orders/:id | Detail with enriched lines + receipts |
| GET | /purchase-orders/by-number/:poNo | Resolve by public PO number |
| GET | /purchase-orders/:id/journal | RECEIVING audit trail |

## Types

- `PurchaseOrderStatus` enum + `PO_TRANSITIONS` + `isValidPOTransition()`
- Zod: createPOSchema, submitPOSchema, receivePOSchema, closeVariancePOSchema, cancelPOSchema
- receivePOSchema lines: `{ poLineId, receivedAcceptedQty, rejectedQty, unitCost, notes? }`
