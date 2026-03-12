# Phase 4B: Inter-Store Transfer Details — Design

## Summary

Wire the Transfer Details UI to the Fastify backend using TanStack Query with the Pessimistic, Reconciliation-First architecture established in Phase 4A.

## Requirements (Locked)

1. Dedicated canonical route: `/transfers/[transferNo]`
2. Render actions strictly from backend `allowedActions[]` — no client inference
3. Line-based Receive modal capturing actual qty per line vs dispatched/remaining
4. Zero optimistic UI — submit then invalidate/refetch
5. Report Variance is a separate guarded workflow from Receive

## Backend Changes

### New endpoint: `GET /transfers/by-number/:transferNo`
- Resolves transfer by public `transfer_no` instead of internal UUID
- Returns full transfer detail enriched with `allowedActions`, location names, and product info

### `computeAllowedActions(transfer, role, activeLocationId)`
Server-side function that returns `string[]` of permitted actions based on:
- Transfer status (9-state machine)
- User role (ADMIN > MANAGER > WAREHOUSE_STAFF)
- Active location (determines if user is at source or destination)

### Enriched response shape
```
{
  transfer: { id, transferNo, status, notes, timestamps... },
  sourceLocation: { id, name, code, type },
  destinationLocation: { id, name, code, type },
  items: [{
    id, productId, mnemonicSku, productName, sku,
    requestedQty, dispatchedQty, receivedQty, varianceQty,
    remainingReceivable
  }],
  receipts: [...],
  allowedActions: ["receive", "report_variance"],
  actionLabels: { receive: "Receive into Downtown Store", ... }
}
```

## Frontend Components

### Transfer Detail Page (`/transfers/[transferNo]/page.tsx`)
- useQuery with key `["transfer", transferNo]`
- Header: transfer number hero, status badge, source -> destination
- Line items table with qty breakdown columns
- Action bar rendered from `allowedActions`
- Receipt history section

### Hooks
- `use-transfer-query.ts` — useQuery for transfer detail by number
- `use-transfer-mutations.ts` — useMutation hooks for dispatch, receive, variance, approve, cancel, start-picking

### Guarded Modals (on Transfer Detail page)
- ReceiveModal: line-based, per-item receiveNowQty inputs
- DispatchModal: line-based, per-item dispatchNowQty inputs
- VarianceModal: line-based, per-item varianceQty + reasonCode
- ApproveModal: confirmation + notes
- CancelModal: confirmation + notes
- StartPickingModal: confirmation only

All modals: fresh refetch before open, idempotency key on submit, enterprise error handling.

## Files

| File | Action |
|------|--------|
| `apps/api/src/modules/transfers/service.ts` | Add `getTransferByNumber()`, `computeAllowedActions()` |
| `apps/api/src/modules/transfers/routes.ts` | Add `GET /by-number/:transferNo`, update response |
| `apps/web/src/app/transfers/[transferNo]/page.tsx` | New page |
| `apps/web/src/hooks/use-transfer-query.ts` | New query hook |
| `apps/web/src/hooks/use-transfer-mutations.ts` | New mutation hooks |
