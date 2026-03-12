# APEX POS — UAT Sandbox Guide

**Document:** SOP-UAT-001
**Version:** 1.0
**Date:** 7 March 2026
**Classification:** Internal — Staff Training & Testing

---

## Purpose

This guide provides step-by-step testing scripts for the three critical business workflows in APEX POS. Each workflow must be completed successfully by the assigned tester before the system is approved for Go-Live.

**Testing Environment:** UAT Sandbox (separate database seeded with test data)
**Login URL:** `http://<uat-server>:3000`
**Test Admin Credentials:** `admin@apex.com` / `admin12345`

---

## Prerequisites

Before beginning any test scenario:

1. Confirm the UAT database has been freshly seeded (`pnpm db:seed`)
2. Log in to the APEX POS web application
3. Select a **RETAIL_STORE** location from the location selector (not WAREHOUSE or TRANSIT_BUFFER)
4. Confirm the location header displays correctly in the top navigation bar
5. Open a separate browser tab for each tester (sessions are independent)

---

## Test Scenario 1: Counter Retail Sale

**Tester Role:** CASHIER or MANAGER
**Estimated Duration:** 10 minutes
**Covers:** Product search, cart building, vehicle attachment, checkout, refund

### Part A — Create & Complete a Sale

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1.1 | Navigate to the **POS** page | POS interface loads with product search bar and empty cart | ☐ |
| 1.2 | Search for a product by **mnemonic SKU** (10-letter code, e.g., `AKINGNNNNN`) | Product appears in search results with name, SKU, and unit price | ☐ |
| 1.3 | Add the product to cart with quantity **3** | Cart shows 1 line item: product name, qty 3, line total = unit price × 3 | ☐ |
| 1.4 | Search for a second product by **name** (e.g., type "brake") | Trigram search returns matching products | ☐ |
| 1.5 | Add second product to cart with quantity **1** | Cart shows 2 line items with updated subtotal and grand total | ☐ |
| 1.6 | **(Optional)** Search for a **customer** by phone number | Customer record appears with name and phone | ☐ |
| 1.7 | Attach the customer to the sale | Customer name displays on the sale header | ☐ |
| 1.8 | From the customer's vehicle list, select a **vehicle** | Vehicle details (make, model, year, plate) display on the sale | ☐ |
| 1.9 | Click **Complete Sale** (checkout button) | Sale transitions to **COMPLETED** status. Confirmation displays with sale number (e.g., `SL-000001`) | ☐ |
| 1.10 | Note the sale number: `SL-__________` | — | ☐ |

### Part B — Verify Inventory Deduction

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1.11 | Navigate to **Inventory** page | Inventory list loads for current location | ☐ |
| 1.12 | Search for the first product (from step 1.2) | Stock level has decreased by **3** from previous level | ☐ |
| 1.13 | Search for the second product (from step 1.4) | Stock level has decreased by **1** from previous level | ☐ |

### Part C — Process a Refund

> **Note:** Only ADMIN or MANAGER roles can process refunds. If testing as CASHIER, switch to a Manager account.

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1.14 | Navigate to the completed sale (by sale number `SL-__________`) | Sale details page shows COMPLETED status with all line items | ☐ |
| 1.15 | Click **Refund Sale** | Confirmation dialog appears: "Refund this sale? This cannot be undone." | ☐ |
| 1.16 | Confirm the refund | Sale transitions to **REFUNDED** status | ☐ |
| 1.17 | Check inventory for the first product again | Stock level has **increased by 3** (restored to original level) | ☐ |
| 1.18 | Check inventory for the second product again | Stock level has **increased by 1** (restored to original level) | ☐ |
| 1.19 | View the sale's **stock journal** (audit trail) | Journal shows RETURN entries reversing the original SALE entries | ☐ |

### Part D — Park & Resume (Optional)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 1.20 | Create a new sale with 1 product | Sale is OPEN with 1 line item | ☐ |
| 1.21 | Click **Park Sale** | Sale transitions to PARKED status | ☐ |
| 1.22 | Verify inventory was NOT deducted | Stock level unchanged (parking does not affect inventory) | ☐ |
| 1.23 | Click **Resume Sale** | Sale returns to OPEN status, cart intact | ☐ |
| 1.24 | Complete the resumed sale | Sale transitions to COMPLETED, stock deducted | ☐ |

**Scenario 1 Sign-Off:**

| | |
|---|---|
| **Tester Name:** | _________________________________ |
| **Date/Time:** | _________________________________ |
| **Result:** | ☐ PASS &nbsp;&nbsp;&nbsp; ☐ FAIL |
| **Notes:** | _________________________________ |

---

## Test Scenario 2: Warehouse Receiving + Location Transfer

**Tester Role:** WAREHOUSE_STAFF or MANAGER
**Estimated Duration:** 15 minutes
**Covers:** PO creation, goods receipt, stock journal verification, inter-location transfer

### Part A — Create & Submit a Purchase Order

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 2.1 | Switch location to a **WAREHOUSE** location | Location header shows warehouse name | ☐ |
| 2.2 | Navigate to **Procurement → Purchase Orders** | PO list page loads | ☐ |
| 2.3 | Click **Create Purchase Order** | PO creation form opens | ☐ |
| 2.4 | Select a **supplier** from the dropdown | Supplier name, contact info displayed | ☐ |
| 2.5 | Confirm destination location is the current warehouse | Destination matches header location | ☐ |
| 2.6 | Add Product Line 1: select a product, set ordered qty = **20**, unit cost = **150.00** | Line appears with qty 20, cost R150.00, line total R3,000.00 | ☐ |
| 2.7 | Add Product Line 2: select a different product, set ordered qty = **10**, unit cost = **85.00** | Second line appears. PO total updates | ☐ |
| 2.8 | Click **Submit PO** | PO transitions to **SUBMITTED** status. PO number assigned (e.g., `PO-000001`) | ☐ |
| 2.9 | Note the PO number: `PO-__________` | — | ☐ |

### Part B — Receive Goods (Partial Receipt)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 2.10 | Open the submitted PO | PO details show SUBMITTED status, 2 lines | ☐ |
| 2.11 | Click **Receive Goods** | Receiving form opens for each line | ☐ |
| 2.12 | For Line 1: enter accepted = **15**, rejected = **2** | 15 accepted, 2 rejected (3 still outstanding) | ☐ |
| 2.13 | For Line 2: enter accepted = **10**, rejected = **0** | 10 accepted, 0 rejected (line fully received) | ☐ |
| 2.14 | Confirm receipt | PO transitions to **PARTIALLY_RECEIVED** (Line 1 has 3 outstanding) | ☐ |
| 2.15 | Verify warehouse inventory for Product 1 | Stock level increased by **15** | ☐ |
| 2.16 | Verify warehouse inventory for Product 2 | Stock level increased by **10** | ☐ |
| 2.17 | View PO **stock journal** | Shows RECEIVING entries for each accepted product line | ☐ |

### Part C — Complete Receipt (Remaining Quantity)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 2.18 | Click **Receive Goods** again on the same PO | Receiving form shows only outstanding quantities | ☐ |
| 2.19 | For Line 1: enter accepted = **3**, rejected = **0** | All 20 units now accounted for (15 + 2 + 3) | ☐ |
| 2.20 | Confirm receipt | PO transitions to **FULLY_RECEIVED** | ☐ |
| 2.21 | Verify warehouse inventory for Product 1 | Stock level increased by additional **3** (total +18 accepted) | ☐ |

### Part D — Create & Execute a Location Transfer

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 2.22 | Navigate to **Transfers** page | Transfer list loads | ☐ |
| 2.23 | Click **Create Transfer** | Transfer form opens | ☐ |
| 2.24 | Set source = **current warehouse**, destination = **a RETAIL_STORE** | Source and destination locations displayed | ☐ |
| 2.25 | Add transfer line: Product 1, qty = **10** | Transfer line shows product, qty 10 | ☐ |
| 2.26 | Transfer is created in **DRAFT** status | Draft status confirmed | ☐ |
| 2.27 | Click **Approve** (requires ADMIN or MANAGER role) | Transfer → **APPROVED**. Stock reserved at warehouse (reserved_level +10) | ☐ |
| 2.28 | Click **Start Picking** | Transfer → **PICKING** | ☐ |
| 2.29 | Click **Dispatch** for the transfer line | Transfer → **DISPATCHED**. Warehouse stock deducted by 10. Stock moves to TRANSIT_BUFFER | ☐ |
| 2.30 | Switch location to the **destination RETAIL_STORE** | Location header changes | ☐ |
| 2.31 | Open the dispatched transfer | Transfer visible from destination location | ☐ |
| 2.32 | Click **Receive** for the transfer line (accepted qty = 10) | Transfer → **RECEIVED**. Retail store stock increased by 10 | ☐ |
| 2.33 | View transfer **stock journal** | Shows TRANSFER_OUT (source) and TRANSFER_IN (destination) entries | ☐ |

### Part E — Variance Handling (Optional)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 2.34 | Create another transfer, dispatch 5 units, receive only 4 | Transfer enters **PARTIALLY_RECEIVED** or **DISCREPANCY_REVIEW** | ☐ |
| 2.35 | Click **Report Variance**, select reason: "DAMAGE_IN_TRANSIT", confirm 1 damaged | ADJUSTMENT journal entry created. 1 unit written off with DAMAGE_IN_TRANSIT reason | ☐ |

**Scenario 2 Sign-Off:**

| | |
|---|---|
| **Tester Name:** | _________________________________ |
| **Date/Time:** | _________________________________ |
| **Result:** | ☐ PASS &nbsp;&nbsp;&nbsp; ☐ FAIL |
| **Notes:** | _________________________________ |

---

## Test Scenario 3: Full Job Card Lifecycle

**Tester Role:** MANAGER (requires both service and POS access)
**Estimated Duration:** 20 minutes
**Covers:** Job card creation, estimating, parts issue, work completion, invoicing

### Part A — Create & Estimate

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.1 | Switch to a **RETAIL_STORE** location | Location header shows retail store | ☐ |
| 3.2 | Navigate to **Service → Job Cards** | Job card list loads | ☐ |
| 3.3 | Click **Create Job Card** | Job card creation form opens | ☐ |
| 3.4 | Search for and select a **customer** | Customer attached to job card | ☐ |
| 3.5 | Select the customer's **vehicle** | Vehicle details shown (make, model, year, plate, odometer) | ☐ |
| 3.6 | Enter odometer reading (e.g., **87,450 km**) | Odometer recorded | ☐ |
| 3.7 | Add notes: "Customer reports squeaking brakes, front left" | Notes saved | ☐ |
| 3.8 | Job card created in **SCHEDULED** status | Job number assigned (e.g., `JC-000001`) | ☐ |
| 3.9 | Note the job number: `JC-__________` | — | ☐ |

### Part B — Check-In & Build Estimate

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.10 | Click **Check In Vehicle** | Job card → **CHECKED_IN** | ☐ |
| 3.11 | Click **Start Estimating** | Job card → **ESTIMATING** | ☐ |
| 3.12 | **Add Labor Line:** select a service operation (e.g., "Brake Pad Replacement — Front"), hours = **1.5**, rate = **350.00/hr** | Labor line appears: R525.00 | ☐ |
| 3.13 | **Add Labor Line:** select another operation (e.g., "Brake Disc Inspection"), hours = **0.5**, rate = **350.00/hr** | Second labor line: R175.00. Labor subtotal: R700.00 | ☐ |
| 3.14 | **Add Part Line:** search for brake pads, planned qty = **2**, selling price = unit price | Part line appears with planned qty 2 | ☐ |
| 3.15 | **Add Part Line:** search for brake cleaner spray, planned qty = **1** | Second part line added. Parts subtotal calculated | ☐ |
| 3.16 | Verify the **estimate total** = labor subtotal + parts subtotal | Grand total matches expected sum | ☐ |

### Part C — Approve & Prepare

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.17 | Click **Approve Estimate** | Job card → **APPROVED**. Parts partially reserved. | ☐ |
| 3.18 | Confirm parts availability in inventory | Reserved level increased for the brake pads and cleaner | ☐ |
| 3.19 | Click **Move to Bay** | Job card → **READY_FOR_BAY** (vehicle staged for technician) | ☐ |

### Part D — Issue Parts & Perform Work

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.20 | Click **Start Work** | Job card → **IN_PROGRESS** | ☐ |
| 3.21 | Click **Issue Parts** | Parts deducted from current location's inventory. JOB_CARD_ISSUE journal entries created | ☐ |
| 3.22 | Verify inventory: brake pads stock reduced by **2** | Stock level decreased correctly | ☐ |
| 3.23 | Verify inventory: brake cleaner stock reduced by **1** | Stock level decreased correctly | ☐ |
| 3.24 | **(Optional — Scope Expansion):** Update brake pad qty from 2 to **4** with note "Both axles require replacement" | Planned qty updated to 4. Audit note recorded | ☐ |
| 3.25 | Issue the additional 2 brake pads | Additional JOB_CARD_ISSUE journal entries. Inventory reduced by 2 more | ☐ |

### Part E — Return Unused Parts (Optional)

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.26 | Click **Return Parts** for brake cleaner (qty = 1) | JOB_CARD_RETURN journal entry created. Stock restored by 1 | ☐ |
| 3.27 | Verify inventory: brake cleaner stock restored by **1** | Stock level back to pre-issue level | ☐ |

### Part F — Complete, Invoice & Close

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.28 | Click **Complete Work** | Job card → **WORK_COMPLETED** | ☐ |
| 3.29 | Review the job card summary: all labor lines, net issued parts, totals | Summary matches expected values | ☐ |
| 3.30 | Click **Generate Invoice** | Job card → **INVOICED**. Invoice total = labor + net parts | ☐ |
| 3.31 | Verify invoice line items match: 2 labor lines + net issued parts | All items accounted for, prices correct | ☐ |
| 3.32 | Click **Close Job Card** | Job card → **CLOSED** (terminal state) | ☐ |
| 3.33 | View the job card's **stock journal** | Full audit trail: JOB_CARD_ISSUE entries (and RETURN if step 3.26 was done) | ☐ |

### Part G — Verify Service History

| Step | Action | Expected Result | ✓ |
|------|--------|-----------------|---|
| 3.34 | Navigate to **Reports → Service History** | Service History page loads | ☐ |
| 3.35 | Search for the customer used in this test | Customer appears in results | ☐ |
| 3.36 | View the customer's service history | The completed job card appears with correct dates and totals | ☐ |
| 3.37 | Switch to **By Vehicle** mode and search for the vehicle | Vehicle service history shows the job card entry | ☐ |

**Scenario 3 Sign-Off:**

| | |
|---|---|
| **Tester Name:** | _________________________________ |
| **Date/Time:** | _________________________________ |
| **Result:** | ☐ PASS &nbsp;&nbsp;&nbsp; ☐ FAIL |
| **Notes:** | _________________________________ |

---

## UAT Final Sign-Off

All three test scenarios must receive a **PASS** result before Go-Live approval.

| Scenario | Result | Tester | Date |
|----------|--------|--------|------|
| 1. Counter Retail Sale | ☐ PASS / ☐ FAIL | ______________ | __________ |
| 2. Warehouse Receiving + Transfer | ☐ PASS / ☐ FAIL | ______________ | __________ |
| 3. Full Job Card Lifecycle | ☐ PASS / ☐ FAIL | ______________ | __________ |

| | |
|---|---|
| **Approved By (Management):** | _________________________________ |
| **Date:** | _________________________________ |
| **Go-Live Authorized:** | ☐ YES &nbsp;&nbsp;&nbsp; ☐ NO — Requires re-test |

---

*End of Document — SOP-UAT-001*
