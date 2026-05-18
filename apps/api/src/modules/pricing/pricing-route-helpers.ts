import { z } from "zod";

export const priceHistoryQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  field: z.enum(["SELL_PRICE", "COST_PRICE"]).optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  batchId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const productPriceHistoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const marginAlertsQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(100).default(15),
  inStockOnly: z.enum(["true", "false"]).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const priceRowsSchema = z
  .array(
    z.object({
      sku: z.string().min(1),
      newCost: z.string().optional(),
      newSell: z.string().optional(),
    }),
  )
  .min(1)
  .max(10_000);

export const bulkPreviewSchema = z.object({
  rows: priceRowsSchema,
});

export const bulkApplySchema = z.object({
  previewToken: z.string().min(1),
  overrides: z
    .record(
      z.object({
        newCost: z.string().optional(),
        newSell: z.string().optional(),
      }),
    )
    .optional(),
  autoAdjustSell: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export const singlePriceUpdateSchema = z
  .object({
    newCost: z.string().optional(),
    newSell: z.string().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((value) => value.newCost || value.newSell, {
    message: "At least one of newCost or newSell is required",
  });

export function buildPriceHistoryFilters(
  query: z.infer<typeof priceHistoryQuerySchema>,
) {
  return {
    productId: query.productId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    field: query.field,
    source: query.source,
    search: query.search,
    batchId: query.batchId,
    cursor: query.cursor,
    limit: query.limit,
  };
}

export function isMarginAlertInStockOnly(
  query: z.infer<typeof marginAlertsQuerySchema>,
) {
  return query.inStockOnly !== "false";
}

export function isPricingProductNotFoundError(err: unknown) {
  return (err as { message?: string }).message === "Product not found";
}
