"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";
import { apiFetch } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";

export interface InvoiceGridRow {
  id: string;
  customerId: string | null;
  customerLabel: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: string;
}

interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string | null;
  paymentTermsDays: number;
  currentBalance: string;
}

const CELL_ORDER = ["date", "customer", "invoiceNumber", "dueDate", "amount"] as const;
type CellKey = (typeof CELL_ORDER)[number];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 30;
  const ms = new Date(toISO + "T00:00:00").getTime() - new Date(fromISO + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

function newRow(): InvoiceGridRow {
  return {
    id: Math.random().toString(36).slice(2),
    customerId: null,
    customerLabel: "",
    invoiceNumber: "",
    invoiceDate: todayISO(),
    dueDate: plusDaysISO(todayISO(), 30),
    amount: "",
  };
}

function isRowValid(r: InvoiceGridRow): boolean {
  const amt = parseFloat(r.amount);
  return !!(
    r.customerId &&
    r.invoiceNumber.trim() &&
    r.invoiceDate &&
    r.dueDate &&
    amt > 0 &&
    r.dueDate >= r.invoiceDate
  );
}

function rowHasData(r: InvoiceGridRow): boolean {
  return !!(r.customerId || r.customerLabel || r.invoiceNumber || r.amount);
}

export interface InvoiceEntryGridProps {
  token: string;
  locationId: string;
  onSubmitted: () => void;
}

export function InvoiceEntryGrid({ token, locationId, onSubmitted }: InvoiceEntryGridProps) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<InvoiceGridRow[]>(() => [newRow()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const cellRefs = useRef(new Map<string, HTMLElement>());
  const setCellRef = (rowId: string, key: CellKey) => (el: HTMLElement | null) => {
    const mapKey = `${rowId}:${key}`;
    if (el) cellRefs.current.set(mapKey, el);
    else cellRefs.current.delete(mapKey);
  };
  const focusCell = (rowId: string, key: CellKey) => {
    const el = cellRefs.current.get(`${rowId}:${key}`);
    if (!el) return;
    el.focus();
    const selectable = el as HTMLInputElement;
    if (typeof selectable.select === "function") {
      try { selectable.select(); } catch { /* non-text inputs */ }
    }
  };

  const updateRow = useCallback((id: string, patch: Partial<InvoiceGridRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addRow = useCallback(() => {
    const nr = newRow();
    setRows((prev) => [...prev, nr]);
    setTimeout(() => focusCell(nr.id, "date"), 0);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleCellKey = (e: React.KeyboardEvent<HTMLElement>, rowId: string, col: CellKey) => {
    const rowIdx = rows.findIndex((r) => r.id === rowId);
    if (rowIdx === -1) return;
    const colIdx = CELL_ORDER.indexOf(col);

    const moveRight = () => {
      if (colIdx < CELL_ORDER.length - 1) {
        focusCell(rowId, CELL_ORDER[colIdx + 1]);
      } else {
        const nextRow = rows[rowIdx + 1];
        if (nextRow) {
          focusCell(nextRow.id, CELL_ORDER[0]);
        } else {
          const nr = newRow();
          setRows((prev) => [...prev, nr]);
          setTimeout(() => focusCell(nr.id, CELL_ORDER[0]), 0);
        }
      }
    };
    const moveLeft = () => {
      if (colIdx > 0) {
        focusCell(rowId, CELL_ORDER[colIdx - 1]);
      } else {
        const prevRow = rows[rowIdx - 1];
        if (prevRow) focusCell(prevRow.id, CELL_ORDER[CELL_ORDER.length - 1]);
      }
    };
    const moveDown = () => {
      const nextRow = rows[rowIdx + 1];
      if (nextRow) {
        focusCell(nextRow.id, col);
      } else {
        const nr = newRow();
        setRows((prev) => [...prev, nr]);
        setTimeout(() => focusCell(nr.id, col), 0);
      }
    };
    const moveUp = () => {
      const prevRow = rows[rowIdx - 1];
      if (prevRow) focusCell(prevRow.id, col);
    };

    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); moveRight(); return; }
    if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); moveLeft(); return; }
    if (e.key === "Enter") { e.preventDefault(); moveDown(); return; }
    if (e.key === "ArrowDown" && (col === "date" || col === "dueDate" || col === "amount")) {
      e.preventDefault(); moveDown(); return;
    }
    if (e.key === "ArrowUp" && (col === "date" || col === "dueDate" || col === "amount")) {
      e.preventDefault(); moveUp(); return;
    }
    if (e.key === "Escape") { (e.target as HTMLElement).blur(); return; }
  };

  const validRows = rows.filter(isRowValid);
  const total = validRows.reduce((s, r) => s + parseFloat(r.amount), 0);

  const handleCancel = async () => {
    const hasAny = rows.some(rowHasData) || notes.length > 0;
    if (hasAny) {
      const ok = await confirm({
        title: "Discard entered invoices?",
        message: "This clears all rows currently entered in the invoice grid. Nothing will be saved.",
        confirmLabel: "Discard Rows",
        variant: "warning",
      });
      if (!ok) return;
    }
    setRows([newRow()]);
    setNotes("");
    setRowErrors({});
  };

  const handleSubmit = async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    setRowErrors({});

    const byCustomer = new Map<string, InvoiceGridRow[]>();
    for (const r of validRows) {
      const key = r.customerId!;
      const arr = byCustomer.get(key) ?? [];
      arr.push(r);
      byCustomer.set(key, arr);
    }

    type BatchResult = { rowIds: string[]; ok: boolean; error?: string; created?: number };
    const results = await Promise.all(
      Array.from(byCustomer.entries()).map(async ([customerId, custRows]): Promise<BatchResult> => {
        try {
          const res = await apiFetch<{ created: number }>("/customers/invoices/batch", {
            method: "POST",
            token,
            locationId,
            body: JSON.stringify({
              customerId,
              notes: notes.trim() || undefined,
              invoices: custRows.map((r) => ({
                referenceNumber: r.invoiceNumber.trim(),
                recordedAt: r.invoiceDate ? `${r.invoiceDate}T00:00:00Z` : undefined,
                dueDate: r.dueDate || undefined,
                amount: parseFloat(r.amount),
              })),
            }),
          });
          return { rowIds: custRows.map((r) => r.id), ok: true, created: res.created };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to record invoices";
          return { rowIds: custRows.map((r) => r.id), ok: false, error: msg };
        }
      }),
    );

    const successRowIds = new Set(results.filter((r) => r.ok).flatMap((r) => r.rowIds));
    const failedResults = results.filter((r) => !r.ok);
    const totalCreated = results.reduce((s, r) => s + (r.created ?? 0), 0);
    const distinctOkCustomers = results.filter((r) => r.ok).length;

    setRows((prev) => {
      const remaining = prev.filter((r) => !successRowIds.has(r.id));
      return remaining.length === 0 ? [newRow()] : remaining;
    });

    const nextErrors: Record<string, string> = {};
    for (const f of failedResults) {
      for (const rid of f.rowIds) nextErrors[rid] = f.error ?? "Failed";
    }
    setRowErrors(nextErrors);

    if (failedResults.length === 0) {
      const invNoun = totalCreated === 1 ? "invoice" : "invoices";
      const custNoun = distinctOkCustomers === 1 ? "customer" : "customers";
      toast.success(`Recorded ${totalCreated} ${invNoun} for ${distinctOkCustomers} ${custNoun}`);
      setNotes("");
      onSubmitted();
    } else if (totalCreated > 0) {
      toast.warning(`Recorded ${totalCreated} invoices. ${failedResults.length} customer batch${failedResults.length === 1 ? "" : "es"} failed — see highlighted rows.`);
      onSubmitted();
    } else {
      toast.error(failedResults[0].error ?? "Failed to record invoices");
    }

    setSubmitting(false);
  };

  const gridCols = "40px 120px minmax(240px,1fr) 140px 120px 140px 32px";

  return (
    <div className="mb-3 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Encode Invoices</h2>
          <p className="text-[11px] text-muted-foreground">
            Each row is an independent invoice. Tab moves across, Enter drops to the next row.
          </p>
        </div>
        <button
          onClick={addRow}
          className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus size={12} /> Add Row
        </button>
      </div>

      {/* Header */}
      <div
        className="grid gap-1 border-b border-border bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span>#</span>
        <span>Date</span>
        <span>Customer</span>
        <span>Invoice #</span>
        <span>Due Date</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      {/* Body */}
      {rows.map((r, idx) => {
        const isValid = isRowValid(r);
        const hasData = rowHasData(r);
        const showInvalid = hasData && !isValid;
        const rowError = rowErrors[r.id];
        const rowClasses = cn(
          "grid gap-1 border-b border-border/50 px-3 py-1 items-center last:border-b-0",
          showInvalid && !rowError && "border-l-2 border-l-red-400",
          rowError && "border-l-2 border-l-red-500 bg-red-50/40",
        );
        return (
          <div key={r.id}>
            <div className={rowClasses} style={{ gridTemplateColumns: gridCols }}>
              <span className="text-[11px] text-muted-foreground">{idx + 1}</span>

              <input
                type="date"
                value={r.invoiceDate}
                ref={setCellRef(r.id, "date")}
                onKeyDown={(e) => handleCellKey(e, r.id, "date")}
                onChange={(e) => {
                  const next = e.target.value;
                  const offset = daysBetween(r.invoiceDate, r.dueDate);
                  updateRow(r.id, {
                    invoiceDate: next,
                    dueDate: next ? plusDaysISO(next, offset) : r.dueDate,
                  });
                }}
                className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
              />

              <CustomerCell
                row={r}
                token={token}
                locationId={locationId}
                inputRef={setCellRef(r.id, "customer")}
                onCellKey={(e) => handleCellKey(e, r.id, "customer")}
                onSelect={(c) => {
                  const label = `${c.name}${c.phone ? ` (${c.phone})` : ""}`;
                  const newDue = plusDaysISO(r.invoiceDate || todayISO(), c.paymentTermsDays);
                  updateRow(r.id, {
                    customerId: c.id,
                    customerLabel: label,
                    dueDate: newDue,
                  });
                }}
                onClearSelection={() => {
                  if (r.customerId) updateRow(r.id, { customerId: null });
                }}
              />

              <input
                type="text"
                value={r.invoiceNumber}
                placeholder="INV-001"
                ref={setCellRef(r.id, "invoiceNumber")}
                onKeyDown={(e) => handleCellKey(e, r.id, "invoiceNumber")}
                onChange={(e) => updateRow(r.id, { invoiceNumber: e.target.value })}
                className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
              />

              <input
                type="date"
                value={r.dueDate}
                ref={setCellRef(r.id, "dueDate")}
                onKeyDown={(e) => handleCellKey(e, r.id, "dueDate")}
                onChange={(e) => updateRow(r.id, { dueDate: e.target.value })}
                className="h-7 rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
              />

              <input
                type="number"
                step="0.01"
                min="0"
                value={r.amount}
                placeholder="0.00"
                ref={setCellRef(r.id, "amount")}
                onKeyDown={(e) => handleCellKey(e, r.id, "amount")}
                onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                className="h-7 rounded border border-border bg-background px-2 text-[12px] tabular-nums text-right outline-none focus:border-primary/40"
              />

              <button
                onClick={() => removeRow(r.id)}
                disabled={rows.length === 1}
                title={rows.length === 1 ? "At least one row required" : "Remove row"}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {rowError && (
              <div className="border-b border-border/50 bg-red-50/40 px-3 py-1 text-[10px] text-red-600">
                {rowError}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 space-y-2">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
            Notes (shared across batch, optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Applies to every valid row submitted"
            className="w-full rounded border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-primary/40"
          />
        </div>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-[11px]",
              validRows.length > 0 && validRows.length === rows.length ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {validRows.length} of {rows.length} valid &nbsp;·&nbsp; Total:{" "}
            <span className="font-semibold tabular-nums text-foreground">{fmtPeso(total)}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={validRows.length === 0 || submitting}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting
                ? "Recording\u2026"
                : `Record ${validRows.length} ${validRows.length === 1 ? "Invoice" : "Invoices"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Customer Cell with debounced search + keyboard-aware dropdown ── */
function CustomerCell({
  row,
  token,
  locationId,
  inputRef,
  onCellKey,
  onSelect,
  onClearSelection,
}: {
  row: InvoiceGridRow;
  token: string;
  locationId: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onCellKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onSelect: (c: CustomerSearchResult) => void;
  onClearSelection: () => void;
}) {
  const [query, setQuery] = useState(row.customerLabel);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(row.customerLabel);
  }, [row.customerLabel]);

  useEffect(() => {
    if (!open || !token || !locationId) { setResults([]); return; }
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ data: CustomerSearchResult[] }>(
          `/customers?search=${encodeURIComponent(q)}&limit=10`,
          { token, locationId },
        );
        setResults(res.data || []);
        setHighlight(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open, token, locationId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commit = (c: CustomerSearchResult) => {
    onSelect(c);
    setQuery(`${c.name}${c.phone ? ` (${c.phone})` : ""}`);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        ref={inputRef}
        placeholder="Type to search..."
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (row.customerId) onClearSelection();
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && results.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const pick = results[highlight];
              if (pick) {
                commit(pick);
                // Spec: Enter-to-select advances RIGHT (to Invoice #), not DOWN.
                // Forge a Tab event so handleCellKey uses its moveRight branch.
                const tabEvent = {
                  key: "Tab", shiftKey: false,
                  preventDefault: () => {}, stopPropagation: () => {},
                  target: e.target, currentTarget: e.currentTarget,
                } as unknown as React.KeyboardEvent<HTMLElement>;
                onCellKey(tabEvent);
              }
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
          onCellKey(e);
        }}
        className={cn(
          "h-7 w-full rounded border bg-background px-2 text-[12px] outline-none focus:border-primary/40",
          row.customerId ? "border-primary/40 bg-primary/5" : "border-border",
        )}
      />
      {open && (query.trim().length > 0 || loading) && (
        <div className="absolute left-0 top-8 z-30 w-[320px] rounded-lg border border-border bg-background shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground">Searching&hellip;</div>
          )}
          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="px-3 py-1.5 text-[11px] text-muted-foreground">No match</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.id}
              onMouseDown={(e) => { e.preventDefault(); commit(c); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "block w-full text-left px-3 py-1.5",
                i === highlight ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <div className="text-[12px] font-medium text-foreground truncate">{c.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">
                {c.phone ?? "\u2014"} &middot; Net {c.paymentTermsDays} &middot; Balance {fmtPeso(parseFloat(c.currentBalance || "0"))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
