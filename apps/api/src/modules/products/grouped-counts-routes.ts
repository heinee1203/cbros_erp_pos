import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export function registerProductGroupedCountRoutes(app: FastifyInstance) {
  app.get("/grouped-counts", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const { orgId, locationId } = request.storeContext!;
    const allLocations = q.allLocations === "true";
    const groupBy = q.groupBy as "family" | "category" | "brand" | "vehicleMake" | undefined;

    if (!groupBy || !["family", "category", "brand", "vehicleMake"].includes(groupBy)) {
      return reply.status(400).send({ error: "groupBy is required: family | category | brand | vehicleMake" });
    }

    // Optional stock status filter fragment
    const stockFilter = q.stockStatus === "out"
      ? sql`AND i.stock_level = 0`
      : q.stockStatus === "low"
        ? sql`AND i.stock_level > 0 AND i.stock_level <= i.reorder_point`
        : sql``;

    // Location filter — when allLocations=true, exclude inactive locations
    const locFilter = allLocations
      ? sql`AND EXISTS (SELECT 1 FROM locations loc WHERE loc.id = i.location_id AND loc.is_active = true)`
      : sql`AND i.location_id = ${locationId} AND i.available_for_sale = true`;

    if (groupBy === "family") {
      const result = await db.execute(sql`
        SELECT pf.id, pf.name,
               COUNT(DISTINCT p.id)::int AS item_count,
               COUNT(DISTINCT p.category_id)::int AS category_count
        FROM inventory i
          INNER JOIN products p ON i.product_id = p.id
          LEFT JOIN product_families pf ON p.family_id = pf.id
        WHERE p.org_id = ${orgId}
          ${locFilter}
          AND p.is_active = true
          ${stockFilter}
        GROUP BY pf.id, pf.name
        ORDER BY pf.name ASC NULLS LAST
      `);

      const data = (result as any[]).map((r) => ({
        id: r.id ?? null,
        name: r.name ?? "No Family",
        itemCount: r.item_count,
        categoryCount: r.category_count,
      }));

      return reply.send({ data });
    }

    if (groupBy === "category") {
      if (!q.familyId) {
        return reply.status(400).send({ error: "familyId is required when groupBy=category" });
      }
      const familyCondition = q.familyId === "__none__"
        ? sql`AND p.family_id IS NULL`
        : sql`AND p.family_id = ${q.familyId}::uuid`;

      const result = await db.execute(sql`
        SELECT c.id, c.name, c.color,
               COUNT(DISTINCT p.id)::int AS item_count,
               COUNT(DISTINCT p.brand_id)::int AS brand_count
        FROM inventory i
          INNER JOIN products p ON i.product_id = p.id
          LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.org_id = ${orgId}
          ${locFilter}
          AND p.is_active = true
          ${familyCondition}
          ${stockFilter}
        GROUP BY c.id, c.name, c.color
        ORDER BY c.name ASC NULLS LAST
      `);

      const data = (result as any[]).map((r) => ({
        id: r.id ?? null,
        name: r.name ?? "No Category",
        color: r.color ?? null,
        itemCount: r.item_count,
        brandCount: r.brand_count,
      }));

      return reply.send({ data });
    }

    if (groupBy === "brand") {
      if (!q.categoryId) {
        return reply.status(400).send({ error: "categoryId is required when groupBy=brand" });
      }
      const categoryCondition = q.categoryId === "__none__"
        ? sql`AND p.category_id IS NULL`
        : sql`AND p.category_id = ${q.categoryId}::uuid`;

      const result = await db.execute(sql`
        SELECT b.id, b.name,
               COUNT(DISTINCT p.id)::int AS item_count,
               COUNT(DISTINCT vc.make)::int AS make_count
        FROM inventory i
          INNER JOIN products p ON i.product_id = p.id
          LEFT JOIN brands b ON p.brand_id = b.id
          LEFT JOIN vehicle_compatibility vc ON vc.product_id = p.id
        WHERE p.org_id = ${orgId}
          ${locFilter}
          AND p.is_active = true
          ${categoryCondition}
          ${stockFilter}
        GROUP BY b.id, b.name
        ORDER BY b.name ASC NULLS LAST
      `);

      const data = (result as any[]).map((r) => ({
        id: r.id ?? null,
        name: r.name ?? "No Brand",
        itemCount: r.item_count,
        makeCount: r.make_count,
      }));

      return reply.send({ data });
    }

    // groupBy === "vehicleMake"
    if (!q.brandId) {
      return reply.status(400).send({ error: "brandId is required when groupBy=vehicleMake" });
    }
    const brandCondition = q.brandId === "__none__"
      ? sql`AND p.brand_id IS NULL`
      : sql`AND p.brand_id = ${q.brandId}::uuid`;

    const result = await db.execute(sql`
      SELECT vc.make, COUNT(DISTINCT p.id)::int AS item_count
      FROM inventory i
        INNER JOIN products p ON i.product_id = p.id
        INNER JOIN vehicle_compatibility vc ON vc.product_id = p.id
      WHERE p.org_id = ${orgId}
        ${locFilter}
        AND p.is_active = true
        ${brandCondition}
        ${stockFilter}
      GROUP BY vc.make

      UNION ALL

      SELECT '__none__' AS make, COUNT(DISTINCT p.id)::int AS item_count
      FROM inventory i
        INNER JOIN products p ON i.product_id = p.id
        LEFT JOIN vehicle_compatibility vc ON vc.product_id = p.id
      WHERE p.org_id = ${orgId}
        ${locFilter}
        AND p.is_active = true
        AND vc.id IS NULL
        ${brandCondition}
        ${stockFilter}

      ORDER BY make ASC
    `);

    const data = (result as any[]).map((r) => ({
      make: r.make,
      itemCount: r.item_count,
    }));

    return reply.send({ data });
  });
}
