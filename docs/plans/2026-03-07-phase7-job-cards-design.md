# Phase 7: Job Cards / Service Integration — Design Document

## Overview
Merge physical parts inventory with mechanical repair labor without corrupting stock levels.
Labor is a SEPARATE domain from products — never modeled in the products table.

## ERP Consultant Corrections (Locked)

### 1. Scope Expansion / Extra Parts
- `planned_qty` is NOT a permanent hard ceiling.
- Allow controlled add-part and increase-qty workflows before INVOICED.
- Effective constraint: `reserved_qty + issued_qty - returned_qty <= planned_qty`.
- `planned_qty` itself can be increased via audited update (logged in notes).

### 2. Unreserved Issuing (Direct Issue)
On issue event:
```
consume_reserved = min(issue_qty, line.reserved_qty)
direct_issue     = issue_qty - consume_reserved

Validate: if direct_issue > 0, then stockLevel - reservedLevel >= direct_issue

Apply:
  stockLevel     -= issue_qty
  reservedLevel  -= consume_reserved
  line.reserved_qty -= consume_reserved
  line.issued_qty   += issue_qty
```

### 3. Post-Issue Cancellation
- Cancel is BLOCKED if any line has `issued_qty - returned_qty > 0`.
- Staff must first return all net issued parts via JOB_CARD_RETURN events.
- Only when all net issued = 0 may cancellation release reservations.

### 4. CHECK Constraints
- `returned_qty <= issued_qty` (cannot return more than issued)
- `reserved_qty >= 0`, `issued_qty >= 0`, `returned_qty >= 0`
- `reserved_qty + issued_qty - returned_qty <= planned_qty`

---

## Data Model

### service_operations
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK | Multi-tenant |
| code | varchar(50) | Unique per org (e.g., "MECH-TIE-ROD") |
| name | varchar(255) | Human-readable (e.g., "Replace Tie Rod End") |
| category | enum | MECHANICAL, ELECTRICAL, BODY, TIRE_SERVICE, DIAGNOSTIC, OTHER |
| default_labor_rate | numeric(12,2) | Default hourly rate |
| estimated_hours | numeric(6,2) | Default estimated hours |
| active | boolean | Soft-delete flag |
| created_at, updated_at | timestamptz | Standard |

### job_cards
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK | |
| job_no | varchar(50) | Unique per org (e.g., "JC-000001") |
| customer_id | uuid FK | REQUIRED |
| customer_vehicle_id | uuid FK | REQUIRED |
| location_id | uuid FK | Service location |
| status | enum | See state machine |
| assigned_technician_user_id | uuid FK nullable | |
| odometer_reading | integer nullable | |
| notes | varchar(2000) | |
| created_by, checked_in_by, approved_by, cancelled_by, closed_by | uuid FK nullable | |
| checked_in_at, approved_at, started_at, completed_at, invoiced_at, cancelled_at, closed_at | timestamptz nullable | |
| idempotency_key | varchar(255) unique nullable | |
| created_at, updated_at | timestamptz | |

### job_card_labor
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| job_card_id | uuid FK | |
| org_id | uuid FK | |
| service_operation_id | uuid FK | |
| description | varchar(500) | Override text |
| qty_hours | numeric(6,2) | |
| unit_price | numeric(12,2) | Prefilled from default_labor_rate |
| line_total | numeric(12,2) | qty_hours × unit_price |
| created_at, updated_at | timestamptz | |

### job_card_parts
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| job_card_id | uuid FK | |
| org_id | uuid FK | |
| product_id | uuid FK | |
| location_id | uuid FK | Source location for this part |
| planned_qty | integer | Can be increased (audited) |
| reserved_qty | integer default 0 | |
| issued_qty | integer default 0 | |
| returned_qty | integer default 0 | |
| unit_price | numeric(12,2) | Selling price to customer |
| created_at, updated_at | timestamptz | |

CHECK constraints:
- `planned_qty > 0`
- `reserved_qty >= 0`
- `issued_qty >= 0`
- `returned_qty >= 0`
- `returned_qty <= issued_qty`
- `reserved_qty + issued_qty - returned_qty <= planned_qty`

---

## State Machine

```
SCHEDULED → CHECKED_IN → ESTIMATING → APPROVED → WAITING_FOR_PARTS / READY_FOR_BAY
                                                         ↓                    ↓
                                                   READY_FOR_BAY ←──────────
                                                         ↓
                                                   IN_PROGRESS → WORK_COMPLETED → INVOICED → CLOSED

Any pre-INVOICED state → CANCELLED (only if net_issued = 0 for all parts)
```

## Stock-Posting Moments

| State | Effect |
|---|---|
| ESTIMATING | Zero — parts are planned only |
| APPROVED | Partial reservation: `reservable = min(planned_qty, available)`. Route to READY_FOR_BAY or WAITING_FOR_PARTS |
| IN_PROGRESS (Issue) | THE deduction moment. Handles reserved + direct issue. JOB_CARD_ISSUE journal. |
| Return Event | Restores stock. JOB_CARD_RETURN journal. |
| CANCELLED | Blocked if net_issued > 0. Releases reservations only. |

## POS Merge Guardrail

sale_lines gets: `job_card_part_id` (nullable FK), `service_operation_id` (nullable FK).
completeSale() skips inventory deduction for lines where `job_card_part_id IS NOT NULL`.

## Lock Ordering
job_card_parts (by ID ASC) → inventory (by locationId, productId) → products (if cost update)
