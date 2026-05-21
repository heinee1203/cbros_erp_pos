export interface BulkPreviewRow {
  sku: string;
  name: string;
  currentCost: number;
  newCost: number;
  currentSell: number;
  newSell: number;
  currentMargin: number;
  projectedMargin: number;
  marginAlert: boolean;
}

export interface BulkPreviewResponse {
  rows: BulkPreviewRow[];
  errors: { row: number; message: string }[];
}

export interface BulkApplyResponse {
  costsUpdated: number;
  pricesUpdated: number;
}

export interface MarginAlertRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  brandName: string | null;
  categoryName: string | null;
  costPrice: number;
  sellPrice: number;
  marginPct: number;
  stock: number;
}

export interface MarginAlertPage {
  data: MarginAlertRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DeadStockRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  costPrice: string | number;
  avgSellingPrice: string | number;
  daysSinceLastSale: number | null;
  lastSaleDate: string | null;
  totalStock: number;
  velocityClass: string;
  sold12m: number;
}

export interface DeadStockPage {
  data: DeadStockRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PriceHistoryRow {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  field: string;
  oldValue: string;
  newValue: string;
  changeReason: string | null;
  source: string;
  batchId: string | null;
  changedBy: string | null;
  changedByName: string | null;
  changedAt: string;
  pctChange: number | null;
}

export interface PriceHistoryPage {
  data: PriceHistoryRow[];
  nextCursor: string | null;
  hasMore: boolean;
}
