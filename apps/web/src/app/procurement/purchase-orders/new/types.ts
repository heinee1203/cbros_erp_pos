export interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  costPrice: string;
  barcode: string | null;
  categoryName?: string;
  unitsPerCase?: number;
  packagingUnit?: string | null;
  sellingUnit?: string | null;
  purchaseUnit?: string | null;
  conversionFactor?: number | string | null;
  parentName?: string | null;
  parentProductId?: string | null;
}

export interface POLineInput {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  listPrice: string;
  discountChain: string;
  netCost: string;
  isManualCost: boolean;
  unitsPerCase: number;
  packagingUnit: string | null;
  entryUnit: "piece" | "case";
  sellingUnit: string;
  purchaseUnit: string | null;
  conversionFactor: number;
}

export interface CSVPreviewRow {
  sku: string;
  qty: number;
  listPrice: string;
  discount: string;
  match: ProductSearchResult | null;
  status: "matched" | "not_found" | "searching";
}
