export type StockMonitorColumn = {
  key: string;
  label: string;
};

export type VelocityWindow = "30" | "90" | "180" | "365" | "all";

export type SortField =
  | "productName"
  | "totalStock"
  | "avgDailySales30d"
  | "daysOfStock"
  | "stockoutDays90d"
  | "lastSaleDate"
  | "lastPoDate"
  | "status"
  | "brandName"
  | "categoryName";

export type SortDir = "asc" | "desc";
