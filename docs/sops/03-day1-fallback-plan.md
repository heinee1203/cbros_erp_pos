# APEX POS — Day 1 Fallback Plan

**Document:** SOP-FALLBACK-001
**Version:** 1.0
**Date:** 7 March 2026
**Classification:** Internal — All Front-Line Staff

---

## Purpose

This document is the **emergency protocol** for Cashiers, Service Advisors, and Warehouse Staff if the APEX POS system becomes unavailable on Day 1 (or any day during the Hypercare period). Print this document and keep one copy at **every POS terminal and service desk**.

**This is NOT a permanent procedure.** It is a temporary fallback to keep the business operating while IT resolves the system issue. All paper slips must be entered into APEX POS as soon as the system is restored.

---

## When to Activate This Plan

Activate this fallback plan if **any** of the following occur:

| Trigger | What You'll See |
|---------|----------------|
| **Network outage** | Browser shows "Unable to connect" or "ERR_CONNECTION_REFUSED" |
| **Server crash** | APEX POS shows a blank/white screen or "500 Internal Server Error" |
| **Login failure** | Cannot log in despite correct credentials (system-wide, not user error) |
| **Extreme slowness** | Pages take >30 seconds to load, transactions time out |
| **Database error** | Error messages mentioning "database", "connection", or "timeout" |

> **DO NOT activate for:** Forgotten passwords (ask a manager), individual browser issues (try another browser/device), or a single failed transaction (retry once, then escalate).

---

## Step 1: Notify Management Immediately

| Action | How |
|--------|-----|
| **Call the on-duty Manager** | Phone: _______________________ |
| **State clearly:** | "APEX POS is down. I am switching to paper fallback." |
| **Manager will:** | Contact IT Admin and confirm fallback activation for all staff |

> **Do not wait** for permission to start writing paper slips if customers are at the counter. Begin immediately and notify management as soon as practical.

---

## Step 2: Use Manual Paper Slips

### For CASHIERS — Sales Transactions

Use the **SALE SLIP** template below. One slip per transaction.

```
┌─────────────────────────────────────────────────┐
│              APEX POS — MANUAL SALE SLIP         │
│                                                  │
│  Date: ___/___/______    Time: ___:___ AM / PM   │
│                                                  │
│  Staff Name: ________________________________    │
│  Location:   ________________________________    │
│                                                  │
│  Customer Name:  ____________________________    │
│  Customer Phone: ____________________________    │
│  Vehicle Plate:  ____________________________    │
│                                                  │
│  ┌─────┬──────────────────────┬─────┬──────────┐ │
│  │ QTY │ PRODUCT / SKU        │PRICE│ LINE TOT │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┴──────────────────────┴─────┼──────────┤ │
│  │                        SUBTOTAL: │          │ │
│  │                        DISCOUNT: │          │ │
│  │                     GRAND TOTAL: │          │ │
│  └──────────────────────────────────┴──────────┘ │
│                                                  │
│  Payment: ☐ Cash  ☐ Card  ☐ Account              │
│  Cash Received: R________  Change: R________     │
│                                                  │
│  Slip #: _____  (sequential, start from 001)     │
│                                                  │
│  Staff Signature: ___________________________    │
└─────────────────────────────────────────────────┘
```

**CRITICAL RULES for Sale Slips:**

1. **Always write the SKU** (printed on the product label/shelf tag), not just the product name
2. **Always write the exact time** — this is needed to reconstruct the transaction sequence
3. **Number slips sequentially** starting from 001 — this prevents lost transactions
4. **Write legibly** — illegible slips cannot be entered into the system
5. **Keep all slips** in a secure location — do not discard any slip, even voided ones
6. **For voided slips:** Write "VOID" across the entire slip, sign it, and keep it in the stack

---

### For SERVICE ADVISORS — Job Card Notes

Use the **JOB CARD SLIP** template below. One slip per vehicle.

```
┌─────────────────────────────────────────────────┐
│            APEX POS — MANUAL JOB CARD SLIP       │
│                                                  │
│  Date: ___/___/______    Time: ___:___ AM / PM   │
│                                                  │
│  Advisor Name: _______________________________   │
│  Location:     _______________________________   │
│                                                  │
│  Customer Name:  ____________________________    │
│  Customer Phone: ____________________________    │
│                                                  │
│  Vehicle Make:   ____________________________    │
│  Vehicle Model:  ____________________________    │
│  Vehicle Year:   ________                        │
│  Plate No:       ____________________________    │
│  Odometer (km):  ____________________________    │
│                                                  │
│  Customer Complaint / Notes:                     │
│  ____________________________________________    │
│  ____________________________________________    │
│  ____________________________________________    │
│                                                  │
│  LABOR (Service Operations):                     │
│  ┌──────────────────────────────┬──────┬───────┐ │
│  │ OPERATION                    │ HOURS│ RATE  │ │
│  ├──────────────────────────────┼──────┼───────┤ │
│  │                              │      │       │ │
│  ├──────────────────────────────┼──────┼───────┤ │
│  │                              │      │       │ │
│  ├──────────────────────────────┼──────┼───────┤ │
│  │                              │      │       │ │
│  └──────────────────────────────┴──────┴───────┘ │
│                                                  │
│  PARTS REQUIRED:                                 │
│  ┌─────┬──────────────────────┬─────┬──────────┐ │
│  │ QTY │ PART NAME / SKU      │PRICE│ LINE TOT │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  ├─────┼──────────────────────┼─────┼──────────┤ │
│  │     │                      │     │          │ │
│  └─────┴──────────────────────┴─────┴──────────┘ │
│                                                  │
│  Technician Assigned: ________________________   │
│                                                  │
│  Slip #: _____  (sequential, start from J-001)   │
│                                                  │
│  Advisor Signature: _________________________    │
│  Customer Signature: ________________________    │
└─────────────────────────────────────────────────┘
```

**CRITICAL RULES for Job Card Slips:**

1. **Get the customer's phone number** — this is the primary lookup key for matching to their account
2. **Record the plate number** — this links the job to the specific vehicle
3. **Record the odometer** — this is required for service history accuracy
4. **Write SKUs for every part** — shelf labels have the SKU printed; capture it
5. **Do NOT issue parts from shelves** without writing the slip first — the slip is the only record
6. **Number slips** sequentially with "J-" prefix (J-001, J-002, ...) to distinguish from sale slips

---

### For WAREHOUSE STAFF — Receiving & Transfers

Use the **RECEIVING SLIP** template below. One slip per delivery.

```
┌─────────────────────────────────────────────────┐
│          APEX POS — MANUAL RECEIVING SLIP        │
│                                                  │
│  Date: ___/___/______    Time: ___:___ AM / PM   │
│                                                  │
│  Receiver Name: ______________________________   │
│  Location:      ______________________________   │
│                                                  │
│  Supplier Name: ______________________________   │
│  Delivery Note #: ____________________________   │
│  PO Number (if known): _______________________   │
│                                                  │
│  ┌─────┬──────────────────────┬────────┬───────┐ │
│  │ QTY │ PRODUCT / SKU        │ACCEPTED│REJECT │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  ├─────┼──────────────────────┼────────┼───────┤ │
│  │     │                      │        │       │ │
│  └─────┴──────────────────────┴────────┴───────┘ │
│                                                  │
│  Rejection Reason(s): _______________________    │
│  ____________________________________________    │
│                                                  │
│  DO NOT shelve goods until this slip is entered   │
│  into APEX POS and stock levels are confirmed.   │
│                                                  │
│  Slip #: _____  (sequential, start from R-001)   │
│                                                  │
│  Receiver Signature: ________________________    │
└─────────────────────────────────────────────────┘
```

**CRITICAL RULES for Receiving Slips:**

1. **Count every item physically** — do not trust the supplier's delivery note quantities
2. **Record accepted AND rejected** quantities separately — rejections must be entered as well
3. **Write the supplier's delivery note number** — this links to the purchase order
4. **Do NOT shelve goods until recorded** — unrecorded inventory causes count discrepancies
5. **Number slips** with "R-" prefix (R-001, R-002, ...)

---

## Step 3: Secure All Paper Slips

| Action | Details |
|--------|---------|
| **Store slips in a dedicated tray or folder** | One per location, clearly labeled "FALLBACK SLIPS — DO NOT DISCARD" |
| **At end of fallback period,** hand all slips to the on-duty Manager | Manager will oversee data entry |
| **Count total slips** before handing over | Record: _____ sale slips, _____ job card slips, _____ receiving slips |

---

## Step 4: System Restoration — Data Entry

> **This section is for MANAGERS only.** Do not allow Cashiers to self-enter their own slips (separation of duties).

When APEX POS is restored:

| # | Action | Owner | Done |
|---|--------|-------|------|
| 4.1 | Confirm system is stable — complete 1 test transaction | Manager | ☐ |
| 4.2 | Collect all paper slips from all locations | Manager | ☐ |
| 4.3 | Sort slips by type: Sales, Job Cards, Receiving | Manager | ☐ |
| 4.4 | Sort each type by **timestamp** (chronological order) | Manager | ☐ |
| 4.5 | Enter **Receiving slips first** (stock must exist before sales can deduct) | Manager | ☐ |
| 4.6 | Enter **Sale slips** in chronological order — match products by SKU, attach customer/vehicle if noted | Manager / Cashier (supervised) | ☐ |
| 4.7 | Enter **Job Card slips** — create job cards, add labor lines, add part lines, issue parts, invoice | Manager | ☐ |
| 4.8 | **Cross-check:** Compare paper slip totals vs. APEX transaction totals | Manager | ☐ |
| 4.9 | File all paper slips in a dated envelope: "Fallback Period: ___/___/___ to ___/___/___" | Manager | ☐ |
| 4.10 | Store envelope in safe/lockbox for minimum **90 days** (audit trail) | Manager | ☐ |

**DATA ENTRY ORDER IS CRITICAL:**

```
  1. RECEIVING SLIPS  →  Stock enters the system first
  2. SALE SLIPS       →  Stock can now be deducted
  3. JOB CARD SLIPS   →  Parts can now be issued
```

Entering sales before receiving can cause "Insufficient Stock" errors.

---

## Quick Reference Card

> **Tear off this section and tape it to the POS terminal.**

```
┌─────────────────────────────────────────────┐
│          APEX POS — SYSTEM DOWN?            │
│                                             │
│  1. CALL MANAGER: ______________________   │
│                                             │
│  2. GRAB A PAPER SLIP PAD                   │
│                                             │
│  3. FOR EVERY TRANSACTION, WRITE:           │
│     ✓ DATE & EXACT TIME                     │
│     ✓ YOUR NAME                             │
│     ✓ CUSTOMER NAME & PHONE                 │
│     ✓ EACH ITEM: QTY + SKU + PRICE          │
│     ✓ GRAND TOTAL                           │
│     ✓ PAYMENT METHOD                        │
│     ✓ SEQUENTIAL SLIP NUMBER                │
│                                             │
│  4. KEEP ALL SLIPS — EVEN VOIDED ONES       │
│                                             │
│  5. WHEN SYSTEM IS BACK:                    │
│     → Give ALL slips to the Manager         │
│     → Manager enters them in order          │
│                                             │
│  DO NOT THROW AWAY ANY SLIPS                │
└─────────────────────────────────────────────┘
```

---

## Frequently Asked Questions

**Q: Can I give the customer a receipt?**
A: Write a duplicate copy of the sale slip and give the carbon/copy to the customer. Keep the original.

**Q: What if I don't know the SKU?**
A: Check the shelf label or product packaging. If no label exists, write the full product name, brand, and size as clearly as possible. The Manager will match it during data entry.

**Q: What if a customer wants a refund during the outage?**
A: Do NOT process refunds on paper. Ask the customer to return when the system is restored. If they insist, contact the Manager for approval and write "REFUND" on a sale slip with full details.

**Q: How long should we stay on paper before escalating?**
A: If the system is down for more than **2 hours**, the Manager should contact the Cutover Lead to assess whether to continue on paper or close early for the day.

**Q: What if we run out of paper slip templates?**
A: Use any blank paper. The critical fields are: **Date, Time, Staff Name, Customer Phone, Product SKU, Quantity, Price, Slip Number.** Everything else is helpful but not mandatory.

---

## Emergency Contact List

| Role | Name | Phone |
|------|------|-------|
| On-Duty Manager | ________________ | ________________ |
| IT Administrator | ________________ | ________________ |
| Cutover Lead | ________________ | ________________ |
| ERP Consultant | ________________ | ________________ |

---

*End of Document — SOP-FALLBACK-001*
