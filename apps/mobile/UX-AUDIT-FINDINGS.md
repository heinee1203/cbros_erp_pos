# CBROS Mobile POS — UX Flow Audit Findings

**Date:** 2026-04-06
**Auditor:** Claude Code
**App:** CBROS Android POS (React Native 0.79)
**Target device:** 10.1" Android tablet at retail counter

---

## Flow A: Ring Up a Sale (Happy Path)

**Tap count analysis:**
- Phone: 4 taps minimum (add item → navigate to cart → CHECKOUT → Complete)
- Tablet split-view: 3 taps (add item → CHECKOUT → Complete)
- With variants/variable price: +1 tap (select variant or enter price)

### Findings

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| A1 | Low | Scan-to-cart is instant for standard items. Variants and variable-price items correctly show a modal first. | No change needed. |
| A2 | Medium | After completing a sale, the app shows a "Sale Complete" success screen. The cashier must tap "New Sale" to return to catalog. No auto-return. | Add a 3-second auto-return timer with "New Sale" as immediate shortcut. During busy hours, this extra tap adds friction on every transaction. |
| A3 | Low | Favorites grid provides quick-add for common items. | Good. Consider adding a "Recent Items" row (last 5 sold) above favorites for repeat-order scenarios. |
| A4 | Info | Cart is NOT auto-cleared until "New Sale" is tapped. This is intentional — prevents accidental loss of multi-item orders. | Correct behavior. |

---

## Flow B: Manager Override (Price Override / Refund / Void)

### Findings

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| B1 | **Critical** | `ManagerPinModal` component exists and is polished, but it is **not wired into any UI flow**. No button triggers it. Price overrides, discounts, refunds, and voids can happen without manager authorization. | Wire `ManagerPinModal` into: (1) price override on cart lines, (2) manual discount > threshold, (3) void/refund from TransactionDetail. The Zustand store already has `setLinePriceOverride(lineId, price, approvedBy)`. |
| B2 | Medium | The modal shows "Manager Authorization Required" with the specific action being elevated — good design. But since it's unused, this is theoretical. | When implementing B1, pass the action description via the `action` prop. |
| B3 | Low | Audit trail is partial: approved overrides show `by {approvedBy}` on the cart line item, but there's no timestamp or centralized audit log screen. | Add timestamp to override display. Consider an "Audit Log" section in Settings or Transactions for managers. |

---

## Flow C: Held/Parked Cart

### Findings

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| C1 | **Critical** | Hold/park cart feature is **completely unimplemented in the UI**. The Zustand actions exist (`holdCurrentCart`, `restoreHeldCart`, `deleteHeldCart`), the storage layer works (max 5 carts), but **no button, menu, or screen exposes this functionality**. | Add: (1) "Hold" button in cart header, (2) "Held Carts" badge/counter on NavRail or cart pane, (3) "Held Carts" sheet listing held carts with preview + restore/delete actions. |
| C2 | Medium | When restoring a held cart, if the current cart has items, it's auto-held first. No confirmation dialog. | Add a brief confirmation: "Current cart will be held. Continue?" |
| C3 | Medium | No preview of held cart contents before restoring. `restoreHeldCart()` immediately replaces the active cart. | Show a bottom sheet listing held carts with: customer name (if any), item count, total, timestamp. Tap to restore. |

---

## Flow D: Offline Transaction

### Findings

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| D1 | Good | Dual offline indicators: NetworkBanner ("No internet — sales will be saved offline") + SyncStatusBar with color-coded states (offline/reconnecting/stale/fresh). | No change needed. Clear and visible. |
| D2 | Good | When checkout fails due to network, the app shows "Sale Saved Offline" screen with pending count. Idempotency keys prevent duplicate submissions on retry. | Excellent. No change needed. |
| D3 | Low | No explicit notification when sync completes. Cashier must observe SyncStatusBar changing from yellow/red to green. | Add a brief toast notification: "X pending sales synced successfully" when `reconcilePendingSales()` completes with successes. |
| D4 | Info | Reconciliation is safe: checks server for existing sale before retrying creation. Removes from queue on success. Marks as "failed" on business errors (e.g., receipt number conflict). | Excellent defensive programming. |

---

## Priority Summary

### Must Fix (Critical)
1. **C1** — Expose hold/park cart in UI (infrastructure exists, just needs buttons + list)
2. **B1** — Wire ManagerPinModal into permission-gated actions (price override, discount, void, refund)

### Should Fix (Medium)
3. **A2** — Auto-return to catalog after sale complete (3s timer)
4. **C2** — Confirmation dialog before auto-holding current cart
5. **C3** — Held cart preview before restore
6. **B3** — Add timestamp to override audit trail

### Nice to Have (Low)
7. **A3** — "Recent Items" row in catalog
8. **D3** — Toast notification on sync completion

---

## Architecture Notes

- The codebase is well-structured with clean separation: screens → hooks → stores → storage
- Theme system is comprehensive and properly tokens-based
- Zustand store has all the actions needed for held carts and overrides — only UI is missing
- Offline handling is robust with idempotency keys and reconciliation
- Permission system (`usePosPermission` hook) exists but is underutilized
