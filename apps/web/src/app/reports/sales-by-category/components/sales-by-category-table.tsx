import { ChevronDown, ChevronUp, Grid3x3 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CategorySalesRow, SalesByCategoryController, SortField } from "../types";
import { categoryDisplayName, fmtCurrency, fmtNumber } from "../utils";

type SalesByCategoryTableProps = {
  controller: SalesByCategoryController;
};

export function SalesByCategoryTable({ controller }: SalesByCategoryTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
        <SortHeader controller={controller} label="Category" field="categoryName" width="w-36" align="left" />
        <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" />
        <SortHeader controller={controller} label="Units" field="unitsSold" width="w-20" />
        <SortHeader controller={controller} label="Revenue" field="totalRevenue" width="w-32" />
        <SortHeader controller={controller} label="Profit" field="grossProfit" width="w-32" />
        <SortHeader controller={controller} label="Margin" field="marginPct" width="w-16" />
        <SortHeader controller={controller} label="SKUs" field="uniqueProducts" width="w-16" />
      </div>

      {controller.isLoading ? (
        <div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse border-b border-border bg-muted/20" />
          ))}
        </div>
      ) : controller.filtered.length === 0 ? (
        <SalesByCategoryEmptyState search={controller.search} />
      ) : (
        <div className="divide-y divide-border">
          {controller.filtered.map((category) => (
            <SalesByCategoryRowView
              key={categoryDisplayName(category)}
              category={category}
              maxRevenue={controller.maxRevenue}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
        <span className="text-[11px] text-muted-foreground">{controller.filtered.length} categories</span>
      </div>
    </div>
  );
}

function SortHeader({
  controller,
  label,
  field,
  width,
  align = "right",
}: {
  controller: SalesByCategoryController;
  label: string;
  field: SortField;
  width: string;
  align?: "left" | "right";
}) {
  const active = controller.sortBy === field;
  return (
    <button
      onClick={() => controller.handleSort(field)}
      className={cn(
        "flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors",
        width,
        align === "right" ? "justify-end" : "justify-start",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active && (controller.sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
    </button>
  );
}

function SalesByCategoryRowView({
  category,
  maxRevenue,
}: {
  category: CategorySalesRow;
  maxRevenue: number;
}) {
  const pct = (parseFloat(category.totalRevenue) / maxRevenue) * 100;
  const profit = parseFloat(category.grossProfit);
  const catName = categoryDisplayName(category);

  return (
    <div className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
      <div className="w-36">
        <Link
          href={`/reports/sales-by-item?category=${encodeURIComponent(catName)}`}
          className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground transition-colors hover:text-emerald-600 hover:underline"
        >
          {catName}
        </Link>
      </div>
      <div className="flex-1 pr-4">
        <div className="h-5 w-full overflow-hidden rounded-r-md bg-muted/40">
          <div
            className="h-5 rounded-r-md transition-all"
            style={{
              background: "linear-gradient(90deg, #10B981, #059669)",
              width: `${Math.max(pct, 1)}%`,
            }}
          />
        </div>
      </div>
      <div className="w-20 text-right text-[12px] tabular-nums text-foreground">{fmtNumber(category.unitsSold)}</div>
      <div className="w-32 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtCurrency(category.totalRevenue)}</div>
      <div className={cn("w-32 text-right text-[12px] font-medium tabular-nums", profit >= 0 ? "text-emerald-600" : "text-red-500")}>
        {fmtCurrency(category.grossProfit)}
      </div>
      <div className="w-16 text-right text-[12px] font-semibold tabular-nums text-foreground">{category.marginPct}%</div>
      <div className="w-16 text-right text-[12px] tabular-nums text-muted-foreground">{fmtNumber(category.uniqueProducts)}</div>
    </div>
  );
}

function SalesByCategoryEmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Grid3x3 size={16} className="text-muted-foreground" />
      </div>
      <p className="mt-3 text-[13px] font-medium text-foreground">{search ? "No matching categories" : "No sales data"}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {search ? "Try adjusting your search" : "No completed sales for the selected period"}
      </p>
    </div>
  );
}
