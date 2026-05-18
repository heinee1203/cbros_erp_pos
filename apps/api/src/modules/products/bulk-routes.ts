import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { inventory, productSubcategories, products } from "@apex/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

import { logAction } from "./product-audit-service";
import { MANAGE_ROLES } from "./permissions";
import { buildBulkProductFilterConditions, isUuid } from "./query";
import {
  buildBulkProductUpdateFields,
  buildPostgresUuidArrayLiteral,
  getBulkProductIdsLimitError,
  resolveBulkFindReplaceColumn,
  type BulkProductUpdateInput,
} from "./bulk-helpers";

export function registerProductBulkRoutes(app: FastifyInstance) {
  app.patch("/bulk-update", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productIds?: string[];
      filter?: { search?: string; familyId?: string; categoryId?: string; brandId?: string };
      updates: BulkProductUpdateInput;
    };

    if (!body.updates || Object.keys(body.updates).length === 0) {
      return reply.status(400).send({ error: "No updates provided" });
    }

    const updateFields = buildBulkProductUpdateFields(body.updates);

    let autoFillCategoryId: string | null = null;
    if (body.updates.subcategoryId && !body.updates.categoryId) {
      const [sub] = await db
        .select({ categoryId: productSubcategories.categoryId })
        .from(productSubcategories)
        .where(eq(productSubcategories.id, body.updates.subcategoryId))
        .limit(1);
      if (sub?.categoryId) {
        autoFillCategoryId = sub.categoryId;
      }
    }

    let updated = 0;

    if (body.productIds && body.productIds.length > 0) {
      const limitError = getBulkProductIdsLimitError(body.productIds, 500);
      if (limitError) return reply.status(400).send({ error: limitError });

      const result = await db
        .update(products)
        .set(updateFields)
        .where(and(
          eq(products.orgId, orgId),
          inArray(products.id, body.productIds),
        ));
      updated = (result as any).rowCount ?? body.productIds.length;

      if (autoFillCategoryId) {
        await db
          .update(products)
          .set({ categoryId: autoFillCategoryId })
          .where(and(
            eq(products.orgId, orgId),
            inArray(products.id, body.productIds),
            sql`${products.categoryId} IS NULL`,
          ));
      }
    } else if (body.filter) {
      const conditions = buildBulkProductFilterConditions(orgId, body.filter);

      const result = await db
        .update(products)
        .set(updateFields)
        .where(and(...conditions));

      updated = (result as any).rowCount ?? 0;

      if (autoFillCategoryId) {
        await db
          .update(products)
          .set({ categoryId: autoFillCategoryId })
          .where(and(...conditions, sql`${products.categoryId} IS NULL`));
      }
    } else {
      return reply.status(400).send({ error: "Provide productIds or filter" });
    }

    logAction({ orgId, userId: (request.user as any).userId, action: "PRODUCT_BULK_UPDATE", entityType: "PRODUCT", details: { count: updated, updates: Object.keys(body.updates) }, ipAddress: request.ip });
    return reply.send({ updated });
  });

  app.post("/bulk-find-replace", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!["ADMIN", "MANAGER"].includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }

    const body = request.body as {
      productIds: string[];
      find: string;
      replace: string;
      fields: string[];
      caseSensitive?: boolean;
    };

    if (!body.find || body.find.length === 0) {
      return reply.status(400).send({ error: "Find string is required" });
    }
    if (!body.productIds || body.productIds.length === 0) {
      return reply.status(400).send({ error: "Select products first" });
    }
    if (body.productIds.length > 5000) {
      return reply.status(400).send({ error: "Maximum 5000 items per request" });
    }

    const fields = body.fields || ["name"];
    const find = body.find;
    const replace = body.replace ?? "";
    let totalUpdated = 0;

    for (const pid of body.productIds) {
      if (!isUuid(pid)) return reply.status(400).send({ error: `Invalid product ID: ${pid}` });
    }

    for (const field of fields) {
      const col = resolveBulkFindReplaceColumn(field);
      if (!col) continue;

      const likePattern = "%" + find + "%";
      const matchOp = body.caseSensitive ? "LIKE" : "ILIKE";
      const idsArray = buildPostgresUuidArrayLiteral(body.productIds);

      const [countResult] = await db.execute(
        sql`SELECT COUNT(*)::int as cnt FROM products
            WHERE org_id = ${orgId}
            AND ${sql.raw(col)} ${sql.raw(matchOp)} ${likePattern}
            AND id = ANY(${idsArray}::uuid[])`,
      );

      if ((countResult as any).cnt > 0) {
        await db.execute(
          sql`UPDATE products
              SET ${sql.raw(col)} = REPLACE(${sql.raw(col)}, ${find}, ${replace})
              WHERE org_id = ${orgId}
              AND ${sql.raw(col)} ${sql.raw(matchOp)} ${likePattern}
              AND id = ANY(${idsArray}::uuid[])`,
        );
      }
      totalUpdated += (countResult as any).cnt ?? 0;
    }

    return reply.send({ updated: totalUpdated });
  });

  app.patch("/bulk-available-for-sale", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productIds?: string[];
      filter?: { search?: string; familyId?: string; categoryId?: string; brandId?: string };
      action: "set" | "add" | "remove";
      locationIds: string[];
    };

    if (!body.action || !body.locationIds || body.locationIds.length === 0) {
      return reply.status(400).send({ error: "action and locationIds are required" });
    }

    let productIds: string[] = [];
    if (body.productIds && body.productIds.length > 0) {
      const limitError = getBulkProductIdsLimitError(body.productIds, 500);
      if (limitError) return reply.status(400).send({ error: limitError });
      productIds = body.productIds;
    } else if (body.filter) {
      const conditions = buildBulkProductFilterConditions(orgId, body.filter);

      const rows = await db
        .select({ id: products.id })
        .from(products)
        .where(and(...conditions))
        .limit(500);
      productIds = rows.map((r) => r.id);
    } else {
      return reply.status(400).send({ error: "Provide productIds or filter" });
    }

    if (productIds.length === 0) {
      return reply.send({ updated: 0 });
    }

    let updated = 0;

    if (body.action === "set") {
      await db
        .update(inventory)
        .set({ availableForSale: false })
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
        ));
      const result = await db
        .update(inventory)
        .set({ availableForSale: true })
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
          inArray(inventory.locationId, body.locationIds),
        ));
      updated = (result as any).rowCount ?? 0;
    } else if (body.action === "add") {
      const result = await db
        .update(inventory)
        .set({ availableForSale: true })
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
          inArray(inventory.locationId, body.locationIds),
        ));
      updated = (result as any).rowCount ?? 0;
    } else if (body.action === "remove") {
      const result = await db
        .update(inventory)
        .set({ availableForSale: false })
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
          inArray(inventory.locationId, body.locationIds),
        ));
      updated = (result as any).rowCount ?? 0;
    }

    return reply.send({ updated, productCount: productIds.length });
  });
}
