import type { ReceiptRow } from "./receipt-utils";
import type { LocationMapping } from "./types";

export interface ReceiptsExecuteOptions {
  previewToken: string;
  locationMapping?: Record<string, string>;
  skipVoided?: boolean;
  skipCustomerCount?: boolean;
  skipZeroQty?: boolean;
}

export interface ReceiptImportRowProduct {
  id: string;
  name: string;
}

export interface ReceiptSkipDecision {
  skip: boolean;
  message?: string;
}

export function buildReceiptLocationMap(
  overrides: Record<string, string> | undefined,
  fallbackMapping: LocationMapping[],
): Map<string, string> {
  const locMap = new Map<string, string>();

  if (overrides) {
    for (const [csvName, locId] of Object.entries(overrides)) {
      locMap.set(csvName.toLowerCase(), locId);
    }
  }

  for (const mapping of fallbackMapping) {
    if (mapping.apexLocationId && !locMap.has(mapping.csvName.toLowerCase())) {
      locMap.set(mapping.csvName.toLowerCase(), mapping.apexLocationId);
    }
  }

  return locMap;
}

export function shouldSkipReceiptRow(
  row: Pick<ReceiptRow, "status" | "sku" | "item" | "quantity" | "netSales">,
  options: Pick<ReceiptsExecuteOptions, "skipVoided" | "skipCustomerCount" | "skipZeroQty">,
): ReceiptSkipDecision {
  if (row.status === "Voided" && (options.skipVoided ?? true)) {
    return { skip: true };
  }

  if (
    (row.sku === "CUSTOMER COUNT" || row.item?.includes("CUSTOMER COUNT")) &&
    (options.skipCustomerCount ?? true)
  ) {
    return { skip: true };
  }

  if (row.quantity === 0 && row.netSales === 0 && (options.skipZeroQty ?? true)) {
    return { skip: true };
  }

  return { skip: false };
}
