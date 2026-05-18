import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { brands, categories, inventory, locations, productFamilies, productSubcategories, products, vehicleCompatibility } from "@apex/database/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export function registerProductSearchRoutes(app: FastifyInstance) {
  /**
   * GET /products/search
   * Trigram fuzzy search (top 20 results by similarity).
   */
  app.get("/search", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = (request.query as any).q as string | undefined;

    if (!q || q.length < 2) {
      return reply
        .status(400)
        .send({ error: "Search query must be at least 2 characters" });
    }

    // Check if query looks like an exact barcode (all digits, 8/12/13 chars)
    const isBarcodeLookup = /^\d{8}$/.test(q) || /^\d{12,13}$/.test(q);

    // Build search condition - mirrors the Item List segment search logic
    let searchCondition;
    if (isBarcodeLookup) {
      searchCondition = eq(products.barcode, q);
    } else {
      const searchTerms = q.trim().split(/\s+/).filter((t: string) => t.length >= 1);
      const fullPattern = `%${q}%`;

      if (searchTerms.length === 1) {
        const term = searchTerms[0];
        const startPat = `${term}%`;
        const wordPat = `% ${term}%`;
        const hyphenPat = `%-${term}%`;
        const containsPat = `%${term}%`;
        searchCondition = sql`(
          ${products.name} ILIKE ${startPat}
          OR ${products.name} ILIKE ${wordPat}
          OR ${products.name} ILIKE ${hyphenPat}
          OR ${products.sku} ILIKE ${startPat}
          OR ${products.sku} ILIKE ${hyphenPat}
          OR mnemonic_sku ILIKE ${startPat}
          OR ${products.barcode} ILIKE ${containsPat}
          OR ${products.oemNumber} ILIKE ${containsPat}
          OR name % ${q}
        )`;
      } else {
        // Multi-term: each term must match in the name (AND), OR full query matches SKU/barcode/OEM
        const termConditions = searchTerms.map((term: string) => {
          const start = `${term}%`;
          const wordBound = `% ${term}%`;
          const hyphenBound = `%-${term}%`;
          return sql`(
            ${products.name} ILIKE ${start}
            OR ${products.name} ILIKE ${wordBound}
            OR ${products.name} ILIKE ${hyphenBound}
          )`;
        });
        searchCondition = sql`(
          (${sql.join(termConditions, sql` AND `)})
          OR ${products.sku} ILIKE ${fullPattern}
          OR ${products.barcode} ILIKE ${fullPattern}
          OR ${products.oemNumber} ILIKE ${fullPattern}
          OR mnemonic_sku ILIKE ${fullPattern}
        )`;
      }
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        barcode: products.barcode,
        oemNumber: products.oemNumber,
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        parentProductId: products.parentProductId,
        parentName: sql<string | null>`(SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId})`.as("parent_name_search"),
        isParent: products.isParent,
        sellingUnit: products.sellingUnit,
        purchaseUnit: products.purchaseUnit,
        conversionFactor: products.conversionFactor,
      })
      .from(products)
      .innerJoin(inventory, and(
        eq(inventory.productId, products.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
        eq(inventory.availableForSale, true),
      ))
      .where(
        and(
          eq(products.orgId, orgId),
          eq(products.isActive, true),
          searchCondition,
        ),
      )
      .orderBy(isBarcodeLookup ? asc(products.name) : sql`similarity(name, ${q}) DESC`)
      .limit(50);

    // Deduplicate - the inventory JOIN can fan out if a product has
    // multiple inventory rows at the same location (data edge case)
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return reply.send({ data: unique });
  });

}

export function registerProductDetailReadRoutes(app: FastifyInstance) {
  /**
   * GET /products/:id
   * Get full product detail by ID (for edit page).
   */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId, locationId } = request.storeContext!;

    // UUID format check
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return reply.status(400).send({ error: "Invalid product ID" });
    }

    const [row] = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        barcode: products.barcode,
        oemNumber: products.oemNumber,
        isVariablePrice: products.isVariablePrice,
        isActive: products.isActive,
        isParent: products.isParent,
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        familyId: products.familyId,
        familyName: productFamilies.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        subcategoryId: products.subcategoryId,
        subcategoryName: productSubcategories.name,
        brandId: products.brandId,
        brandName: brands.name,
        parentProductId: products.parentProductId,
        parentName: sql<string | null>`(SELECT pp.name FROM products pp WHERE pp.id = ${products.parentProductId})`.as("parent_name"),
        unitsPerCase: products.unitsPerCase,
        packagingUnit: products.packagingUnit,
        sellingUnit: products.sellingUnit,
        purchaseUnit: products.purchaseUnit,
        conversionFactor: products.conversionFactor,
        primarySupplierId: products.primarySupplierId,
        isSerialized: products.isSerialized,
        isTire: products.isTire,
        specialOrder: products.specialOrder,
        discontinued: products.discontinued,
      })
      .from(products)
      .leftJoin(inventory, and(
        eq(inventory.productId, products.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
      ))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.id, id), eq(products.orgId, orgId)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: "Product not found" });
    }

    // Fetch vehicle compatibility
    const vehicles = await db
      .select({
        id: vehicleCompatibility.id,
        make: vehicleCompatibility.make,
        model: vehicleCompatibility.model,
        yearStart: vehicleCompatibility.yearStart,
        yearEnd: vehicleCompatibility.yearEnd,
        engine: vehicleCompatibility.engine,
        notes: vehicleCompatibility.notes,
      })
      .from(vehicleCompatibility)
      .where(eq(vehicleCompatibility.productId, id));

    // Fetch variants if this is a parent product
    let variants: any[] = [];
    if (row.isParent) {
      const variantRows = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          barcode: products.barcode,
          unitPrice: products.unitPrice,
          costPrice: products.costPrice,
          isActive: products.isActive,
          stockLevel: inventory.stockLevel,
        })
        .from(products)
        .leftJoin(inventory, and(
          eq(inventory.productId, products.id),
          ...(locationId && locationId !== "ALL" ? [eq(inventory.locationId, locationId)] : []),
        ))
        .where(and(
          eq(products.parentProductId, id),
          eq(products.orgId, orgId),
        ))
        .orderBy(asc(products.name));
      // Deduplicate: when locationId is "ALL", sum stock across all locations
      const variantMap = new Map<string, any>();
      for (const r of variantRows) {
        if (variantMap.has(r.id)) {
          const existing = variantMap.get(r.id);
          existing.stockLevel = (existing.stockLevel ?? 0) + (r.stockLevel ?? 0);
        } else {
          variantMap.set(r.id, { ...r, stockLevel: r.stockLevel ?? 0 });
        }
      }
      variants = Array.from(variantMap.values());
    }

    return reply.send({ ...row, vehicleCompatibility: vehicles, variants });
  });

  /**
   * GET /products/:id/stock
   * Cross-location stock for a single product (for mobile product detail).
   */
  app.get("/:id/stock", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const rows = await db
      .select({
        locationId: locations.id,
        locationName: locations.name,
        locationType: locations.type,
        stockLevel: sql<number>`COALESCE(${inventory.stockLevel}, 0)`.as("stock_level"),
        reservedLevel: sql<number>`COALESCE(${inventory.reservedLevel}, 0)`.as("reserved_level"),
      })
      .from(locations)
      .leftJoin(
        inventory,
        and(eq(inventory.locationId, locations.id), eq(inventory.productId, id)),
      )
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));

    const totalStock = rows.reduce((sum, r) => sum + r.stockLevel, 0);

    return reply.send({
      productId: id,
      locations: rows.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationName,
        locationType: r.locationType,
        quantity: r.stockLevel,
        reserved: r.reservedLevel,
      })),
      totalStock,
    });
  });

}

export function registerProductBarcodeRoutes(app: FastifyInstance) {
  /**
   * GET /products/by-barcode/:barcode
   * Exact barcode lookup - returns single product or 404.
   * Used by POS scanner and barcode printing search.
   */
  app.get("/by-barcode/:barcode", async (request, reply) => {
    const { barcode } = request.params as { barcode: string };
    const { orgId, locationId } = request.storeContext!;

    if (!barcode || barcode.length > 50) {
      return reply.status(400).send({ error: "Barcode must be 1-50 characters" });
    }

    const [row] = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        mnemonicSku: products.mnemonicSku,
        category: products.category,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        barcode: products.barcode,
        oemNumber: products.oemNumber,
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        familyId: products.familyId,
        familyName: productFamilies.name,
        brandId: products.brandId,
        brandName: brands.name,
      })
      .from(products)
      .leftJoin(inventory, and(
        eq(inventory.productId, products.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
      ))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(eq(products.orgId, orgId), eq(products.barcode, barcode)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: `No product found with barcode "${barcode}"` });
    }

    return reply.send(row);
  });
}
