import { db } from "@apex/database";
import {
  inventoryCounts,
  inventoryCountItems,
  countNumberSequence,
  products,
  inventory,
  locations,
  brands,
  categories,
  stockJournal,
} from "@apex/database/schema";
import {
  eq,
  and,
  sql,
  desc,
  gt,
  ilike,
  or,
  inArray,
  isNotNull,
  type SQL,
} from "drizzle-orm";
import type { CreateCountInput, RecordCountItemsInput } from "@apex/types";

// ── Generate count number ──

async function generateCountNumber(
  orgId: string,
  tx: typeof db,
): Promise<string> {
  // Advisory lock based on org_id hash to prevent concurrent number generation
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${orgId} || 'count_seq'))`,
  );

  // Upsert sequence row
  await tx.execute(
    sql`INSERT INTO count_number_sequence (org_id, last_number)
        VALUES (${orgId}, 0)
        ON CONFLICT (org_id) DO NOTHING`,
  );

  const [row] = await tx
    .update(countNumberSequence)
    .set({ lastNumber: sql`${countNumberSequence.lastNumber} + 1` })
    .where(eq(countNumberSequence.orgId, orgId))
    .returning({ lastNumber: countNumberSequence.lastNumber });

  const num = row!.lastNumber;
  return `CNT-${String(num).padStart(6, "0")}`;
}

// ── Create count ──

export async function createCount(
  orgId: string,
  locationId: string,
  userId: string,
  input: CreateCountInput,
) {
  return db.transaction(async (tx) => {
    // Check no IN_PROGRESS count at this location
    const [existing] = await tx
      .select({ id: inventoryCounts.id })
      .from(inventoryCounts)
      .where(
        and(
          eq(inventoryCounts.orgId, orgId),
          eq(inventoryCounts.locationId, locationId),
          eq(inventoryCounts.status, "IN_PROGRESS"),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error(
        "An IN_PROGRESS count already exists at this location. Complete or cancel it first.",
      );
    }

    const countNumber = await generateCountNumber(orgId, tx as any);

    // Build product query based on count type and filters
    const conditions: SQL[] = [
      eq(inventory.locationId, locationId),
      eq(products.orgId, orgId),
      gt(inventory.stockLevel, 0),
    ];

    if (input.countType === "CYCLE" && input.filterCriteria) {
      if (input.filterCriteria.familyId) {
        conditions.push(
          sql`(${products.familyId} = ${input.filterCriteria.familyId} OR EXISTS (
            SELECT 1 FROM categories c WHERE c.id = ${products.categoryId} AND c.family_id = ${input.filterCriteria.familyId}
          ))`,
        );
      }
      if (input.filterCriteria.categoryId) {
        conditions.push(
          eq(products.categoryId, input.filterCriteria.categoryId),
        );
      }
      if (input.filterCriteria.subcategoryId) {
        conditions.push(
          eq(products.subcategoryId, input.filterCriteria.subcategoryId),
        );
      }
      if (input.filterCriteria.brandId) {
        conditions.push(eq(products.brandId, input.filterCriteria.brandId));
      }
    }

    // Snapshot products with inventory
    const inventoryRows = await tx
      .select({
        productId: products.id,
        productName: sql<string>`CASE WHEN ${products.parentProductId} IS NOT NULL THEN (SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId}) || ' (' || ${products.name} || ')' ELSE ${products.name} END`.as("product_name"),
        sku: products.sku,
        costPrice: products.costPrice,
        brandName: brands.name,
        categoryName: categories.name,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(products.name);

    if (inventoryRows.length === 0) {
      throw new Error(
        "No inventory items found for the selected scope and location",
      );
    }

    // Insert count session
    const [session] = await tx
      .insert(inventoryCounts)
      .values({
        orgId,
        locationId,
        countNumber,
        countType: input.countType as any,
        status: "DRAFT",
        title: input.title,
        notes: input.notes,
        filterCriteria: input.filterCriteria ?? null,
        totalItems: inventoryRows.length,
        createdBy: userId,
      })
      .returning();

    // Bulk insert items in chunks
    const CHUNK_SIZE = 1000;
    const itemValues = inventoryRows.map((inv) => ({
      countId: session!.id,
      productId: inv.productId,
      productName: inv.productName,
      sku: inv.sku,
      brandName: inv.brandName,
      categoryName: inv.categoryName,
      systemQty: inv.stockLevel,
      costPrice: inv.costPrice,
      status: "PENDING" as const,
    }));

    for (let i = 0; i < itemValues.length; i += CHUNK_SIZE) {
      await tx
        .insert(inventoryCountItems)
        .values(itemValues.slice(i, i + CHUNK_SIZE));
    }

    return {
      id: session!.id,
      countNumber: session!.countNumber,
      countType: session!.countType,
      status: session!.status,
      totalItems: inventoryRows.length,
    };
  });
}

// ── Start count ──

export async function startCount(orgId: string, countId: string) {
  const [session] = await db
    .select({ id: inventoryCounts.id, status: inventoryCounts.status })
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");
  if (session.status !== "DRAFT") {
    throw new Error(`Cannot start count in ${session.status} status. Must be DRAFT.`);
  }

  await db
    .update(inventoryCounts)
    .set({ status: "IN_PROGRESS", startedAt: new Date() })
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, status: "IN_PROGRESS" };
}

// ── Record items ──

export async function recordItems(
  orgId: string,
  countId: string,
  userId: string,
  input: RecordCountItemsInput,
) {
  return db.transaction(async (tx) => {
    // Validate session
    const [session] = await tx
      .select({
        id: inventoryCounts.id,
        status: inventoryCounts.status,
      })
      .from(inventoryCounts)
      .where(
        and(
          eq(inventoryCounts.id, countId),
          eq(inventoryCounts.orgId, orgId),
        ),
      )
      .limit(1);

    if (!session) throw new Error("Count session not found");
    if (session.status !== "IN_PROGRESS") {
      throw new Error(
        `Cannot record counts in ${session.status} status. Must be IN_PROGRESS.`,
      );
    }

    const itemIds = input.items.map((i) => i.itemId);

    // Fetch existing items
    const existingItems = await tx
      .select({
        id: inventoryCountItems.id,
        systemQty: inventoryCountItems.systemQty,
        countedQty: inventoryCountItems.countedQty,
        variance: inventoryCountItems.variance,
        costPrice: inventoryCountItems.costPrice,
        status: inventoryCountItems.status,
      })
      .from(inventoryCountItems)
      .where(
        and(
          eq(inventoryCountItems.countId, countId),
          inArray(inventoryCountItems.id, itemIds),
        ),
      );

    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    let newCountedDelta = 0;
    let varianceDelta = 0;

    for (const item of input.items) {
      const existing = itemMap.get(item.itemId);
      if (!existing) {
        throw new Error(`Count item ${item.itemId} not found`);
      }

      const wasUncounted = existing.status === "PENDING";
      const hadVariance =
        existing.variance !== null && existing.variance !== 0;
      const newVariance = item.countedQty - existing.systemQty;
      const hasVariance = newVariance !== 0;
      const varianceCost = String(
        (newVariance * Number(existing.costPrice)).toFixed(2),
      );

      await tx
        .update(inventoryCountItems)
        .set({
          countedQty: item.countedQty,
          variance: newVariance,
          varianceCost,
          status: "COUNTED",
          countedBy: userId,
          countedAt: new Date(),
          notes: item.notes ?? null,
        })
        .where(eq(inventoryCountItems.id, item.itemId));

      if (wasUncounted) newCountedDelta++;
      varianceDelta += (hasVariance ? 1 : 0) - (hadVariance ? 1 : 0);
    }

    // Update session stats
    if (newCountedDelta !== 0 || varianceDelta !== 0) {
      await tx
        .update(inventoryCounts)
        .set({
          countedItems: sql`${inventoryCounts.countedItems} + ${newCountedDelta}`,
          varianceCount: sql`${inventoryCounts.varianceCount} + ${varianceDelta}`,
        })
        .where(eq(inventoryCounts.id, countId));
    }

    return { recorded: input.items.length };
  });
}

// ── Submit for review ──

export async function submitReview(orgId: string, countId: string) {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({
        id: inventoryCounts.id,
        status: inventoryCounts.status,
      })
      .from(inventoryCounts)
      .where(
        and(
          eq(inventoryCounts.id, countId),
          eq(inventoryCounts.orgId, orgId),
        ),
      )
      .limit(1);

    if (!session) throw new Error("Count session not found");
    if (session.status !== "IN_PROGRESS") {
      throw new Error(
        `Cannot submit for review in ${session.status} status. Must be IN_PROGRESS.`,
      );
    }

    // Skip uncounted items
    await tx
      .update(inventoryCountItems)
      .set({ status: "SKIPPED" })
      .where(
        and(
          eq(inventoryCountItems.countId, countId),
          eq(inventoryCountItems.status, "PENDING"),
        ),
      );

    // Recalculate totals
    const [stats] = await tx
      .select({
        varianceCount: sql<number>`count(*) filter (where ${inventoryCountItems.variance} != 0 and ${inventoryCountItems.variance} is not null)`,
        varianceValue: sql<string>`coalesce(sum(${inventoryCountItems.varianceCost}), 0)`,
      })
      .from(inventoryCountItems)
      .where(eq(inventoryCountItems.countId, countId));

    await tx
      .update(inventoryCounts)
      .set({
        status: "REVIEW",
        reviewStartedAt: new Date(),
        varianceCount: Number(stats!.varianceCount),
        varianceValue: stats!.varianceValue,
      })
      .where(eq(inventoryCounts.id, countId));

    return { id: countId, status: "REVIEW" };
  });
}

// ── Complete count ──

export async function completeCount(
  orgId: string,
  countId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Lock session
    const sessionRows = await tx.execute(
      sql`SELECT * FROM inventory_counts WHERE id = ${countId} AND org_id = ${orgId} FOR UPDATE`,
    );
    const session = sessionRows[0] as any;
    if (!session) throw new Error("Count session not found");
    if (session.status !== "REVIEW") {
      throw new Error(
        `Cannot complete count in ${session.status} status. Must be REVIEW.`,
      );
    }

    // Fetch items with variance != 0
    const varianceItems = await tx
      .select({
        id: inventoryCountItems.id,
        productId: inventoryCountItems.productId,
        countedQty: inventoryCountItems.countedQty,
        variance: inventoryCountItems.variance,
        costPrice: inventoryCountItems.costPrice,
      })
      .from(inventoryCountItems)
      .where(
        and(
          eq(inventoryCountItems.countId, countId),
          isNotNull(inventoryCountItems.variance),
          sql`${inventoryCountItems.variance} != 0`,
        ),
      );

    const locationId = session.location_id;

    for (const item of varianceItems) {
      const variance = item.variance!;
      const isGain = variance > 0;

      // Lock inventory row
      const invRows = await tx.execute(
        sql`SELECT id, stock_level
            FROM inventory
            WHERE product_id = ${item.productId}
              AND location_id = ${locationId}
            FOR UPDATE`,
      );
      const inv = invRows[0] as any;
      if (!inv) continue;

      const newBalance = inv.stock_level + variance;

      // Update inventory stock_level = counted_qty
      await tx
        .update(inventory)
        .set({ stockLevel: item.countedQty! })
        .where(eq(inventory.id, inv.id));

      // Create stock journal entry
      await tx.insert(stockJournal).values({
        orgId,
        productId: item.productId,
        locationId,
        userId,
        actorType: "USER",
        changeQuantity: variance,
        balanceAfter: newBalance,
        referenceType: "STOCKTAKE",
        referenceId: countId,
        referenceLineId: item.id,
        reasonCode: isGain ? "COUNT_GAIN" : "COUNT_LOSS",
        idempotencyKey: `CNT:${countId}:${item.id}`,
        effectiveAt: new Date(),
        notes: `Inventory count ${session.count_number}`,
      });
    }

    // Mark as completed
    await tx
      .update(inventoryCounts)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: userId,
      })
      .where(eq(inventoryCounts.id, countId));

    return {
      id: countId,
      status: "COMPLETED",
      adjustmentsCreated: varianceItems.length,
    };
  });
}

// ── Cancel count ──

export async function cancelCount(
  orgId: string,
  countId: string,
  userId: string,
  reason: string,
) {
  const [session] = await db
    .select({ id: inventoryCounts.id, status: inventoryCounts.status })
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");
  if (session.status === "COMPLETED") {
    throw new Error("Cannot cancel a completed count");
  }

  await db
    .update(inventoryCounts)
    .set({
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason: reason,
    })
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, status: "CANCELLED" };
}

// ── Delete count (DRAFT only) ──

export async function deleteCount(orgId: string, countId: string) {
  const [session] = await db
    .select({ id: inventoryCounts.id, status: inventoryCounts.status })
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");
  if (session.status !== "DRAFT") {
    throw new Error("Can only delete counts in DRAFT status");
  }

  await db
    .delete(inventoryCounts)
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, deleted: true };
}

// ── Get count detail ──

export async function getCount(orgId: string, countId: string) {
  const [session] = await db
    .select({
      id: inventoryCounts.id,
      orgId: inventoryCounts.orgId,
      locationId: inventoryCounts.locationId,
      locationName: locations.name,
      countNumber: inventoryCounts.countNumber,
      countType: inventoryCounts.countType,
      status: inventoryCounts.status,
      title: inventoryCounts.title,
      notes: inventoryCounts.notes,
      filterCriteria: inventoryCounts.filterCriteria,
      totalItems: inventoryCounts.totalItems,
      countedItems: inventoryCounts.countedItems,
      varianceCount: inventoryCounts.varianceCount,
      varianceValue: inventoryCounts.varianceValue,
      startedAt: inventoryCounts.startedAt,
      reviewStartedAt: inventoryCounts.reviewStartedAt,
      completedAt: inventoryCounts.completedAt,
      completedBy: inventoryCounts.completedBy,
      cancelledAt: inventoryCounts.cancelledAt,
      cancelledBy: inventoryCounts.cancelledBy,
      cancelReason: inventoryCounts.cancelReason,
      createdBy: inventoryCounts.createdBy,
      createdAt: inventoryCounts.createdAt,
      updatedAt: inventoryCounts.updatedAt,
    })
    .from(inventoryCounts)
    .innerJoin(locations, eq(inventoryCounts.locationId, locations.id))
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");

  return {
    ...session,
    startedAt: session.startedAt?.toISOString() ?? null,
    reviewStartedAt: session.reviewStartedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    cancelledAt: session.cancelledAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

// ── Get count items (paginated) ──

export interface GetCountItemsParams {
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function getCountItems(
  orgId: string,
  countId: string,
  params: GetCountItemsParams,
) {
  const limit = params.limit ?? 50;

  // Verify count belongs to org
  const [session] = await db
    .select({ id: inventoryCounts.id })
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");

  const conditions: SQL[] = [eq(inventoryCountItems.countId, countId)];

  if (params.status) {
    conditions.push(
      eq(inventoryCountItems.status, params.status as any),
    );
  }

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(inventoryCountItems.productName, `%${params.search}%`),
        ilike(inventoryCountItems.sku, `%${params.search}%`),
      )!,
    );
  }

  if (params.cursor) {
    conditions.push(gt(inventoryCountItems.id, params.cursor));
  }

  const rows = await db
    .select()
    .from(inventoryCountItems)
    .where(and(...conditions))
    .orderBy(inventoryCountItems.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return {
    data: data.map((r) => ({
      ...r,
      countedAt: r.countedAt?.toISOString() ?? null,
    })),
    nextCursor,
    hasMore,
  };
}

// ── List counts (paginated) ──

export interface ListCountsParams {
  locationId?: string;
  status?: string;
  countType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function listCounts(orgId: string, params: ListCountsParams) {
  const limit = params.limit ?? 50;
  const conditions: SQL[] = [eq(inventoryCounts.orgId, orgId)];

  if (params.locationId) {
    conditions.push(eq(inventoryCounts.locationId, params.locationId));
  }

  if (params.status) {
    const statuses = params.status.split(",").filter(Boolean);
    if (statuses.length === 1) {
      conditions.push(eq(inventoryCounts.status, statuses[0] as any));
    } else if (statuses.length > 1) {
      conditions.push(
        inArray(
          inventoryCounts.status,
          statuses as any[],
        ),
      );
    }
  }

  if (params.countType) {
    conditions.push(eq(inventoryCounts.countType, params.countType as any));
  }

  if (params.dateFrom) {
    conditions.push(
      sql`${inventoryCounts.createdAt} >= ${params.dateFrom}::timestamptz`,
    );
  }

  if (params.dateTo) {
    conditions.push(
      sql`${inventoryCounts.createdAt} <= ${params.dateTo}::timestamptz`,
    );
  }

  if (params.search && params.search.length >= 2) {
    conditions.push(
      or(
        ilike(inventoryCounts.countNumber, `%${params.search}%`),
        ilike(inventoryCounts.title, `%${params.search}%`),
      )!,
    );
  }

  if (params.cursor) {
    const [cursorRow] = await db
      .select({ createdAt: inventoryCounts.createdAt })
      .from(inventoryCounts)
      .where(eq(inventoryCounts.id, params.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${inventoryCounts.createdAt}, ${inventoryCounts.id}) < (${cursorRow.createdAt}, ${params.cursor})`,
      );
    }
  }

  const rows = await db
    .select({
      id: inventoryCounts.id,
      locationId: inventoryCounts.locationId,
      locationName: locations.name,
      countNumber: inventoryCounts.countNumber,
      countType: inventoryCounts.countType,
      status: inventoryCounts.status,
      title: inventoryCounts.title,
      totalItems: inventoryCounts.totalItems,
      countedItems: inventoryCounts.countedItems,
      varianceCount: inventoryCounts.varianceCount,
      varianceValue: inventoryCounts.varianceValue,
      startedAt: inventoryCounts.startedAt,
      completedAt: inventoryCounts.completedAt,
      createdBy: inventoryCounts.createdBy,
      createdAt: inventoryCounts.createdAt,
    })
    .from(inventoryCounts)
    .innerJoin(locations, eq(inventoryCounts.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(desc(inventoryCounts.createdAt), desc(inventoryCounts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return {
    data: data.map((r) => ({
      ...r,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
    hasMore,
  };
}
