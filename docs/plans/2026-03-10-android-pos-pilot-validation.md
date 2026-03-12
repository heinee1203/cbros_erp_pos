# Android POS Pilot Validation Plan

> **For Claude:** This is a testing/validation plan, NOT a feature implementation plan. Execute each task as a structured test protocol. Record PASS/FAIL results and file defects for any failures. Use superpowers:systematic-debugging for any defects found.

**Goal:** Validate the Phase 1 Android POS app under real hardware, real cashier workflows, and real failure conditions before internal pilot rollout.

**Scope:** Defect discovery, operational stability, and hardware compatibility — NOT new features.

**Prerequisites:**
- Android device (physical, not emulator) with USB debugging enabled
- HID barcode scanner (USB or Bluetooth keyboard-wedge mode)
- Bluetooth thermal receipt printer (58mm or 80mm ESC/POS compatible)
- APEX API running at a reachable network address (not localhost)
- Seeded database (50k products via `pnpm db:seed`)
- At least 2 user accounts: one ADMIN, one CASHIER
- At least 2 retail locations configured

---

## Track 1: Real Hardware Testing

### Task 1: Android Device Build & Launch

**Goal:** Verify the app builds, installs, and launches on a physical Android device.

**Steps:**

1. Connect Android device via USB, verify `adb devices` shows the device
2. Set API_BASE_URL to the server's LAN IP (e.g., `http://192.168.1.100:3000`)
3. Build and install:

```bash
cd apps/mobile
npx react-native run-android --device
```

4. App should launch and show the ServerConfig screen (first run)

**Pass criteria:**
- [ ] App installs without build errors
- [ ] ServerConfig screen renders correctly
- [ ] Keyboard input works in the URL field
- [ ] After saving URL + logging in, MainTabs (POS/Transactions/Settings) appear
- [ ] Initial catalog sync completes (pull-to-refresh on Catalog)

**Fail actions:** Record exact build error, device model, Android version, and stack trace.

---

### Task 2: HID Barcode Scanner Integration

**Goal:** Verify the HID scanner adapter correctly captures barcodes and adds products to cart with zero unnecessary taps.

**Prerequisites:** HID barcode scanner connected to device (USB OTG or BT keyboard-wedge).

**Test 2.1: Basic scan-to-cart**

1. Navigate to Catalog screen
2. Scan a known product barcode with the HID scanner
3. Observe behavior

**Pass criteria:**
- [ ] Product is added to cart automatically (no tap required)
- [ ] Green toast banner `"✓ [Product Name]"` appears and auto-dismisses (~1.5s)
- [ ] Cart badge count in header increments
- [ ] No blocking Alert dialog appears

**Test 2.2: Rapid sequential scanning**

1. Scan 5 different products in quick succession (< 2 seconds between scans)
2. Observe each scan result

**Pass criteria:**
- [ ] All 5 products appear in cart with correct quantities
- [ ] Toast shows for each scan (stacking or replacing previous)
- [ ] No missed scans, no duplicate entries (unless same product scanned twice → qty increments)
- [ ] App remains responsive between scans

**Test 2.3: Scanner vs. manual typing isolation**

1. Navigate to Catalog screen
2. Tap the search input field
3. Type "MOBIL" slowly on the device keyboard (not scanner)
4. Verify NO scan event fires (manual typing must not trigger addLine)
5. Now scan a barcode while search field is focused

**Pass criteria:**
- [ ] Manual keyboard typing only populates the search field, never triggers addLine
- [ ] HID scanner input while search is focused: does it add to cart or populate search?
  - **Expected:** Scanner input captured by HID adapter (listening=true), not by search field
  - **Defect if:** Barcode text appears in search field instead of adding to cart

**Test 2.4: Unknown barcode handling**

1. Scan a barcode that does NOT exist in the catalog (e.g., a random grocery item)

**Pass criteria:**
- [ ] Alert dialog appears: "Not Found — No product found for barcode [barcode]"
- [ ] No crash, no empty cart line added
- [ ] App returns to normal scan-ready state after dismissing alert

**Test 2.5: Scanner on non-Catalog screens**

1. Navigate to Transactions tab
2. Scan a barcode
3. Navigate to Settings tab
4. Scan a barcode

**Pass criteria:**
- [ ] No scan event fires on non-Catalog screens (scanner.stopListening() on unmount)
- [ ] No crash, no unexpected navigation
- [ ] Returning to POS/Catalog tab: scanner resumes listening

---

### Task 3: Bluetooth Thermal Printer Integration

**Goal:** Verify BLE printer discovery, connection, receipt printing, and graceful failure handling.

**Test 3.1: Printer discovery**

1. Navigate to Settings → Printer Setup
2. Power on the Bluetooth printer
3. Tap "Scan for Printers"

**Pass criteria:**
- [ ] Printer appears in the device list with name and address
- [ ] RSSI (signal strength) displayed if available
- [ ] Discovery completes within 10 seconds
- [ ] Multiple scans don't produce duplicate entries

**Test 3.2: Printer connection**

1. Tap the discovered printer to connect
2. Observe connection status

**Pass criteria:**
- [ ] "Connected" alert appears
- [ ] Status dot turns green
- [ ] "Test Print" and "Disconnect" buttons appear
- [ ] Printer device ID saved (verify in Settings: printer shows as connected after navigating away and back)

**Test 3.3: Test print**

1. While connected, tap "Test Print"

**Pass criteria:**
- [ ] Printer produces a test receipt
- [ ] Text is legible, aligned correctly
- [ ] Paper width matches selection (58mm or 80mm)
- [ ] No garbled characters or missing lines

**Test 3.4: Receipt print after checkout**

1. Add 3 products to cart via scan or tap
2. Select CASH payment, enter cash tendered ≥ grand total
3. Tap "Charge"
4. Observe receipt output

**Pass criteria:**
- [ ] Receipt prints automatically after "Sale Complete" screen appears
- [ ] Receipt contains: store name, receipt number, date, cashier name
- [ ] Receipt contains: all 3 line items with name, qty, unit price, line total
- [ ] Receipt contains: subtotal, grand total, payment method, cash tendered, change
- [ ] Receipt footer shows "Thank you for your purchase!"
- [ ] **Sale is marked complete BEFORE printing starts** (non-blocking)

**Test 3.5: Print failure graceful handling**

1. Disconnect or power off the printer
2. Complete a sale (add product, charge)

**Pass criteria:**
- [ ] Sale completes successfully (success screen shown)
- [ ] Alert appears: "Receipt could not be printed. You can reprint from Transactions."
- [ ] Sale is NOT rolled back — it remains in the server
- [ ] Reprint works after reconnecting printer (via Transactions → Detail → Reprint)

**Test 3.6: Reprint from Transactions**

1. Navigate to Transactions tab
2. Tap a previously completed sale
3. Tap "Reprint"

**Pass criteria:**
- [ ] Receipt prints with same data as original
- [ ] Footer shows `"** REPRINT **"` instead of original footer
- [ ] All line items, totals, and payment info match the original

**Test 3.7: Paper width toggle**

1. In Printer Setup, switch paper width from 80mm to 58mm
2. Print a test page or receipt

**Pass criteria:**
- [ ] Receipt wraps correctly for 58mm paper (32 chars per line)
- [ ] No text cutoff or overlap
- [ ] Switching back to 80mm produces correctly formatted 48-char-wide receipts

**Test 3.8: Auto-reconnect on app restart**

1. With printer connected, force-close the app
2. Reopen the app
3. Check Settings → Printer Setup

**Pass criteria:**
- [ ] App attempts auto-reconnect to last known printer
- [ ] If printer is powered on: auto-connect succeeds silently
- [ ] If printer is powered off: no crash, status shows "Not connected"

---

## Track 2: Cashier Workflow Speed & Stability

### Task 4: Full Sale Cycle Speed Test

**Goal:** Time a complete sale workflow end-to-end. Target: < 30 seconds for a 3-item cash sale.

**Steps:**

1. Start timer
2. From Catalog screen, scan 3 products
3. Tap "Cart" button
4. Verify totals are correct
5. Select CASH, enter cash tendered
6. Tap "Charge"
7. Observe success screen
8. Tap "New Sale"
9. Stop timer

**Pass criteria:**
- [ ] Total time < 30 seconds for practiced cashier
- [ ] No noticeable lag between scan and toast
- [ ] Cart navigation is instant
- [ ] Charge button responds within 1 second
- [ ] Server response (sale creation + completion) < 3 seconds
- [ ] "New Sale" returns to clean Catalog screen

**Record:** Actual time: ____s. Any lag points: ________________

---

### Task 5: Cart Persistence Under Stress

**Goal:** Verify cart survives app kill, crash, and device rotation.

**Test 5.1: App kill mid-cart**

1. Add 3 products to cart
2. Force-close the app (swipe away from recent apps)
3. Reopen the app, navigate to Catalog → Cart

**Pass criteria:**
- [ ] All 3 products present with correct quantities
- [ ] Payment method and any entered cash tendered preserved
- [ ] Customer attachment preserved (if set)

**Test 5.2: Device rotation**

1. Add products to cart
2. Rotate device (portrait ↔ landscape)
3. Check cart state

**Pass criteria:**
- [ ] Cart state unchanged after rotation
- [ ] Layout adapts (or is locked to portrait — either is acceptable)

**Test 5.3: Low memory / background kill**

1. Add products to cart
2. Open many other apps to pressure memory
3. Return to APEX POS

**Pass criteria:**
- [ ] Cart restored from MMKV persistence
- [ ] No crash on restoration

---

### Task 6: Catalog Search Performance

**Goal:** Verify local WatermelonDB search is fast and accurate on 50k products.

**Test 6.1: Name search**

1. Type "Mobil" in search bar
2. Observe results and timing

**Pass criteria:**
- [ ] Results appear within 200ms of debounce (400ms total from typing)
- [ ] Results contain products with "Mobil" in name
- [ ] Stock badge colors match actual inventory levels

**Test 6.2: SKU search**

1. Type a known SKU (10-char mnemonic or full SKU)
2. Observe results

**Pass criteria:**
- [ ] Exact or partial SKU match returned
- [ ] Mnemonic SKU search works (e.g., typing "LUBOIL" prefix)

**Test 6.3: Category filter**

1. Tap "TIRES" category chip
2. Verify only tire products shown
3. Tap "TIRES" again to deselect
4. Verify all products shown

**Pass criteria:**
- [ ] Category filter restricts results correctly
- [ ] Category + text search work together
- [ ] "All" chip resets filter

**Test 6.4: Pull-to-refresh sync**

1. On Catalog screen, pull down to refresh
2. Observe sync behavior

**Pass criteria:**
- [ ] Full sync runs (catalog + inventory)
- [ ] Results update with any server-side changes
- [ ] Refresh indicator animates during sync

---

## Track 3: Connectivity Disruption & Recovery

### Task 7: Offline Sale → Online Reconciliation

**Goal:** Verify the reconciliation-first checkout recovery pattern under real network disruption.

**Test 7.1: Airplane mode during checkout**

1. Add products to cart, navigate to Cart screen
2. Enable airplane mode on the device
3. Tap "Charge"

**Pass criteria:**
- [ ] Sale status transitions to `pending_offline`
- [ ] Pending screen shows: "Sale saved locally. It will be completed when the device is back online."
- [ ] "New Sale" button works, returns to Catalog
- [ ] Pending sale stored in MMKV (verify in Settings: pending sales count > 0)

**Test 7.2: Disable airplane mode → auto-reconciliation**

1. With 1 pending sale, disable airplane mode
2. Observe network monitor behavior

**Pass criteria:**
- [ ] SyncStatusBar shows "Reconnecting..." (blue bar)
- [ ] `reconcilePendingSales()` runs automatically
- [ ] Pending sale either:
  - Completes successfully on server (removed from pending queue), OR
  - Was already completed (GET by-idempotency-key returns 200 → removed)
- [ ] `runFullSync()` runs after reconciliation
- [ ] SyncStatusBar returns to normal (hidden)
- [ ] Settings → Pending Sales count drops to 0
- [ ] Transaction list shows the reconciled sale

**Test 7.3: Network drop DURING checkout (mid-request)**

1. Add product to cart
2. Start checkout (tap "Charge")
3. Immediately toggle airplane mode ON during the API call

**Pass criteria:**
- [ ] App handles timeout gracefully (no crash)
- [ ] Sale transitions to `pending_offline` (not error)
- [ ] Pending sale stored with correct idempotency key
- [ ] On reconnect: reconciliation check runs → sale either completes or is found already completed

**Test 7.4: Multiple pending sales accumulation**

1. Enable airplane mode
2. Complete 3 separate sales (each should go to `pending_offline`)
3. Disable airplane mode

**Pass criteria:**
- [ ] All 3 pending sales listed in Settings
- [ ] On reconnect: all 3 reconciled in sequence
- [ ] Server shows all 3 sales completed
- [ ] No duplicate sales created (idempotency keys prevent this)
- [ ] Pending count returns to 0

**Test 7.5: Server down (not just offline)**

1. Stop the API server (`Ctrl+C` the dev server)
2. With app running, attempt a checkout

**Pass criteria:**
- [ ] Sale goes to `pending_offline` (ApiError status 0 / network error)
- [ ] App does not crash
- [ ] Restart API server → reconnect triggers reconciliation → sale completes

---

### Task 8: Sync Staleness & Offline Catalog

**Goal:** Verify SyncStatusBar behavior and catalog usability during prolonged offline periods.

**Test 8.1: Stale sync indicator**

1. Sync the catalog (pull-to-refresh)
2. Wait > 5 minutes without syncing
3. Observe SyncStatusBar

**Pass criteria:**
- [ ] After 5 minutes: subtle gray bar appears "Last sync: 5m ago"
- [ ] Bar is non-intrusive (does not block interaction)
- [ ] Pull-to-refresh on Catalog clears the stale indicator

**Test 8.2: Offline catalog search**

1. Sync catalog while online
2. Enable airplane mode
3. Search for products, scan barcodes

**Pass criteria:**
- [ ] All catalog searches work locally (WatermelonDB)
- [ ] Barcode scanning works locally
- [ ] Stock levels displayed from last sync (may be stale but present)
- [ ] SyncStatusBar shows amber "Offline — working from local data"
- [ ] No errors thrown when searching offline

**Test 8.3: Offline → online inventory accuracy**

1. While online, note stock level of product A
2. From another terminal, create a sale with product A (reducing stock)
3. On mobile, sync inventory (pull-to-refresh)
4. Verify stock level updated

**Pass criteria:**
- [ ] Stock level decreases after sync
- [ ] StockBadge color updates if threshold crossed (green → yellow → red)

---

## Track 4: Sign-in / Location / Device Persistence

### Task 9: Authentication Flow

**Test 9.1: Fresh login**

1. Uninstall and reinstall the app (or clear app data)
2. Launch app → ServerConfig should appear
3. Enter API URL, save
4. Login with CASHIER credentials

**Pass criteria:**
- [ ] ServerConfig appears only on first launch
- [ ] Login succeeds, MainTabs appear
- [ ] User name and role shown in Settings

**Test 9.2: App restart preserves session**

1. While logged in, force-close the app
2. Reopen

**Pass criteria:**
- [ ] App skips ServerConfig and Login
- [ ] Goes directly to MainTabs (POS tab)
- [ ] Correct user info shown in Settings

**Test 9.3: Token expiry**

1. Login, then wait for JWT to expire (check exp claim — default 24h)
2. Or: manually modify the token in secure storage to be expired

**Pass criteria:**
- [ ] App detects expired token on next API call
- [ ] User is redirected to Login screen
- [ ] Device settings (API URL, printer) preserved

**Test 9.4: Sign out clears auth, preserves device config**

1. Login, configure printer, sync catalog
2. Sign out from Settings
3. Observe what's cleared vs. preserved

**Pass criteria:**
- [ ] Login screen appears
- [ ] API URL field still populated (device setting preserved)
- [ ] Printer config preserved (device ID, paper width)
- [ ] Scanner mode preserved
- [ ] Pending sales NOT deleted (warning shown before sign-out if any exist)
- [ ] Cart cleared for this location (location-scoped key removed with auth)
- [ ] Re-login: printer auto-reconnects, catalog available from WatermelonDB cache

---

### Task 10: Multi-Location Behavior

**Test 10.1: Default location assignment**

1. Login with a user that has access to multiple locations
2. Check Settings: which location is shown?

**Pass criteria:**
- [ ] First retail/store location auto-selected
- [ ] Location name displayed in Settings

**Test 10.2: Location-scoped cart isolation**

1. Login, add products to cart at Location A
2. Sign out, sign in at Location B (if possible via admin reassignment)
3. Check cart

**Pass criteria:**
- [ ] Cart at Location B is empty (separate MMKV key: `cart.state.<locationB_id>`)
- [ ] Cart at Location A preserved if user re-signs in to Location A

**Test 10.3: Inventory scoped to location**

1. Sync inventory at Location A
2. Note stock levels
3. Verify stock levels reflect Location A's inventory (not warehouse or other stores)

**Pass criteria:**
- [ ] `X-Location-ID` header sent with `/sync/inventory` request
- [ ] Stock levels match Location A's actual inventory in admin dashboard

---

## Track 5: Transaction / Receipt / Audit Parity

### Task 11: Sale Data Integrity

**Goal:** Verify mobile sale data matches exactly what the server stores and what admin sees.

**Test 11.1: Line item parity**

1. Complete a 3-item sale on mobile (note exact products, quantities, prices)
2. Query the sale from the API:

```bash
curl -H "Authorization: Bearer <token>" -H "X-Location-ID: <id>" \
  http://<server>:3000/sales/<sale-id>
```

3. Compare mobile receipt data vs. server response

**Pass criteria:**
- [ ] `saleNo` matches receipt number shown on mobile
- [ ] Line items: same productId, quantity, unitPrice, lineTotal
- [ ] Subtotal, discountTotal, grandTotal match
- [ ] Payment method and amount match
- [ ] `status` is `COMPLETED`
- [ ] `completedAt` timestamp is populated
- [ ] `idempotencyKey` is populated and unique

**Test 11.2: Cash tendered / change accuracy**

1. Complete a sale for total = 150.00
2. Enter cash tendered = 200.00
3. Verify change = 50.00 on receipt

**Pass criteria:**
- [ ] Change displayed correctly on mobile: 50.00
- [ ] Receipt shows cash tendered: 200.00, change: 50.00
- [ ] Server payment record: method=CASH, amount=150.00 (grand total, not cash tendered)

**Test 11.3: Discount calculations**

1. Add product(s), apply a line-level discount (if available in Phase 1 UI)
2. Verify subtotal → discount → grand total math

**Pass criteria:**
- [ ] Line total = (unitPrice * qty) - discount
- [ ] Subtotal = sum of all line totals
- [ ] Grand total = subtotal - cart discount
- [ ] Server totals match mobile display

---

### Task 12: Transaction List & Admin Dashboard Parity

**Test 12.1: Today's transactions**

1. Complete 3 sales on mobile
2. Check Transactions tab
3. Query sales API for today's date

**Pass criteria:**
- [ ] All 3 sales appear in Transactions list
- [ ] Sale numbers, totals, and statuses match API response
- [ ] Sort order: most recent first

**Test 12.2: Cached transaction access**

1. Load Transactions tab while online (triggers API fetch + MMKV cache)
2. Enable airplane mode
3. Navigate away and back to Transactions tab

**Pass criteria:**
- [ ] Transactions list still displays from MMKV cache
- [ ] Up to 20 most recent transactions available offline
- [ ] Tapping a cached transaction → detail may fail (server fetch required)
  - **Note:** This is an acceptable Phase 1 limitation

**Test 12.3: Refund visibility**

1. From admin/web interface, refund one of the mobile sales
2. On mobile, pull-to-refresh Transactions

**Pass criteria:**
- [ ] Refunded sale shows `REFUNDED` status badge (red)
- [ ] Sale detail shows refund status

---

### Task 13: Receipt Audit Trail

**Test 13.1: Receipt number uniqueness**

1. Complete 10 sales in sequence
2. Note all receipt numbers (`saleNo`)

**Pass criteria:**
- [ ] All receipt numbers are unique
- [ ] Receipt numbers follow the server's sequential pattern

**Test 13.2: Receipt content matches server record**

1. Print a receipt
2. Photograph or transcribe the receipt content
3. Compare against `GET /sales/<id>` response

**Pass criteria:**
- [ ] Store name matches location name
- [ ] Receipt number matches `saleNo`
- [ ] Each line item: product name, qty, unit price, line total — all match
- [ ] Subtotal, discount, grand total — all match
- [ ] Payment method, amount — match
- [ ] Date/time approximately matches `completedAt`

---

## Defect Severity Classification

| Severity | Definition | Examples | Resolution Requirement |
|----------|-----------|----------|----------------------|
| **Blocker** | Data loss, financial error, or crash that prevents completing a sale. The app cannot be used at all in the affected scenario. | Duplicate charges on server, sale total mismatch between mobile and server, checkout crash losing cart data, pending sale never reconciles, security bypass | Must fix before any pilot use. Zero tolerance. |
| **High** | A core workflow is broken or unreliable, but there is no data loss. The cashier cannot complete their job efficiently. | Scanner doesn't capture barcodes, printer never connects, cart not persisting across restart, sign-out wipes device config, offline sale stuck in pending permanently | Must fix before live one-counter pilot. No workarounds accepted. |
| **Medium** | Workflow friction or degraded experience. The cashier can complete their job, but something is slower, uglier, or requires an extra step. | Slow catalog search (>1s), toast not dismissing, stale sync bar not appearing, paper width toggle not persisting, reprint footer missing "REPRINT" label | Allowed in pilot only with a documented workaround. Must fix before expanding beyond one counter. |
| **Low** | Cosmetic issue, minor edge case, or polish item. Does not affect cashier productivity or data accuracy. | Alignment off on receipt, status bar flicker on tab switch, category chip text truncated on small screens, minor color inconsistency with web app | Can be deferred to Phase 1.5 backlog. |

---

## Defect Tracking

For each defect found during pilot validation:

```markdown
### DEFECT-XXX: [Short description]

**Severity:** Blocker / High / Medium / Low
**Track:** [1-5]
**Task:** [Task number]
**Test:** [Test number]
**Steps to reproduce:**
1. ...

**Expected:** ...
**Actual:** ...
**Device:** [model, Android version]
**Screenshot/Log:** [attach]
**Workaround:** [if Medium — describe the workaround. N/A for Blocker/High]
**Status:** Open / In Progress / Fixed / Deferred
```

---

## Pilot Exit Criteria

### Gate: One-Counter Live Pilot

All of the following must be true before deploying to a single real counter:

- [ ] **0 Blocker defects** — no open Blockers, all resolved and verified
- [ ] **0 unresolved High defects** — every High fixed and verified, no exceptions
- [ ] **All Medium defects have documented workarounds** — cashier briefed on each
- [ ] **Low defects may be deferred** — logged in backlog, no action required for pilot

### Functional Gates

- [ ] Full sale cycle completes in < 30 seconds with real hardware
- [ ] Offline checkout + online reconciliation works end-to-end (tested 3+ times)
- [ ] Receipt data matches server records with 100% accuracy (verified on 10+ sales)
- [ ] Sign-out / sign-in preserves device config and pending sales correctly
- [ ] HID scanner and BT printer work reliably on the target pilot hardware
- [ ] No data loss under any tested crash, kill, or disconnect scenario

### After Pilot Clears

1. Deploy to one counter for 1 full business day
2. Collect cashier feedback (speed, friction, missing features)
3. Review defect log — any new Blockers or Highs stop the pilot immediately
4. If clean: prioritize Phase 1.5 backlog from pilot feedback
5. Do not expand to additional counters until Phase 1.5 defects are resolved
