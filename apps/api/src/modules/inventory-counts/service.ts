import { db, type DbOrTx } from "@apex/database";
import {
  inventoryCounts,
  inventoryCountLines,
  inventory,
  products,
  productFamilies,
  locations,
  stockJournal,
  users,
} from "@apex/database/schema";
import {
  eq,
  and,
  gt,
  sql,
  ilike,
  or,
  isNull,
  isNotNull,
  inArray,
  desc,
  type SQL,
} from "drizzle-orm";
import type {
  CreateCountInput,
  RecordCountLineInput,
  PostCountInput,
} from "@apex/types";

// ── Types ──

export interface CountSessionRow {
  id: string;
  locationId: string;
  locationName: string;
  label: string;
  status: string;
  scope: string;
  scopeFilter: string | null;
  notes: string | null;
  totalLines: number;
  countedLines: number;
  varianceLines: number;
  createdByName: string | null;
  reviewedByName: string | null;
  postedByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CountSessionsPage {
  data: CountSessionRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CountLineRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  mnemonicSku: string;
  category: string;
  familyName: string | null;
  inventoryId: string;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
  countedByName: string | null;
  countedAt: string | null;
  notes: string | null;
}

export interface CountDetailResponse {
  session: CountSessionRow;
  lines: CountLineRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── List count sessions ──

export interface ListCountsParams {
  orgId: string;
  locationId: string;
  allLocations?: boolean;
  overrideLocationId?: string;
  status?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export async function listCountSessions(
  params: ListCountsParams,
): Promise<CountSessionsPage> {
  const limit = params.limit ?? 50;
  const conditions: SQL[] = [eq(inventoryCounts.orgId, params.orgId)];

  if (!params.allLocations) {
    const locId = params.overrideLocationId || params.locationId;
    conditions.push(eq(inventoryCounts.locationId, locId));
  }

  if (params.status) {
    conditions.push(eq(inventoryCounts.status, params.status as any));
  }

  if (params.search && params.search.length >= 2) {
    conditions.push(ilike(inventoryCounts.label, `%${params.search}%`));
  }

  if (params.cursor) {
    // Keyset: we order by createdAt DESC, id DESC
    // Cursor is the id; resolve its createdAt for keyset
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

  // Alias for creator user
  const creatorAlias = db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .as("creator");

  const rows = await db
    .select({
      id: inventoryCounts.id,
      locationId: inventoryCounts.locationId,
      locationName: locations.name,
      label: inventoryCounts.label,
      status: inventoryCounts.status,
      scope: inventoryCounts.scope,
      scopeFilter: inventoryCounts.scopeFilter,
      notes: inventoryCounts.notes,
      totalLines: inventoryCounts.totalLines,
      countedLines: inventoryCounts.countedLines,
      varianceLines: inventoryCounts.varianceLines,
      createdByUserId: inventoryCounts.createdByUserId,
      startedAt: inventoryCounts.startedAt,
      completedAt: inventoryCounts.completedAt,
      reviewedAt: inventoryCounts.reviewedAt,
      postedAt: inventoryCounts.postedAt,
      createdAt: inventoryCounts.createdAt,
      updatedAt: inventoryCounts.updatedAt,
    })
    .from(inventoryCounts)
    .innerJoin(locations, eq(inventoryCounts.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(desc(inventoryCounts.createdAt), desc(inventoryCounts.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  // Batch-fetch user names for createdBy
  const userIds = [...new Set(data.map((r) => r.createdByUserId))];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

  const enriched: CountSessionRow[] = data.map((r) => ({
    id: r.id,
    locationId: r.locationId,
    locationName: r.locationName,
    label: r.label,
    status: r.status,
    scope: r.scope,
    scopeFilter: r.scopeFilter,
    notes: r.notes,
    totalLines: r.totalLines,
    countedLines: r.countedLines,
    varianceLines: r.varianceLines,
    createdByName: userMap.get(r.createdByUserId) ?? null,
    reviewedByName: null,
    postedByName: null,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    postedAt: r.postedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { data: enriched, nextCursor, hasMore };
}

// ── Create count session ──

export async function createCountSession(
  input: CreateCountInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Validate location
    const [location] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.id, input.locationId), eq(locations.orgId, orgId)))
      .limit(1);
    if (!location) throw new Error("Location not found");

    // Build conditions for which inventory rows to include
    const invConditions: SQL[] = [
      eq(inventory.locationId, input.locationId),
      eq(products.orgId, orgId),
    ];

    if (input.scope === "CATEGORY" && input.scopeFilter) {
      invConditions.push(eq(products.category, input.scopeFilter as any));
    } else if (input.scope === "FAMILY" && input.scopeFilter) {
      invConditions.push(eq(productFamilies.slug, input.scopeFilter));
    }
    // SELECTED_SKUS and FULL_LOCATION don't filter further here
    // (SELECTED_SKUS would be handled with additional logic if needed)

    // Insert the count session
    const [session] = await tx
      .insert(inventoryCounts)
      .values({
        orgId,
        locationId: input.locationId,
        createdByUserId: userId,
        label: input.label,
        scope: input.scope as any,
        scopeFilter: input.scopeFilter,
        notes: input.notes,
        status: "DRAFT",
      })
      .returning();

    // Snapshot inventory into count lines
    const inventoryRows = await tx
      .select({
        inventoryId: inventory.id,
        productId: inventory.productId,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .where(and(...invConditions))
      .orderBy(products.name);

    if (inventoryRows.length === 0) {
      throw new Error("No inventory items found for the selected scope and location");
    }

    // Bulk insert lines
    const lineValues = inventoryRows.map((inv) => ({
      countId: session.id,
      productId: inv.productId,
      inventoryId: inv.inventoryId,
      systemQty: inv.stockLevel,
    }));

    // Batch insert to avoid Node.js call stack overflow with large datasets
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < lineValues.length; i += CHUNK_SIZE) {
      await tx.insert(inventoryCountLines).values(lineValues.slice(i, i + CHUNK_SIZE));
    }

    // Update total_lines count
    await tx
      .update(inventoryCounts)
      .set({ totalLines: inventoryRows.length })
      .where(eq(inventoryCounts.id, session.id));

    return {
      id: session.id,
      totalLines: inventoryRows.length,
      label: session.label,
      status: session.status,
    };
  });
}

// ── Get count session detail (with paginated lines) ──

export interface GetCountDetailParams {
  orgId: string;
  countId: string;
  search?: string;
  varianceOnly?: boolean;
  uncountedOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export async function getCountDetail(
  params: GetCountDetailParams,
): Promise<CountDetailResponse> {
  const limit = params.limit ?? 100;

  // Fetch session
  const [session] = await db
    .select({
      id: inventoryCounts.id,
      locationId: inventoryCounts.locationId,
      locationName: locations.name,
      label: inventoryCounts.label,
      status: inventoryCounts.status,
      scope: inventoryCounts.scope,
      scopeFilter: inventoryCounts.scopeFilter,
      notes: inventoryCounts.notes,
      totalLines: inventoryCounts.totalLines,
      countedLines: inventoryCounts.countedLines,
      varianceLines: inventoryCounts.varianceLines,
      createdByUserId: inventoryCounts.createdByUserId,
      reviewedByUserId: inventoryCounts.reviewedByUserId,
      postedByUserId: inventoryCounts.postedByUserId,
      startedAt: inventoryCounts.startedAt,
      completedAt: inventoryCounts.completedAt,
      reviewedAt: inventoryCounts.reviewedAt,
      postedAt: inventoryCounts.postedAt,
      createdAt: inventoryCounts.createdAt,
      updatedAt: inventoryCounts.updatedAt,
    })
    .from(inventoryCounts)
    .innerJoin(locations, eq(inventoryCounts.locationId, locations.id))
    .where(
      and(
        eq(inventoryCounts.id, params.countId),
        eq(inventoryCounts.orgId, params.orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");

  // Fetch user names
  const userIds = [session.createdByUserId, session.reviewedByUserId, session.postedByUserId].filter(Boolean) as string[];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

  // Build line conditions
  const lineConditions: SQL[] = [
    eq(inventoryCountLines.countId, params.countId),
  ];

  if (params.search && params.search.length >= 2) {
    lineConditions.push(
      or(
        ilike(products.name, `%${params.search}%`),
        eq(products.sku, params.search),
        eq(products.mnemonicSku, params.search.toUpperCase()),
      )!,
    );
  }

  if (params.varianceOnly) {
    lineConditions.push(
      and(
        isNotNull(inventoryCountLines.variance),
        sql`${inventoryCountLines.variance} != 0`,
      )!,
    );
  }

  if (params.uncountedOnly) {
    lineConditions.push(isNull(inventoryCountLines.countedQty));
  }

  if (params.cursor) {
    lineConditions.push(gt(inventoryCountLines.id, params.cursor));
  }

  const lines = await db
    .select({
      id: inventoryCountLines.id,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      mnemonicSku: products.mnemonicSku,
      category: products.category,
      familyName: productFamilies.name,
      inventoryId: inventoryCountLines.inventoryId,
      systemQty: inventoryCountLines.systemQty,
      countedQty: inventoryCountLines.countedQty,
      variance: inventoryCountLines.variance,
      countedByUserId: inventoryCountLines.countedByUserId,
      countedAt: inventoryCountLines.countedAt,
      notes: inventoryCountLines.notes,
    })
    .from(inventoryCountLines)
    .innerJoin(products, eq(inventoryCountLines.productId, products.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...lineConditions))
    .orderBy(inventoryCountLines.id)
    .limit(limit + 1);

  const hasMoreLines = lines.length > limit;
  const lineData = hasMoreLines ? lines.slice(0, limit) : lines;
  const lineNextCursor = hasMoreLines ? lineData[lineData.length - 1]!.id : null;

  // Batch-fetch counter names
  const counterIds = [
    ...new Set(lineData.map((l) => l.countedByUserId).filter(Boolean) as string[]),
  ];
  const counterRows =
    counterIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(inArray(users.id, counterIds))
      : [];
  const counterMap = new Map(counterRows.map((u) => [u.id, u.fullName]));

  const enrichedLines: CountLineRow[] = lineData.map((l) => ({
    id: l.id,
    productId: l.productId,
    productName: l.productName,
    productSku: l.productSku,
    mnemonicSku: l.mnemonicSku,
    category: l.category,
    familyName: l.familyName,
    inventoryId: l.inventoryId,
    systemQty: l.systemQty,
    countedQty: l.countedQty,
    variance: l.variance,
    countedByName: l.countedByUserId ? (counterMap.get(l.countedByUserId) ?? null) : null,
    countedAt: l.countedAt?.toISOString() ?? null,
    notes: l.notes,
  }));

  const sessionRow: CountSessionRow = {
    id: session.id,
    locationId: session.locationId,
    locationName: session.locationName,
    label: session.label,
    status: session.status,
    scope: session.scope,
    scopeFilter: session.scopeFilter,
    notes: session.notes,
    totalLines: session.totalLines,
    countedLines: session.countedLines,
    varianceLines: session.varianceLines,
    createdByName: userMap.get(session.createdByUserId) ?? null,
    reviewedByName: session.reviewedByUserId
      ? (userMap.get(session.reviewedByUserId) ?? null)
      : null,
    postedByName: session.postedByUserId
      ? (userMap.get(session.postedByUserId) ?? null)
      : null,
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    reviewedAt: session.reviewedAt?.toISOString() ?? null,
    postedAt: session.postedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };

  return {
    session: sessionRow,
    lines: enrichedLines,
    nextCursor: lineNextCursor,
    hasMore: hasMoreLines,
  };
}

// ── Record a single line count ──

export async function recordLineCount(
  countId: string,
  lineId: string,
  input: RecordCountLineInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Validate session exists, belongs to org, and is in countable state
    const [session] = await tx
      .select({
        id: inventoryCounts.id,
        status: inventoryCounts.status,
        orgId: inventoryCounts.orgId,
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

    const allowedStatuses = ["DRAFT", "IN_PROGRESS"];
    if (!allowedStatuses.includes(session.status)) {
      throw new Error(
        `Cannot record counts in ${session.status} status. Session must be DRAFT or IN_PROGRESS.`,
      );
    }

    // Fetch the line
    const [line] = await tx
      .select()
      .from(inventoryCountLines)
      .where(
        and(
          eq(inventoryCountLines.id, lineId),
          eq(inventoryCountLines.countId, countId),
        ),
      )
      .limit(1);

    if (!line) throw new Error("Count line not found");

    const wasUncounted = line.countedQty === null;
    const variance = input.countedQty - line.systemQty;
    const hadVariance = line.variance !== null && line.variance !== 0;
    const hasVariance = variance !== 0;

    // Update line
    await tx
      .update(inventoryCountLines)
      .set({
        countedQty: input.countedQty,
        variance,
        countedByUserId: userId,
        countedAt: new Date(),
        notes: input.notes ?? line.notes,
      })
      .where(eq(inventoryCountLines.id, lineId));

    // Update session stats
    const countedDelta = wasUncounted ? 1 : 0;
    const varianceDelta =
      (hasVariance ? 1 : 0) - (hadVariance ? 1 : 0);

    if (countedDelta !== 0 || varianceDelta !== 0) {
      await tx
        .update(inventoryCounts)
        .set({
          countedLines: sql`${inventoryCounts.countedLines} + ${countedDelta}`,
          varianceLines: sql`${inventoryCounts.varianceLines} + ${varianceDelta}`,
          // Auto-transition DRAFT → IN_PROGRESS on first count entry
          ...(session.status === "DRAFT"
            ? { status: "IN_PROGRESS" as any, startedAt: new Date() }
            : {}),
        })
        .where(eq(inventoryCounts.id, countId));
    }

    return { lineId, countedQty: input.countedQty, variance };
  });
}

// ── Transition: Complete counting ──

export async function completeCount(countId: string, orgId: string) {
  const [session] = await db
    .select()
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");
  if (session.status !== "IN_PROGRESS" && session.status !== "DRAFT") {
    throw new Error(`Cannot complete count in ${session.status} status`);
  }

  await db
    .update(inventoryCounts)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, status: "COMPLETED" };
}

// ── Transition: Review ──

export async function reviewCount(countId: string, orgId: string, userId: string) {
  const [session] = await db
    .select()
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");
  if (session.status !== "COMPLETED") {
    throw new Error(`Cannot review count in ${session.status} status`);
  }

  await db
    .update(inventoryCounts)
    .set({
      status: "REVIEWED",
      reviewedByUserId: userId,
      reviewedAt: new Date(),
    })
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, status: "REVIEWED" };
}

// ── Transition: Post variances (creates journal entries) ──

export async function postCountVariances(
  countId: string,
  input: PostCountInput,
  orgId: string,
  userId: string,
) {
  return db.transaction(async (tx) => {
    // Lock session
    const sessionRows = await tx.execute(
      sql`SELECT * FROM inventory_counts WHERE id = ${countId} AND org_id = ${orgId} FOR UPDATE`,
    );
    const session = sessionRows[0] as any;
    if (!session) throw new Error("Count session not found");
    if (session.status !== "REVIEWED") {
      throw new Error(`Cannot post variances in ${session.status} status. Must be REVIEWED.`);
    }

    // Fetch all lines with non-zero variance
    const varianceLines = await tx
      .select({
        id: inventoryCountLines.id,
        productId: inventoryCountLines.productId,
        inventoryId: inventoryCountLines.inventoryId,
        systemQty: inventoryCountLines.systemQty,
        countedQty: inventoryCountLines.countedQty,
        variance: inventoryCountLines.variance,
      })
      .from(inventoryCountLines)
      .where(
        and(
          eq(inventoryCountLines.countId, countId),
          isNotNull(inventoryCountLines.variance),
          sql`${inventoryCountLines.variance} != 0`,
        ),
      );

    if (varianceLines.length === 0) {
      // No variances — just mark as posted
      await tx
        .update(inventoryCounts)
        .set({
          status: "POSTED",
          postedByUserId: userId,
          postedAt: new Date(),
        })
        .where(eq(inventoryCounts.id, countId));

      return { id: countId, status: "POSTED", adjustmentsCreated: 0 };
    }

    let adjustmentsCreated = 0;

    for (const line of varianceLines) {
      const variance = line.variance!;
      const isGain = variance > 0;

      // Lock inventory row
      const invRows = await tx.execute(
        sql`SELECT id, stock_level, reserved_level
            FROM inventory
            WHERE id = ${line.inventoryId}
            FOR UPDATE`,
      );
      const inv = invRows[0] as any;
      if (!inv) continue;

      const newBalance = inv.stock_level + variance;

      // Guard: don't allow stock to go below 0
      if (newBalance < 0) {
        throw new Error(
          `Posting variance would result in negative stock for product ${line.productId}. ` +
          `Current: ${inv.stock_level}, Variance: ${variance}`,
        );
      }

      // Update inventory
      await tx
        .update(inventory)
        .set({ stockLevel: newBalance })
        .where(eq(inventory.id, line.inventoryId));

      // Create journal entry
      await tx.insert(stockJournal).values({
        orgId,
        productId: line.productId,
        locationId: session.location_id,
        userId,
        actorType: "USER",
        changeQuantity: variance,
        balanceAfter: newBalance,
        referenceType: "STOCKTAKE",
        referenceId: countId,
        referenceLineId: line.id,
        reasonCode: isGain ? "COUNT_GAIN" : "COUNT_LOSS",
        idempotencyKey: `${input.idempotencyKey}:${line.id}`,
        effectiveAt: new Date(),
        notes: input.notes
          ? `Count: ${session.label} — ${input.notes}`
          : `Count: ${session.label}`,
      });

      adjustmentsCreated++;
    }

    // Mark session as posted
    await tx
      .update(inventoryCounts)
      .set({
        status: "POSTED",
        postedByUserId: userId,
        postedAt: new Date(),
      })
      .where(eq(inventoryCounts.id, countId));

    return { id: countId, status: "POSTED", adjustmentsCreated };
  });
}

// ── Cancel count ──

export async function cancelCount(countId: string, orgId: string) {
  const [session] = await db
    .select()
    .from(inventoryCounts)
    .where(
      and(
        eq(inventoryCounts.id, countId),
        eq(inventoryCounts.orgId, orgId),
      ),
    )
    .limit(1);

  if (!session) throw new Error("Count session not found");

  const cancelableStatuses = ["DRAFT", "IN_PROGRESS", "COMPLETED", "REVIEWED"];
  if (!cancelableStatuses.includes(session.status)) {
    throw new Error(`Cannot cancel count in ${session.status} status`);
  }

  await db
    .update(inventoryCounts)
    .set({ status: "CANCELLED" })
    .where(eq(inventoryCounts.id, countId));

  return { id: countId, status: "CANCELLED" };
}
