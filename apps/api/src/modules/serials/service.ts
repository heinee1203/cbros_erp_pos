import { db } from "@apex/database";
import { serialNumbers, saleLineSerials, products, locations } from "@apex/database/schema";
import { eq, and, ilike, gt, asc, sql, type SQL } from "drizzle-orm";

// ── List serials with filters + cursor pagination ──
export async function listSerials(params: {
  orgId: string;
  productId?: string;
  status?: string;
  locationId?: string;
  search?: string;
  cursor?: string;
  limit: number;
}) {
  const { orgId, productId, status, locationId, search, cursor, limit } = params;

  const conditions: SQL[] = [eq(serialNumbers.orgId, orgId)];

  if (productId) {
    conditions.push(eq(serialNumbers.productId, productId));
  }
  if (status) {
    conditions.push(eq(serialNumbers.status, status as any));
  }
  if (locationId) {
    conditions.push(eq(serialNumbers.locationId, locationId));
  }
  if (search) {
    conditions.push(ilike(serialNumbers.serialNumber, `%${search}%`));
  }
  if (cursor) {
    conditions.push(gt(serialNumbers.id, cursor));
  }

  const rows = await db
    .select({
      id: serialNumbers.id,
      serialNumber: serialNumbers.serialNumber,
      status: serialNumbers.status,
      productId: serialNumbers.productId,
      productName: products.name,
      productSku: products.sku,
      locationId: serialNumbers.locationId,
      locationName: locations.name,
      receivedVia: serialNumbers.receivedVia,
      receivedAt: serialNumbers.receivedAt,
      soldViaSaleId: serialNumbers.soldViaSaleId,
      soldAt: serialNumbers.soldAt,
      notes: serialNumbers.notes,
      createdAt: serialNumbers.createdAt,
      updatedAt: serialNumbers.updatedAt,
    })
    .from(serialNumbers)
    .innerJoin(products, eq(serialNumbers.productId, products.id))
    .leftJoin(locations, eq(serialNumbers.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(asc(serialNumbers.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return { data, nextCursor, hasMore };
}

// ── Lookup a single serial by number ──
export async function lookupSerial(orgId: string, serialNumber: string) {
  const [row] = await db
    .select({
      id: serialNumbers.id,
      serialNumber: serialNumbers.serialNumber,
      status: serialNumbers.status,
      productId: serialNumbers.productId,
      productName: products.name,
      productSku: products.sku,
      locationId: serialNumbers.locationId,
      locationName: locations.name,
      receivedVia: serialNumbers.receivedVia,
      receivedReferenceId: serialNumbers.receivedReferenceId,
      receivedAt: serialNumbers.receivedAt,
      soldViaSaleId: serialNumbers.soldViaSaleId,
      soldViaSaleLineId: serialNumbers.soldViaSaleLineId,
      soldAt: serialNumbers.soldAt,
      soldToCustomerId: serialNumbers.soldToCustomerId,
      returnedAt: serialNumbers.returnedAt,
      returnedViaReturnId: serialNumbers.returnedViaReturnId,
      notes: serialNumbers.notes,
      createdAt: serialNumbers.createdAt,
      updatedAt: serialNumbers.updatedAt,
    })
    .from(serialNumbers)
    .innerJoin(products, eq(serialNumbers.productId, products.id))
    .leftJoin(locations, eq(serialNumbers.locationId, locations.id))
    .where(and(eq(serialNumbers.orgId, orgId), eq(serialNumbers.serialNumber, serialNumber)))
    .limit(1);

  return row ?? null;
}

// ── Get serials by sale ID ──
export async function getSerialsBySale(orgId: string, saleId: string) {
  const rows = await db
    .select({
      id: serialNumbers.id,
      serialNumber: serialNumbers.serialNumber,
      status: serialNumbers.status,
      productId: serialNumbers.productId,
      productName: products.name,
      productSku: products.sku,
      saleLineId: saleLineSerials.saleLineId,
      soldAt: serialNumbers.soldAt,
    })
    .from(saleLineSerials)
    .innerJoin(serialNumbers, eq(saleLineSerials.serialNumberId, serialNumbers.id))
    .innerJoin(products, eq(serialNumbers.productId, products.id))
    .where(and(eq(serialNumbers.orgId, orgId), eq(serialNumbers.soldViaSaleId, saleId)));

  return rows;
}

// ── Bulk register serials (manual entry for existing stock) ──
export async function bulkRegisterSerials(
  orgId: string,
  productId: string,
  locationId: string,
  serials: string[],
) {
  let created = 0;
  let duplicates = 0;
  const errors: string[] = [];

  for (const sn of serials) {
    try {
      await db.insert(serialNumbers).values({
        orgId,
        productId,
        locationId,
        serialNumber: sn,
        status: "IN_STOCK",
        receivedVia: "MANUAL",
        receivedAt: new Date(),
      });
      created++;
    } catch (err: any) {
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("duplicate key")
      ) {
        duplicates++;
      } else {
        errors.push(`${sn}: ${err.message}`);
      }
    }
  }

  return { created, duplicates, errors };
}
