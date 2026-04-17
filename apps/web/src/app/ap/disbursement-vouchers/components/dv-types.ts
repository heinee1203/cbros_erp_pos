export interface SOARef {
  soaId: string;
  soaNumber: string;
  allocatedAmount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface DVRecord {
  id: string;
  dvNumber: string;
  supplierId: string;
  supplierName: string;
  soaId: string | null;
  soaNumber: string;
  soaNumbers: string[];
  amount: number;
  paymentMethod: string;
  checkNumber: string | null;
  paymentDate: string;
  status: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface DVDetail extends DVRecord {
  grossAmount: number;
  totalDeductions: number;
  totalCharges: number;
  netAmount: number;
  remarks: string | null;
  printedAt: string | null;
  confirmedAt: string | null;
  soaDateFrom: string | null;
  soaDateTo: string | null;
  soaRefs: SOARef[];
  payments: DVPayment[];
  deductions: DVDeduction[];
  additionalCharges: DVAdditionalCharge[];
}

export interface DVPayment {
  id: string;
  paymentMethod: string;
  amount: number;
  referenceNumber: string | null;
  bankName: string | null;
  transactionDate: string | null;
  platform: string | null;
  receivedBy: string | null;
}

export interface DVDeduction {
  id: string;
  deductionType: string;
  description: string;
  referenceNumber: string | null;
  amount: number;
}

export interface DVAdditionalCharge {
  id: string;
  chargeType: string;
  description: string;
  referenceNumber: string | null;
  amount: number;
}

export interface Supplier {
  id: string;
  name: string;
  isActive: boolean;
}

export type SortField = "dvNumber" | "supplierName" | "paymentDate" | "amount" | "status";
export type SortDir = "asc" | "desc";

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PRINTED: "bg-blue-100 text-blue-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  VOIDED: "bg-red-100 text-red-700",
};

export const METHOD_LABELS: Record<string, string> = {
  CHECK: "Check",
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  ONLINE: "Online",
};
