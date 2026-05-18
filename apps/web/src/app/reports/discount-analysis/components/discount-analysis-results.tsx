import { Grid3x3, Loader2, Package, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DiscountAnalysis } from "@/hooks/use-sales-reports";
import type { DiscountAnalysisController, DiscountAnalysisTab } from "../types";
import { fmt } from "../utils";

type DiscountAnalysisResultsProps = {
  controller: DiscountAnalysisController;
};

export function DiscountAnalysisResults({ controller }: DiscountAnalysisResultsProps) {
  if (controller.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!controller.summary || !controller.data) {
    return <div className="py-20 text-center text-sm text-muted-foreground">No data for this period</div>;
  }

  return (
    <>
      <DiscountSummaryCards summary={controller.summary} />
      <DiscountAnalysisTabs activeTab={controller.tab} onTabChange={controller.setTab} />
      <DiscountAnalysisTable data={controller.data} tab={controller.tab} />
    </>
  );
}

function DiscountSummaryCards({ summary }: { summary: DiscountAnalysis["summary"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <SummaryCard label="Total Discounts" value={<>{"\u20B1"}{fmt(summary.totalDiscount)}</>} />
      <SummaryCard label="Avg Discount %" value={`${summary.avgDiscountPct.toFixed(2)}%`} />
      <SummaryCard
        label="Sales with Discount"
        value={summary.salesWithDiscount.toLocaleString()}
        footer={`of ${summary.totalSales.toLocaleString()} total`}
      />
      <SummaryCard label="Total Revenue" value={<>{"\u20B1"}{fmt(summary.totalRevenue)}</>} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  footer,
}: {
  label: string;
  value: ReactNode;
  footer?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</div>
      {footer && <div className="text-[10px] text-muted-foreground">{footer}</div>}
    </div>
  );
}

const TAB_OPTIONS = [
  { key: "employee" as const, label: "By Employee", icon: Users },
  { key: "product" as const, label: "By Product", icon: Package },
  { key: "category" as const, label: "By Category", icon: Grid3x3 },
];

function DiscountAnalysisTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DiscountAnalysisTab;
  onTabChange: (tab: DiscountAnalysisTab) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
      {TAB_OPTIONS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            activeTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <tab.icon size={13} /> {tab.label}
        </button>
      ))}
    </div>
  );
}

function DiscountAnalysisTable({ data, tab }: { data: DiscountAnalysis; tab: DiscountAnalysisTab }) {
  if (tab === "employee") {
    return <EmployeeDiscountTable rows={data.byEmployee} />;
  }

  if (tab === "product") {
    return <ProductDiscountTable rows={data.byProduct} />;
  }

  return <CategoryDiscountTable rows={data.byCategory} />;
}

function EmployeeDiscountTable({ rows }: { rows: DiscountAnalysis["byEmployee"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-1.5 text-left">Employee</th>
            <th className="px-4 py-1.5 text-right">Transactions</th>
            <th className="px-4 py-1.5 text-right">Total Discount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.userId} className="hover:bg-muted/20">
              <td className="px-4 py-1.5 font-medium text-foreground">{row.employeeName}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                {row.transactionCount.toLocaleString()}
              </td>
              <td className="px-4 py-1.5 text-right font-medium tabular-nums text-destructive">
                {"\u20B1"}{fmt(row.totalDiscount)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                No discounts in this period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProductDiscountTable({ rows }: { rows: DiscountAnalysis["byProduct"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-1.5 text-left">Product</th>
            <th className="px-4 py-1.5 text-left">SKU</th>
            <th className="px-4 py-1.5 text-right">Qty</th>
            <th className="px-4 py-1.5 text-right">Transactions</th>
            <th className="px-4 py-1.5 text-right">Total Discount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.productId} className="hover:bg-muted/20">
              <td className="max-w-[200px] truncate px-4 py-1.5 font-medium text-foreground">{row.productName}</td>
              <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.totalQty.toLocaleString()}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                {row.transactionCount.toLocaleString()}
              </td>
              <td className="px-4 py-1.5 text-right font-medium tabular-nums text-destructive">
                {"\u20B1"}{fmt(row.totalDiscount)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                No line-level discounts in this period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CategoryDiscountTable({ rows }: { rows: DiscountAnalysis["byCategory"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-1.5 text-left">Category</th>
            <th className="px-4 py-1.5 text-right">Qty</th>
            <th className="px-4 py-1.5 text-right">Transactions</th>
            <th className="px-4 py-1.5 text-right">Total Discount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.categoryName} className="hover:bg-muted/20">
              <td className="px-4 py-1.5 font-medium text-foreground">{row.categoryName}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.totalQty.toLocaleString()}</td>
              <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                {row.transactionCount.toLocaleString()}
              </td>
              <td className="px-4 py-1.5 text-right font-medium tabular-nums text-destructive">
                {"\u20B1"}{fmt(row.totalDiscount)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                No line-level discounts in this period
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
