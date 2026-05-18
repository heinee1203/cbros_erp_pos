import { db, type DbOrTx } from "@apex/database";
import {
  locations,
  poLines,
  products,
  purchaseOrders,
  suppliers,
} from "@apex/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { PROCUREMENT_ROLES, type CreatePOInput } from "@apex/types";
import {
  buildPurchaseOrderLineValue,
  type ProductUomSnapshot,
} from "./po-helpers";

async function generatePoNo(tx: DbOrTx, orgId: string): Promise<string> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.orgId, orgId));
  const seq = (result[0]?.count ?? 0) + 1;
  return `PO-${String(seq).padStart(6, "0")}`;
}

function assertProcurementRole(userRole: string) {
  if (!PROCUREMENT_ROLES.includes(userRole as any)) {
    throw new Error(
      "Access denied: requires ADMIN, MANAGER, or WAREHOUSE_STAFF role",
    );
  }
}

export async function createPO(
  input: CreatePOInput,
  orgId: string,
  userId: string,
  userRole: string,
) {
  assertProcurementRole(userRole);

  if (!input.lines || input.lines.length === 0) {
    throw new Error("Purchase Order must have at least one line item");
  }

  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.orgId, orgId)))
      .limit(1);
    if (!supplier) throw new Error("Supplier not found");

    const [destLocation] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.destinationLocationId),
          eq(locations.orgId, orgId),
        ),
      )
      .limit(1);
    if (!destLocation) throw new Error("Destination location not found");
    if (destLocation.type === "TRANSIT_BUFFER") {
      throw new Error("Cannot receive into a TRANSIT_BUFFER location");
    }

    const productUomMap = new Map<string, ProductUomSnapshot>();
    for (const line of input.lines) {
      const [product] = await tx
        .select({
          id: products.id,
          sellingUnit: products.sellingUnit,
          purchaseUnit: products.purchaseUnit,
          conversionFactor: products.conversionFactor,
        })
        .from(products)
        .where(and(eq(products.id, line.productId), eq(products.orgId, orgId)))
        .limit(1);
      if (!product) throw new Error(`Product ${line.productId} not found`);
      productUomMap.set(product.id, {
        sellingUnit: product.sellingUnit,
        purchaseUnit: product.purchaseUnit,
        conversionFactor: product.conversionFactor,
      });
    }

    const poNo = await generatePoNo(tx, orgId);

    const [po] = await tx
      .insert(purchaseOrders)
      .values({
        orgId,
        poNo,
        supplierId: input.supplierId,
        destinationLocationId: input.destinationLocationId,
        status: "DRAFT",
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : null,
        notes: input.notes ?? null,
        createdByUserId: userId,
      })
      .returning();

    const lineValues = input.lines.map((line) =>
      buildPurchaseOrderLineValue({
        line,
        uom: productUomMap.get(line.productId)!,
        purchaseOrderId: po.id,
        orgId,
      }),
    );

    const insertedLines = await tx.insert(poLines).values(lineValues).returning();

    return { po, lines: insertedLines };
  });
}
