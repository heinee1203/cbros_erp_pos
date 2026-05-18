import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { inventory, products, vehicleCompatibility } from "@apex/database/schema";
import { and, eq } from "drizzle-orm";
import { createProductSchema, generateEan13, isValidBarcode } from "@apex/types";

import {
  buildVariantProductName,
  getProductMutationPermissionError,
  hasDuplicateSkus,
  requiresSkuForProduct,
  resolveInventoryTargetLocationIds,
} from "./mutation-helpers";
import {
  buildCreateInventoryInsertValues,
  buildCreateProductInsertValues,
  buildCreateVariantProductInsertValues,
  buildParentPlaceholderSku,
  buildVehicleCompatibilityInsertValues,
  resolveCreateMainInventoryStockLevel,
} from "./create-helpers";
import { generateUniqueMnemonicSku } from "./sku";

export function registerProductCreateRoutes(app: FastifyInstance) {
  /**
   * POST /products
   * Create a new product with inventory rows and optional vehicle compatibility.
   * Restricted to ADMIN / MANAGER.
   */
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    const permissionError = getProductMutationPermissionError("create", userRole);
    if (permissionError) {
      return reply
        .status(403)
        .send({ error: permissionError });
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
      barcode: inputBarcode,
      trackInventory,
      reorderPoint,
      optimalStock,
      leadTimeDays,
      initialStock,
      locationIds,
      vehicleCompatibility: vehicleCompat,
      variants: variantItems,
    } = parsed.data;

    const hasVariants = variantItems && variantItems.length > 0;

    // Parent items (with variants) don't need a SKU — generate a placeholder
    // Regular items still require a real SKU
    if (requiresSkuForProduct(Boolean(hasVariants), sku)) {
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
      if (hasDuplicateSkus(variantSkus)) {
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

    // -- Barcode handling (only for non-parent products) --
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

    // -- Helper: generate unique barcode inside transaction --
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
        ? buildParentPlaceholderSku()
        : sku!;

      // 2. Insert main product (parent if has variants, regular otherwise)
      const [product] = await tx
        .insert(products)
        .values(buildCreateProductInsertValues({
          data: parsed.data,
          orgId,
          sku: parentSku,
          mnemonicSku,
          hasVariants: Boolean(hasVariants),
          barcode: finalBarcode,
        }))
        .returning();

      // 3. Create variant children if this is a parent
      const createdVariants: any[] = [];
      if (hasVariants) {
        for (const v of variantItems) {
          const childName = buildVariantProductName(name, v.suffix);
          const childMnemonic = await generateUniqueMnemonicSku(orgId, childName, tx as any);
          const childBarcode = await generateUniqueBarcode(tx, orgId, v.barcode);

          const [child] = await tx
            .insert(products)
            .values(buildCreateVariantProductInsertValues({
              data: parsed.data,
              orgId,
              parentProductId: product.id,
              variant: v,
              name: childName,
              mnemonicSku: childMnemonic,
              barcode: childBarcode,
            }))
            .returning();

          createdVariants.push(child);

          // Create inventory rows for each variant child
          if (trackInventory) {
            const targetLocations = resolveInventoryTargetLocationIds(locationIds, locationId);
            for (const locId of targetLocations) {
              await tx.insert(inventory).values(buildCreateInventoryInsertValues({
                orgId,
                productId: child.id,
                locationId: locId,
                stockLevel: 0,
                reorderPoint: reorderPoint ?? 5,
                optimalStock: optimalStock ?? 0,
                leadTimeDays: leadTimeDays ?? 7,
              }));
            }
          }
        }
      }

      // 4. Create inventory rows for main product (not for parents — they don't hold stock)
      if (trackInventory && !hasVariants) {
        const targetLocations = resolveInventoryTargetLocationIds(locationIds, locationId);

        for (const locId of targetLocations) {
          await tx.insert(inventory).values(buildCreateInventoryInsertValues({
            orgId,
            productId: product.id,
            locationId: locId,
            stockLevel: resolveCreateMainInventoryStockLevel(locId, locationId, initialStock),
            reorderPoint: reorderPoint ?? 5,
            optimalStock: optimalStock ?? 0,
            leadTimeDays: leadTimeDays ?? 7,
          }));
        }
      }

      // 5. Insert vehicle compatibility records if provided
      if (vehicleCompat && vehicleCompat.length > 0) {
        await tx.insert(vehicleCompatibility).values(
          buildVehicleCompatibilityInsertValues(product.id, vehicleCompat),
        );
      }

      return { ...product, variants: createdVariants };
    });

    return reply.status(201).send(result);
  });
}
