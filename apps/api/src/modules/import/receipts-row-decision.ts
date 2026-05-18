import type { ReceiptImportRowProduct, ReceiptsExecuteOptions } from "./receipts-execution";
import { shouldSkipReceiptRow } from "./receipts-execution";
import {
  normalizeReceiptQuantity,
  resolveReceiptLocation,
  resolveReceiptProduct,
  type ReceiptLocationDetails,
} from "./receipts-history-records";
import { parseReceiptDate, type ReceiptRow } from "./receipt-utils";

export type ReceiptRowWriteDecision =
  | { action: "skip" }
  | { action: "invalid_date"; message: string }
  | { action: "zero_quantity" }
  | {
      action: "write";
      movementDate: Date;
      product: ReceiptImportRowProduct | null;
      location: ReceiptLocationDetails;
      qty: number;
    };

export interface ReceiptRowWriteDecisionContext {
  options: Pick<ReceiptsExecuteOptions, "skipVoided" | "skipCustomerCount" | "skipZeroQty">;
  skuToProduct: Map<string, ReceiptImportRowProduct>;
  locationByCsvName: Map<string, string>;
  locationNameById: Map<string, string>;
}

export function buildReceiptRowWriteDecision(
  row: ReceiptRow,
  context: ReceiptRowWriteDecisionContext,
): ReceiptRowWriteDecision {
  if (shouldSkipReceiptRow(row, context.options).skip) {
    return { action: "skip" };
  }

  const movementDate = parseReceiptDate(row.date);
  if (!movementDate) {
    return { action: "invalid_date", message: `Invalid date: ${row.date}` };
  }

  const product = resolveReceiptProduct(row, context.skuToProduct);
  const location = resolveReceiptLocation(row, context.locationByCsvName, context.locationNameById);
  const qty = normalizeReceiptQuantity(row);
  if (qty === 0) {
    return { action: "zero_quantity" };
  }

  return {
    action: "write",
    movementDate,
    product,
    location,
    qty,
  };
}
