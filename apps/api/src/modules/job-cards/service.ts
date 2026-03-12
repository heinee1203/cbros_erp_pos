import { db, type DbOrTx } from "@apex/database";
import {
  jobCards,
  jobCardLabor,
  jobCardParts,
  jobCardStateLog,
  serviceOperations,
  inventory,
  stockJournal,
  products,
  locations,
  customers,
  customerVehicles,
  users,
} from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import type {
  CreateJobCardInput,
  AddPartsInput,
  AddLaborInput,
  ApproveJobCardInput,
  IssuePartsInput,
  ReturnPartsInput,
} from "@apex/types";
import {
  JobCardStatus,
  isValidJobCardTransition,
  PRE_INVOICED_STATUSES,
  PARTS_EDITABLE_STATUSES,
  PARTS_ISSUABLE_STATUSES,
  SERVICE_ROLES,
} from "@apex/types";

// ── Helpers ──

async function generateJobNo(tx: DbOrTx, orgId: string): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(jobCards)
    .where(eq(jobCards.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `JC-${String(seq).padStart(6, "0")}`;
}

function assertServiceRole(userRole: string) {
  if (!SERVICE_ROLES.includes(userRole as any)) {
    throw new Error("Access denied: requires ADMIN, MANAGER, or CASHIER role");
  }
}

/**
 * Race-safe inventory row creation + lock.
 */
async function lockInventoryRow(
  tx: DbOrTx,
  orgId: string,
  productId: string,
  locationId: string,
): Promise<{ id: string; stockLevel: number; reservedLevel: number }> {
  // Step 1: race-safe create-if-missing
  await tx.execute(
    sql`INSERT INTO inventory (id, org_id, product_id, location_id, stock_level, reserved_level, reorder_point, lead_time_days, created_at, updated_at)
        VALUES (gen_random_uuid(), ${orgId}, ${productId}, ${locationId}, 0, 0, 10, 7, NOW(), NOW())
        ON CONFLICT (product_id, location_id) DO NOTHING`,
  );

  // Step 2: lock the row
  const rows = await tx.execute(
    sql`SELECT id, stock_level, reserved_level
        FROM inventory
        WHERE org_id = ${orgId}
          AND product_id = ${productId}
          AND location_id = ${locationId}
        FOR UPDATE`,
  );

  const row = rows[0] as any;
  return {
    id: row.id,
    stockLevel: row.stock_level,
    reservedLevel: row.reserved_level,
  };
}

/**
 * Emit a state transition log entry (immutable ledger).
 */
async function emitStateLog(
  tx: DbOrTx,
  orgId: string,
  jobCardId: string,
  fromStatus: string | null,
  toStatus: string,
  userId: string,
  notes?: string,
) {
  await tx.insert(jobCardStateLog).values({
    orgId,
    jobCardId,
    fromStatus: fromStatus as any,
    toStatus: toStatus as any,
    transitionedByUserId: userId,
    notes: notes ?? null,
    transitionedAt: new Date(),
  });
}

// ── Service Operations CRUD ──

export async function createServiceOperation(
  input: { code: string; name: string; category: string; defaultLaborRate: string; estimatedHours: string },
  orgId: string,
  userRole: string,
) {
  assertServiceRole(userRole);

  // Check for duplicate code
  const existing = await db
    .select({ id: serviceOperations.id })
    .from(serviceOperations)
    .where(
      and(
        eq(serviceOperations.orgId, orgId),
        eq(serviceOperations.code, input.code),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error(`Service operation code "${input.code}" already exists`);
  }

  const [op] = await db
    .insert(serviceOperations)
    .values({
      orgId,
      code: input.code,
      name: input.name,
      category: input.category as any,
      defaultLaborRate: input.defaultLaborRate,
      estimatedHours: input.estimatedHours,
    })
    .returning();

  return op;
}

export async function updateServiceOperation(
  opId: string,
  orgId: string,
  userRole: string,
  input: {
    name?: string;
    category?: string;
    defaultLaborRate?: string;
    estimatedHours?: string;
    active?: boolean;
  },
) {
  assertServiceRole(userRole);

  const updateSet: Record<string, any> = {};
  if (input.name !== undefined) updateSet.name = input.name;
  if (input.category !== undefined) updateSet.category = input.category;
  if (input.defaultLaborRate !== undefined) updateSet.defaultLaborRate = input.defaultLaborRate;
  if (input.estimatedHours !== undefined) updateSet.estimatedHours = input.estimatedHours;
  if (input.active !== undefined) updateSet.active = input.active;

  if (Object.keys(updateSet).length === 0) {
    throw new Error("No fields to update");
  }

  const [updated] = await db
    .update(serviceOperations)
    .set(updateSet)
    .where(
      and(
        eq(serviceOperations.id, opId),
        eq(serviceOperations.orgId, orgId),
      ),
    )
    .returning();

  if (!updated) throw new Error("Service operation not found");
  return updated;
}

export async function listServiceOperations(
  orgId: string,
  cursor?: string,
  limit: number = 50,
) {
  const results = await db
    .select()
    .from(serviceOperations)
    .where(
      cursor
        ? and(
            eq(serviceOperations.orgId, orgId),
            sql`${serviceOperations.id} > ${cursor}`,
          )
        : eq(serviceOperations.orgId, orgId),
    )
    .orderBy(asc(serviceOperations.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getServiceOperation(opId: string, orgId: string) {
  const [op] = await db
    .select()
    .from(serviceOperations)
    .where(
      and(eq(serviceOperations.id, opId), eq(serviceOperations.orgId, orgId)),
    )
    .limit(1);

  return op ?? null;
}

// ── Job Card Service Functions ──

/**
 * Create a new job card in SCHEDULED status.
 */
export async function createJobCard(
  input: CreateJobCardInput,
  orgId: string,
  userId: string,
  userRole: string,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Validate customer
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.orgId, orgId)))
      .limit(1);
    if (!customer) throw new Error("Customer not found");

    // Validate vehicle belongs to customer
    const [vehicle] = await tx
      .select({ id: customerVehicles.id })
      .from(customerVehicles)
      .where(
        and(
          eq(customerVehicles.id, input.customerVehicleId),
          eq(customerVehicles.customerId, input.customerId),
          eq(customerVehicles.orgId, orgId),
        ),
      )
      .limit(1);
    if (!vehicle) throw new Error("Vehicle not found or does not belong to customer");

    // Validate location
    const [location] = await tx
      .select({ id: locations.id, type: locations.type })
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.orgId, orgId)))
      .limit(1);
    if (!location) throw new Error("Location not found");
    if (location.type === "TRANSIT_BUFFER") {
      throw new Error("Cannot create job card for TRANSIT_BUFFER location");
    }

    // Validate technician if provided
    if (input.assignedTechnicianUserId) {
      const [tech] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.assignedTechnicianUserId),
            eq(users.orgId, orgId),
          ),
        )
        .limit(1);
      if (!tech) throw new Error("Assigned technician not found");
    }

    const jobNo = await generateJobNo(tx, orgId);

    const [jc] = await tx
      .insert(jobCards)
      .values({
        orgId,
        jobNo,
        customerId: input.customerId,
        customerVehicleId: input.customerVehicleId,
        locationId: input.locationId,
        status: "SCHEDULED",
        assignedTechnicianUserId: input.assignedTechnicianUserId ?? null,
        odometerReading: input.odometerReading ?? null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      })
      .returning();

    // Emit state log: NULL → SCHEDULED
    await emitStateLog(tx, orgId, jc.id, null, "SCHEDULED", userId, input.notes);

    return jc;
  });
}

/**
 * Transition a job card to the next status.
 * Handles: SCHEDULED→CHECKED_IN, CHECKED_IN→ESTIMATING,
 *          READY_FOR_BAY→IN_PROGRESS, IN_PROGRESS→WORK_COMPLETED,
 *          WORK_COMPLETED→INVOICED, INVOICED→CLOSED
 */
export async function transitionJobCard(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  targetStatus: JobCardStatus,
  idempotencyKey: string,
  notes?: string,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const rows = await tx.execute(
      sql`SELECT * FROM job_cards
          WHERE id = ${jobCardId} AND org_id = ${orgId}
          FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Job card not found");

    const jc = rows[0] as any;

    // Idempotency
    if (jc.status === targetStatus && jc.idempotency_key === idempotencyKey) {
      return jc;
    }

    if (!isValidJobCardTransition(jc.status as JobCardStatus, targetStatus)) {
      throw new Error(`Cannot transition from ${jc.status} to ${targetStatus}`);
    }

    const updateSet: Record<string, any> = {
      status: targetStatus,
      idempotencyKey,
    };

    // Set timestamp/actor fields based on target status
    const now = new Date();
    switch (targetStatus) {
      case JobCardStatus.CHECKED_IN:
        updateSet.checkedInByUserId = userId;
        updateSet.checkedInAt = now;
        if (notes) {
          updateSet.odometerReading = jc.odometer_reading; // preserve
        }
        break;
      case JobCardStatus.IN_PROGRESS:
        updateSet.startedAt = now;
        break;
      case JobCardStatus.WORK_COMPLETED:
        updateSet.completedAt = now;
        break;
      case JobCardStatus.INVOICED:
        updateSet.invoicedAt = now;
        break;
      case JobCardStatus.CLOSED:
        updateSet.closedByUserId = userId;
        updateSet.closedAt = now;
        break;
    }

    if (notes) {
      updateSet.notes = `${jc.notes ?? ""}\n[${targetStatus}] ${notes}`.trim();
    }

    const [updated] = await tx
      .update(jobCards)
      .set(updateSet)
      .where(eq(jobCards.id, jobCardId))
      .returning();

    // Emit state log
    await emitStateLog(tx, orgId, jobCardId, jc.status, targetStatus, userId, notes);

    return updated;
  });
}

/**
 * Add labor lines to a job card.
 * Only allowed in ESTIMATING or before INVOICED.
 */
export async function addLabor(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: AddLaborInput,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const rows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Job card not found");

    const jc = rows[0] as any;
    const status = jc.status as JobCardStatus;

    // Labor can be added during estimation and active work phases
    const laborEditableStatuses: JobCardStatus[] = [
      JobCardStatus.ESTIMATING,
      JobCardStatus.APPROVED,
      JobCardStatus.WAITING_FOR_PARTS,
      JobCardStatus.READY_FOR_BAY,
      JobCardStatus.IN_PROGRESS,
    ];
    if (!laborEditableStatuses.includes(status)) {
      throw new Error(`Cannot add labor in ${status} status`);
    }

    // Validate service operations and build values
    const lineValues: any[] = [];
    for (const line of input.lines) {
      const [op] = await tx
        .select()
        .from(serviceOperations)
        .where(
          and(
            eq(serviceOperations.id, line.serviceOperationId),
            eq(serviceOperations.orgId, orgId),
          ),
        )
        .limit(1);
      if (!op) throw new Error(`Service operation ${line.serviceOperationId} not found`);
      if (!op.active) throw new Error(`Service operation "${op.code}" is inactive`);

      const qtyHours = parseFloat(line.qtyHours);
      const unitPrice = parseFloat(line.unitPrice);
      const lineTotal = qtyHours * unitPrice;

      lineValues.push({
        jobCardId,
        orgId,
        serviceOperationId: line.serviceOperationId,
        description: line.description ?? null,
        qtyHours: line.qtyHours,
        unitPrice: line.unitPrice,
        lineTotal: lineTotal.toFixed(2),
      });
    }

    const inserted = await tx
      .insert(jobCardLabor)
      .values(lineValues)
      .returning();

    return inserted;
  });
}

/**
 * Add part lines to a job card.
 * Only allowed in PARTS_EDITABLE_STATUSES.
 */
export async function addParts(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: AddPartsInput,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const rows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new Error("Job card not found");

    const jc = rows[0] as any;
    const status = jc.status as JobCardStatus;

    if (!PARTS_EDITABLE_STATUSES.includes(status)) {
      throw new Error(`Cannot add parts in ${status} status`);
    }

    // Validate products and locations
    const lineValues: any[] = [];
    for (const line of input.lines) {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.orgId, orgId)))
        .limit(1);
      if (!product) throw new Error(`Product ${line.productId} not found`);

      const [loc] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, line.locationId), eq(locations.orgId, orgId)))
        .limit(1);
      if (!loc) throw new Error(`Location ${line.locationId} not found`);

      lineValues.push({
        jobCardId,
        orgId,
        productId: line.productId,
        locationId: line.locationId,
        plannedQty: line.plannedQty,
        reservedQty: 0,
        issuedQty: 0,
        returnedQty: 0,
        unitPrice: line.unitPrice,
      });
    }

    const inserted = await tx
      .insert(jobCardParts)
      .values(lineValues)
      .returning();

    return inserted;
  });
}

/**
 * Update a part line's planned_qty (scope expansion).
 * Only allowed in PARTS_EDITABLE_STATUSES.
 * New planned_qty must satisfy: reserved_qty + issued_qty - returned_qty <= new_planned_qty
 */
export async function updatePartQty(
  jobCardPartId: string,
  orgId: string,
  userId: string,
  userRole: string,
  newPlannedQty: number,
  notes?: string,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock the part line
    const partRows = await tx.execute(
      sql`SELECT jcp.*, jc.status as jc_status
          FROM job_card_parts jcp
          JOIN job_cards jc ON jc.id = jcp.job_card_id
          WHERE jcp.id = ${jobCardPartId} AND jcp.org_id = ${orgId}
          FOR UPDATE OF jcp`,
    );
    if (partRows.length === 0) throw new Error("Job card part not found");

    const part = partRows[0] as any;
    const jcStatus = part.jc_status as JobCardStatus;

    if (!PARTS_EDITABLE_STATUSES.includes(jcStatus)) {
      throw new Error(`Cannot update part qty in ${jcStatus} status`);
    }

    // Validate new planned_qty satisfies CHECK constraint
    const commitment = part.reserved_qty + part.issued_qty - part.returned_qty;
    if (commitment > newPlannedQty) {
      throw new Error(
        `Cannot reduce planned_qty to ${newPlannedQty}. ` +
          `Current commitment (reserved + issued - returned) is ${commitment}`,
      );
    }

    const [updated] = await tx
      .update(jobCardParts)
      .set({ plannedQty: newPlannedQty })
      .where(eq(jobCardParts.id, jobCardPartId))
      .returning();

    // Log the change in job card notes
    if (notes) {
      await tx.execute(
        sql`UPDATE job_cards
            SET notes = COALESCE(notes, '') || ${`\n[Part qty updated: ${part.product_id} → ${newPlannedQty}] ${notes}`},
                updated_at = NOW()
            WHERE id = ${part.job_card_id}`,
      );
    }

    return updated;
  });
}

/**
 * Approve a job card (ESTIMATING → APPROVED).
 * THE PARTIAL RESERVATION PATH:
 *
 * For each part line:
 *   1. Lock inventory row
 *   2. Compute available = stockLevel - reservedLevel
 *   3. reservable = min(planned_qty - reserved_qty, available)
 *   4. Reserve: inventory.reservedLevel += reservable, part.reserved_qty += reservable
 *
 * After all parts:
 *   - If all parts fully reserved → READY_FOR_BAY
 *   - If any shortfall → WAITING_FOR_PARTS
 */
export async function approveJobCard(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: ApproveJobCardInput,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const jcRows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (jcRows.length === 0) throw new Error("Job card not found");

    const jc = jcRows[0] as any;

    // Idempotency
    if (
      (jc.status === JobCardStatus.READY_FOR_BAY ||
        jc.status === JobCardStatus.WAITING_FOR_PARTS) &&
      jc.idempotency_key === input.idempotencyKey
    ) {
      return jc;
    }

    if (
      !isValidJobCardTransition(
        jc.status as JobCardStatus,
        JobCardStatus.APPROVED,
      )
    ) {
      throw new Error(`Cannot approve job card in ${jc.status} status`);
    }

    // Lock part lines in deterministic order (by ID ASC)
    const partLines = await tx.execute(
      sql`SELECT * FROM job_card_parts
          WHERE job_card_id = ${jobCardId} AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    let allFullyReserved = true;

    // Collect unique (locationId, productId) pairs for deterministic lock ordering
    const inventoryKeys: { locationId: string; productId: string; partId: string }[] = [];
    for (const part of partLines) {
      const p = part as any;
      inventoryKeys.push({
        locationId: p.location_id,
        productId: p.product_id,
        partId: p.id,
      });
    }

    // Sort by (locationId, productId) for deterministic lock ordering
    inventoryKeys.sort((a, b) => {
      const locCmp = a.locationId.localeCompare(b.locationId);
      if (locCmp !== 0) return locCmp;
      return a.productId.localeCompare(b.productId);
    });

    // Get unique keys for inventory locking
    const uniqueInvKeys = inventoryKeys.filter(
      (item, idx, arr) =>
        idx === 0 ||
        item.productId !== arr[idx - 1].productId ||
        item.locationId !== arr[idx - 1].locationId,
    );

    // Lock all inventory rows
    const invMap = new Map<string, { id: string; stockLevel: number; reservedLevel: number }>();
    for (const key of uniqueInvKeys) {
      const inv = await lockInventoryRow(tx, orgId, key.productId, key.locationId);
      invMap.set(`${key.locationId}:${key.productId}`, inv);
    }

    // Reserve for each part line
    for (const rawPart of partLines) {
      const part = rawPart as any;
      const invKey = `${part.location_id}:${part.product_id}`;
      const inv = invMap.get(invKey)!;

      const needed = part.planned_qty - part.reserved_qty;
      if (needed <= 0) continue; // Already fully reserved

      const available = inv.stockLevel - inv.reservedLevel;
      const reservable = Math.min(needed, Math.max(0, available));

      if (reservable > 0) {
        // Update inventory reserved level
        const newReserved = inv.reservedLevel + reservable;
        await tx
          .update(inventory)
          .set({ reservedLevel: newReserved })
          .where(eq(inventory.id, inv.id));
        inv.reservedLevel = newReserved;

        // Update part line reserved qty
        await tx
          .update(jobCardParts)
          .set({ reservedQty: part.reserved_qty + reservable })
          .where(eq(jobCardParts.id, part.id));
      }

      // Check if fully reserved after this reservation
      if (reservable < needed) {
        allFullyReserved = false;
      }
    }

    // Determine target status
    const targetStatus = allFullyReserved
      ? JobCardStatus.READY_FOR_BAY
      : JobCardStatus.WAITING_FOR_PARTS;

    const updateSet: Record<string, any> = {
      status: targetStatus,
      approvedByUserId: userId,
      approvedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    };

    if (input.notes) {
      updateSet.notes = `${jc.notes ?? ""}\n[APPROVED → ${targetStatus}] ${input.notes}`.trim();
    }

    const [updated] = await tx
      .update(jobCards)
      .set(updateSet)
      .where(eq(jobCards.id, jobCardId))
      .returning();

    // Emit state log: ESTIMATING → targetStatus (WAITING_FOR_PARTS or READY_FOR_BAY)
    await emitStateLog(tx, orgId, jobCardId, "ESTIMATING", targetStatus, userId, input.notes);

    return updated;
  });
}

/**
 * Issue parts from inventory to the job card.
 * THE DEDUCTION MOMENT — JOB_CARD_ISSUE journal.
 *
 * For each line:
 *   consume_reserved = min(issue_qty, line.reserved_qty)
 *   direct_issue     = issue_qty - consume_reserved
 *
 *   Validate: if direct_issue > 0, then stockLevel - reservedLevel >= direct_issue
 *
 *   Apply:
 *     stockLevel     -= issue_qty
 *     reservedLevel  -= consume_reserved
 *     line.reserved_qty -= consume_reserved
 *     line.issued_qty   += issue_qty
 */
export async function issueParts(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: IssuePartsInput,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const jcRows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (jcRows.length === 0) throw new Error("Job card not found");

    const jc = jcRows[0] as any;
    const status = jc.status as JobCardStatus;

    if (!PARTS_ISSUABLE_STATUSES.includes(status)) {
      throw new Error(`Cannot issue parts in ${status} status`);
    }

    // Lock part lines in deterministic order
    const allParts = await tx.execute(
      sql`SELECT * FROM job_card_parts
          WHERE job_card_id = ${jobCardId} AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    const partMap = new Map<string, any>();
    for (const p of allParts) {
      partMap.set((p as any).id, p);
    }

    // Validate all input lines exist
    for (const line of input.lines) {
      if (!partMap.has(line.jobCardPartId)) {
        throw new Error(`Job card part ${line.jobCardPartId} not found`);
      }
    }

    // Sort input lines by part ID for deterministic processing
    const sortedLines = [...input.lines].sort((a, b) =>
      a.jobCardPartId.localeCompare(b.jobCardPartId),
    );

    // Collect unique inventory keys for locking
    const invKeysSet = new Set<string>();
    const invKeysArr: { locationId: string; productId: string }[] = [];
    for (const line of sortedLines) {
      const part = partMap.get(line.jobCardPartId);
      const key = `${part.location_id}:${part.product_id}`;
      if (!invKeysSet.has(key)) {
        invKeysSet.add(key);
        invKeysArr.push({ locationId: part.location_id, productId: part.product_id });
      }
    }

    // Sort and lock inventory rows
    invKeysArr.sort((a, b) => {
      const locCmp = a.locationId.localeCompare(b.locationId);
      if (locCmp !== 0) return locCmp;
      return a.productId.localeCompare(b.productId);
    });

    const invMap = new Map<string, { id: string; stockLevel: number; reservedLevel: number }>();
    for (const key of invKeysArr) {
      const inv = await lockInventoryRow(tx, orgId, key.productId, key.locationId);
      invMap.set(`${key.locationId}:${key.productId}`, inv);
    }

    // Pre-fetch current cost prices for all products being issued
    const productCostMap = new Map<string, string>();
    const uniqueProductIds = [...new Set(sortedLines.map((l) => partMap.get(l.jobCardPartId).product_id))];
    for (const productId of uniqueProductIds) {
      const [product] = await tx
        .select({
          id: products.id,
          currentCostPrice: products.currentCostPrice,
          mnemonicSku: products.mnemonicSku,
          name: products.name,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (product) {
        productCostMap.set(productId, product.currentCostPrice);
      }
    }

    // Process each issue line
    for (const line of sortedLines) {
      const part = partMap.get(line.jobCardPartId);
      const invKey = `${part.location_id}:${part.product_id}`;
      const inv = invMap.get(invKey)!;

      const issueQty = line.issueQty;

      // Compute consume_reserved and direct_issue
      const consumeReserved = Math.min(issueQty, part.reserved_qty);
      const directIssue = issueQty - consumeReserved;

      // Validate constraint after operation
      const newIssuedQty = part.issued_qty + issueQty;
      const newReservedQty = part.reserved_qty - consumeReserved;
      const finalCommitment = newReservedQty + newIssuedQty - part.returned_qty;
      if (finalCommitment > part.planned_qty) {
        throw new Error(
          `Issue would exceed planned_qty for part ${line.jobCardPartId}. ` +
            `Planned: ${part.planned_qty}, commitment after: ${finalCommitment}`,
        );
      }

      // Validate direct_issue has enough unreserved stock
      if (directIssue > 0) {
        const unreservedAvailable = inv.stockLevel - inv.reservedLevel;
        if (unreservedAvailable < directIssue) {
          // Get product name for error
          const [product] = await tx
            .select({ name: products.name, mnemonicSku: products.mnemonicSku })
            .from(products)
            .where(eq(products.id, part.product_id))
            .limit(1);

          throw new Error(
            `Insufficient unreserved stock for ${product?.mnemonicSku ?? part.product_id}. ` +
              `Unreserved available: ${unreservedAvailable}, Direct issue needed: ${directIssue}`,
          );
        }
      }

      // Apply inventory changes
      const newStockLevel = inv.stockLevel - issueQty;
      const newReservedLevel = inv.reservedLevel - consumeReserved;

      await tx
        .update(inventory)
        .set({
          stockLevel: newStockLevel,
          reservedLevel: newReservedLevel,
        })
        .where(eq(inventory.id, inv.id));

      // Update local cache
      inv.stockLevel = newStockLevel;
      inv.reservedLevel = newReservedLevel;

      // Update part line
      await tx
        .update(jobCardParts)
        .set({
          reservedQty: newReservedQty,
          issuedQty: newIssuedQty,
        })
        .where(eq(jobCardParts.id, line.jobCardPartId));

      // JOB_CARD_ISSUE journal entry — snapshot cost at issuance time
      const costSnapshot = productCostMap.get(part.product_id) ?? "0.00";
      const journalKey = `${input.idempotencyKey}:ISSUE:${line.jobCardPartId}`;
      await tx.insert(stockJournal).values({
        orgId,
        productId: part.product_id,
        locationId: part.location_id,
        userId,
        actorType: "USER",
        changeQuantity: -issueQty,
        balanceAfter: newStockLevel,
        referenceType: "JOB_CARD_ISSUE",
        referenceId: jobCardId,
        referenceLineId: line.jobCardPartId,
        unitCostSnapshot: costSnapshot,
        idempotencyKey: journalKey,
        notes: input.notes ?? `Job card ${jc.job_no} issue`,
      });
    }

    return { success: true };
  });
}

/**
 * Return parts from the job card back to inventory.
 * JOB_CARD_RETURN journal (positive changeQuantity).
 *
 * Validates: returned_qty + returnQty <= issued_qty
 * Restores stock and reserved level appropriately.
 */
export async function returnParts(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  input: ReturnPartsInput,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const jcRows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (jcRows.length === 0) throw new Error("Job card not found");

    const jc = jcRows[0] as any;

    // Returns allowed in active states + cancellation flow
    const returnableStatuses: JobCardStatus[] = [
      JobCardStatus.IN_PROGRESS,
      JobCardStatus.WORK_COMPLETED,
      // Also allow returns if trying to cancel (parts must be returned first)
      JobCardStatus.APPROVED,
      JobCardStatus.WAITING_FOR_PARTS,
      JobCardStatus.READY_FOR_BAY,
    ];
    if (!returnableStatuses.includes(jc.status as JobCardStatus)) {
      throw new Error(`Cannot return parts in ${jc.status} status`);
    }

    // Lock part lines
    const allParts = await tx.execute(
      sql`SELECT * FROM job_card_parts
          WHERE job_card_id = ${jobCardId} AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    const partMap = new Map<string, any>();
    for (const p of allParts) {
      partMap.set((p as any).id, p);
    }

    // Sort input lines by part ID
    const sortedLines = [...input.lines].sort((a, b) =>
      a.jobCardPartId.localeCompare(b.jobCardPartId),
    );

    // Validate and collect inventory keys
    const invKeysSet = new Set<string>();
    const invKeysArr: { locationId: string; productId: string }[] = [];
    for (const line of sortedLines) {
      const part = partMap.get(line.jobCardPartId);
      if (!part) throw new Error(`Job card part ${line.jobCardPartId} not found`);

      // Validate: returned_qty + returnQty <= issued_qty
      if (part.returned_qty + line.returnQty > part.issued_qty) {
        throw new Error(
          `Cannot return ${line.returnQty} for part ${line.jobCardPartId}. ` +
            `Already returned: ${part.returned_qty}, Issued: ${part.issued_qty}`,
        );
      }

      const key = `${part.location_id}:${part.product_id}`;
      if (!invKeysSet.has(key)) {
        invKeysSet.add(key);
        invKeysArr.push({ locationId: part.location_id, productId: part.product_id });
      }
    }

    // Lock inventory rows
    invKeysArr.sort((a, b) => {
      const locCmp = a.locationId.localeCompare(b.locationId);
      if (locCmp !== 0) return locCmp;
      return a.productId.localeCompare(b.productId);
    });

    const invMap = new Map<string, { id: string; stockLevel: number; reservedLevel: number }>();
    for (const key of invKeysArr) {
      const inv = await lockInventoryRow(tx, orgId, key.productId, key.locationId);
      invMap.set(`${key.locationId}:${key.productId}`, inv);
    }

    // Process returns — FIFO cost-layer-consistent
    // Each return journal entry reverses a specific issue journal at the same unit_cost_snapshot.
    // If a return spans multiple issue cost layers, we create one return journal row per layer.
    for (const line of sortedLines) {
      const part = partMap.get(line.jobCardPartId);
      const invKey = `${part.location_id}:${part.product_id}`;
      const inv = invMap.get(invKey)!;

      const returnQty = line.returnQty;

      // Restore stock
      const newStockLevel = inv.stockLevel + returnQty;

      await tx
        .update(inventory)
        .set({ stockLevel: newStockLevel })
        .where(eq(inventory.id, inv.id));

      inv.stockLevel = newStockLevel;

      // Update part line
      await tx
        .update(jobCardParts)
        .set({ returnedQty: part.returned_qty + returnQty })
        .where(eq(jobCardParts.id, line.jobCardPartId));

      // ── FIFO Cost-Layer Return Logic ──
      // 1. Fetch all JOB_CARD_ISSUE journal entries for this part line (FIFO order)
      const issueEntries = await tx.execute(
        sql`SELECT sj.id, sj.change_quantity, sj.unit_cost_snapshot
            FROM stock_journal sj
            WHERE sj.reference_type = 'JOB_CARD_ISSUE'
              AND sj.reference_id = ${jobCardId}
              AND sj.reference_line_id = ${line.jobCardPartId}
              AND sj.org_id = ${orgId}
            ORDER BY sj.effective_at ASC, sj.created_at ASC, sj.id ASC`,
      );

      // 2. For each issue entry, find how many units have already been returned against it
      const issueReturned = new Map<string, number>();
      for (const entry of issueEntries) {
        const e = entry as any;
        const returnedAgainst = await tx.execute(
          sql`SELECT COALESCE(SUM(sj.change_quantity), 0)::int AS returned_qty
              FROM stock_journal sj
              WHERE sj.reversal_of_journal_id = ${e.id}
                AND sj.reference_type = 'JOB_CARD_RETURN'
                AND sj.org_id = ${orgId}`,
        );
        issueReturned.set(e.id, (returnedAgainst[0] as any).returned_qty);
      }

      // 3. FIFO: consume from earliest issue layers first
      let remaining = returnQty;
      let layerIdx = 0;
      let balanceTracker = newStockLevel; // Start from post-return balance

      while (remaining > 0 && layerIdx < issueEntries.length) {
        const issueEntry = issueEntries[layerIdx] as any;
        const issuedQtyAbs = Math.abs(issueEntry.change_quantity);
        const alreadyReturned = issueReturned.get(issueEntry.id) ?? 0;
        const returnable = issuedQtyAbs - alreadyReturned;

        if (returnable > 0) {
          const layerReturn = Math.min(remaining, returnable);
          const costSnapshot = issueEntry.unit_cost_snapshot ?? "0.00";

          const journalKey = `${input.idempotencyKey}:RETURN:${line.jobCardPartId}:${issueEntry.id}`;
          await tx.insert(stockJournal).values({
            orgId,
            productId: part.product_id,
            locationId: part.location_id,
            userId,
            actorType: "USER",
            changeQuantity: layerReturn, // positive — restoring stock
            balanceAfter: balanceTracker,
            referenceType: "JOB_CARD_RETURN",
            referenceId: jobCardId,
            referenceLineId: line.jobCardPartId,
            unitCostSnapshot: costSnapshot,
            reversalOfJournalId: issueEntry.id,
            idempotencyKey: journalKey,
            notes: input.notes ?? `Job card ${jc.job_no} return`,
          });

          remaining -= layerReturn;
        }
        layerIdx++;
      }

      // Safety check: if remaining > 0, issue entries were exhausted (shouldn't happen with valid data)
      if (remaining > 0) {
        throw new Error(
          `FIFO layer mismatch: ${remaining} return units could not be matched to issue cost layers ` +
            `for part ${line.jobCardPartId}. Data integrity issue.`,
        );
      }
    }

    return { success: true };
  });
}

/**
 * Cancel a job card.
 * BLOCKED if any part has net_issued (issued_qty - returned_qty) > 0.
 * Releases all reservations.
 */
export async function cancelJobCard(
  jobCardId: string,
  orgId: string,
  userId: string,
  userRole: string,
  idempotencyKey: string,
  notes?: string,
) {
  assertServiceRole(userRole);

  return db.transaction(async (tx) => {
    // Lock job card
    const jcRows = await tx.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId} AND org_id = ${orgId} FOR UPDATE`,
    );
    if (jcRows.length === 0) throw new Error("Job card not found");

    const jc = jcRows[0] as any;

    // Idempotency
    if (
      jc.status === JobCardStatus.CANCELLED &&
      jc.idempotency_key === idempotencyKey
    ) {
      return jc;
    }

    if (
      !isValidJobCardTransition(
        jc.status as JobCardStatus,
        JobCardStatus.CANCELLED,
      )
    ) {
      throw new Error(`Cannot cancel job card in ${jc.status} status`);
    }

    // Lock all part lines
    const allParts = await tx.execute(
      sql`SELECT * FROM job_card_parts
          WHERE job_card_id = ${jobCardId} AND org_id = ${orgId}
          ORDER BY id ASC
          FOR UPDATE`,
    );

    // ERP Consultant Correction #3: BLOCK if any net_issued > 0
    for (const rawPart of allParts) {
      const part = rawPart as any;
      const netIssued = part.issued_qty - part.returned_qty;
      if (netIssued > 0) {
        throw new Error(
          `Cannot cancel: part ${part.product_id} has ${netIssued} net issued units. ` +
            `All issued parts must be returned before cancellation.`,
        );
      }
    }

    // Release all reservations
    const invKeysArr: { locationId: string; productId: string }[] = [];
    const partsWithReservation: any[] = [];

    for (const rawPart of allParts) {
      const part = rawPart as any;
      if (part.reserved_qty > 0) {
        partsWithReservation.push(part);
        invKeysArr.push({
          locationId: part.location_id,
          productId: part.product_id,
        });
      }
    }

    if (partsWithReservation.length > 0) {
      // Sort and deduplicate
      invKeysArr.sort((a, b) => {
        const locCmp = a.locationId.localeCompare(b.locationId);
        if (locCmp !== 0) return locCmp;
        return a.productId.localeCompare(b.productId);
      });

      const uniqueInvKeys = invKeysArr.filter(
        (item, idx, arr) =>
          idx === 0 ||
          item.productId !== arr[idx - 1].productId ||
          item.locationId !== arr[idx - 1].locationId,
      );

      // Lock inventory rows and release reservations
      for (const key of uniqueInvKeys) {
        const inv = await lockInventoryRow(tx, orgId, key.productId, key.locationId);

        // Sum reservations for this product+location across part lines
        let totalReserved = 0;
        for (const part of partsWithReservation) {
          if (
            part.location_id === key.locationId &&
            part.product_id === key.productId
          ) {
            totalReserved += part.reserved_qty;
          }
        }

        // Release reservation
        const newReservedLevel = Math.max(0, inv.reservedLevel - totalReserved);
        await tx
          .update(inventory)
          .set({ reservedLevel: newReservedLevel })
          .where(eq(inventory.id, inv.id));
      }

      // Zero out reserved_qty on all part lines
      for (const part of partsWithReservation) {
        await tx
          .update(jobCardParts)
          .set({ reservedQty: 0 })
          .where(eq(jobCardParts.id, part.id));
      }
    }

    // Update job card status
    const [updated] = await tx
      .update(jobCards)
      .set({
        status: "CANCELLED",
        cancelledByUserId: userId,
        cancelledAt: new Date(),
        idempotencyKey,
        notes: notes
          ? `${jc.notes ?? ""}\n[CANCELLED] ${notes}`.trim()
          : jc.notes,
      })
      .where(eq(jobCards.id, jobCardId))
      .returning();

    // Emit state log
    await emitStateLog(tx, orgId, jobCardId, jc.status, "CANCELLED", userId, notes);

    return updated;
  });
}

// ── Query Functions ──

/**
 * Get a job card by ID with full detail.
 */
export async function getJobCard(jobCardId: string, orgId: string) {
  const [jc] = await db
    .select()
    .from(jobCards)
    .where(and(eq(jobCards.id, jobCardId), eq(jobCards.orgId, orgId)))
    .limit(1);

  if (!jc) return null;
  return buildJobCardDetail(jc);
}

/**
 * Get a job card by its public job number.
 */
export async function getJobCardByNumber(jobNo: string, orgId: string) {
  const [jc] = await db
    .select()
    .from(jobCards)
    .where(and(eq(jobCards.jobNo, jobNo), eq(jobCards.orgId, orgId)))
    .limit(1);

  if (!jc) return null;
  return buildJobCardDetail(jc);
}

/**
 * Build enriched job card detail.
 */
async function buildJobCardDetail(jc: typeof jobCards.$inferSelect) {
  // Fetch customer
  const [customer] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, jc.customerId))
    .limit(1);

  // Fetch vehicle
  const [vehicle] = await db
    .select()
    .from(customerVehicles)
    .where(eq(customerVehicles.id, jc.customerVehicleId))
    .limit(1);

  // Fetch location
  const [location] = await db
    .select({
      id: locations.id,
      name: locations.name,
      code: locations.code,
      type: locations.type,
    })
    .from(locations)
    .where(eq(locations.id, jc.locationId))
    .limit(1);

  // Fetch labor lines with service operation details
  const laborLines = await db
    .select({
      id: jobCardLabor.id,
      serviceOperationId: jobCardLabor.serviceOperationId,
      description: jobCardLabor.description,
      qtyHours: jobCardLabor.qtyHours,
      unitPrice: jobCardLabor.unitPrice,
      lineTotal: jobCardLabor.lineTotal,
      createdAt: jobCardLabor.createdAt,
      opCode: serviceOperations.code,
      opName: serviceOperations.name,
      opCategory: serviceOperations.category,
    })
    .from(jobCardLabor)
    .innerJoin(
      serviceOperations,
      eq(serviceOperations.id, jobCardLabor.serviceOperationId),
    )
    .where(eq(jobCardLabor.jobCardId, jc.id))
    .orderBy(asc(jobCardLabor.createdAt));

  // Fetch part lines with product info
  const partLines = await db
    .select({
      id: jobCardParts.id,
      productId: jobCardParts.productId,
      locationId: jobCardParts.locationId,
      plannedQty: jobCardParts.plannedQty,
      reservedQty: jobCardParts.reservedQty,
      issuedQty: jobCardParts.issuedQty,
      returnedQty: jobCardParts.returnedQty,
      unitPrice: jobCardParts.unitPrice,
      createdAt: jobCardParts.createdAt,
      productName: products.name,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      category: products.category,
    })
    .from(jobCardParts)
    .innerJoin(products, eq(products.id, jobCardParts.productId))
    .where(eq(jobCardParts.jobCardId, jc.id))
    .orderBy(asc(jobCardParts.createdAt));

  // Compute allowed actions based on current status
  const allowedActions = computeAllowedActions(jc.status as JobCardStatus, partLines);

  return {
    ...jc,
    customer,
    vehicle,
    location,
    laborLines,
    partLines,
    allowedActions,
  };
}

/**
 * Compute what actions are allowed on a job card given its status.
 */
function computeAllowedActions(
  status: JobCardStatus,
  partLines: { issuedQty: number; returnedQty: number }[],
): string[] {
  const actions: string[] = [];

  // Status transitions
  const transitions = {
    [JobCardStatus.SCHEDULED]: ["check_in", "cancel"],
    [JobCardStatus.CHECKED_IN]: ["start_estimating", "cancel"],
    [JobCardStatus.ESTIMATING]: ["approve", "add_labor", "add_parts", "cancel"],
    [JobCardStatus.APPROVED]: ["add_parts", "cancel"],
    [JobCardStatus.WAITING_FOR_PARTS]: ["move_to_bay", "add_parts", "cancel"],
    [JobCardStatus.READY_FOR_BAY]: ["start_work", "add_parts", "cancel"],
    [JobCardStatus.IN_PROGRESS]: [
      "complete_work",
      "issue_parts",
      "return_parts",
      "add_parts",
      "cancel",
    ],
    [JobCardStatus.WORK_COMPLETED]: ["invoice", "return_parts", "cancel"],
    [JobCardStatus.INVOICED]: ["close"],
    [JobCardStatus.CLOSED]: [],
    [JobCardStatus.CANCELLED]: [],
  };

  const statusActions = transitions[status] ?? [];
  actions.push(...statusActions);

  // If cancel is in actions, check if it should be blocked
  if (actions.includes("cancel")) {
    const hasNetIssued = partLines.some(
      (p) => p.issuedQty - p.returnedQty > 0,
    );
    if (hasNetIssued) {
      // Remove cancel — net issued parts must be returned first
      const idx = actions.indexOf("cancel");
      if (idx !== -1) actions.splice(idx, 1);
      actions.push("cancel_blocked_net_issued");
    }
  }

  return actions;
}

/**
 * List job cards with pagination.
 */
export async function listJobCards(
  orgId: string,
  locationId?: string,
  cursor?: string,
  limit: number = 50,
) {
  const conditions = [eq(jobCards.orgId, orgId)];
  if (locationId) {
    conditions.push(eq(jobCards.locationId, locationId));
  }
  if (cursor) {
    conditions.push(sql`${jobCards.id} > ${cursor}`);
  }

  const results = await db
    .select({
      id: jobCards.id,
      jobNo: jobCards.jobNo,
      status: jobCards.status,
      locationId: jobCards.locationId,
      customerId: jobCards.customerId,
      customerVehicleId: jobCards.customerVehicleId,
      assignedTechnicianUserId: jobCards.assignedTechnicianUserId,
      createdAt: jobCards.createdAt,
      updatedAt: jobCards.updatedAt,
      customerName: customers.name,
    })
    .from(jobCards)
    .innerJoin(customers, eq(customers.id, jobCards.customerId))
    .where(and(...conditions))
    .orderBy(asc(jobCards.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

/**
 * Get JOB_CARD_ISSUE and JOB_CARD_RETURN journal entries for a job card.
 */
export async function getJobCardJournal(jobCardId: string, orgId: string) {
  const entries = await db
    .select()
    .from(stockJournal)
    .where(
      and(
        eq(stockJournal.referenceId, jobCardId),
        eq(stockJournal.orgId, orgId),
        sql`${stockJournal.referenceType} IN ('JOB_CARD_ISSUE', 'JOB_CARD_RETURN')`,
      ),
    )
    .orderBy(asc(stockJournal.effectiveAt), asc(stockJournal.createdAt));

  return entries;
}
