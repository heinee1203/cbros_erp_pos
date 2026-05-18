import { db } from "@apex/database";
import { purchaseOrders, suppliers } from "@apex/database/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export async function listSuppliers(orgId: string) {
  const results = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contactEmail: suppliers.contactEmail,
      contactPhone: suppliers.contactPhone,
      address: suppliers.address,
      mnemonicCode: suppliers.mnemonicCode,
      isActive: suppliers.isActive,
      paymentTermsDays: suppliers.paymentTermsDays,
      avgLeadTimeDays: suppliers.avgLeadTimeDays,
    })
    .from(suppliers)
    .where(eq(suppliers.orgId, orgId))
    .orderBy(asc(suppliers.name));

  return results;
}

export async function createSupplier(
  orgId: string,
  input: {
    name: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    mnemonicCode?: string;
    avgLeadTimeDays?: number;
    paymentTermsDays?: number;
    isActive?: boolean;
  },
) {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      orgId,
      name: input.name,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      mnemonicCode: input.mnemonicCode ?? null,
      avgLeadTimeDays: input.avgLeadTimeDays ?? 7,
      paymentTermsDays: input.paymentTermsDays ?? 30,
      isActive: input.isActive ?? true,
    })
    .returning();

  return supplier;
}

export async function updateSupplier(
  orgId: string,
  supplierId: string,
  input: {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    mnemonicCode?: string | null;
    avgLeadTimeDays?: number;
    paymentTermsDays?: number;
    isActive?: boolean;
  },
) {
  const setFields: Record<string, any> = {};
  if (input.name !== undefined) setFields.name = input.name;
  if (input.contactEmail !== undefined)
    setFields.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined)
    setFields.contactPhone = input.contactPhone;
  if (input.address !== undefined) setFields.address = input.address;
  if (input.mnemonicCode !== undefined)
    setFields.mnemonicCode = input.mnemonicCode;
  if (input.avgLeadTimeDays !== undefined)
    setFields.avgLeadTimeDays = input.avgLeadTimeDays;
  if (input.paymentTermsDays !== undefined)
    setFields.paymentTermsDays = input.paymentTermsDays;
  if (input.isActive !== undefined) setFields.isActive = input.isActive;

  if (Object.keys(setFields).length === 0) {
    throw new Error("No fields to update");
  }

  const [updated] = await db
    .update(suppliers)
    .set(setFields)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning();

  if (!updated) {
    throw new Error("Supplier not found");
  }

  return updated;
}

export async function deleteSupplier(orgId: string, supplierId: string) {
  const [po] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.supplierId, supplierId),
        eq(purchaseOrders.orgId, orgId),
      ),
    )
    .limit(1);

  if (po) {
    throw new Error("Cannot delete supplier with existing purchase orders");
  }

  const [deleted] = await db
    .delete(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.orgId, orgId)))
    .returning({ id: suppliers.id });

  if (!deleted) {
    throw new Error("Supplier not found");
  }

  return deleted;
}

export async function mergeSuppliers(
  orgId: string,
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) {
    throw new Error("Source and target supplier must be different");
  }

  return await db.transaction(async (tx) => {
    const [source] = await tx
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.id, sourceId), eq(suppliers.orgId, orgId)))
      .limit(1);

    if (!source) throw new Error("Source supplier not found");

    const [target] = await tx
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.id, targetId), eq(suppliers.orgId, orgId)))
      .limit(1);

    if (!target) throw new Error("Target supplier not found");

    const counts: Record<string, number> = {};

    const deletedDupPS = await tx.execute(
      sql`DELETE FROM product_suppliers
          WHERE org_id = ${orgId}
            AND supplier_id = ${sourceId}
            AND product_id IN (
              SELECT product_id FROM product_suppliers
              WHERE org_id = ${orgId} AND supplier_id = ${targetId}
            )`,
    );
    counts.productSuppliersDeduplicated = (deletedDupPS as any).count ?? 0;

    const updatedPS = await tx.execute(
      sql`UPDATE product_suppliers
          SET supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.productSuppliersRepointed = (updatedPS as any).count ?? 0;

    const updatedProducts = await tx.execute(
      sql`UPDATE products
          SET primary_supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND primary_supplier_id = ${sourceId}`,
    );
    counts.products = (updatedProducts as any).count ?? 0;

    const updatedPOs = await tx.execute(
      sql`UPDATE purchase_orders
          SET supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.purchaseOrders = (updatedPOs as any).count ?? 0;

    const conflictingInvoices = await tx.execute(
      sql`SELECT si.invoice_number FROM supplier_invoices si
          WHERE si.org_id = ${orgId} AND si.supplier_id = ${sourceId}
            AND si.invoice_number IN (
              SELECT invoice_number FROM supplier_invoices
              WHERE org_id = ${orgId} AND supplier_id = ${targetId}
            )`,
    );
    if ((conflictingInvoices as any[]).length > 0) {
      const conflicting = (conflictingInvoices as any[])
        .map((r: any) => r.invoice_number)
        .join(", ");
      throw new Error(
        `Cannot merge: duplicate invoice numbers found on both suppliers: ${conflicting}. Resolve these manually first.`,
      );
    }

    const updatedInvoices = await tx.execute(
      sql`UPDATE supplier_invoices
          SET supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.supplierInvoices = (updatedInvoices as any).count ?? 0;

    const updatedCVs = await tx.execute(
      sql`UPDATE check_vouchers
          SET supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.checkVouchers = (updatedCVs as any).count ?? 0;

    const updatedReturns = await tx.execute(
      sql`UPDATE supplier_returns
          SET supplier_id = ${targetId}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.supplierReturns = (updatedReturns as any).count ?? 0;

    const updatedSOAs = await tx.execute(
      sql`UPDATE supplier_soa_records
          SET supplier_id = ${targetId}
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.supplierSoaRecords = (updatedSOAs as any).count ?? 0;

    const updatedBO1 = await tx.execute(
      sql`UPDATE backorders
          SET supplier_id = ${targetId}, supplier_name = ${target.name}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.backordersSupplier = (updatedBO1 as any).count ?? 0;

    const updatedBO2 = await tx.execute(
      sql`UPDATE backorders
          SET new_supplier_id = ${targetId}, new_supplier_name = ${target.name}, updated_at = NOW()
          WHERE org_id = ${orgId} AND new_supplier_id = ${sourceId}`,
    );
    counts.backordersNewSupplier = (updatedBO2 as any).count ?? 0;

    const updatedDOT = await tx.execute(
      sql`UPDATE dot_batches
          SET supplier_id = ${targetId}, supplier_name = ${target.name}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.dotBatches = (updatedDOT as any).count ?? 0;

    const updatedReorder = await tx.execute(
      sql`UPDATE reorder_suggestions
          SET supplier_id = ${targetId}, supplier_name = ${target.name}, updated_at = NOW()
          WHERE org_id = ${orgId} AND supplier_id = ${sourceId}`,
    );
    counts.reorderSuggestions = (updatedReorder as any).count ?? 0;

    const updatedSM = await tx.execute(
      sql`UPDATE stock_metrics
          SET last_po_supplier_name = ${target.name}
          WHERE org_id = ${orgId} AND last_po_supplier_name = ${source.name}`,
    );
    counts.stockMetrics = (updatedSM as any).count ?? 0;

    await tx.execute(
      sql`DELETE FROM suppliers WHERE id = ${sourceId} AND org_id = ${orgId}`,
    );

    return {
      mergedInto: { id: target.id, name: target.name },
      removed: { id: source.id, name: source.name },
      counts,
    };
  });
}
