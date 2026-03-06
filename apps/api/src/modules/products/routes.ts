import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { eq, and, gt, ilike, sql, type SQL } from "drizzle-orm";
import { paginationSchema } from "@apex/types";
import type { PaginatedResponse } from "@apex/types";

export const productRoutes: FastifyPluginAsync = async (app) => {
  // Auth is handled globally by the auth plugin — no per-route hook needed

  app.get("/", async (request, reply) => {
    const query = paginationSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: "Invalid pagination params",
        details: query.error.flatten(),
      });
    }

    const { cursor, limit } = query.data;
    const { orgId, locationId } = request.storeContext!;

    const search = (request.query as any).search as string | undefined;

    const conditions: SQL[] = [
      eq(inventory.locationId, locationId),
      eq(products.orgId, orgId),
    ];

    if (cursor) {
      conditions.push(gt(products.id, cursor));
    }

    if (search && search.length >= 2) {
      conditions.push(ilike(products.name, `%${search}%`));
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(and(...conditions))
      .orderBy(products.id)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const result: PaginatedResponse<(typeof data)[number]> = {
      data,
      nextCursor,
      hasMore,
    };

    return reply.send(result);
  });

  app.get("/search", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = (request.query as any).q as string | undefined;

    if (!q || q.length < 2) {
      return reply
        .status(400)
        .send({ error: "Search query must be at least 2 characters" });
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(
        and(
          eq(inventory.locationId, locationId),
          eq(products.orgId, orgId),
          sql`name % ${q}`,
        ),
      )
      .orderBy(sql`similarity(name, ${q}) DESC`)
      .limit(20);

    return reply.send({ data: rows });
  });
};
