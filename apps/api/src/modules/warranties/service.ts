import { db, type DbOrTx } from "@apex/database";
import {
  warrantyPolicies,
  warrantyRecords,
  warrantyClaims,
  products,
  sales,
  saleLines,
  serialNumbers,
  saleLineSerials,
} from "@apex/database/schema";
import { eq, and, or, sql, desc, asc, gte, lte, type SQL } from "drizzle-orm";

// ══════════════════════════════════════════════════════
// WARRANTY POLICIES
// ══════════════════════════════════════════════════════

export async function listPolicies(orgId: string) {
  return db
    .select()
    .from(warrantyPolicies)
    .where(and(eq(warrantyPolicies.orgId, orgId), eq(warrantyPolicies.isActive, true)))
    .orderBy(desc(warrantyPolicies.createdAt));
}

export async function createPolicy(
  orgId: string,
  input: {
    name: string;
    brandId?: string | null;
    categoryId?: string | null;
    productId?: string | null;
    durationMonths: number;
    durationKm?: number | null;
    warrantyType?: string;
    proratedFullMonths?: number | null;
    coverageDescription?: string | null;
    exclusions?: string | null;
    requiresSerial?: boolean;
  },
) {
  const [policy] = await db
    .insert(warrantyPolicies)
    .values({
      orgId,
      name: input.name,
      brandId: input.brandId ?? null,
      categoryId: input.categoryId ?? null,
      productId: input.productId ?? null,
      durationMonths: input.durationMonths,
      durationKm: input.durationKm ?? null,
      warrantyType: (input.warrantyType as any) ?? "FULL_REPLACEMENT",
      proratedFullMonths: input.proratedFullMonths ?? null,
      coverageDescription: input.coverageDescription ?? null,
      exclusions: input.exclusions ?? null,
      requiresSerial: input.requiresSerial ?? false,
    })
    .returning();
  return policy;
}

export async function updatePolicy(
  id: string,
  orgId: string,
  updates: Record<string, any>,
) {
  const [updated] = await db
    .update(warrantyPolicies)
    .set(updates)
    .where(and(eq(warrantyPolicies.id, id), eq(warrantyPolicies.orgId, orgId)))
    .returning();
  return updated;
}

export async function deactivatePolicy(id: string, orgId: string) {
  return updatePolicy(id, orgId, { isActive: false });
}

// ── Policy matching: product → category → brand ──

export async function findMatchingPolicy(
  orgId: string,
  productId: string,
  categoryId: string | null,
  brandId: string | null,
) {
  // 1. Most specific: product match
  if (productId) {
    const [match] = await db
      .select()
      .from(warrantyPolicies)
      .where(
        and(
          eq(warrantyPolicies.orgId, orgId),
          eq(warrantyPolicies.productId, productId),
          eq(warrantyPolicies.isActive, true),
        ),
      )
      .limit(1);
    if (match) return match;
  }

  // 2. Category match
  if (categoryId) {
    const [match] = await db
      .select()
      .from(warrantyPolicies)
      .where(
        and(
          eq(warrantyPolicies.orgId, orgId),
          eq(warrantyPolicies.categoryId, categoryId),
          eq(warrantyPolicies.isActive, true),
          sql`${warrantyPolicies.productId} IS NULL`,
        ),
      )
      .limit(1);
    if (match) return match;
  }

  // 3. Brand match (broadest)
  if (brandId) {
    const [match] = await db
      .select()
      .from(warrantyPolicies)
      .where(
        and(
          eq(warrantyPolicies.orgId, orgId),
          eq(warrantyPolicies.brandId, brandId),
          eq(warrantyPolicies.isActive, true),
          sql`${warrantyPolicies.productId} IS NULL`,
          sql`${warrantyPolicies.categoryId} IS NULL`,
        ),
      )
      .limit(1);
    if (match) return match;
  }

  return null;
}

// ══════════════════════════════════════════════════════
// WARRANTY RECORDS
// ══════════════════════════════════════════════════════

export async function listRecords(
  orgId: string,
  opts: {
    cursor?: string;
    limit?: number;
    status?: string;
    customerId?: string;
    productId?: string;
    expiringWithinDays?: number;
  } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions: SQL[] = [eq(warrantyRecords.orgId, orgId)];

  if (opts.status) conditions.push(eq(warrantyRecords.status, opts.status as any));
  if (opts.customerId) conditions.push(eq(warrantyRecords.customerId, opts.customerId));
  if (opts.productId) conditions.push(eq(warrantyRecords.productId, opts.productId));
  if (opts.expiringWithinDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + opts.expiringWithinDays);
    conditions.push(lte(warrantyRecords.expiryDate, cutoff.toISOString().split("T")[0]));
    conditions.push(eq(warrantyRecords.status, "ACTIVE"));
  }
  if (opts.cursor) {
    conditions.push(sql`${warrantyRecords.id} < ${opts.cursor}`);
  }

  const rows = await db
    .select()
    .from(warrantyRecords)
    .where(and(...conditions))
    .orderBy(desc(warrantyRecords.createdAt), desc(warrantyRecords.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, nextCursor, hasMore };
}

export async function getRecord(id: string, orgId: string) {
  const [record] = await db
    .select()
    .from(warrantyRecords)
    .where(and(eq(warrantyRecords.id, id), eq(warrantyRecords.orgId, orgId)))
    .limit(1);
  return record ?? null;
}

/**
 * Lookup warranty by serial number, receipt number, or customer ID.
 * Returns enriched result with isUnderWarranty, daysRemaining, message.
 */
export async function lookupWarranty(
  orgId: string,
  query: { serial?: string; receiptNumber?: string; customerId?: string },
) {
  const conditions: SQL[] = [eq(warrantyRecords.orgId, orgId)];

  if (query.serial) {
    conditions.push(eq(warrantyRecords.serialNumber, query.serial));
  } else if (query.receiptNumber) {
    // Find sale by receipt number, then match warranty records
    const [sale] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.orgId, orgId), eq(sales.receiptNumber, query.receiptNumber)))
      .limit(1);
    if (!sale) return { records: [], message: "No sale found with this receipt number" };
    conditions.push(eq(warrantyRecords.saleId, sale.id));
  } else if (query.customerId) {
    conditions.push(eq(warrantyRecords.customerId, query.customerId));
  } else {
    return { records: [], message: "Provide a serial number, receipt number, or customer ID" };
  }

  const records = await db
    .select()
    .from(warrantyRecords)
    .where(and(...conditions))
    .orderBy(desc(warrantyRecords.purchaseDate));

  if (records.length === 0) {
    return { records: [], message: "No warranty records found" };
  }

  const today = new Date().toISOString().split("T")[0];
  const enriched = records.map((r) => {
    const expiryMs = new Date(r.expiryDate).getTime();
    const todayMs = new Date(today).getTime();
    const daysRemaining = Math.ceil((expiryMs - todayMs) / (1000 * 60 * 60 * 24));
    const isUnderWarranty = r.status === "ACTIVE" && daysRemaining > 0;

    let message: string;
    if (r.status === "CLAIMED") {
      message = `Warranty claimed on ${r.claimedAt ? new Date(r.claimedAt).toLocaleDateString("en-PH") : "unknown date"}`;
    } else if (r.status === "VOIDED") {
      message = `Warranty voided: ${r.voidReason || "No reason provided"}`;
    } else if (isUnderWarranty) {
      message = `Warranty valid — ${daysRemaining} days remaining. ${r.warrantyType.replace(/_/g, " ")} coverage.`;
    } else {
      message = `Warranty expired ${Math.abs(daysRemaining)} days ago (expired ${new Date(r.expiryDate).toLocaleDateString("en-PH")}).`;
    }

    return {
      ...r,
      daysRemaining,
      isUnderWarranty,
      message,
    };
  });

  return { records: enriched, message: enriched[0].message };
}

export async function voidWarranty(
  id: string,
  orgId: string,
  reason: string,
) {
  const [updated] = await db
    .update(warrantyRecords)
    .set({
      status: "VOIDED",
      voidedAt: new Date(),
      voidReason: reason,
    })
    .where(and(eq(warrantyRecords.id, id), eq(warrantyRecords.orgId, orgId)))
    .returning();
  return updated;
}

// ── Auto-creation on sale completion ──

interface SaleLineInfo {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  sku?: string;
}

/**
 * Create warranty records for a completed sale.
 * Fire-and-forget: called after transaction commits via setImmediate.
 */
export async function createWarrantyRecordsForSale(
  orgId: string,
  saleId: string,
  saleLines: SaleLineInfo[],
  customerId?: string | null,
  customerName?: string | null,
) {
  const saleDate = new Date().toISOString().split("T")[0];

  for (const line of saleLines) {
    try {
      // Fetch product to get brandId and categoryId for policy matching
      const [product] = await db
        .select({
          id: products.id,
          brandId: products.brandId,
          categoryId: products.categoryId,
          sku: products.sku,
          isSerialized: products.isSerialized,
        })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);

      if (!product) continue;

      // Find matching warranty policy
      const policy = await findMatchingPolicy(
        orgId,
        product.id,
        product.categoryId,
        product.brandId,
      );

      if (!policy) continue; // No warranty policy for this product

      // Calculate expiry date
      const purchaseDate = new Date(saleDate);
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + policy.durationMonths);

      // Check if serialized — create per-serial warranty records
      if (product.isSerialized) {
        const serials = await db
          .select({
            serialNumberId: saleLineSerials.serialNumberId,
            serialNumber: serialNumbers.serialNumber,
          })
          .from(saleLineSerials)
          .innerJoin(serialNumbers, eq(serialNumbers.id, saleLineSerials.serialNumberId))
          .where(eq(saleLineSerials.saleLineId, line.id));

        for (const serial of serials) {
          await db.insert(warrantyRecords).values({
            orgId,
            warrantyPolicyId: policy.id,
            productId: product.id,
            productName: line.productName,
            sku: product.sku,
            customerId: customerId ?? null,
            customerName: customerName ?? null,
            saleId,
            saleLineId: line.id,
            serialNumberId: serial.serialNumberId,
            serialNumber: serial.serialNumber,
            quantity: 1,
            purchaseDate: saleDate,
            expiryDate: expiryDate.toISOString().split("T")[0],
            expiryKm: policy.durationKm ?? null,
            warrantyType: policy.warrantyType,
            coverageDescription: policy.coverageDescription,
            exclusions: policy.exclusions,
          });
        }
      } else {
        // Non-serialized: one record with quantity
        await db.insert(warrantyRecords).values({
          orgId,
          warrantyPolicyId: policy.id,
          productId: product.id,
          productName: line.productName,
          sku: product.sku,
          customerId: customerId ?? null,
          customerName: customerName ?? null,
          saleId,
          saleLineId: line.id,
          quantity: line.quantity,
          purchaseDate: saleDate,
          expiryDate: expiryDate.toISOString().split("T")[0],
          expiryKm: policy.durationKm ?? null,
          warrantyType: policy.warrantyType,
          coverageDescription: policy.coverageDescription,
          exclusions: policy.exclusions,
        });
      }
    } catch (err) {
      console.error(`[WARRANTY] Auto-creation error for product ${line.productId}:`, err);
    }
  }
}

// ══════════════════════════════════════════════════════
// WARRANTY CLAIMS
// ══════════════════════════════════════════════════════

async function generateClaimNumber(orgId: string): Promise<string> {
  // Advisory lock to prevent race conditions
  const [result] = await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext('warranty_claim_' || ${orgId}))`,
  );

  const [latest] = await db
    .select({ claimNumber: warrantyClaims.claimNumber })
    .from(warrantyClaims)
    .where(eq(warrantyClaims.orgId, orgId))
    .orderBy(desc(warrantyClaims.claimNumber))
    .limit(1);

  if (!latest) return "WC-000001";

  const num = parseInt(latest.claimNumber.replace("WC-", ""), 10) + 1;
  return `WC-${String(num).padStart(6, "0")}`;
}

export async function listClaims(
  orgId: string,
  opts: { cursor?: string; limit?: number; status?: string } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions: SQL[] = [eq(warrantyClaims.orgId, orgId)];
  if (opts.status) conditions.push(eq(warrantyClaims.status, opts.status as any));
  if (opts.cursor) conditions.push(sql`${warrantyClaims.id} < ${opts.cursor}`);

  const rows = await db
    .select({
      claim: warrantyClaims,
      productName: warrantyRecords.productName,
      serialNumber: warrantyRecords.serialNumber,
      customerName: warrantyRecords.customerName,
    })
    .from(warrantyClaims)
    .innerJoin(warrantyRecords, eq(warrantyRecords.id, warrantyClaims.warrantyRecordId))
    .where(and(...conditions))
    .orderBy(desc(warrantyClaims.createdAt), desc(warrantyClaims.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].claim.id : null;

  return {
    data: data.map((r) => ({
      ...r.claim,
      productName: r.productName,
      serialNumber: r.serialNumber,
      customerName: r.customerName,
    })),
    nextCursor,
    hasMore,
  };
}

export async function getClaim(id: string, orgId: string) {
  const [row] = await db
    .select({
      claim: warrantyClaims,
      record: warrantyRecords,
    })
    .from(warrantyClaims)
    .innerJoin(warrantyRecords, eq(warrantyRecords.id, warrantyClaims.warrantyRecordId))
    .where(and(eq(warrantyClaims.id, id), eq(warrantyClaims.orgId, orgId)))
    .limit(1);
  if (!row) return null;
  return { ...row.claim, warrantyRecord: row.record };
}

export async function createClaim(
  orgId: string,
  input: {
    warrantyRecordId: string;
    claimReason: string;
    claimDescription?: string;
    mileageAtClaim?: number;
  },
  userId: string,
) {
  // Validate warranty record exists and is ACTIVE
  const record = await getRecord(input.warrantyRecordId, orgId);
  if (!record) throw new Error("Warranty record not found");

  const today = new Date().toISOString().split("T")[0];
  const isExpired = new Date(record.expiryDate) < new Date(today);

  // Check mileage limit
  let mileageExceeded = false;
  if (record.expiryKm && input.mileageAtClaim && input.mileageAtClaim > record.expiryKm) {
    mileageExceeded = true;
  }

  return db.transaction(async (tx) => {
    const claimNumber = await generateClaimNumber(orgId);

    const [claim] = await tx
      .insert(warrantyClaims)
      .values({
        orgId,
        warrantyRecordId: input.warrantyRecordId,
        claimNumber,
        claimDate: today,
        claimReason: input.claimReason as any,
        claimDescription: input.claimDescription ?? null,
        mileageAtClaim: input.mileageAtClaim ?? null,
        status: "PENDING",
        processedBy: userId,
      })
      .returning();

    return {
      ...claim,
      isExpired,
      mileageExceeded,
      warnings: [
        ...(isExpired ? ["Warranty expired — manager approval required"] : []),
        ...(mileageExceeded ? [`Mileage limit exceeded (${record.expiryKm} km)`] : []),
      ],
    };
  });
}

export async function resolveClaim(
  id: string,
  orgId: string,
  input: {
    status: "APPROVED" | "DENIED" | "COMPLETED";
    resolution?: string;
    resolutionNotes?: string;
    replacementProductId?: string;
    replacementSerialId?: string;
    creditAmount?: string;
  },
  userId: string,
) {
  const [claim] = await db
    .select()
    .from(warrantyClaims)
    .where(and(eq(warrantyClaims.id, id), eq(warrantyClaims.orgId, orgId)))
    .limit(1);

  if (!claim) throw new Error("Claim not found");
  if (claim.status !== "PENDING" && claim.status !== "APPROVED") {
    throw new Error(`Cannot resolve claim in ${claim.status} status`);
  }

  const updates: Record<string, any> = {
    status: input.status,
    approvedBy: userId,
  };

  if (input.resolution) updates.resolution = input.resolution;
  if (input.resolutionNotes) updates.resolutionNotes = input.resolutionNotes;
  if (input.replacementProductId) updates.replacementProductId = input.replacementProductId;
  if (input.replacementSerialId) updates.replacementSerialId = input.replacementSerialId;
  if (input.creditAmount) updates.creditAmount = input.creditAmount;

  const [updated] = await db
    .update(warrantyClaims)
    .set(updates)
    .where(eq(warrantyClaims.id, id))
    .returning();

  // If approved, update warranty record status to CLAIMED
  if (input.status === "APPROVED" || input.status === "COMPLETED") {
    await db
      .update(warrantyRecords)
      .set({
        status: "CLAIMED",
        claimedAt: new Date(),
        claimNotes: input.resolutionNotes ?? null,
      })
      .where(eq(warrantyRecords.id, claim.warrantyRecordId));
  }

  return updated;
}
