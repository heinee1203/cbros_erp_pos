import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from "lucide-react";

import { cn } from "@/lib/utils";

import { fmtDate, fmtPesoFull } from "../formatters";
import type { DailyRow } from "../types";

type SortField =
  | "date"
  | "apOldSales"
  | "apNewSales"
  | "apOnAccount"
  | "acSales"
  | "acOnAccount"
  | "serviceSales"
  | "serviceOnAccount"
  | "paintingSales"
  | "paintingOnAccount"
  | "juniorSales"
  | "payments"
  | "total";

export function DailyDataTable({ rows, from, to }: { rows: DailyRow[]; from: string; to: string }) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const withTotal = rows.map((r) => ({
      ...r,
      total:
        r.apOldSales + r.apNewSales + r.apOnAccount +
        r.acSales + r.acOnAccount +
        r.serviceSales + r.serviceOnAccount +
        r.paintingSales + r.paintingOnAccount +
        r.juniorSales,
    }));
    const filtered = search
      ? withTotal.filter((r) => r.date.includes(search))
      : withTotal;
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortField === "date") {
        cmp = a.date.localeCompare(b.date);
      } else {
        cmp = (a[sortField] as number) - (b[sortField] as number);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [rows, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "desc");
    }
  };

  const exportCSV = () => {
    const headers = [
      "Date",
      "A/P Old", "A/P New", "A/P On Acct",
      "A/C", "A/C On Acct",
      "Service", "Service On Acct",
      "Painting", "Painting On Acct",
      "Junior",
      "Payments",
      "Total",
    ];
    const csvRows = sorted.map((r) =>
      [
        r.date,
        r.apOldSales, r.apNewSales, r.apOnAccount,
        r.acSales, r.acOnAccount,
        r.serviceSales, r.serviceOnAccount,
        r.paintingSales, r.paintingOnAccount,
        r.juniorSales,
        r.payments,
        r.total,
      ].join(","),
    );
    const blob = new Blob([headers.join(",") + "\n" + csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-sales-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Daily Data</h3>
          <p className="text-[11px] text-muted-foreground">
            {sorted.length} days · {fmtDate(from)} – {fmtDate(to)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by date (YYYY-MM)…"
            className="h-8 w-56 rounded-lg border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
          />
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur">
            <tr>
              <Th field="date" label="Date" activeField={sortField} dir={sortDir} onSort={handleSort} align="left" />
              <Th field="apOldSales" label="A/P Old" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="apNewSales" label="A/P New" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="apOnAccount" label="A/P Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="acSales" label="A/C" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="acOnAccount" label="A/C Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="serviceSales" label="Service" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="serviceOnAccount" label="Svc Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="paintingSales" label="Painting" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="paintingOnAccount" label="Paint Acct" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="juniorSales" label="Junior" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="payments" label="Payments" activeField={sortField} dir={sortDir} onSort={handleSort} />
              <Th field="total" label="Total" activeField={sortField} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.date} className="border-b border-border/40 hover:bg-accent/30">
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.date}</td>
                <Td v={r.apOldSales} />
                <Td v={r.apNewSales} />
                <Td v={r.apOnAccount} />
                <Td v={r.acSales} />
                <Td v={r.acOnAccount} />
                <Td v={r.serviceSales} />
                <Td v={r.serviceOnAccount} />
                <Td v={r.paintingSales} />
                <Td v={r.paintingOnAccount} />
                <Td v={r.juniorSales} />
                <Td v={r.payments} muted />
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-foreground">
                  {r.total > 0 ? fmtPesoFull(r.total) : "\u2014"}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                  No rows in the selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  field,
  label,
  activeField,
  dir,
  onSort,
  align = "right",
}: {
  field: SortField;
  label: string;
  activeField: SortField;
  dir: "asc" | "desc";
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = field === activeField;
  return (
    <th
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        onClick={() => onSort(field)}
        className={cn(
          "group inline-flex items-center gap-0.5 transition-colors",
          active ? "text-foreground" : "hover:text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <span className="inline-flex w-3 justify-center">
          {active ? (
            dir === "asc" ? <ChevronUp size={10} className="text-primary" strokeWidth={2.5} />
            : <ChevronDown size={10} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronsUpDown size={10} className="text-muted-foreground/30 group-hover:text-muted-foreground/60" />
          )}
        </span>
      </button>
    </th>
  );
}

function Td({ v, muted }: { v: number; muted?: boolean }) {
  if (v === 0) {
    return <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground/30">{"\u2014"}</td>;
  }
  return (
    <td
      className={cn(
        "px-3 py-1.5 text-right tabular-nums",
        muted ? "text-emerald-600" : "text-foreground",
      )}
    >
      {fmtPesoFull(v)}
    </td>
  );
}
