import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products, inventory, productFamilies, vehicleCompatibility, categories, productSubcategories, brands, locations } from "@apex/database/schema";
import { eq, and, ilike, sql, asc, desc, inArray, type SQL } from "drizzle-orm";
import { createProductSchema, updateProductSchema, addVehicleSchema, updateVehicleSchema, bulkImportSchema, generateEan13, isValidBarcode, type VariantItem } from "@apex/types";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

/**
 * Generate a guaranteed-unique 10-char mnemonic SKU.
 * Strategy: 4-char prefix from name + 6-char random uppercase letters.
 * If collision (astronomically unlikely), retry up to 10 times.
 */
async function generateUniqueMnemonicSku(
  orgId: string,
  productName: string,
  dbOrTx: typeof db,
): Promise<string> {
  const prefix = productName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const candidate = prefix + suffix;

    const [existing] = await dbOrTx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, candidate)))
      .limit(1);

    if (!existing) return candidate;
  }

  // Fallback: timestamp-based (virtually impossible to reach)
  const ts = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, "X");
  return prefix + ts;
}

// Allowed sort columns mapped to their Drizzle column references
const SORT_COLUMNS: Record<string, any> = {
  name: products.name,
  sku: products.sku,
  category: products.category,
  unitPrice: products.unitPrice,
  costPrice: products.costPrice,
  stockLevel: inventory.stockLevel,
  reorderPoint: inventory.reorderPoint,
  categoryName: categories.name,
  brandName: brands.name,
  margin: sql`CASE WHEN CAST(${products.unitPrice} AS numeric) > 0 THEN (CAST(${products.unitPrice} AS numeric) - CAST(${products.costPrice} AS numeric)) / CAST(${products.unitPrice} AS numeric) * 100 ELSE 0 END`,
};

type SortField = string;

const VALID_SORT_FIELDS = Object.keys(SORT_COLUMNS);

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
    const allLocations = q.allLocations === "true" || !locationId;

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
        q.subCategoryId,
        q.familyId,
        q.subcategoryId,
        q.brandId,
        allLocations,
      );
    }

    // ── All-locations aggregate mode ──
    if (allLocations) {
      return handleAllLocationsQuery(
        reply, orgId, page, limit, offset, sortBy, sortDir, q,
      );
    }

    // ── Standard flat mode ──
    // (allLocations check above guarantees locationId is non-null here)
    // Build WHERE conditions
    const conditions: SQL[] = [
      eq(inventory.locationId, locationId!),
      eq(inventory.availableForSale, true),
      eq(products.orgId, orgId),
    ];

    // Default: active products only. ADMIN/MANAGER can include inactive.
    const includeInactive = q.includeInactive === "true" && MANAGE_ROLES.includes(request.user.role);
    if (!includeInactive) {
      conditions.push(eq(products.isActive, true));
    }

    // parentOnly mode: hide variant children, show only parent + standalone
    const parentOnly = q.parentOnly === "true";
    if (parentOnly) {
      conditions.push(sql`${products.parentProductId} IS NULL`);
    }

    // Filter by specific parent (show variants of a parent)
    if (q.parentProductId) {
      conditions.push(eq(products.parentProductId, q.parentProductId));
    }

    if (q.search && q.search.length >= 2) {
      const searchTerm = "%" + q.search + "%";
      conditions.push(
        sql`(${products.name} ILIKE ${searchTerm} OR ${products.sku} ILIKE ${searchTerm} OR ${products.barcode} ILIKE ${searchTerm} OR ${products.oemNumber} ILIKE ${searchTerm} OR ${categories.name} ILIKE ${searchTerm})`,
      );
    }

    // OEM number filter — searches oem_number, name, SKU, and barcode
    // so a mechanic typing "MZ690027" finds matches in any identifier field
    if (q.oemNumber) {
      const oemTerm = "%" + q.oemNumber + "%";
      conditions.push(
        sql`(${products.oemNumber} ILIKE ${oemTerm} OR ${products.name} ILIKE ${oemTerm} OR ${products.sku} ILIKE ${oemTerm} OR ${products.barcode} ILIKE ${oemTerm})`,
      );
    }

    // Only products with at least one vehicle fitment
    if (q.hasVehicles === "true") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id})`,
      );
    }

    if (q.familyId) {
      if (q.familyId === "__none__") {
        conditions.push(sql`${products.familyId} IS NULL`);
      } else {
        conditions.push(eq(products.familyId, q.familyId));
      }
    }

    if (q.subCategoryId) {
      if (q.subCategoryId === "__none__") {
        conditions.push(sql`${products.categoryId} IS NULL`);
      } else {
        conditions.push(eq(products.categoryId, q.subCategoryId));
      }
    }

    if (q.subcategoryId) {
      if (q.subcategoryId === "__none__") {
        conditions.push(sql`${products.subcategoryId} IS NULL`);
      } else {
        conditions.push(eq(products.subcategoryId, q.subcategoryId));
      }
    }

    if (q.brandId) {
      if (q.brandId === "__none__") {
        conditions.push(sql`${products.brandId} IS NULL`);
      } else {
        conditions.push(eq(products.brandId, q.brandId));
      }
    }

    if (q.vehicleMake || q.vehicleModel || q.vehicleYear || q.vehicleEngine) {
      if (q.vehicleMake === "__none__") {
        conditions.push(
          sql`NOT EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id})`,
        );
      } else {
        const vcConds: SQL[] = [
          sql`vc.product_id = ${products.id}`,
        ];
        if (q.vehicleMake) {
          vcConds.push(sql`vc.make = ${q.vehicleMake}`);
        }
        if (q.vehicleModel) {
          vcConds.push(sql`vc.model ILIKE ${"%" + q.vehicleModel + "%"}`);
        }
        if (q.vehicleYear) {
          const year = parseInt(q.vehicleYear, 10);
          if (!isNaN(year)) {
            vcConds.push(sql`(vc.year_start IS NULL OR vc.year_start <= ${year}) AND (vc.year_end IS NULL OR vc.year_end >= ${year})`);
          }
        }
        if (q.vehicleEngine) {
          vcConds.push(sql`vc.engine ILIKE ${"%" + q.vehicleEngine + "%"}`);
        }
        conditions.push(
          sql`EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE ${sql.join(vcConds, sql` AND `)})`,
        );
      }
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
      .leftJoin(categories, eq(products.categoryId, categories.id))
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
        oemNumber: products.oemNumber,
        isVariablePrice: products.isVariablePrice,
        stockLevel: parentOnly
          ? sql<number>`GREATEST(CASE WHEN ${products.isParent} THEN COALESCE((
              SELECT SUM(inv2.stock_level)::int
              FROM inventory inv2
              INNER JOIN products p2 ON inv2.product_id = p2.id
              INNER JOIN locations loc2 ON inv2.location_id = loc2.id AND loc2.is_active = true
              WHERE p2.parent_product_id = ${products.id}
              ${locationId ? sql`AND inv2.location_id = ${locationId}` : sql``}
            ), 0) ELSE ${inventory.stockLevel} END, 0)`.as("stock_level")
          : inventory.stockLevel,
        reorderPoint: inventory.reorderPoint,
        familyId: products.familyId,
        familyName: productFamilies.name,
        subCategoryId: products.categoryId,
        subCategoryName: categories.name,
        subcategoryId: products.subcategoryId,
        subcategoryName: productSubcategories.name,
        brandId: products.brandId,
        brandName: brands.name,
        parentProductId: products.parentProductId,
        isParent: products.isParent,
        unitsPerCase: products.unitsPerCase,
        packagingUnit: products.packagingUnit,
        primarySupplierId: products.primarySupplierId,
        isSerialized: products.isSerialized,
        vehicleModel: q.vehicleMake && q.vehicleMake !== "__none__"
          ? sql<string>`(SELECT string_agg(DISTINCT vc.model, ', ' ORDER BY vc.model) FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id} AND vc.make = ${q.vehicleMake})`.as('vehicle_model')
          : sql<string | null>`null`.as('vehicle_model'),
        vehicleCount: q.hasVehicles === "true"
          ? sql<number>`(SELECT COUNT(*)::int FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id})`.as('vehicle_count')
          : sql<number>`0`.as('vehicle_count'),
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
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

    // Check if query looks like a barcode (all digits, 8/12/13 chars)
    const isBarcodeLookup = /^\d{8}$/.test(q) || /^\d{12,13}$/.test(q);

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
        isParent: products.isParent,
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
      variants: variantItems,
    } = parsed.data;

    const hasVariants = variantItems && variantItems.length > 0;

    // Parent items (with variants) don't need a SKU — generate a placeholder
    // Regular items still require a real SKU
    if (!hasVariants && (!sku || sku.length === 0)) {
      return reply.status(400).send({ error: "SKU is required for non-variant products" });
    }

    // Check SKU uniqueness within org (skip for parents which get auto-generated SKU)
    if (!hasVariants && sku) {
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
    }

    // Validate variant SKU uniqueness if creating variants
    if (hasVariants) {
      const variantSkus = variantItems.map((v) => v.sku);
      // Check for duplicates within the batch
      const uniqueSkus = new Set(variantSkus);
      if (uniqueSkus.size !== variantSkus.length) {
        return reply.status(400).send({ error: "Variant SKUs must be unique" });
      }
      // Check against existing SKUs in DB
      for (const vSku of variantSkus) {
        const [dup] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.orgId, orgId), eq(products.sku, vSku)))
          .limit(1);
        if (dup) {
          return reply.status(409).send({ error: `Variant SKU "${vSku}" already exists` });
        }
      }
    }

    // ── Barcode handling (only for non-parent products) ──
    let finalBarcode: string | null = null;
    if (!hasVariants) {
      if (inputBarcode) {
        if (!isValidBarcode(inputBarcode)) {
          return reply.status(400).send({ error: "Invalid barcode format" });
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
    }

    // ── Helper: generate unique barcode inside transaction ──
    async function generateUniqueBarcode(tx: any, orgIdParam: string, inputBc?: string): Promise<string> {
      if (inputBc) {
        return inputBc;
      }
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateEan13();
        const [dup] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.orgId, orgIdParam), eq(products.barcode, candidate)))
          .limit(1);
        if (!dup) return candidate;
      }
      throw new Error("Failed to generate unique barcode");
    }

    // Transaction: create product + variants + inventory rows + vehicle compatibility
    const result = await db.transaction(async (tx) => {
      // 1. Generate unique mnemonic SKU for parent/product
      const mnemonicSku = parsed.data.mnemonicSku || await generateUniqueMnemonicSku(orgId, name, tx as any);

      // For parent items, generate a placeholder SKU (e.g. "PARENT-XXXX")
      const parentSku = hasVariants
        ? `P-${Date.now().toString(36).toUpperCase().slice(-8)}`
        : sku!;

      // 2. Insert main product (parent if has variants, regular otherwise)
      const [product] = await tx
        .insert(products)
        .values({
          orgId,
          name,
          sku: parentSku,
          mnemonicSku,
          category: category as any,
          unitPrice: hasVariants ? "0.00" : (unitPrice || "0.00"),
          costPrice: hasVariants ? "0.00" : (costPrice || "0.00"),
          barcode: hasVariants ? null : finalBarcode,
          oemNumber: parsed.data.oemNumber || null,
          isParent: hasVariants ? true : (parsed.data.isParent ?? false),
          parentProductId: parsed.data.parentProductId || null,
          familyId: familyId || null,
          categoryId: parsed.data.categoryId || null,
          subcategoryId: parsed.data.subcategoryId || null,
          brandId: parsed.data.brandId || null,
          description: parsed.data.description || null,
          unitsPerCase: parsed.data.unitsPerCase ?? 1,
          packagingUnit: parsed.data.packagingUnit || null,
          primarySupplierId: parsed.data.primarySupplierId || null,
          isSerialized: parsed.data.isSerialized ?? false,
        })
        .returning();

      // 3. Create variant children if this is a parent
      const createdVariants: any[] = [];
      if (hasVariants) {
        for (const v of variantItems) {
          const childName = `${name} — ${v.suffix}`;
          const childMnemonic = await generateUniqueMnemonicSku(orgId, childName, tx as any);
          const childBarcode = await generateUniqueBarcode(tx, orgId, v.barcode);

          const [child] = await tx
            .insert(products)
            .values({
              orgId,
              name: childName,
              sku: v.sku,
              mnemonicSku: childMnemonic,
              category: category as any,
              unitPrice: v.unitPrice || "0.00",
              costPrice: v.costPrice || "0.00",
              barcode: childBarcode,
              oemNumber: parsed.data.oemNumber || null,
              isParent: false,
              parentProductId: product.id,
              familyId: familyId || null,
              categoryId: parsed.data.categoryId || null,
              subcategoryId: parsed.data.subcategoryId || null,
              brandId: parsed.data.brandId || null,
            })
            .returning();

          createdVariants.push(child);

          // Create inventory rows for each variant child
          if (trackInventory) {
            const targetLocations = locationIds && locationIds.length > 0
              ? locationIds
              : locationId ? [locationId] : [];
            for (const locId of targetLocations) {
              await tx.insert(inventory).values({
                orgId,
                productId: child.id,
                locationId: locId,
                stockLevel: 0,
                reorderPoint: reorderPoint ?? 10,
                leadTimeDays: leadTimeDays ?? 7,
              });
            }
          }
        }
      }

      // 4. Create inventory rows for main product (not for parents — they don't hold stock)
      if (trackInventory && !hasVariants) {
        const targetLocations = locationIds && locationIds.length > 0
          ? locationIds
          : locationId ? [locationId] : [];

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

      // 5. Insert vehicle compatibility records if provided
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

      return { ...product, variants: createdVariants };
    });

    return reply.status(201).send(result);
  });

  /**
   * PATCH /products/bulk-update
   * Bulk update category, brand, family, or subcategory for multiple products.
   * Supports two modes: explicit productIds list, or filter-based update.
   * Admin/Manager only.
   */
  app.patch("/bulk-update", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productIds?: string[];
      filter?: { search?: string; familyId?: string; categoryId?: string; brandId?: string };
      updates: {
        categoryId?: string;
        brandId?: string;
        familyId?: string;
        subcategoryId?: string;
      };
    };

    if (!body.updates || Object.keys(body.updates).length === 0) {
      return reply.status(400).send({ error: "No updates provided" });
    }

    // Build the SET clause from provided updates only
    const updateFields: Record<string, unknown> = {};
    if (body.updates.categoryId !== undefined) updateFields.categoryId = body.updates.categoryId;
    if (body.updates.brandId !== undefined) updateFields.brandId = body.updates.brandId;
    if (body.updates.familyId !== undefined) updateFields.familyId = body.updates.familyId;
    if (body.updates.subcategoryId !== undefined) updateFields.subcategoryId = body.updates.subcategoryId;

    let updated = 0;

    if (body.productIds && body.productIds.length > 0) {
      // Mode 1: Update specific product IDs (max 500)
      if (body.productIds.length > 500) {
        return reply.status(400).send({ error: "Maximum 500 items per request" });
      }

      const result = await db
        .update(products)
        .set(updateFields)
        .where(and(
          eq(products.orgId, orgId),
          inArray(products.id, body.productIds),
        ));
      updated = (result as any).rowCount ?? body.productIds.length;
    } else if (body.filter) {
      // Mode 2: Update all products matching filter
      const conditions: SQL[] = [eq(products.orgId, orgId), eq(products.isActive, true)];
      if (body.filter.search && body.filter.search.length >= 2) {
        conditions.push(ilike(products.name, `%${body.filter.search}%`));
      }
      if (body.filter.familyId) conditions.push(eq(products.familyId, body.filter.familyId));
      if (body.filter.categoryId) conditions.push(eq(products.categoryId, body.filter.categoryId));
      if (body.filter.brandId) conditions.push(eq(products.brandId, body.filter.brandId));

      const result = await db
        .update(products)
        .set(updateFields)
        .where(and(...conditions));

      updated = (result as any).rowCount ?? 0;
    } else {
      return reply.status(400).send({ error: "Provide productIds or filter" });
    }

    return reply.send({ updated });
  });

  /**
   * PATCH /products/:id
   * Update a product's editable fields. Admin/Manager only.
   */
  app.patch("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can update products" });
    }

    const { id } = request.params as { id: string };
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) {
      console.error("PATCH /products/:id validation:", JSON.stringify(parsed.error.flatten(), null, 2));
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId, locationId } = request.storeContext!;
    const updates = parsed.data;

    // Verify product belongs to this org
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ error: "Product not found" });
    }

    // If barcode is changing, validate uniqueness
    if (updates.barcode) {
      if (!isValidBarcode(updates.barcode)) {
        return reply.status(400).send({ error: "Invalid barcode format" });
      }
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.barcode, updates.barcode), sql`${products.id} != ${id}`))
        .limit(1);
      if (dup) {
        return reply.status(409).send({ error: `Barcode "${updates.barcode}" already exists` });
      }
    }

    // Build product update set (excluding reorderPoint and newVariants which are handled separately)
    const { reorderPoint, newVariants, ...productUpdates } = updates;
    const hasProductUpdates = Object.keys(productUpdates).length > 0;

    // Validate new variant SKU uniqueness
    if (newVariants && newVariants.length > 0) {
      const variantSkus = newVariants.map((v) => v.sku);
      const uniqueSkus = new Set(variantSkus);
      if (uniqueSkus.size !== variantSkus.length) {
        return reply.status(400).send({ error: "Variant SKUs must be unique" });
      }
      for (const vSku of variantSkus) {
        const [dup] = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.orgId, orgId), eq(products.sku, vSku)))
          .limit(1);
        if (dup) {
          return reply.status(409).send({ error: `Variant SKU "${vSku}" already exists` });
        }
      }
    }

    const result = await db.transaction(async (tx) => {
      // Update product fields
      if (hasProductUpdates) {
        await tx
          .update(products)
          .set(productUpdates)
          .where(eq(products.id, id));
      }

      // Update reorder point in inventory (only when a specific location is selected)
      if (reorderPoint !== undefined && locationId) {
        await tx
          .update(inventory)
          .set({ reorderPoint })
          .where(and(eq(inventory.productId, id), eq(inventory.locationId, locationId)));
      }

      // Create new variant children if provided
      const createdVariants: any[] = [];
      if (newVariants && newVariants.length > 0) {
        // Fetch parent product to inherit shared fields
        const [parent] = await tx
          .select()
          .from(products)
          .where(eq(products.id, id))
          .limit(1);

        if (parent) {
          for (const v of newVariants) {
            const childName = `${parent.name} — ${v.suffix}`;
            const childMnemonic = await generateUniqueMnemonicSku(orgId, childName, tx as any);
            // Generate barcode for variant
            let childBarcode = v.barcode || "";
            if (!childBarcode) {
              for (let attempt = 0; attempt < 10; attempt++) {
                const candidate = generateEan13();
                const [dup] = await tx
                  .select({ id: products.id })
                  .from(products)
                  .where(and(eq(products.orgId, orgId), eq(products.barcode, candidate)))
                  .limit(1);
                if (!dup) { childBarcode = candidate; break; }
              }
            }

            const [child] = await tx
              .insert(products)
              .values({
                orgId,
                name: childName,
                sku: v.sku,
                mnemonicSku: childMnemonic,
                category: parent.category as any,
                unitPrice: v.unitPrice || "0.00",
                costPrice: v.costPrice || "0.00",
                barcode: childBarcode || null,
                oemNumber: parent.oemNumber || null,
                isParent: false,
                parentProductId: id,
                familyId: parent.familyId || null,
                categoryId: parent.categoryId || null,
                subcategoryId: parent.subcategoryId || null,
                brandId: parent.brandId || null,
              })
              .returning();

            createdVariants.push(child);

            // Create inventory rows for the new variant
            if (locationId) {
              await tx.insert(inventory).values({
                orgId,
                productId: child.id,
                locationId,
                stockLevel: 0,
                reorderPoint: 10,
                leadTimeDays: 7,
              });
            }
          }
        }
      }

      // Return updated product with inventory data
      const [row] = await tx
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
          unitsPerCase: products.unitsPerCase,
          packagingUnit: products.packagingUnit,
          primarySupplierId: products.primarySupplierId,
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
        .where(eq(products.id, id))
        .limit(1);

      return { ...row, newVariants: createdVariants };
    });

    return reply.send(result);
  });

  /**
   * GET /products/grouped-counts
   * Aggregated counts for the drill-down inventory view.
   * Groups products by family → category → brand → vehicleMake.
   */
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
        unitsPerCase: products.unitsPerCase,
        packagingUnit: products.packagingUnit,
        primarySupplierId: products.primarySupplierId,
        isSerialized: products.isSerialized,
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
   * DELETE /products/:id
   * Hard-delete a product if it has no sales history, otherwise soft-delete (isActive=false).
   */
  app.delete("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can delete products" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return reply.status(400).send({ error: "Invalid product ID format" });
    }

    const [existing] = await db
      .select({ id: products.id, isParent: products.isParent })
      .from(products)
      .where(and(eq(products.id, id), eq(products.orgId, orgId)))
      .limit(1);

    if (!existing) return reply.status(404).send({ error: "Product not found" });

    // Collect all product IDs to check (self + children if parent)
    const idsToCheck: string[] = [id];
    if (existing.isParent) {
      const children = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.parentProductId, id), eq(products.orgId, orgId)));
      idsToCheck.push(...children.map((c) => c.id));
    }

    // Check for non-cascading FK references across ALL affected products
    const idList = sql.join(idsToCheck.map((i) => sql`${i}`), sql`, `);
    const [hasRefs] = await db.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM sale_lines WHERE product_id IN (${idList})
        UNION ALL SELECT 1 FROM po_lines WHERE product_id IN (${idList})
        UNION ALL SELECT 1 FROM job_card_parts WHERE product_id IN (${idList})
        UNION ALL SELECT 1 FROM stock_transfer_items WHERE product_id IN (${idList})
        UNION ALL SELECT 1 FROM po_receipt_events WHERE product_id IN (${idList})
      ) AS has_refs
    `);

    if ((hasRefs as any)?.has_refs) {
      // Soft-delete: deactivate all affected products
      await db.update(products).set({ isActive: false }).where(
        inArray(products.id, idsToCheck),
      );
      return reply.send({
        message: existing.isParent
          ? "Parent and variants deactivated (has transaction history)"
          : "Product deactivated (has transaction history)",
      });
    }

    // Hard delete — CASCADE handles inventory, stock_journal, vehicle_compatibility,
    // inventory_count_lines, product_option_types, product_variant_options.
    // For parent products, CASCADE on parent_product_id deletes children first,
    // and each child's CASCADE deletes its own dependent rows.
    await db.delete(products).where(eq(products.id, id));
    return reply.status(204).send();
  });

  /**
   * GET /products/by-barcode/:barcode
   * Exact barcode lookup — returns single product or 404.
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
   * POST /products/families
   * Create a new product family. Admin/Manager only.
   */
  app.post("/families", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { name } = request.body as { name: string };
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: "Name is required" });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check for duplicate slug
    const existing = await db
      .select({ id: productFamilies.id })
      .from(productFamilies)
      .where(and(eq(productFamilies.orgId, orgId), eq(productFamilies.slug, slug)))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: `Family with slug "${slug}" already exists` });
    }

    const [created] = await db
      .insert(productFamilies)
      .values({ orgId, name: name.trim(), slug })
      .returning({ id: productFamilies.id, name: productFamilies.name, slug: productFamilies.slug });

    return reply.status(201).send(created);
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
      ...(locationId ? [eq(inventory.locationId, locationId)] : []),
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
        oemNumber: products.oemNumber,
      })
      .from(products)
      .leftJoin(inventory, and(
        eq(inventory.productId, products.id),
        ...(locationId ? [eq(inventory.locationId, locationId)] : []),
      ))
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

  // ── Vehicle Compatibility CRUD ──

  // Static routes BEFORE parametric ones (Fastify radix trie)

  /** GET /products/vehicles/makes — distinct makes across org */
  app.get("/vehicles/makes", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.execute(sql`
      SELECT DISTINCT vc.make
      FROM vehicle_compatibility vc
      INNER JOIN products p ON vc.product_id = p.id
      WHERE p.org_id = ${orgId}
      ORDER BY vc.make
    `);
    return reply.send({ data: (rows as any[]).map((r) => r.make) });
  });

  /** GET /products/vehicles/models?make=X — distinct models for a make across org */
  app.get("/vehicles/models", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { make } = request.query as { make?: string };
    if (!make) return reply.status(400).send({ error: "make query param is required" });
    const rows = await db.execute(sql`
      SELECT DISTINCT vc.model
      FROM vehicle_compatibility vc
      INNER JOIN products p ON vc.product_id = p.id
      WHERE p.org_id = ${orgId} AND vc.make = ${make}
      ORDER BY vc.model
    `);
    return reply.send({ data: (rows as any[]).map((r) => r.model) });
  });

  /** GET /products/vehicles/engines — distinct engine codes, optionally filtered by make */
  app.get("/vehicles/engines", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const conditions = [eq(products.orgId, orgId)];
    if (q.make) {
      conditions.push(eq(vehicleCompatibility.make, q.make as any));
    }

    const rows = await db
      .selectDistinct({ engine: vehicleCompatibility.engine })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(and(...conditions, sql`${vehicleCompatibility.engine} IS NOT NULL AND ${vehicleCompatibility.engine} != ''`))
      .orderBy(vehicleCompatibility.engine);

    return reply.send({ data: rows.map((r) => r.engine) });
  });

  /** GET /products/:productId/vehicles — list fitment entries for a product */
  app.get("/:productId/vehicles", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const [prod] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .limit(1);
    if (!prod) return reply.status(404).send({ error: "Product not found" });

    const rows = await db
      .select()
      .from(vehicleCompatibility)
      .where(eq(vehicleCompatibility.productId, productId))
      .orderBy(asc(vehicleCompatibility.make), asc(vehicleCompatibility.model));
    return reply.send({ data: rows });
  });

  /** POST /products/:productId/vehicles — add a fitment entry */
  app.post("/:productId/vehicles", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const parsed = addVehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });

    const [prod] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .limit(1);
    if (!prod) return reply.status(404).send({ error: "Product not found" });

    const [row] = await db
      .insert(vehicleCompatibility)
      .values({
        productId,
        make: parsed.data.make,
        model: parsed.data.model,
        yearStart: parsed.data.yearStart,
        yearEnd: parsed.data.yearEnd,
        engine: parsed.data.engine ?? null,
        notes: parsed.data.notes ?? null,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  /** PATCH /products/:productId/vehicles/:id — update a fitment entry */
  app.patch("/:productId/vehicles/:id", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId, id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const parsed = updateVehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });

    // Verify ownership chain: vehicle → product → org
    const [existing] = await db
      .select({ vcId: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(
        and(
          eq(vehicleCompatibility.id, id),
          eq(vehicleCompatibility.productId, productId),
          eq(products.orgId, orgId)
        )
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Vehicle entry not found" });

    const [updated] = await db
      .update(vehicleCompatibility)
      .set(parsed.data)
      .where(eq(vehicleCompatibility.id, id))
      .returning();
    return reply.send({ data: updated });
  });

  /** DELETE /products/:productId/vehicles/:id — remove a fitment entry */
  app.delete("/:productId/vehicles/:id", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId, id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;

    const [existing] = await db
      .select({ vcId: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(
        and(
          eq(vehicleCompatibility.id, id),
          eq(vehicleCompatibility.productId, productId),
          eq(products.orgId, orgId)
        )
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Vehicle entry not found" });

    await db.delete(vehicleCompatibility).where(eq(vehicleCompatibility.id, id));
    return reply.send({ success: true });
  });

  // ────────────────────────────────────────────────────────────────────
  // GET /products/export — Denormalized export with per-location inventory
  // ────────────────────────────────────────────────────────────────────
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as Record<string, string>;

    const search = query.search || "";
    const familyId = query.familyId || "";
    const subCategoryId = query.subCategoryId || "";
    const subcategoryId = query.subcategoryId || "";
    const stockStatus = query.stockStatus || "";
    const brandId = query.brandId || "";
    const sortBy = query.sortBy || "name";
    const sortDir = query.sortDir || "asc";

    // Build WHERE conditions
    const conditions: SQL[] = [eq(products.orgId, orgId), eq(products.isActive, true)];
    if (search && search.length >= 2) {
      conditions.push(ilike(products.name, `%${search}%`));
    }
    if (familyId) conditions.push(eq(products.familyId, familyId));
    if (subCategoryId) conditions.push(eq(products.categoryId, subCategoryId));
    if (subcategoryId) conditions.push(eq(products.subcategoryId, subcategoryId));
    if (brandId) conditions.push(eq(products.brandId, brandId));

    // Fetch all active locations for the org
    const orgLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));

    // Fetch products with taxonomy joins
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        oemNumber: products.oemNumber,
        description: products.description,
        unitPrice: products.unitPrice,
        costPrice: products.costPrice,
        isVariablePrice: products.isVariablePrice,
        isParent: products.isParent,
        parentProductId: products.parentProductId,
        familyName: productFamilies.name,
        categoryName: categories.name,
        subcategoryName: productSubcategories.name,
        brandName: brands.name,
        unitsPerCase: products.unitsPerCase,
        packagingUnit: products.packagingUnit,
        isSerialized: products.isSerialized,
      })
      .from(products)
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(and(...conditions))
      .orderBy(sortDir === "desc" ? desc(SORT_COLUMNS[sortBy] ?? products.name) : asc(SORT_COLUMNS[sortBy] ?? products.name))
      .limit(50000);

    // Fetch ALL inventory rows for these products
    const productIds = productRows.map((p) => p.id);
    let allInventory: Array<{
      productId: string;
      locationId: string;
      stockLevel: number;
      reorderPoint: number;
      optimalStock: number;
      availableForSale: boolean;
    }> = [];

    if (productIds.length > 0) {
      allInventory = await db
        .select({
          productId: inventory.productId,
          locationId: inventory.locationId,
          stockLevel: inventory.stockLevel,
          reorderPoint: inventory.reorderPoint,
          optimalStock: inventory.optimalStock,
          availableForSale: inventory.availableForSale,
        })
        .from(inventory)
        .where(and(
          eq(inventory.orgId, orgId),
          inArray(inventory.productId, productIds),
        ));
    }

    // Build inventory map: productId -> locationId -> row
    const invMap = new Map<string, Map<string, typeof allInventory[0]>>();
    for (const row of allInventory) {
      if (!invMap.has(row.productId)) invMap.set(row.productId, new Map());
      invMap.get(row.productId)!.set(row.locationId, row);
    }

    // Build parent handle map
    const parentHandleMap = new Map<string, string>();
    for (const p of productRows) {
      if (p.isParent) {
        const handle = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
        parentHandleMap.set(p.id, handle);
      }
    }

    // Enrich products
    const enriched = productRows.map((p) => {
      const locMap = invMap.get(p.id) ?? new Map();
      const locData = orgLocations.map((loc) => {
        const inv = locMap.get(loc.id);
        return {
          locationId: loc.id,
          locationName: loc.name,
          availableForSale: inv?.availableForSale ?? true,
          stockLevel: inv?.stockLevel ?? 0,
          reorderPoint: inv?.reorderPoint ?? 0,
          optimalStock: inv?.optimalStock ?? 0,
        };
      });

      let handle = "";
      if (p.isParent) {
        handle = parentHandleMap.get(p.id) ?? "";
      } else if (p.parentProductId) {
        handle = parentHandleMap.get(p.parentProductId) ?? "";
      }

      return { ...p, handle, locations: locData };
    });

    return reply.send({ data: enriched, locations: orgLocations });
  });

  // ── Bulk Import ──────────────────────────────────────────────────────
  app.post("/import", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can import products" });
    }

    const parsed = bulkImportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const { orgId, locationId } = request.storeContext!;
    const { dryRun, rows } = parsed.data;

    // 1. Load all existing SKUs for this org → Map<lowercase_sku, productId>
    const existingProducts = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(eq(products.orgId, orgId));
    const skuMap = new Map<string, string>();
    for (const p of existingProducts) {
      skuMap.set(p.sku.toLowerCase(), p.id);
    }

    // 2. Load taxonomy lookups → Map<lowercase_name, id>
    const [allFamilies, allCategories, allSubcategories, allBrands] = await Promise.all([
      db.select({ id: productFamilies.id, name: productFamilies.name }).from(productFamilies).where(eq(productFamilies.orgId, orgId)),
      db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.orgId, orgId)),
      db.select({ id: productSubcategories.id, name: productSubcategories.name }).from(productSubcategories).where(eq(productSubcategories.orgId, orgId)),
      db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.orgId, orgId)),
    ]);

    const familyMap = new Map(allFamilies.map((f) => [f.name.toLowerCase(), f.id]));
    const categoryMap = new Map(allCategories.map((c) => [c.name.toLowerCase(), c.id]));
    const subcategoryMap = new Map(allSubcategories.map((s) => [s.name.toLowerCase(), s.id]));
    const brandMap = new Map(allBrands.map((b) => [b.name.toLowerCase(), b.id]));

    // 2b. Load location name -> id map
    const orgLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)));
    const locationNameMap = new Map(orgLocations.map((l) => [l.name.toLowerCase(), l.id]));

    // 3. Process rows in a transaction
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; sku: string; error: string }> = [];
    const results: Array<{ row: number; sku: string; action: "created" | "updated" | "error"; productId?: string }> = [];

    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          try {
            const familyId = row.family ? familyMap.get(row.family.toLowerCase()) ?? null : null;
            const categoryId = row.category ? categoryMap.get(row.category.toLowerCase()) ?? null : null;
            const subcategoryId = row.subcategory ? subcategoryMap.get(row.subcategory.toLowerCase()) ?? null : null;
            const brandId = row.brand ? brandMap.get(row.brand.toLowerCase()) ?? null : null;

            const existingId = skuMap.get(row.sku.toLowerCase());

            if (existingId) {
              // ── UPDATE existing product ──
              const updateValues: Record<string, any> = { name: row.name };
              if (row.unitPrice !== undefined) updateValues.unitPrice = row.unitPrice;
              if (row.costPrice !== undefined) updateValues.costPrice = row.costPrice;
              if (row.barcode !== undefined) updateValues.barcode = row.barcode;
              if (row.oemNumber !== undefined) updateValues.oemNumber = row.oemNumber;
              if (row.isVariablePrice !== undefined) updateValues.isVariablePrice = row.isVariablePrice;
              if (row.description !== undefined) updateValues.description = row.description;
              if (row.unitsPerCase !== undefined) updateValues.unitsPerCase = row.unitsPerCase;
              if (row.packagingUnit !== undefined) updateValues.packagingUnit = row.packagingUnit;
              if (familyId) updateValues.familyId = familyId;
              if (categoryId) updateValues.categoryId = categoryId;
              if (subcategoryId) updateValues.subcategoryId = subcategoryId;
              if (brandId) updateValues.brandId = brandId;

              await tx
                .update(products)
                .set(updateValues)
                .where(and(eq(products.id, existingId), eq(products.orgId, orgId)));

              // Upsert per-location inventory
              if (row.locations && row.locations.length > 0) {
                for (const loc of row.locations) {
                  const locId = locationNameMap.get(loc.locationName.toLowerCase());
                  if (!locId) continue;
                  const [existingInv] = await tx
                    .select({ id: inventory.id })
                    .from(inventory)
                    .where(and(eq(inventory.productId, existingId), eq(inventory.locationId, locId)))
                    .limit(1);
                  if (existingInv) {
                    await tx.update(inventory).set({
                      stockLevel: loc.inStock,
                      reorderPoint: loc.lowStock,
                      optimalStock: loc.optimalStock,
                      availableForSale: loc.availableForSale,
                    }).where(eq(inventory.id, existingInv.id));
                  } else {
                    await tx.insert(inventory).values({
                      orgId,
                      productId: existingId,
                      locationId: locId,
                      stockLevel: loc.inStock,
                      reorderPoint: loc.lowStock,
                      optimalStock: loc.optimalStock,
                      availableForSale: loc.availableForSale,
                    });
                  }
                }
              }

              updated++;
              results.push({ row: i + 1, sku: row.sku, action: "updated", productId: existingId });
            } else {
              // ── CREATE new product ──
              const mnemonicSku = await generateUniqueMnemonicSku(orgId, row.name, tx as any);
              const barcode = row.barcode || generateEan13();

              const [newProduct] = await tx
                .insert(products)
                .values({
                  orgId,
                  name: row.name,
                  sku: row.sku,
                  mnemonicSku,
                  category: "HARD_PARTS" as any,
                  unitPrice: row.unitPrice || "0.00",
                  costPrice: row.costPrice || "0.00",
                  barcode,
                  oemNumber: row.oemNumber || null,
                  isVariablePrice: row.isVariablePrice ?? false,
                  description: row.description || null,
                  unitsPerCase: row.unitsPerCase ?? 1,
                  packagingUnit: row.packagingUnit || null,
                  familyId,
                  categoryId,
                  subcategoryId,
                  brandId,
                })
                .returning();

              // Create inventory row at current location
              if (locationId) {
                await tx.insert(inventory).values({
                  orgId,
                  productId: newProduct.id,
                  locationId,
                  stockLevel: 0,
                  reorderPoint: 10,
                });
              }

              // Upsert per-location inventory from import
              if (row.locations && row.locations.length > 0) {
                for (const loc of row.locations) {
                  const locId = locationNameMap.get(loc.locationName.toLowerCase());
                  if (!locId) continue;
                  // Skip if already created above for this location
                  if (locId === locationId) continue;
                  await tx.insert(inventory).values({
                    orgId,
                    productId: newProduct.id,
                    locationId: locId,
                    stockLevel: loc.inStock,
                    reorderPoint: loc.lowStock,
                    optimalStock: loc.optimalStock,
                    availableForSale: loc.availableForSale,
                  });
                }
              }

              // Track new SKU so subsequent duplicate rows in the same batch resolve to update
              skuMap.set(row.sku.toLowerCase(), newProduct.id);

              created++;
              results.push({ row: i + 1, sku: row.sku, action: "created", productId: newProduct.id });
            }
          } catch (rowErr: any) {
            errors.push({ row: i + 1, sku: row.sku, error: rowErr.message ?? String(rowErr) });
            results.push({ row: i + 1, sku: row.sku, action: "error" });
          }
        }

        // Dry-run: rollback the transaction but keep the preview data
        if (dryRun) {
          throw new Error("__DRY_RUN_ROLLBACK__");
        }
      });
    } catch (err: any) {
      if (err.message !== "__DRY_RUN_ROLLBACK__") {
        throw err; // re-throw real errors
      }
    }

    return reply.send({ dryRun, created, updated, errors, results });
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
  locationId: string | null,
  page: number,
  limit: number,
  offset: number,
  sortBy: SortField,
  sortDir: "asc" | "desc",
  search?: string,
  category?: string,
  stockStatus?: string,
  subCategoryId?: string,
  familyId?: string,
  subcategoryId?: string,
  brandId?: string,
  allLocations?: boolean,
) {
  // Build filter fragments
  const brandFilter = brandId
    ? brandId === "__none__" ? sql`AND p.brand_id IS NULL` : sql`AND p.brand_id = ${brandId}::uuid`
    : sql``;

  const subcategoryFilter = subcategoryId
    ? subcategoryId === "__none__" ? sql`AND p.subcategory_id IS NULL` : sql`AND p.subcategory_id = ${subcategoryId}::uuid`
    : sql``;

  const familyFilter = familyId
    ? familyId === "__none__" ? sql`AND p.family_id IS NULL` : sql`AND p.family_id = ${familyId}::uuid`
    : sql``;

  const searchFilter = search && search.length >= 2
    ? sql`AND (p.name ILIKE ${"%" + search + "%"} OR cat.name ILIKE ${"%" + search + "%"})`
    : sql``;

  const categoryFilter = category
    ? sql`AND p.category = ${category}`
    : sql``;

  const stockFilter = stockStatus === "out"
    ? sql`AND i.stock_level = 0`
    : stockStatus === "low"
      ? sql`AND i.stock_level > 0 AND i.stock_level <= i.reorder_point`
      : sql``;

  const subCategoryFilter = subCategoryId
    ? subCategoryId === "__none__" ? sql`AND p.category_id IS NULL` : sql`AND p.category_id = ${subCategoryId}::uuid`
    : sql``;

  // Location filter — omitted when allLocations=true
  const locationFilter = allLocations ? sql`` : sql`AND i.location_id = ${locationId}`;
  // Only show items marked available for sale at the store
  const availabilityFilter = allLocations ? sql`` : sql`AND i.available_for_sale = true`;
  // Exclude inventory at inactive locations when showing all-locations aggregate
  const activeLocationFilter = allLocations
    ? sql`AND EXISTS (SELECT 1 FROM locations loc WHERE loc.id = i.location_id AND loc.is_active = true)`
    : sql``;

  // When search matches a family product, expand to include ALL variants in that family.
  // This lets the frontend show the complete family context around matching children.
  const familySearchExpansion = search && search.length >= 2
    ? sql`
      OR p.family_id IN (
        SELECT DISTINCT p2.family_id
        FROM inventory i2
        INNER JOIN products p2 ON i2.product_id = p2.id
        WHERE ${allLocations ? sql`TRUE` : sql`i2.location_id = ${locationId}`}
          AND p2.org_id = ${orgId}
          AND p2.family_id IS NOT NULL
          AND (p2.name ILIKE ${"%" + search + "%"} OR p2.sku ILIKE ${"%" + search + "%"})
      )
    `
    : sql``;

  // Build sort expression
  const GROUPED_SORT_MAP: Record<string, ReturnType<typeof sql>> = {
    stockLevel: sql`stock_level`,
    unitPrice: sql`unit_price`,
    costPrice: sql`cost_price`,
    category: sql`category`,
    sku: sql`sku`,
    categoryName: sql`sub_category_name`,
    brandName: sql`brand_name`,
    margin: sql`CASE WHEN CAST(unit_price AS numeric) > 0 THEN (CAST(unit_price AS numeric) - CAST(cost_price AS numeric)) / CAST(unit_price AS numeric) * 100 ELSE 0 END`,
  };
  const sortExpr = GROUPED_SORT_MAP[sortBy] ?? sql`sort_key`;

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
        (array_agg(p.oem_number ORDER BY p.sku))[1] AS oem_number,
        bool_or(p.is_variable_price) AS is_variable_price,
        GREATEST(COALESCE(SUM(i.stock_level), 0), 0)::int AS stock_level,
        COALESCE(MAX(i.reorder_point), 0)::int AS reorder_point,
        p.family_id AS family_id,
        pf.name AS family_name,
        (array_agg(p.category_id ORDER BY p.sku))[1] AS sub_category_id,
        (array_agg(cat.name ORDER BY p.sku))[1] AS sub_category_name,
        (array_agg(p.subcategory_id ORDER BY p.sku))[1] AS subcategory_id,
        (array_agg(psub.name ORDER BY p.sku))[1] AS subcategory_name,
        (array_agg(p.brand_id ORDER BY p.sku))[1] AS brand_id,
        (array_agg(b.name ORDER BY p.sku))[1] AS brand_name,
        COALESCE(pf.name, p.name) AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      INNER JOIN product_families pf ON p.family_id = pf.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${locationFilter}
        ${availabilityFilter}
        ${activeLocationFilter}
        ${familyFilter}
        ${categoryFilter}
        ${stockFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
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
        p.oem_number,
        p.is_variable_price,
        ${allLocations ? sql`GREATEST(COALESCE(SUM(i.stock_level), 0), 0)::int` : sql`GREATEST(i.stock_level, 0)`} AS stock_level,
        ${allLocations ? sql`COALESCE(MAX(i.reorder_point), 0)::int` : sql`i.reorder_point`} AS reorder_point,
        NULL::uuid AS family_id,
        NULL::text AS family_name,
        p.category_id AS sub_category_id,
        cat.name AS sub_category_name,
        p.subcategory_id AS subcategory_id,
        psub.name AS subcategory_name,
        p.brand_id AS brand_id,
        b.name AS brand_name,
        p.name AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${locationFilter}
        ${availabilityFilter}
        ${activeLocationFilter}
        AND p.family_id IS NULL
        ${familyFilter}
        ${searchFilter}
        ${categoryFilter}
        ${stockFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
      ${allLocations ? sql`GROUP BY p.id, p.name, p.sku, p.mnemonic_sku, p.category,
               p.unit_price, p.cost_price, p.barcode, p.oem_number, p.is_variable_price,
               p.category_id, cat.name, p.subcategory_id, psub.name,
               p.brand_id, b.name` : sql``}
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
    oemNumber: row.oem_number,
    isVariablePrice: row.is_variable_price,
    stockLevel: row.stock_level,
    reorderPoint: row.reorder_point,
    familyId: row.family_id,
    familyName: row.family_name,
    subCategoryId: row.sub_category_id,
    subCategoryName: row.sub_category_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
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

/**
 * All-locations aggregate query.
 * Returns products across ALL org locations with SUM(stock_level).
 */
async function handleAllLocationsQuery(
  reply: any,
  orgId: string,
  page: number,
  limit: number,
  offset: number,
  sortBy: SortField,
  sortDir: "asc" | "desc",
  q: Record<string, string | undefined>,
) {
  // Build filter fragments for raw SQL
  const searchFilter = q.search && q.search.length >= 2
    ? sql`AND (p.name ILIKE ${"%" + q.search + "%"} OR cat.name ILIKE ${"%" + q.search + "%"})`
    : sql``;

  const familyFilter = q.familyId
    ? q.familyId === "__none__" ? sql`AND p.family_id IS NULL` : sql`AND p.family_id = ${q.familyId}::uuid`
    : sql``;

  const categoryFilter = q.category
    ? sql`AND p.category = ${q.category}`
    : sql``;

  const subCategoryFilter = q.subCategoryId
    ? q.subCategoryId === "__none__" ? sql`AND p.category_id IS NULL` : sql`AND p.category_id = ${q.subCategoryId}::uuid`
    : sql``;

  const subcategoryFilter = q.subcategoryId
    ? q.subcategoryId === "__none__" ? sql`AND p.subcategory_id IS NULL` : sql`AND p.subcategory_id = ${q.subcategoryId}::uuid`
    : sql``;

  const brandFilter = q.brandId
    ? q.brandId === "__none__" ? sql`AND p.brand_id IS NULL` : sql`AND p.brand_id = ${q.brandId}::uuid`
    : sql``;

  const oemFilter = q.oemNumber
    ? sql`AND (p.oem_number ILIKE ${"%" + q.oemNumber + "%"} OR p.name ILIKE ${"%" + q.oemNumber + "%"} OR p.sku ILIKE ${"%" + q.oemNumber + "%"} OR p.barcode ILIKE ${"%" + q.oemNumber + "%"})`
    : sql``;

  const vehicleFilter = (() => {
    if (q.vehicleMake === "__none__") {
      return sql`AND NOT EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = p.id)`;
    }
    const vcConds: SQL[] = [sql`vc.product_id = p.id`];
    if (q.vehicleMake) vcConds.push(sql`vc.make = ${q.vehicleMake}`);
    if (q.vehicleModel) vcConds.push(sql`vc.model ILIKE ${"%" + q.vehicleModel + "%"}`);
    if (q.vehicleYear) {
      const year = parseInt(q.vehicleYear, 10);
      if (!isNaN(year)) vcConds.push(sql`(vc.year_start IS NULL OR vc.year_start <= ${year}) AND (vc.year_end IS NULL OR vc.year_end >= ${year})`);
    }
    if (q.vehicleEngine) vcConds.push(sql`vc.engine ILIKE ${"%" + q.vehicleEngine + "%"}`);
    if (vcConds.length <= 1) return sql``; // only product_id condition = no vehicle filters
    return sql`AND EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE ${sql.join(vcConds, sql` AND `)})`;
  })();

  const includeInactive = q.includeInactive === "true";
  const activeFilter = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const parentOnlyFilter = q.parentOnly === "true" ? sql`AND p.parent_product_id IS NULL` : sql``;
  const parentFilter = q.parentProductId ? sql`AND p.parent_product_id = ${q.parentProductId}::uuid` : sql``;

  // Stock status filter operates on the aggregated sum
  const stockHaving = q.stockStatus === "out"
    ? sql`HAVING COALESCE(SUM(i.stock_level), 0) = 0`
    : q.stockStatus === "low"
      ? sql`HAVING COALESCE(SUM(i.stock_level), 0) > 0 AND COALESCE(SUM(i.stock_level), 0) <= MAX(i.reorder_point)`
      : sql``;

  // Sort expression (refers to CTE output columns, not table-qualified)
  const FLAT_SORT_MAP: Record<string, ReturnType<typeof sql>> = {
    stockLevel: sql`stock_level`,
    unitPrice: sql`unit_price`,
    costPrice: sql`cost_price`,
    category: sql`category`,
    sku: sql`sku`,
    categoryName: sql`sub_category_name`,
    brandName: sql`brand_name`,
    margin: sql`CASE WHEN CAST(unit_price AS numeric) > 0 THEN (CAST(unit_price AS numeric) - CAST(cost_price AS numeric)) / CAST(unit_price AS numeric) * 100 ELSE 0 END`,
  };
  const sortExpr = FLAT_SORT_MAP[sortBy] ?? sql`name`;
  const dirExpr = sortDir === "desc" ? sql`DESC` : sql`ASC`;

  // Vehicle model subselect
  const vehicleModelExpr = q.vehicleMake && q.vehicleMake !== "__none__"
    ? sql`(SELECT string_agg(DISTINCT vc.model, ', ' ORDER BY vc.model) FROM vehicle_compatibility vc WHERE vc.product_id = p.id AND vc.make = ${q.vehicleMake})`
    : sql`NULL`;

  const result = await db.execute(sql`
    WITH agg AS (
      SELECT
        p.id, p.name, p.sku, p.mnemonic_sku, p.category::text,
        p.unit_price::text, p.cost_price::text, p.barcode, p.oem_number,
        p.is_variable_price,
        GREATEST(COALESCE(SUM(i.stock_level), 0), 0)::int AS stock_level,
        COALESCE(MAX(i.reorder_point), 0)::int AS reorder_point,
        p.family_id, pf.name AS family_name,
        p.category_id AS sub_category_id, cat.name AS sub_category_name,
        p.subcategory_id, psub.name AS subcategory_name,
        p.brand_id, b.name AS brand_name,
        p.parent_product_id, p.is_parent,
        ${vehicleModelExpr} AS vehicle_model
      FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
          AND EXISTS (SELECT 1 FROM locations loc WHERE loc.id = i.location_id AND loc.is_active = true)
        LEFT JOIN product_families pf ON p.family_id = pf.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
        LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${activeFilter}
        ${parentOnlyFilter}
        ${parentFilter}
        ${searchFilter}
        ${familyFilter}
        ${categoryFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
        ${oemFilter}
        ${vehicleFilter}
      GROUP BY p.id, p.name, p.sku, p.mnemonic_sku, p.category,
               p.unit_price, p.cost_price, p.barcode, p.oem_number, p.is_variable_price,
               p.family_id, pf.name, p.category_id, cat.name,
               p.subcategory_id, psub.name, p.brand_id, b.name,
               p.parent_product_id, p.is_parent
      ${stockHaving}
    )
    SELECT *, count(*) OVER() AS _total_count
    FROM agg
    ORDER BY ${sortExpr} ${dirExpr}, name ASC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = result as any[];
  const totalCount = rows.length > 0 ? Number(rows[0]._total_count) : 0;

  const data = rows.map(({ _total_count, ...row }) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    mnemonicSku: row.mnemonic_sku,
    category: row.category,
    unitPrice: row.unit_price,
    costPrice: row.cost_price,
    barcode: row.barcode,
    oemNumber: row.oem_number,
    isVariablePrice: row.is_variable_price,
    stockLevel: row.stock_level,
    reorderPoint: row.reorder_point,
    familyId: row.family_id,
    familyName: row.family_name,
    subCategoryId: row.sub_category_id,
    subCategoryName: row.sub_category_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    parentProductId: row.parent_product_id,
    isParent: row.is_parent,
    vehicleModel: row.vehicle_model,
  }));

  return reply.send({
    data,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    hasMore: page * limit < totalCount,
  });
}
