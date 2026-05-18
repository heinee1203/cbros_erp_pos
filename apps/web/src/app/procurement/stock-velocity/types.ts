export type SortField =
  | "productName"
  | "totalStock"
  | "avgDailySales30d"
  | "daysOfStock"
  | "saleDaysCount"
  | "daysSinceLastSale"
  | "totalQtySold";

export type SortDir = "asc" | "desc";

export interface ReorderItem {
  productId: string;
  productName: string;
  parentName?: string | null;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  totalStock: number;
  avgMonth3m: number;
  minMonthsLeft: number | null;
  suggestedQty: number;
  costPrice: string | null;
  avgSellingPrice: string | null;
  lastSaleDate: string | null;
  primarySupplierId: string | null;
  primarySupplierName: string | null;
  specialOrder?: boolean;
  discontinued?: boolean;
  supplierName?: string | null;
  supplierId?: string | null;
}

export interface ReorderResponse {
  data: ReorderItem[];
  total: number;
}

export type CreatedReorderPO = {
  poNo: string;
  supplierName: string;
  itemCount: number;
  action: "created" | "updated";
};

export type ReorderSupplierGroup = {
  supplierId: string | null;
  supplierName: string;
  items: ReorderItem[];
};
