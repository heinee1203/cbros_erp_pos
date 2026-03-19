import { db, type DbOrTx } from "@apex/database";
import {
  productSuppliers,
  suppliers,
  products,
  purchaseOrders,
  poLines,
  supplierMetrics,
} from "@apex/database/schema";
import { eq, and, sql, asc, ne, gt, gte, lt } from "drizzle-orm";

// ── List suppliers for a product ──

export async function listProductSuppliers(orgId: string, productId: string) {
  const rows = await db
    .select({
      id: productSuppliers.id,
      productId: productSuppliers.productId,
      supplierId: productSuppliers.supplierId,
      supplierName: suppliers.name,
      supplierMnemonicCode: suppliers.mnemonicCode,
      priority: productSuppliers.priority,
      supplierSku: productSuppliers.supplierSku,
      supplierCost: productSuppliers.supplierCost,
      minOrderQty: productSuppliers.minOrderQty,
      leadTimeDays: productSuppliers.leadTimeDays,
      isActive: productSuppliers.isActive,
      notes: productSuppliers.notes,
      lastOrderedAt: productSuppliers.lastOrderedAt,
      lastCost: productSuppliers.lastCost,
      createdAt: productSuppliers.createdAt,
      updatedAt: productSuppliers.updatedAt,
    })
    .from(productSuppliers)
    .innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId))
    .where(
      and(
        eq(productSuppliers.orgId, orgId),
        eq(productSuppliers.productId, productId),
      ),
    )
    .orderBy(asc(productSuppliers.priority));

  return rows;
}

// ── Add a supplier mapping to a product ──

export async function addProductSupplier(
  orgId: string,
  productId: string,
  data: {
    supplierId: string;
    priority?: number;
    supplierSku?: string;
    supplierCost?: string;
    minOrderQty?: number;
    leadTimeDays?: number;
    notes?: string;
  },
) {
  return db.transaction(async (tx) => {
    // Check for duplicate
    const [existing] = await tx
      .select({ id: productSuppliers.id })
      .from(productSuppliers)
      .where(
        and(
          eq(productSuppliers.orgId, orgId),
          eq(productSuppliers.productId, productId),
          eq(productSuppliers.supplierId, data.supplierId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new Error("This supplier is already mapped to this product");
    }

    // Validate supplier belongs to org
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, data.supplierId), eq(suppliers.orgId, orgId)))
      .limit(1);

    if (!supplier) {
      throw new Error("Supplier not found");
    }

    const priority = data.priority ?? 1;

    // Shift existing priorities down if there's a conflict
    await tx.execute(
      sql`UPDATE product_suppliers
          SET priority = priority + 1, updated_at = NOW()
          WHERE org_id = ${orgId}
            AND product_id = ${productId}
            AND priority >= ${priority}`,
    );

    const [row] = await tx
      .insert(productSuppliers)
      .values({
        orgId,
        productId,
        supplierId: data.supplierId,
        priority,
        supplierSku: data.supplierSku ?? null,
        supplierCost: data.supplierCost ?? null,
        minOrderQty: data.minOrderQty ?? 1,
        leadTimeDays: data.leadTimeDays ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    // If priority=1, sync products.primarySupplierId
    if (priority === 1) {
      await tx
        .update(products)
        .set({ primarySupplierId: data.supplierId })
        .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
    }

    return row;
  });
}

// ── Update a product-supplier mapping ──

export async function updateProductSupplier(
  orgId: string,
  id: string,
  data: {
    priority?: number;
    supplierSku?: string | null;
    supplierCost?: string | null;
    minOrderQty?: number;
    leadTimeDays?: number | null;
    isActive?: boolean;
    notes?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productSuppliers)
      .where(and(eq(productSuppliers.id, id), eq(productSuppliers.orgId, orgId)))
      .limit(1);

    if (!existing) {
      throw new Error("Product-supplier mapping not found");
    }

    const updates: Record<string, any> = {};
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.supplierSku !== undefined) updates.supplierSku = data.supplierSku;
    if (data.supplierCost !== undefined) updates.supplierCost = data.supplierCost;
    if (data.minOrderQty !== undefined) updates.minOrderQty = data.minOrderQty;
    if (data.leadTimeDays !== undefined) updates.leadTimeDays = data.leadTimeDays;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.notes !== undefined) updates.notes = data.notes;

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    // If priority is changing to 1, shift others down
    if (data.priority !== undefined && data.priority !== existing.priority) {
      const oldPriority = existing.priority;
      const newPriority = data.priority;

      if (newPriority < oldPriority) {
        // Moving up: shift items in [newPriority, oldPriority-1] down by 1
        await tx.execute(
          sql`UPDATE product_suppliers
              SET priority = priority + 1, updated_at = NOW()
              WHERE org_id = ${orgId}
                AND product_id = ${existing.productId}
                AND id != ${id}
                AND priority >= ${newPriority}
                AND priority < ${oldPriority}`,
        );
      } else {
        // Moving down: shift items in [oldPriority+1, newPriority] up by 1
        await tx.execute(
          sql`UPDATE product_suppliers
              SET priority = priority - 1, updated_at = NOW()
              WHERE org_id = ${orgId}
                AND product_id = ${existing.productId}
                AND id != ${id}
                AND priority > ${oldPriority}
                AND priority <= ${newPriority}`,
        );
      }
    }

    const [updated] = await tx
      .update(productSuppliers)
      .set(updates)
      .where(eq(productSuppliers.id, id))
      .returning();

    // If new priority is 1, sync products.primarySupplierId
    if (data.priority === 1) {
      await tx
        .update(products)
        .set({ primarySupplierId: existing.supplierId })
        .where(
          and(
            eq(products.id, existing.productId),
            eq(products.orgId, orgId),
          ),
        );
    }

    return updated;
  });
}

// ── Delete a product-supplier mapping ──

export async function deleteProductSupplier(orgId: string, id: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(productSuppliers)
      .where(and(eq(productSuppliers.id, id), eq(productSuppliers.orgId, orgId)))
      .limit(1);

    if (!existing) {
      throw new Error("Product-supplier mapping not found");
    }

    await tx
      .delete(productSuppliers)
      .where(eq(productSuppliers.id, id));

    // Shift remaining priorities up to fill the gap
    await tx.execute(
      sql`UPDATE product_suppliers
          SET priority = priority - 1, updated_at = NOW()
          WHERE org_id = ${orgId}
            AND product_id = ${existing.productId}
            AND priority > ${existing.priority}`,
    );

    // If was priority=1, clear primarySupplierId or set to new priority=1
    if (existing.priority === 1) {
      const [newPrimary] = await tx
        .select({ supplierId: productSuppliers.supplierId })
        .from(productSuppliers)
        .where(
          and(
            eq(productSuppliers.orgId, orgId),
            eq(productSuppliers.productId, existing.productId),
            eq(productSuppliers.priority, 1),
          ),
        )
        .limit(1);

      await tx
        .update(products)
        .set({ primarySupplierId: newPrimary?.supplierId ?? null })
        .where(
          and(
            eq(products.id, existing.productId),
            eq(products.orgId, orgId),
          ),
        );
    }

    return { success: true };
  });
}

// ── Reorder priorities for a product's suppliers ──

export async function reorderPriorities(
  orgId: string,
  productId: string,
  orderedIds: string[],
) {
  return db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(productSuppliers)
        .set({ priority: i + 1 })
        .where(
          and(
            eq(productSuppliers.id, orderedIds[i]),
            eq(productSuppliers.orgId, orgId),
            eq(productSuppliers.productId, productId),
          ),
        );
    }

    // Sync primarySupplierId to the new priority=1 supplier
    if (orderedIds.length > 0) {
      const [primary] = await tx
        .select({ supplierId: productSuppliers.supplierId })
        .from(productSuppliers)
        .where(
          and(
            eq(productSuppliers.id, orderedIds[0]),
            eq(productSuppliers.orgId, orgId),
          ),
        )
        .limit(1);

      if (primary) {
        await tx
          .update(products)
          .set({ primarySupplierId: primary.supplierId })
          .where(and(eq(products.id, productId), eq(products.orgId, orgId)));
      }
    }

    return { success: true };
  });
}

// ── List all products for a supplier (cursor-paginated) ──

export async function getSupplierProducts(
  orgId: string,
  supplierId: string,
  cursor?: string,
  limit: number = 50,
) {
  const conditions = [
    eq(productSuppliers.orgId, orgId),
    eq(productSuppliers.supplierId, supplierId),
    eq(productSuppliers.isActive, true),
  ];

  if (cursor) {
    conditions.push(gt(productSuppliers.id, cursor));
  }

  const rows = await db
    .select({
      id: productSuppliers.id,
      productId: productSuppliers.productId,
      productName: products.name,
      productSku: products.sku,
      priority: productSuppliers.priority,
      supplierSku: productSuppliers.supplierSku,
      supplierCost: productSuppliers.supplierCost,
      minOrderQty: productSuppliers.minOrderQty,
      leadTimeDays: productSuppliers.leadTimeDays,
      lastOrderedAt: productSuppliers.lastOrderedAt,
      lastCost: productSuppliers.lastCost,
    })
    .from(productSuppliers)
    .innerJoin(products, eq(products.id, productSuppliers.productId))
    .where(and(...conditions))
    .orderBy(asc(productSuppliers.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor };
}

// ── PO Redirect: Get redirect plan for unfulfilled items ──

export async function getRedirectPlan(orgId: string, poId: string) {
  // 1. Fetch the PO and its supplier
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      destinationLocationId: purchaseOrders.destinationLocationId,
    })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.orgId, orgId)))
    .limit(1);

  if (!po) throw new Error("Purchase order not found");

  const redirectableStatuses = ["PARTIALLY_RECEIVED", "CLOSED_WITH_VARIANCE"];
  if (!redirectableStatuses.includes(po.status)) {
    throw new Error(
      `PO must be PARTIALLY_RECEIVED or CLOSED_WITH_VARIANCE to redirect (current: ${po.status})`,
    );
  }

  // 2. Get unfulfilled lines (shortfall = ordered - received_accepted)
  const unfulfilled = await db
    .select({
      poLineId: poLines.id,
      productId: poLines.productId,
      productName: products.name,
      productSku: products.sku,
      orderedQty: poLines.orderedQty,
      receivedAcceptedQty: poLines.receivedAcceptedQty,
      shortfall: sql<number>`${poLines.orderedQty} - ${poLines.receivedAcceptedQty}`.as("shortfall"),
    })
    .from(poLines)
    .innerJoin(products, eq(products.id, poLines.productId))
    .where(
      and(
        eq(poLines.purchaseOrderId, poId),
        eq(poLines.orgId, orgId),
        sql`${poLines.orderedQty} > ${poLines.receivedAcceptedQty}`,
      ),
    );

  if (unfulfilled.length === 0) {
    return { poNo: po.poNo, redirectGroups: [], message: "No unfulfilled items to redirect" };
  }

  // 3. For each unfulfilled product, find alternate suppliers
  const redirectItems: Array<{
    poLineId: string;
    productId: string;
    productName: string;
    productSku: string;
    shortfall: number;
    alternateSupplierId: string | null;
    alternateSupplierName: string | null;
    alternateCost: string | null;
    alternatePriority: number | null;
    alternateLeadTimeDays: number | null;
    reliabilityPct: string | null;
  }> = [];

  for (const line of unfulfilled) {
    // Find best alternate supplier (lowest priority, excluding PO's supplier)
    const alternates = await db
      .select({
        supplierId: productSuppliers.supplierId,
        supplierName: suppliers.name,
        supplierCost: productSuppliers.supplierCost,
        priority: productSuppliers.priority,
        leadTimeDays: productSuppliers.leadTimeDays,
        reliabilityPct: supplierMetrics.reliabilityPct,
      })
      .from(productSuppliers)
      .innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId))
      .leftJoin(
        supplierMetrics,
        and(
          eq(supplierMetrics.supplierId, productSuppliers.supplierId),
          eq(supplierMetrics.orgId, orgId),
        ),
      )
      .where(
        and(
          eq(productSuppliers.orgId, orgId),
          eq(productSuppliers.productId, line.productId),
          ne(productSuppliers.supplierId, po.supplierId),
          eq(productSuppliers.isActive, true),
        ),
      )
      .orderBy(asc(productSuppliers.priority))
      .limit(1);

    const alt = alternates[0] ?? null;
    redirectItems.push({
      poLineId: line.poLineId,
      productId: line.productId,
      productName: line.productName,
      productSku: line.productSku,
      shortfall: line.shortfall,
      alternateSupplierId: alt?.supplierId ?? null,
      alternateSupplierName: alt?.supplierName ?? null,
      alternateCost: alt?.supplierCost ?? null,
      alternatePriority: alt?.priority ?? null,
      alternateLeadTimeDays: alt?.leadTimeDays ?? null,
      reliabilityPct: alt?.reliabilityPct ?? null,
    });
  }

  // 4. Group by suggested alternate supplier
  const groupMap = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      reliabilityPct: string | null;
      items: Array<{
        poLineId: string;
        productId: string;
        productName: string;
        productSku: string;
        shortfall: number;
        suggestedCost: string | null;
        leadTimeDays: number | null;
      }>;
    }
  >();

  const unmatched: typeof redirectItems = [];

  for (const item of redirectItems) {
    if (!item.alternateSupplierId) {
      unmatched.push(item);
      continue;
    }

    let group = groupMap.get(item.alternateSupplierId);
    if (!group) {
      group = {
        supplierId: item.alternateSupplierId,
        supplierName: item.alternateSupplierName!,
        reliabilityPct: item.reliabilityPct,
        items: [],
      };
      groupMap.set(item.alternateSupplierId, group);
    }

    group.items.push({
      poLineId: item.poLineId,
      productId: item.productId,
      productName: item.productName,
      productSku: item.productSku,
      shortfall: item.shortfall,
      suggestedCost: item.alternateCost,
      leadTimeDays: item.alternateLeadTimeDays,
    });
  }

  return {
    poNo: po.poNo,
    originalSupplierId: po.supplierId,
    destinationLocationId: po.destinationLocationId,
    redirectGroups: Array.from(groupMap.values()),
    unmatchedItems: unmatched.map((i) => ({
      poLineId: i.poLineId,
      productId: i.productId,
      productName: i.productName,
      productSku: i.productSku,
      shortfall: i.shortfall,
    })),
  };
}

// ── PO Redirect: Create redirect POs from a plan ──

async function generatePoNo(tx: DbOrTx, orgId: string): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `PO-${String(seq).padStart(6, "0")}`;
}

export async function createRedirectPOs(
  orgId: string,
  userId: string,
  originalPoId: string,
  redirects: Array<{
    supplierId: string;
    destinationLocationId: string;
    lines: Array<{
      productId: string;
      qty: number;
      unitCost: string;
    }>;
  }>,
) {
  return db.transaction(async (tx) => {
    // Validate original PO exists
    const [originalPo] = await tx
      .select({ poNo: purchaseOrders.poNo })
      .from(purchaseOrders)
      .where(
        and(eq(purchaseOrders.id, originalPoId), eq(purchaseOrders.orgId, orgId)),
      )
      .limit(1);

    if (!originalPo) {
      throw new Error("Original purchase order not found");
    }

    const createdPOs: Array<{ id: string; poNo: string; supplierId: string }> = [];

    for (const redirect of redirects) {
      const poNo = await generatePoNo(tx, orgId);

      const [newPO] = await tx
        .insert(purchaseOrders)
        .values({
          orgId,
          poNo,
          supplierId: redirect.supplierId,
          destinationLocationId: redirect.destinationLocationId,
          status: "DRAFT",
          notes: `Redirect from ${originalPo.poNo} — unfulfilled items`,
          createdByUserId: userId,
        })
        .returning({ id: purchaseOrders.id, poNo: purchaseOrders.poNo });

      for (const line of redirect.lines) {
        await tx.insert(poLines).values({
          purchaseOrderId: newPO.id,
          orgId,
          productId: line.productId,
          orderedQty: line.qty,
          unitCost: line.unitCost,
        });
      }

      createdPOs.push({
        id: newPO.id,
        poNo: newPO.poNo,
        supplierId: redirect.supplierId,
      });
    }

    return { createdPOs, originalPoNo: originalPo.poNo };
  });
}
