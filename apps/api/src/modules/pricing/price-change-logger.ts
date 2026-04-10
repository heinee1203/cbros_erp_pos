import { db } from "@apex/database";
import { priceChanges } from "@apex/database/schema";

export type PriceChangeSource = "manual" | "bulk_update" | "import" | "margin_alert" | "dead_stock_clearance" | "po_received";

/**
 * Log a price change. Fire-and-forget — never throws.
 */
export function logPriceChange(params: {
  orgId: string;
  productId: string;
  field: "SELL_PRICE" | "COST_PRICE";
  oldValue: number;
  newValue: number;
  reason?: string;
  source?: PriceChangeSource;
  changedBy?: string;
  batchId?: string;
}): void {
  // Don't log if no actual change
  if (Math.abs(params.oldValue - params.newValue) < 0.005) return;

  db.insert(priceChanges)
    .values({
      orgId: params.orgId,
      productId: params.productId,
      field: params.field,
      oldValue: String(params.oldValue),
      newValue: String(params.newValue),
      changeReason: params.reason ?? null,
      source: params.source ?? "manual",
      changedBy: params.changedBy ?? null,
      batchId: params.batchId ?? null,
    })
    .execute()
    .catch((err) => {
      console.error("[price-change-logger] Failed:", err.message);
    });
}
