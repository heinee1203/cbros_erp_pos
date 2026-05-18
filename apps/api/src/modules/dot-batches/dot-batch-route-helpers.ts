export type DotBatchListQuery = {
  productId?: string;
  locationId?: string;
  inStock?: string;
  limit?: string;
  cursor?: string;
};

export type DotBatchSummaryQuery = {
  productId?: string;
};

export type DotBatchEntryQuery = {
  locationId?: string;
};

export type DotBatchEntryParams = {
  productId: string;
};

export type DotBatchDeleteParams = {
  id: string;
};

export type DotBatchEntryBody = {
  productId: string;
  locationId: string;
  dotCode: string;
  quantity?: number;
};

export function parseDotBatchListOptions(query: DotBatchListQuery) {
  return {
    productId: query.productId,
    locationId: query.locationId,
    inStock: query.inStock === "true",
    limit: query.limit ? parseInt(query.limit, 10) : 50,
    cursor: query.cursor,
  };
}
