export interface BackorderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  supplierId: string;
  supplierName: string;
  qtyNeeded: number;
  quantityOrdered: number | null;
  quantityReceived: number | null;
  quantityOutstanding: number | null;
  unitCost: string | null;
  sourcePo: string | null;
  sourcePONumber: string | null;
  originalPoLineId: string | null;
  daysPending: number;
  reason: string;
  priority: "HIGH" | "NORMAL" | "LOW";
  neededBy: string | null;
  waitUntil: string | null;
  isOverdue: boolean;
  status: "PENDING" | "INCLUDED_IN_PO" | "FULFILLED" | "CANCELLED";
  targetPoId: string | null;
  targetPoNumber: string | null;
  newSupplierId: string | null;
  newSupplierName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  items: BackorderItem[];
  totalQty: number;
  oldestDays: number;
}

export interface BackorderSummary {
  pendingTotal: number;
  suppliersWithPending: number;
  oldestPendingDays: number;
  neededThisWeek: number;
  overdueCount: number;
}

export interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}
