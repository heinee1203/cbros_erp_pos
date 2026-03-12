import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products, inventory, productFamilies, vehicleCompatibility } from "@apex/database/schema";
import { eq, and, ilike, sql, asc, desc, type SQL } from "drizzle-orm";
import { createProductSchema, generateEan13, isValidEan13 } from "@apex/types";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

// Allowed sort columns mapped to their Drizzle column references
const SORT_COLUMNS = {
  name: products.name,
  sku: products.sku,
  category: products.category,
  unitPrice: products.unitPrice,
  stockLevel: inventory.stockLevel,
  reorderPoint: inventory.reorderPoint,
} as const;

type SortField = keyof typeof SORT_COLUMNS;

const VALID_SORT_FIELDS = Object.keys(SORT_COLUMNS) as SortField[];

export const productRoutes: FastifyPluginAsync = async (app) => {
  // Auth is handled globally by the auth plugin — no per-route hook needed

  /**
   * GET /products
   * Paginated product list with server-side sorting.
   *
   * Query params:
   *   page     - 1-based page number (default: 1)
   *   limit    - items per page, 1-100 (default: 50)
   *   search   - text filter on product name (min 2 chars)
   *   category - filter by product_category enum value
   *   stockStatus - "low" | "out" to filter stock alerts
   *   sortBy   - column to sort: name, sku, category, unitPrice, stockLevel
   *   sortDir  - "asc" | "desc" (default: asc)
   *   grouped  - "true" to enable variant grouping (deduplicates family variants)
   */
  app.get("/", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const { orgId, locationId } = request.storeContext!;

    // Parse pagination
    const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? "50", 10) || 50));
    const offset = (page - 1) * limit;

    // Parse sort
    const sortBy = VALID_SORT_FIELDS.includes(q.sortBy as SortField)
      ? (q.sortBy as SortField)
      : "name";
    const sortDir = q.sortDir === "desc" ? "desc" : "asc";

    // Parse grouped mode
    const grouped = q.grouped === "true";

    // ── Grouped mode: deduplicate variants within families ──
    if (grouped) {
      return handleGroupedQuery(
        reply,
        orgId,
        locationId,
        page,
        limit,
        offset,
        sortBy,
        sortDir,
        q.search,
        q.category,
        q.stockStatus,
      );
    }

    // ── Standard flat mode ──
    // Build WHERE conditions
    const conditions: SQL[] = [
      eq(inventory.locationId, locationId),
      eq(products.orgId, orgId),
    ];

    // Default: active products only. ADMIN/MANAGER can include inactive.
    const includeInactive = q.includeInactive === "true" && MANAGE_ROLES.includes(request.user.role);
    if (!includeInactive) {
      conditions.push(eq(products.isActive, true));
    }

    if (q.search && q.search.length >= 2) {
      conditions.push(ilike(products.name, `%${q.search}%`));
    }

    if (q.category) {
      conditions.push(eq(products.category, q.category as any));
    }

    if (q.stockStatus === "out") {
      conditions.push(eq(inventory.stockLevel, 0));
    } else if (q.stockStatus === "low") {
      conditions.push(
        sql`${inventory.stockLevel} > 0 AND ${inventory.stockLevel} <= ${inventory.reorderPoint}`,
      );
    }

    const where = and(...conditions);

    // Count total for pagination metadata
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(where);

    // Build ORDER BY — always add products.id as tie-breaker for stable pagination
    const sortCol = SORT_COLUMNS[sortBy];
    const orderFn = sortDir === "desc" ? desc : asc;
    const orderClauses = [orderFn(sortCol)];
    if (sortBy !== "name") {
      orderClauses.push(asc(products.name)); // secondary sort for stability
    }
    orderClauses.push(asc(products.id)); // final tie-breaker

    // Fetch page
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
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        familyId: products.familyId,
        familyName: productFamilies.name,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .where(where)
      .orderBy(...orderClauses)
      .limit(limit)
      .offset(offset);

    return reply.send({
      data: rows,
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
      hasMore: page * limit < count,
    });
  });

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

    // Check if query looks like a barcode (all digits, 13 chars)
    const isBarcodeLookup = /^\d{13}$/.test(q);

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
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(
        and(
          eq(inventory.locationId, locationId),
          eq(products.orgId, orgId),
          eq(products.isActive, true),
          isBarcodeLookup
            ? eq(products.barcode, q)
            : sql`(name % ${q} OR sku ILIKE ${q + "%"} OR mnemonic_sku ILIKE ${q + "%"})`,
        ),
      )
      .orderBy(isBarcodeLookup ? asc(products.name) : sql`similarity(name, ${q}) DESC`)
      .limit(20);

    return reply.send({ data: rows });
  });

  /**
   * POST /products
   * Create a new product with inventory rows and optional vehicle compatibility.
   * Restricted to ADMIN / MANAGER.
   */
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can create products" });
    }

    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId, locationId } = request.storeContext!;
    const {
      name,
      sku,
      mnemonicSku,
      category,
      unitPrice,
      costPrice,
      barcode: inputBarcode,
      familyId,
      trackInventory,
      reorderPoint,
      leadTimeDays,
      initialStock,
      locationIds,
      vehicleCompatibility: vehicleCompat,
    } = parsed.data;

    // Check SKU uniqueness within org
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.sku, sku)))
      .limit(1);

    if (existing) {
      return reply
        .status(409)
        .send({ error: `SKU "${sku}" already exists in this organization` });
    }

    // Check mnemonic SKU uniqueness within org
    const [existingMnemonic] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, mnemonicSku)))
      .limit(1);

    if (existingMnemonic) {
      return reply
        .status(409)
        .send({ error: `Mnemonic SKU "${mnemonicSku}" already exists` });
    }

    // ── Barcode handling ──
    let finalBarcode: string;
    if (inputBarcode) {
      // User provided a barcode — validate and check uniqueness
      if (!isValidEan13(inputBarcode)) {
        return reply.status(400).send({ error: "Invalid EAN-13 barcode (check digit mismatch)" });
      }
      const [existingBarcode] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.barcode, inputBarcode)))
        .limit(1);
      if (existingBarcode) {
        return reply.status(409).send({ error: `Barcode "${inputBarcode}" already exists in this organization` });
      }
      finalBarcode = inputBarcode;
    } else {
      // Auto-generate a unique EAN-13 barcode
      let generated = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateEan13();
        const [dup] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.orgId, orgId), eq(products.barcode, candidate)))
          .limit(1);
        if (!dup) {
          generated = candidate;
          break;
        }
      }
      if (!generated) {
        return reply.status(500).send({ error: "Failed to generate unique barcode after 10 attempts" });
      }
      finalBarcode = generated;
    }

    // Transaction: create product + inventory rows + vehicle compatibility
    const result = await db.transaction(async (tx) => {
      // 1. Insert product
      const [product] = await tx
        .insert(products)
        .values({
          orgId,
          name,
          sku,
          mnemonicSku,
          category: category as any,
          unitPrice: unitPrice || "0.00",
          costPrice: costPrice || "0.00",
          barcode: finalBarcode,
          familyId: familyId || null,
        })
        .returning();

      // 2. Create inventory rows
      if (trackInventory) {
        // Determine which locations to seed
        const targetLocations = locationIds && locationIds.length > 0
          ? locationIds
          : [locationId]; // default to current location

        for (const locId of targetLocations) {
          await tx.insert(inventory).values({
            orgId,
            productId: product.id,
            locationId: locId,
            stockLevel: locId === locationId ? (initialStock || 0) : 0,
            reorderPoint: reorderPoint ?? 10,
            leadTimeDays: leadTimeDays ?? 7,
          });
        }
      }

      // 3. Insert vehicle compatibility records if provided
      if (vehicleCompat && vehicleCompat.length > 0) {
        await tx.insert(vehicleCompatibility).values(
          vehicleCompat.map((vc) => ({
            productId: product.id,
            make: vc.make,
            model: vc.model,
            yearStart: vc.yearStart,
            yearEnd: vc.yearEnd,
            engine: vc.engine || null,
            notes: vc.notes || null,
          })),
        );
      }

      return product;
    });

    return reply.status(201).send(result);
  });

  /**
   * GET /products/by-barcode/:barcode
   * Exact barcode lookup — returns single product or 404.
   * Used by POS scanner and barcode printing search.
   */
  app.get("/by-barcode/:barcode", async (request, reply) => {
    const { barcode } = request.params as { barcode: string };
    const { orgId, locationId } = request.storeContext!;

    if (!/^\d{13}$/.test(barcode)) {
      return reply.status(400).send({ error: "Barcode must be exactly 13 digits" });
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
        stockLevel: inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        familyId: products.familyId,
        familyName: productFamilies.name,
      })
      .from(products)
      .innerJoin(inventory, and(eq(inventory.productId, products.id), eq(inventory.locationId, locationId)))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .where(and(eq(products.orgId, orgId), eq(products.barcode, barcode)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: `No product found with barcode "${barcode}"` });
    }

    return reply.send(row);
  });

  /**
   * GET /products/families
   * List all product families for the org (used by Add Item family selector).
   */
  app.get("/families", async (request, reply) => {
    const { orgId } = request.storeContext!;

    const rows = await db
      .select({
        id: productFamilies.id,
        name: productFamilies.name,
        slug: productFamilies.slug,
        productCount: sql<number>`(
          SELECT count(*)::int FROM products
          WHERE products.family_id = "product_families"."id"
        )`,
      })
      .from(productFamilies)
      .where(eq(productFamilies.orgId, orgId))
      .orderBy(asc(productFamilies.name));

    return reply.send({ data: rows });
  });

  /**
   * GET /products/families/:slug
   * Get a single family by slug, with product count.
   */
  app.get("/families/:slug", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { slug } = request.params as { slug: string };

    const [row] = await db
      .select({
        id: productFamilies.id,
        name: productFamilies.name,
        slug: productFamilies.slug,
        createdAt: productFamilies.createdAt,
        productCount: sql<number>`(
          SELECT count(*)::int FROM products
          WHERE products.family_id = "product_families"."id"
        )`,
      })
      .from(productFamilies)
      .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: `Family "${slug}" not found` });
    }

    return reply.send(row);
  });

  /**
   * GET /products/families/:slug/products
   * List all products belonging to a family (with stock at current location).
   */
  app.get("/families/:slug/products", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { slug } = request.params as { slug: string };
    const q = request.query as { search?: string };

    // Resolve family by slug
    const [family] = await db
      .select({ id: productFamilies.id })
      .from(productFamilies)
      .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
      .limit(1);

    if (!family) {
      return reply.status(404).send({ error: `Family "${slug}" not found` });
    }

    const conditions: SQL[] = [
      eq(products.familyId, family.id),
      eq(inventory.locationId, locationId),
    ];

    if (q.search && q.search.length >= 2) {
      conditions.push(ilike(products.name, `%${q.search}%`));
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        stockLevel: inventory.stockLevel,
        barcode: products.barcode,
      })
      .from(products)
      .innerJoin(inventory, and(eq(inventory.productId, products.id), eq(inventory.locationId, locationId)))
      .where(and(...conditions))
      .orderBy(asc(products.name));

    return reply.send({ data: rows });
  });

  /**
   * PATCH /products/families/:id
   * Update a family's name (slug auto-derived). Admin/Manager only.
   */
  app.patch("/families/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };

    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Name is required" });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const [updated] = await db
      .update(productFamilies)
      .set({ name: name.trim(), slug })
      .where(and(eq(productFamilies.id, id), eq(productFamilies.orgId, orgId)))
      .returning({ id: productFamilies.id, name: productFamilies.name, slug: productFamilies.slug });

    if (!updated) {
      return reply.status(404).send({ error: "Family not found" });
    }

    return reply.send(updated);
  });

  /**
   * DELETE /products/families/:id
   * Delete a family. Products keep familyId = null (FK onDelete: set null).
   * Admin/Manager only.
   */
  app.delete("/families/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(productFamilies)
      .where(and(eq(productFamilies.id, id), eq(productFamilies.orgId, orgId)))
      .returning({ id: productFamilies.id });

    if (!deleted) {
      return reply.status(404).send({ error: "Family not found" });
    }

    return reply.send({ success: true });
  });
};

/**
 * Grouped query handler.
 *
 * Deduplicates products within families by variant name:
 * - Family products: GROUP BY (familyId, name) → one row per variant with aggregated stock
 * - Standalone products: no grouping, returned as-is
 *
 * When search is active: expands to include ALL family siblings when any variant matches.
 */
async function handleGroupedQuery(
  reply: any,
  orgId: string,
  locationId: string,
  page: number,
  limit: number,
  offset: number,
  sortBy: SortField,
  sortDir: "asc" | "desc",
  search?: string,
  category?: string,
  stockStatus?: string,
) {
  // Build filter fragments
  const searchFilter = search && search.length >= 2
    ? sql`AND p.name ILIKE ${"%" + search + "%"}`
    : sql``;

  const categoryFilter = category
    ? sql`AND p.category = ${category}`
    : sql``;

  const stockFilter = stockStatus === "out"
    ? sql`AND i.stock_level = 0`
    : stockStatus === "low"
      ? sql`AND i.stock_level > 0 AND i.stock_level <= i.reorder_point`
      : sql``;

  // When search matches a family product, expand to include ALL variants in that family.
  // This lets the frontend show the complete family context around matching children.
  const familySearchExpansion = search && search.length >= 2
    ? sql`
      OR p.family_id IN (
        SELECT DISTINCT p2.family_id
        FROM inventory i2
        INNER JOIN products p2 ON i2.product_id = p2.id
        WHERE i2.location_id = ${locationId}
          AND p2.org_id = ${orgId}
          AND p2.family_id IS NOT NULL
          AND (p2.name ILIKE ${"%" + search + "%"} OR p2.sku ILIKE ${"%" + search + "%"})
      )
    `
    : sql``;

  // Build sort expression
  const sortExpr =
    sortBy === "stockLevel"
      ? sql`stock_level`
      : sortBy === "unitPrice"
        ? sql`unit_price`
        : sortBy === "category"
          ? sql`category`
          : sortBy === "sku"
            ? sql`sku`
            : sql`sort_key`; // default: name

  const dirExpr = sortDir === "desc" ? sql`DESC` : sql`ASC`;

  // Execute grouped query using raw SQL for the UNION ALL + aggregation
  const result = await db.execute(sql`
    WITH grouped_data AS (
      -- Part 1: Family products — one row per (family, variant_name) with aggregated stock
      SELECT
        (array_agg(p.id ORDER BY p.sku))[1] AS id,
        p.name AS name,
        (array_agg(p.sku ORDER BY p.sku))[1] AS sku,
        (array_agg(p.mnemonic_sku ORDER BY p.sku))[1] AS mnemonic_sku,
        p.category::text AS category,
        (array_agg(p.unit_price ORDER BY p.sku))[1]::text AS unit_price,
        (array_agg(p.cost_price ORDER BY p.sku))[1]::text AS cost_price,
        (array_agg(p.barcode ORDER BY p.sku))[1] AS barcode,
        SUM(i.stock_level)::int AS stock_level,
        MAX(i.reorder_point)::int AS reorder_point,
        p.family_id AS family_id,
        pf.name AS family_name,
        COALESCE(pf.name, p.name) AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      INNER JOIN product_families pf ON p.family_id = pf.id
      WHERE i.location_id = ${locationId}
        AND p.org_id = ${orgId}
        ${categoryFilter}
        ${stockFilter}
        AND (TRUE ${searchFilter} ${familySearchExpansion})
      GROUP BY p.family_id, pf.name, p.name, p.category

      UNION ALL

      -- Part 2: Standalone products — no grouping
      SELECT
        p.id,
        p.name,
        p.sku,
        p.mnemonic_sku,
        p.category::text,
        p.unit_price::text,
        p.cost_price::text,
        p.barcode,
        i.stock_level,
        i.reorder_point,
        NULL::uuid AS family_id,
        NULL::text AS family_name,
        p.name AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      WHERE i.location_id = ${locationId}
        AND p.org_id = ${orgId}
        AND p.family_id IS NULL
        ${searchFilter}
        ${categoryFilter}
        ${stockFilter}
    )
    SELECT *, count(*) OVER() AS _total_count
    FROM grouped_data
    ORDER BY ${sortExpr} ${dirExpr}, name ASC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = result as any[];
  const totalCount = rows.length > 0 ? Number(rows[0]._total_count) : 0;

  // Strip the _total_count helper field from response rows
  const data = rows.map(({ _total_count, ...row }) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    mnemonicSku: row.mnemonic_sku,
    category: row.category,
    unitPrice: row.unit_price,
    costPrice: row.cost_price,
    barcode: row.barcode,
    stockLevel: row.stock_level,
    reorderPoint: row.reorder_point,
    familyId: row.family_id,
    familyName: row.family_name,
  }));

  return reply.send({
    data,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    hasMore: page * limit < totalCount,
    grouped: true,
  });
}
