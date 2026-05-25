"use client";

import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";

export type FinancialBreakdownTone = "neutral" | "payment" | "deduction" | "credit" | "charge" | "warning";

export interface FinancialBreakdownLine {
  id?: string;
  label: string;
  amount: string | number;
  tone?: FinancialBreakdownTone;
}

export interface FinancialActionSummaryProps {
  grossLabel: string;
  grossAmount: string | number;
  lines?: FinancialBreakdownLine[];
  netLabel: string;
  netAmount: string | number;
  netDisplayValue?: string;
  netTone?: FinancialBreakdownTone;
  warning?: string;
  className?: string;
}

function toNumber(value: string | number): number {
  return typeof value === "string" ? parseFloat(value) || 0 : value;
}

function linePrefix(tone: FinancialBreakdownTone | undefined): string {
  if (tone === "charge") return "+";
  if (tone === "payment" || tone === "deduction" || tone === "credit") return "-";
  return "";
}

function toneClass(tone: FinancialBreakdownTone | undefined): string {
  if (tone === "charge" || tone === "payment") return "text-emerald-600";
  if (tone === "credit" || tone === "deduction" || tone === "warning") return "text-red-600";
  return "text-foreground";
}

export function FinancialActionSummary({
  grossLabel,
  grossAmount,
  lines = [],
  netLabel,
  netAmount,
  netDisplayValue,
  netTone = "neutral",
  warning,
  className,
}: FinancialActionSummaryProps) {
  return (
    <div className={cn("space-y-1 rounded-lg border border-border bg-muted/10 p-3 text-[12px]", className)}>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{grossLabel}</span>
        <span className="tabular-nums font-medium">{fmtPeso(grossAmount)}</span>
      </div>
      {lines.map((line, index) => {
        const tone = line.tone ?? "neutral";
        const prefix = linePrefix(tone);
        return (
          <div key={line.id ?? `${line.label}-${index}`} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{line.label}</span>
            <span className={cn("tabular-nums", toneClass(tone))}>
              {prefix}{fmtPeso(Math.abs(toNumber(line.amount)))}
            </span>
          </div>
        );
      })}
      <div className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
        <span>{netLabel}</span>
        <span className={cn("tabular-nums", toneClass(netTone))}>
          {netDisplayValue ?? fmtPeso(netAmount)}
        </span>
      </div>
      {warning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-4 text-amber-800">
          {warning}
        </div>
      )}
    </div>
  );
}
