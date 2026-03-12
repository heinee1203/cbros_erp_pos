/* ─── Category labels & colors ─── */

export const CATEGORY_LABELS: Record<string, string> = {
  TIRES: "Tires",
  LUBRICANTS: "Lubricants",
  HARD_PARTS: "Hard Parts",
  ACCESSORIES: "Accessories",
  LABOR_SERVICES: "Services",
};

export const CATEGORY_COLORS: Record<string, string> = {
  TIRES: "bg-slate-100 text-slate-700",
  LUBRICANTS: "bg-blue-100 text-blue-700",
  HARD_PARTS: "bg-amber-100 text-amber-700",
  ACCESSORIES: "bg-emerald-100 text-emerald-700",
  LABOR_SERVICES: "bg-violet-100 text-violet-700",
};

/* ─── Reference type labels & colors ─── */

export const REF_TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RECEIVING: "Receiving",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  STOCKTAKE: "Stocktake",
  VOID: "Void",
  JOB_CARD_ISSUE: "Job Issue",
  JOB_CARD_RETURN: "Job Return",
  OPENING_BALANCE: "Opening",
};

export const REF_TYPE_COLORS: Record<string, string> = {
  SALE: "bg-blue-100 text-blue-700",
  RECEIVING: "bg-emerald-100 text-emerald-700",
  TRANSFER_IN: "bg-indigo-100 text-indigo-700",
  TRANSFER_OUT: "bg-violet-100 text-violet-700",
  ADJUSTMENT: "bg-amber-100 text-amber-700",
  RETURN: "bg-orange-100 text-orange-700",
  STOCKTAKE: "bg-slate-100 text-slate-700",
  VOID: "bg-red-100 text-red-700",
  JOB_CARD_ISSUE: "bg-rose-100 text-rose-700",
  JOB_CARD_RETURN: "bg-teal-100 text-teal-700",
  OPENING_BALANCE: "bg-gray-100 text-gray-600",
};

/* ─── Cash variance thresholds for shift Z-readings ─── */

export const CASH_VARIANCE_THRESHOLDS = {
  /** < this = green (OK) */
  OK: 1,
  /** < this = amber (warning), >= this = red */
  WARNING: 50,
} as const;

/* ─── Margin thresholds for reports ─── */

export const MARGIN_THRESHOLDS = {
  /** >= this = green */
  GOOD: 30,
  /** >= this = amber, < this = red */
  WARNING: 15,
} as const;

/* ─── Role helpers ─── */

const FINANCIAL_ROLES = new Set(["ADMIN", "MANAGER"]);
const OPERATIONAL_ROLES = new Set(["ADMIN", "MANAGER", "CASHIER"]);

export function isFinancialRole(role: string): boolean {
  return FINANCIAL_ROLES.has(role);
}

export function isOperationalRole(role: string): boolean {
  return OPERATIONAL_ROLES.has(role);
}

/* ─── Payment methods ─── */

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash", icon: "\uD83D\uDCB5" },
  { value: "CARD", label: "Card", icon: "\uD83D\uDCB3" },
  { value: "GCASH", label: "GCash", icon: "\uD83D\uDCF1" },
  { value: "EFT", label: "EFT", icon: "\uD83C\uDFE6" },
] as const;

/* ─── Stock level thresholds ─── */

export const STOCK_THRESHOLDS = {
  /** stock <= 0 = out of stock */
  OUT: 0,
  /** stock <= this = low stock */
  LOW: 5,
} as const;
