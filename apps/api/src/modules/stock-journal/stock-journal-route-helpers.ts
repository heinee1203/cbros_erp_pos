import { UserRole } from "@apex/types";

export type StockJournalQuery = Record<string, string | undefined>;

export type StockJournalDirection = "IN" | "OUT";

export const STOCK_JOURNAL_CROSS_LOCATION_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
];

export const STOCK_JOURNAL_REFERENCE_TYPES = [
  "SALE",
  "RECEIVING",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "RETURN",
  "STOCKTAKE",
  "VOID",
  "JOB_CARD_ISSUE",
  "JOB_CARD_RETURN",
  "OPENING_BALANCE",
];

export const STOCK_JOURNAL_REASON_CODES = [
  "COUNT_GAIN",
  "FOUND_STOCK",
  "OPENING_BALANCE",
  "COUNT_LOSS",
  "DAMAGE_IN_TRANSIT",
  "DAMAGE_WAREHOUSE",
  "DAMAGE_SHOWROOM",
  "WARRANTY_WRITE_OFF",
  "SHRINKAGE_MISSING",
  "OBSOLETE_WRITE_OFF",
  "TRANSFER_SHORTAGE_CONFIRMED",
  "DATA_CORRECTION",
];

export function canQueryStockJournalAcrossLocations(role: string) {
  return (STOCK_JOURNAL_CROSS_LOCATION_ROLES as readonly string[]).includes(
    role,
  );
}

export function getStockJournalValidationError(query: StockJournalQuery) {
  if (
    query.referenceType &&
    !STOCK_JOURNAL_REFERENCE_TYPES.includes(query.referenceType)
  ) {
    return `Invalid referenceType: ${query.referenceType}`;
  }

  if (query.direction && query.direction !== "IN" && query.direction !== "OUT") {
    return `Invalid direction: ${query.direction}`;
  }

  if (
    query.reasonCode &&
    !STOCK_JOURNAL_REASON_CODES.includes(query.reasonCode)
  ) {
    return `Invalid reasonCode: ${query.reasonCode}`;
  }

  return null;
}

export function shouldQueryAllStockJournalLocations(
  query: StockJournalQuery,
  defaultLocationId: string | null | undefined,
) {
  return query.allLocations === "true" || !defaultLocationId;
}

export function shouldIncludeHistoricalProductJournalEntries(
  productId: string | undefined,
  referenceType: string | undefined,
): productId is string {
  return (
    !!productId &&
    (!referenceType || referenceType === "SALE" || referenceType === "RETURN")
  );
}

export function resolveHistoricalJournalLocationId(
  allLocations: boolean,
  locationId: string | undefined,
  defaultLocationId: string | null | undefined,
) {
  return allLocations ? undefined : locationId || defaultLocationId || undefined;
}

export type StockJournalPageLike<T extends { effectiveAt: Date | string }> = {
  data: T[];
  hasMore: boolean;
};

export function mergeHistoricalStockJournalEntries<
  T extends { effectiveAt: Date | string },
>(
  result: StockJournalPageLike<T>,
  historical: StockJournalPageLike<T>,
  limit: number | undefined,
) {
  if (historical.data.length === 0) {
    return;
  }

  result.data = [...result.data, ...historical.data]
    .sort(
      (a, b) =>
        new Date(b.effectiveAt).getTime() -
        new Date(a.effectiveAt).getTime(),
    )
    .slice(0, limit || 50);
  result.hasMore = result.hasMore || historical.hasMore;
}
