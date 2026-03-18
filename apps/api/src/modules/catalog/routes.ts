import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products, brands, productFamilies, categories, productSubcategories, inventory, locations, apiKeys } from "@apex/database/schema";
import { eq, and, ilike, or, sql, asc, desc, inArray } from "drizzle-orm";
import { createHash } from "crypto";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  // API Key auth hook — runs on all routes in this plugin
  app.addHook("onRequest", async (request, reply) => {
    const apiKey = request.headers["x-api-key"] as string;
    if (!apiKey) {
      return reply.status(401).send({ error: "Missing X-API-Key header" });
    }

    const hash = hashKey(apiKey);
    const [keyRow] = await db
      .select({ id: apiKeys.id, orgId: apiKeys.orgId, isActive: apiKeys.isActive })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .limit(1);

    if (!keyRow || !keyRow.isActive) {
      return reply.status(401).send({ error: "Invalid or inactive API key" });
    }

    // Store orgId on request for use in route handlers
    (request as any).catalogOrgId = keyRow.orgId;

    // Update last_used_at (fire and forget)
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyRow.id)).execute().catch(() => {});
  });

  // GET /search
  app.get("/search", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const q = request.query as Record<string, string>;

    const searchTerm = q.q || "";
    if (searchTerm.length < 2) {
      return reply.status(400).send({ error: "Search term must be at least 2 characters" });
    }

    const limit = Math.min(parseInt(q.limit || "20"), 50);
    const offset = parseInt(q.offset || "0");

    const conditions: any[] = [eq(products.orgId, orgId), eq(products.isActive, true)];

    if (q.categoryId) conditions.push(eq(products.categoryId, q.categoryId));
    if (q.familyId) conditions.push(eq(products.familyId, q.familyId));
    if (q.brandId) conditions.push(eq(products.brandId, q.brandId));

    // Search across name, sku, oem_number, barcode
    conditions.push(
      or(
        ilike(products.name, `%${searchTerm}%`),
        ilike(products.sku, `%${searchTerm}%`),
        ilike(products.oemNumber, `%${searchTerm}%`),
        eq(products.barcode, searchTerm),
      )!
    );

    // Query products with joins
    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        brandName: brands.name,
        familyName: productFamilies.name,
        categoryName: categories.name,
        subcategoryName: productSubcategories.name,
        oemNumber: products.oemNumber,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .where(and(...conditions))
      .orderBy(
        // Exact SKU match first, then by name similarity
        desc(sql`CASE WHEN UPPER(${products.sku}) = UPPER(${searchTerm}) THEN 1 ELSE 0 END`),
        asc(products.name),
      )
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    // Fetch stock for these products
    const productIds = data.map(p => p.id);
    const stockMap = new Map<string, { total: number; byLocation: Record<string, number> }>();

    if (productIds.length > 0) {
      const stockRows = await db
        .select({
          productId: inventory.productId,
          locationName: locations.name,
          stockLevel: inventory.stockLevel,
        })
        .from(inventory)
        .innerJoin(locations, and(eq(inventory.locationId, locations.id), eq(locations.isActive, true)))
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
        ));

      for (const row of stockRows) {
        if (!stockMap.has(row.productId)) {
          stockMap.set(row.productId, { total: 0, byLocation: {} });
        }
        const entry = stockMap.get(row.productId)!;
        entry.total += row.stockLevel;
        entry.byLocation[row.locationName] = row.stockLevel;
      }
    }

    // Build results with stock info
    let results = data.map(p => {
      const stock = stockMap.get(p.id) ?? { total: 0, byLocation: {} };
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brandName,
        family: p.familyName,
        category: p.categoryName,
        subcategory: p.subcategoryName,
        oem_number: p.oemNumber,
        sell_price: parseFloat(p.unitPrice || "0"),
        cost_price: parseFloat(p.costPrice || "0"),
        stock: {
          total: stock.total,
          by_location: stock.byLocation,
        },
      };
    });

    // Filter by inStock if requested
    if (q.inStock === "true") {
      results = results.filter(r => r.stock.total > 0);
    }

    // Count total (without limit)
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions));

    return reply.send({
      results,
      total: (countRow as any).count,
      has_more: hasMore,
    });
  });

  // GET /items/:id
  app.get("/items/:id", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const { id } = request.params as { id: string };

    const [product] = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        brandName: brands.name,
        familyName: productFamilies.name,
        categoryName: categories.name,
        subcategoryName: productSubcategories.name,
        oemNumber: products.oemNumber,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .where(and(eq(products.id, id), eq(products.orgId, orgId)))
      .limit(1);

    if (!product) {
      return reply.status(404).send({ error: "Product not found" });
    }

    // Fetch stock
    const stockRows = await db
      .select({
        locationName: locations.name,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(locations, and(eq(inventory.locationId, locations.id), eq(locations.isActive, true)))
      .where(and(eq(inventory.productId, id), eq(inventory.orgId, orgId)));

    const stock = { total: 0, by_location: {} as Record<string, number> };
    for (const row of stockRows) {
      stock.total += row.stockLevel;
      stock.by_location[row.locationName] = row.stockLevel;
    }

    return reply.send({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brandName,
      family: product.familyName,
      category: product.categoryName,
      subcategory: product.subcategoryName,
      oem_number: product.oemNumber,
      sell_price: parseFloat(product.unitPrice || "0"),
      cost_price: parseFloat(product.costPrice || "0"),
      stock,
    });
  });

  // GET /items/:id/stock
  app.get("/items/:id/stock", async (request, reply) => {
    const orgId = (request as any).catalogOrgId as string;
    const { id } = request.params as { id: string };

    // Verify product exists and belongs to org
    const [product] = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, orgId)))
      .limit(1);

    if (!product) {
      return reply.status(404).send({ error: "Product not found" });
    }

    const stockRows = await db
      .select({
        locationName: locations.name,
        stockLevel: inventory.stockLevel,
      })
      .from(inventory)
      .innerJoin(locations, and(eq(inventory.locationId, locations.id), eq(locations.isActive, true)))
      .where(and(eq(inventory.productId, id), eq(inventory.orgId, orgId)));

    const byLocation = stockRows.map(r => ({
      location: r.locationName,
      quantity: r.stockLevel,
    }));

    return reply.send({
      product_id: id,
      sku: product.sku,
      total: byLocation.reduce((sum, r) => sum + r.quantity, 0),
      by_location: byLocation,
    });
  });
};
