import { ChevronDown, ChevronUp, Info, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MechanicProductivityController, MergedRow, SortField } from "../types";
import { EMPTY_FORMULA, fmtCurrency, fmtNumber, ROLE_COLORS, ROLE_LABELS } from "../utils";

type MechanicProductivityTableProps = {
  controller: MechanicProductivityController;
};

export function MechanicProductivityTable({ controller }: MechanicProductivityTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <MechanicProductivityTableHeader controller={controller} />
      <MechanicProductivityTableBody controller={controller} />
      <MechanicProductivityTableFooter controller={controller} />
    </div>
  );
}

function MechanicProductivityTableHeader({ controller }: MechanicProductivityTableProps) {
  return (
    <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
      <SortHeader controller={controller} label="Technician" field="technicianName" width="w-36" align="left" />
      <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Role</div>
      <div className="flex-1" />
      <SortHeader controller={controller} label="Jobs" field="jobCount" width="w-16" />
      <SortHeader controller={controller} label="Revenue" field="revenue" width="w-32" />
      <SortHeader controller={controller} label="Avg/Job" field="avgPerJob" width="w-28" />
      <SortHeader controller={controller} label="Commission" field="commission" width="w-32" />
      <div className="w-8" />
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
  controller: MechanicProductivityController;
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

function MechanicProductivityTableBody({ controller }: MechanicProductivityTableProps) {
  if (controller.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (controller.sorted.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <Wrench size={28} className="text-muted-foreground/30" />
        <p className="text-sm font-medium">No labor data</p>
        <p className="text-xs text-muted-foreground">Select a date range to see technician productivity</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {controller.sorted.map((row, index) => (
        <MechanicProductivityRow key={row.technicianId ?? index} row={row} controller={controller} />
      ))}
      <MechanicProductivityTotalRow controller={controller} />
    </div>
  );
}

function MechanicProductivityRow({
  row,
  controller,
}: {
  row: MergedRow;
  controller: MechanicProductivityController;
}) {
  const revenuePercent = (row.revenue / controller.maxRevenue) * 100;

  return (
    <div>
      <div className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
        <div className="w-36 min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">{row.technicianName}</span>
          {row.locationId && (
            <span className="block truncate text-[10px] text-muted-foreground">
              {controller.locationMap.get(row.locationId) ?? ""}
            </span>
          )}
        </div>
        <div className="w-20">
          {row.role && (
            <span
              className={cn(
                "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold",
                ROLE_COLORS[row.role] ?? "bg-muted text-muted-foreground",
              )}
            >
              {ROLE_LABELS[row.role] ?? row.role}
            </span>
          )}
        </div>
        <div className="flex-1 pr-4">
          <div className="h-4 w-full overflow-hidden rounded-r-md bg-muted/40">
            <div
              className="h-4 rounded-r-md transition-all"
              style={{
                width: `${Math.max(revenuePercent, 1)}%`,
                background: "linear-gradient(90deg, #10B981, #059669)",
                minWidth: "4px",
              }}
            />
          </div>
        </div>
        <div className="w-16 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtNumber(row.jobCount)}</div>
        <div className="w-32 text-right text-[12px] font-medium tabular-nums text-foreground">{fmtCurrency(row.revenue)}</div>
        <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{fmtCurrency(row.avgPerJob)}</div>
        <div className="w-32 text-right text-[12px] font-semibold tabular-nums text-amber-600">
          {fmtCurrency(row.commission)}
        </div>
        <div className="flex w-8 justify-center">
          {row.formula !== EMPTY_FORMULA && (
            <button
              onClick={() => controller.toggleFormula(row.technicianId)}
              className={cn(
                "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                controller.showFormula === row.technicianId && "bg-muted text-foreground",
              )}
              title="Show formula"
            >
              <Info size={12} />
            </button>
          )}
        </div>
      </div>
      {controller.showFormula === row.technicianId && row.formula !== EMPTY_FORMULA && <MechanicFormulaRow row={row} />}
    </div>
  );
}

function MechanicFormulaRow({ row }: { row: MergedRow }) {
  return (
    <div className="space-y-0.5 border-t border-border/50 bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">
      {row.fixedCommission > 0 && (
        <div>
          <span className="font-medium text-foreground">Fixed (installs):</span> {fmtCurrency(row.fixedCommission)}
        </div>
      )}
      {row.rateCommission > 0 && (
        <div>
          <span className="font-medium text-foreground">Rate:</span> {fmtCurrency(row.rateCommission)}
        </div>
      )}
      <div>
        <span className="font-medium">Formula:</span> {row.formula}
      </div>
    </div>
  );
}

function MechanicProductivityTotalRow({ controller }: MechanicProductivityTableProps) {
  return (
    <div className="flex items-center bg-muted/30 px-4 py-3 font-semibold">
      <div className="w-36 text-[13px] text-foreground">TOTAL</div>
      <div className="w-20" />
      <div className="flex-1" />
      <div className="w-16 text-right text-[12px] tabular-nums text-foreground">
        {fmtNumber(controller.merged.reduce((sum, row) => sum + row.jobCount, 0))}
      </div>
      <div className="w-32 text-right text-[12px] tabular-nums text-foreground">
        {fmtCurrency(controller.merged.reduce((sum, row) => sum + row.revenue, 0))}
      </div>
      <div className="w-28" />
      <div className="w-32 text-right text-[12px] tabular-nums text-amber-600">
        {fmtCurrency(controller.totalCommission)}
      </div>
      <div className="w-8" />
    </div>
  );
}

function MechanicProductivityTableFooter({ controller }: MechanicProductivityTableProps) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
      <span className="text-[11px] text-muted-foreground">{controller.sorted.length} technicians</span>
      {controller.commSummary && (
        <span className="text-[11px] text-muted-foreground">
          Shop total labor: {fmtCurrency(controller.commSummary.shopTotalLabor)}
        </span>
      )}
    </div>
  );
}
