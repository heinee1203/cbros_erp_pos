import { db } from "@apex/database";
import { serialNumbers, saleLineSerials, products, locations, brands } from "@apex/database/schema";
import { eq, and, ilike, gt, asc, desc, sql, type SQL } from "drizzle-orm";
import { parseDotCode, getDotAgeStatus, DOT_WARNING_MONTHS, DOT_BLOCK_MONTHS } from "./dot-utils";

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
      dotCode: serialNumbers.dotCode,
      manufactureWeek: serialNumbers.manufactureWeek,
      manufactureYear: serialNumbers.manufactureYear,
      manufactureDate: serialNumbers.manufactureDate,
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
      dotCode: serialNumbers.dotCode,
      manufactureWeek: serialNumbers.manufactureWeek,
      manufactureYear: serialNumbers.manufactureYear,
      manufactureDate: serialNumbers.manufactureDate,
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
      dotCode: serialNumbers.dotCode,
      manufactureDate: serialNumbers.manufactureDate,
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
  serials: (string | { serialNumber: string; dotCode?: string })[],
) {
  let created = 0;
  let duplicates = 0;
  const errors: string[] = [];
  const dotWarnings: string[] = [];

  for (const input of serials) {
    const sn = typeof input === "string" ? input : input.serialNumber;
    const rawDot = typeof input === "string" ? undefined : input.dotCode;

    try {
      const values: any = {
        orgId,
        productId,
        locationId,
        serialNumber: sn,
        status: "IN_STOCK",
        receivedVia: "MANUAL",
        receivedAt: new Date(),
      };

      // Parse and store DOT code if provided
      if (rawDot) {
        const dot = parseDotCode(rawDot);
        if (dot.valid) {
          values.dotCode = rawDot;
          values.manufactureWeek = dot.week;
          values.manufactureYear = dot.year;
          values.manufactureDate = dot.manufactureDate;
          if (dot.warning) {
            dotWarnings.push(`${sn}: ${dot.warning}`);
          }
        } else {
          dotWarnings.push(`${sn}: Invalid DOT code "${rawDot}" — ${dot.warning}`);
        }
      }

      await db.insert(serialNumbers).values(values);
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

  return { created, duplicates, errors, dotWarnings };
}

// ── Tire Age Report ──
export async function getTireAgeReport(
  orgId: string,
  opts: { locationId?: string; status?: string; cursor?: string; limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions: SQL[] = [
    eq(serialNumbers.orgId, orgId),
    eq(serialNumbers.status, "IN_STOCK"),
    sql`${serialNumbers.dotCode} IS NOT NULL`,
  ];

  if (opts.locationId) {
    conditions.push(eq(serialNumbers.locationId, opts.locationId));
  }
  if (opts.cursor) {
    conditions.push(sql`${serialNumbers.id} < ${opts.cursor}`);
  }

  // Age calculation at query time
  const ageMonthsExpr = sql<number>`
    EXTRACT(YEAR FROM AGE(NOW(), ${serialNumbers.manufactureDate}::timestamp)) * 12 +
    EXTRACT(MONTH FROM AGE(NOW(), ${serialNumbers.manufactureDate}::timestamp))
  `.as("age_months");

  const rows = await db
    .select({
      id: serialNumbers.id,
      serialNumber: serialNumbers.serialNumber,
      productId: serialNumbers.productId,
      productName: products.name,
      productSku: products.sku,
      brandName: brands.name,
      locationId: serialNumbers.locationId,
      locationName: locations.name,
      dotCode: serialNumbers.dotCode,
      manufactureWeek: serialNumbers.manufactureWeek,
      manufactureYear: serialNumbers.manufactureYear,
      manufactureDate: serialNumbers.manufactureDate,
      ageMonths: ageMonthsExpr,
    })
    .from(serialNumbers)
    .innerJoin(products, eq(serialNumbers.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(locations, eq(serialNumbers.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(sql`${serialNumbers.manufactureDate} ASC NULLS LAST`)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  // Filter by age status if requested
  const enriched = data.map((r) => {
    const age = Number(r.ageMonths) || 0;
    return { ...r, ageMonths: age, ageStatus: getDotAgeStatus(age) };
  });

  const filtered = opts.status
    ? enriched.filter((r) => r.ageStatus === opts.status)
    : enriched;

  // Summary (count all, not just page)
  const [summaryRow] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      ok: sql<number>`COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), manufacture_date::timestamp)) * 12 + EXTRACT(MONTH FROM AGE(NOW(), manufacture_date::timestamp)) < ${DOT_WARNING_MONTHS})::int`,
      warning: sql<number>`COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), manufacture_date::timestamp)) * 12 + EXTRACT(MONTH FROM AGE(NOW(), manufacture_date::timestamp)) >= ${DOT_WARNING_MONTHS} AND EXTRACT(YEAR FROM AGE(NOW(), manufacture_date::timestamp)) * 12 + EXTRACT(MONTH FROM AGE(NOW(), manufacture_date::timestamp)) < ${DOT_BLOCK_MONTHS})::int`,
      expired: sql<number>`COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM AGE(NOW(), manufacture_date::timestamp)) * 12 + EXTRACT(MONTH FROM AGE(NOW(), manufacture_date::timestamp)) >= ${DOT_BLOCK_MONTHS})::int`,
    })
    .from(serialNumbers)
    .where(and(
      eq(serialNumbers.orgId, orgId),
      eq(serialNumbers.status, "IN_STOCK"),
      sql`${serialNumbers.dotCode} IS NOT NULL`,
      ...(opts.locationId ? [eq(serialNumbers.locationId, opts.locationId)] : []),
    ));

  return {
    summary: {
      total: summaryRow?.total ?? 0,
      ok: summaryRow?.ok ?? 0,
      warning: summaryRow?.warning ?? 0,
      expired: summaryRow?.expired ?? 0,
    },
    data: filtered,
    nextCursor,
    hasMore,
  };
}
