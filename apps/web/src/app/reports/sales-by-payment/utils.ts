import type { PaymentMethodRow } from "@/hooks/use-sales-reports";
import { downloadCSV } from "@/lib/csv-export";

export const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CREDIT_CARD: "Credit Card",
  DEBIT_CARD: "Debit Card",
  GCASH: "GCash",
  MAYA: "Maya",
  QRPH: "QRPH",
  BANK_TRANSFER: "Bank Transfer",
  EFT: "EFT",
  ACCOUNT: "Charge Account",
  CARD: "Card (Legacy)",
  OTHER: "Other",
};

export const METHOD_COLORS: Record<string, string> = {
  CASH: "bg-emerald-500",
  CREDIT_CARD: "bg-blue-500",
  DEBIT_CARD: "bg-indigo-500",
  GCASH: "bg-sky-500",
  MAYA: "bg-green-500",
  QRPH: "bg-violet-500",
  BANK_TRANSFER: "bg-slate-500",
  EFT: "bg-gray-500",
  ACCOUNT: "bg-amber-500",
  CARD: "bg-blue-400",
  OTHER: "bg-gray-400",
};

export function fmt(value: number) {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  switch (preset) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    default:
      from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

export function exportSalesByPaymentCsv(rows: PaymentMethodRow[]) {
  downloadCSV(
    "sales-by-payment",
    ["Method", "Transactions", "Amount", "% of Total"],
    rows.map((row) => [
      METHOD_LABELS[row.method] || row.method,
      String(row.transactionCount),
      row.totalAmount.toFixed(2),
      row.percentage.toFixed(1),
    ]),
  );
}
