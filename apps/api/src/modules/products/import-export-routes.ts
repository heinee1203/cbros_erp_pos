import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { brands, categories, inventory, locations, productFamilies, productOptionTypes, productOptionValues, productSubcategories, productVariantOptions, products, suppliers } from "@apex/database/schema";
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { bulkImportSchema, generateEan13 } from "@apex/types";

import { MANAGE_ROLES } from "./permissions";
import { generateUniqueMnemonicSku } from "./sku";
import { SORT_COLUMNS } from "./sorting";
import {
  buildProductExportInventoryMap,
  buildProductExportOptionMap,
  buildProductExportRows,
  parseProductExportQuery,
  type ProductExportInventory,
} from "./import-export-helpers";

export function registerProductImportExportRoutes(app: FastifyInstance) {
  // --------------------------------------------------------------------
  // GET /products/export - Denormalized export with per-location inventory
  //
  // Query params:
  //   search, familyId, categoryId, subcategoryId, brandId, sortBy, sortDir
  //   includeCost=true   -> include costPrice in response (default: stripped)
  //   includeStock=true  -> include per-location inventory (default: stripped)
  //   includeNonItems=true -> include Non-Items family (default: excluded)
  //   active=true|false  -> filter by active+not-discontinued status
  // --------------------------------------------------------------------
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const {
      search,
      familyId,
      categoryId,
      subcategoryId,
      brandId,
      sortBy,
      sortDir,
      includeCost,
      includeStock,
      includeNonItems,
      activeFilter,
    } = parseProductExportQuery(request.query as Record<string, string | undefined>);

    // Build WHERE conditions
    const conditions: SQL[] = [eq(products.orgId, orgId)];

    // Active filter: by default include all; when active=true, only active+not-discontinued
    if (activeFilter === "true") {
      conditions.push(eq(products.isActive, true));
      conditions.push(eq(products.discontinued, false));
    } else if (activeFilter === "false") {
      conditions.push(
        sql`(${products.isActive} = false OR ${products.discontinued} = true)`,
      );
    }

    if (search && search.length >= 2) {
      conditions.push(ilike(products.name, `%${search}%`));
    }
    if (familyId) conditions.push(eq(products.familyId, familyId));
    if (categoryId) conditions.push(eq(products.categoryId, categoryId));
    if (subcategoryId) conditions.push(eq(products.subcategoryId, subcategoryId));
    if (brandId) conditions.push(eq(products.brandId, brandId));

    // Exclude Non-Items family by default
    if (!includeNonItems) {
      conditions.push(
        sql`(${productFamilies.name} IS NULL OR ${productFamilies.name} != 'Non-Items')`,
      );
    }

    // Fetch all active locations for the org
    const orgLocations = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name));

    // Fetch products with taxonomy + supplier joins
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
        isActive: products.isActive,
        familyName: productFamilies.name,
        categoryName: categories.name,
        subcategoryName: productSubcategories.name,
        brandName: brands.name,
        supplierName: suppliers.name,
        unitsPerCase: products.unitsPerCase,
        packagingUnit: products.packagingUnit,
        sellingUnit: products.sellingUnit,
        purchaseUnit: products.purchaseUnit,
        conversionFactor: products.conversionFactor,
        isSerialized: products.isSerialized,
        isTire: products.isTire,
        specialOrder: products.specialOrder,
        discontinued: products.discontinued,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productSubcategories, eq(products.subcategoryId, productSubcategories.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(suppliers, eq(products.primarySupplierId, suppliers.id))
      .where(and(...conditions))
      .orderBy(sortDir === "desc" ? desc(SORT_COLUMNS[sortBy] ?? products.name) : asc(SORT_COLUMNS[sortBy] ?? products.name))
      .limit(50000);

    const productIds = productRows.map((p) => p.id);

    // -- Option types query: resolve variant -> option type name + value --
    let optionMap = new Map<string, Array<{ typeName: string; value: string }>>();
    const parentIds = productRows.filter((p) => p.isParent).map((p) => p.id);

    if (parentIds.length > 0) {
      const optionRows = await db
        .select({
          parentProductId: productOptionTypes.productId,
          typeName: productOptionTypes.name,
          typeSort: productOptionTypes.sortOrder,
          value: productOptionValues.value,
          variantProductId: productVariantOptions.productId,
        })
        .from(productOptionTypes)
        .innerJoin(productOptionValues, eq(productOptionValues.optionTypeId, productOptionTypes.id))
        .innerJoin(productVariantOptions, eq(productVariantOptions.optionValueId, productOptionValues.id))
        .where(inArray(productOptionTypes.productId, parentIds))
        .orderBy(asc(productOptionTypes.sortOrder), asc(productOptionValues.sortOrder));

      optionMap = buildProductExportOptionMap(optionRows);
    }

    // -- Inventory (only when requested) --
    let invMap = new Map<string, Map<string, ProductExportInventory>>();

    if (includeStock && productIds.length > 0) {
      const allInventory = await db
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

      invMap = buildProductExportInventoryMap(allInventory);
    }

    // -- Enrich products --
    const enriched = buildProductExportRows({
      productRows,
      locations: orgLocations,
      optionMap,
      inventoryMap: invMap,
      includeStock,
      includeCost,
    });

    return reply.send({ data: enriched, locations: orgLocations });
  });

  // -- Bulk Import ------------------------------------------------------
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

    // 1. Load all existing SKUs for this org -> Map<lowercase_sku, productId>
    const existingProducts = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(eq(products.orgId, orgId));
    const skuMap = new Map<string, string>();
    for (const p of existingProducts) {
      skuMap.set(p.sku.toLowerCase(), p.id);
    }

    // 2. Load taxonomy lookups -> Map<lowercase_name, id>
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
              // -- UPDATE existing product --
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
              // -- CREATE new product --
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
                  reorderPoint: 5,
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

}
