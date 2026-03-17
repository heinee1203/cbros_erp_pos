# Multi-Receipt PO Receiving Flow — Design

## Problem
POs may arrive across multiple supplier shipments, each with its own Delivery Receipt (DR) number. The system needs to track which lines arrived in which delivery, prevent duplicate DR numbers, and show receipt history grouped by delivery.

## Design Decision
**Approach A: New batch header table** — `po_receipts` table links to `po_receipt_events` via FK. Enforces DR uniqueness at DB level, stores batch-level metadata cleanly.

## Phase 1: Database Schema

### New table: `po_receipts`
- id, org_id, purchase_order_id, supplier_dr_no, received_by_user_id
- line_count, total_accepted_qty, total_rejected_qty, notes, created_at
- Unique constraint: (org_id, purchase_order_id, supplier_dr_no)

### Modified: `po_receipt_events`
- Add `po_receipt_id UUID FK po_receipts(id) ON DELETE CASCADE`
- Existing rows without po_receipt_id remain NULL

### Migration: `0022_po_receipts.sql`

## Phase 2: API

### Schema change: `receivePOSchema`
- Add required `supplierDrNo: z.string().min(1).max(100)`

### Service change: `receivePO()`
1. Check DR uniqueness on this PO (error if duplicate)
2. Create `po_receipts` batch header after processing lines
3. Link each `po_receipt_event` to the batch via `po_receipt_id`

### New endpoint: `GET /:poNo/receipts`
- Returns receipts with nested line events, ordered by created_at DESC

## Phase 3: Web UI

### ReceivingGrid changes
- Checkbox column (first col) with Select All toggle
- DR Number input (required, above table)
- Unchecked rows dimmed (opacity-50)
- Scan auto-checks + highlights + fills remaining qty (preserving yellow fade)
- Post button shows DR number + selected line/unit count
- Button disabled if: no selection, empty DR, validation errors

### ReceiptHistory redesign
- Collapsible cards grouped by DR number
- Most recent expanded, older collapsed
- Each card: DR no, date, received-by, line count, unit count, line detail table

### Progress bar
- At top of PO detail: received/ordered ratio with green fill
- Shows receipt count + remaining items

## Phase 4: Hooks
- Add `supplierDrNo` to receive mutation payload
- New `usePOReceipts(token, locationId, poNo)` query hook
