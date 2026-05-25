"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  firstFieldError,
  normalizeFieldErrors,
  type FieldErrorMap,
} from "@/lib/field-errors";

interface Supplier {
  id: string;
  name: string;
  isActive: boolean;
  paymentTermsDays: number | null;
}

interface InvoiceRow {
  key: string;
  kind: "invoice" | "credit_memo";
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
}

/**
 * Outcome shape passed to the parent after a successful (or partially-successful) save.
 * Parent uses this to build the toast and highlight the new rows after refetch.
 *
 * The bulk-create endpoint does not return invoice IDs (response shape is frozen per audit),
 * so we hand back invoice-number + supplier context and the parent resolves IDs by
 * matching against the fresh list.
 */
export interface RecordInvoiceOutcome {
  created: number;
  errors: Array<{ invoiceNumber: string; message: string }>;
  supplierId: string;
  supplierName: string;
  /** Invoice numbers that were accepted by the server (submitted minus errored). */
  successInvoiceNumbers: string[];
  /** Accepted credit memo numbers, used for clearer success copy. */
  successCreditMemoNumbers: string[];
  /** Sum of amounts for the successfully created invoices. */
  successTotal: number;
}

function newRow(date: string): InvoiceRow {
  return {
    key: Math.random().toString(36).slice(2),
    kind: "invoice",
    invoiceNumber: "",
    invoiceDate: date,
    amount: "",
  };
}

function termsLabel(days: number): string {
  return days === 0 ? "COD" : `Net ${days}`;
}

function normalizeCreditMemoInvoiceNumber(invoiceNumber: string) {
  const trimmed = invoiceNumber.trim();
  return /^CM-/i.test(trimmed) ? `CM-${trimmed.slice(3)}` : `CM-${trimmed}`;
}

function normalizeSubmittedRow(row: InvoiceRow) {
  const parsedAmount = parseFloat(row.amount);
  const amount = Math.abs(Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const isCreditMemo = row.kind === "credit_memo";

  return {
    kind: row.kind,
    invoiceNumber: isCreditMemo
      ? normalizeCreditMemoInvoiceNumber(row.invoiceNumber)
      : row.invoiceNumber.trim(),
    invoiceDate: row.invoiceDate,
    amount: (isCreditMemo ? -amount : amount).toFixed(2),
  };
}

function recordButtonLabel(invoiceCount: number, creditMemoCount: number) {
  const parts: string[] = [];
  if (invoiceCount > 0) {
    parts.push(`${invoiceCount} Invoice${invoiceCount !== 1 ? "s" : ""}`);
  }
  if (creditMemoCount > 0) {
    parts.push(`${creditMemoCount} Credit Memo${creditMemoCount !== 1 ? "s" : ""}`);
  }
  return `Record ${parts.join(" + ") || "0 Invoices"}`;
}

const INVOICE_FIELD_ALIASES: Record<string, string> = {
  supplier_id: "supplierId",
  supplierId: "supplierId",
  source_po_id: "poReference",
  sourcePoId: "poReference",
  invoices: "invoices",
  "invoices.0.invoiceNumber": "invoices",
  "invoices.0.amount": "invoices",
};

function fieldClass(fieldErrors: FieldErrorMap, field: string) {
  return firstFieldError(fieldErrors, field)
    ? "border-red-500 bg-red-50/40 focus:border-red-600"
    : "border-border";
}

function InlineFieldError({ fieldErrors, field }: { fieldErrors: FieldErrorMap; field: string }) {
  const message = firstFieldError(fieldErrors, field);
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-red-700">{message}</p>;
}

export function RecordInvoiceModal({
  open,
  onClose,
  onCreated,
  token,
  locationId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (outcome: RecordInvoiceOutcome) => void;
  token: string;
  locationId: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [rows, setRows] = useState<InvoiceRow[]>([newRow(today)]);
  const [poReference, setPoReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const lastInvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && token && locationId) {
      setSupplierError(null);
      apiFetch<{ data: Supplier[] }>("/procurement/suppliers", { token, locationId })
        .then((res) => setSuppliers(res.data.filter((s: Supplier) => s.isActive !== false)))
        .catch(() => setSupplierError("Failed to load suppliers"));
    }
  }, [open, token, locationId]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSupplierId("");
      setRows([newRow(today)]);
      setPoReference("");
      setNotes("");
      setError(null);
      setFieldErrors({});
    }
  }, [open, today]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const paymentTermsDays = selectedSupplier?.paymentTermsDays ?? 30;

  const validRows = useMemo(
    () => rows.filter((r) => r.invoiceNumber.trim() && Math.abs(parseFloat(r.amount)) > 0),
    [rows],
  );
  const total = useMemo(
    () => validRows.reduce((s, r) => {
      const amount = Math.abs(parseFloat(r.amount) || 0);
      return s + (r.kind === "credit_memo" ? -amount : amount);
    }, 0),
    [validRows],
  );
  const invoiceCount = validRows.filter((r) => r.kind === "invoice").length;
  const creditMemoCount = validRows.filter((r) => r.kind === "credit_memo").length;

  const updateRow = (key: string, field: keyof InvoiceRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setFieldErrors((current) => {
      if (!current.invoices) return current;
      const next = { ...current };
      delete next.invoices;
      return next;
    });
  };

  const removeRow = (key: string) => {
    if (rows.length > 1) setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const addRow = () => {
    const lastDate = rows[rows.length - 1]?.invoiceDate || today;
    setRows((prev) => [...prev, newRow(lastDate)]);
    // Focus the new row's invoice # field after render
    setTimeout(() => lastInvRef.current?.focus(), 50);
  };

  // Auto-add row when last row gets an invoice number
  const handleInvoiceNumberChange = (key: string, value: string) => {
    updateRow(key, "invoiceNumber", value);
    const isLastRow = rows[rows.length - 1]?.key === key;
    if (isLastRow && value.trim() && rows.every((r) => r.key === key || r.invoiceNumber.trim())) {
      // All rows filled — auto-add a new empty row
      const lastDate = rows[rows.length - 1]?.invoiceDate || today;
      setRows((prev) => [...prev, newRow(lastDate)]);
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Requirement 7: re-entrant submits are blocked by `saving` — the button is also
    // disabled, but this guard short-circuits rapid keyboard-Enter bursts too.
    if (saving) return;
    if (!supplierId || validRows.length === 0) return;

    // Check for duplicate invoice numbers within the batch
    const submittedRows = validRows.map(normalizeSubmittedRow);
    const nums = submittedRows.map((r) => r.invoiceNumber);
    const dupSet = new Set<string>();
    for (const n of nums) {
      if (dupSet.has(n)) {
        setError("Please fix the highlighted invoice rows.");
        setFieldErrors({ invoices: [`Duplicate invoice number in batch: ${n}`] });
        return;
      }
      dupSet.add(n);
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    const supplier = selectedSupplier;

    try {
      const res = await apiFetch<{ created: number; total: number; errors: Array<{ invoiceNumber: string; message: string }> }>(
        "/ap/invoices/bulk-create",
        {
          token,
          locationId,
          method: "POST",
          body: JSON.stringify({
            supplierId,
            sourcePoId: poReference || undefined,
            notes: notes || undefined,
            invoices: submittedRows,
          }),
        },
      );
      const erroredNumbers = new Set((res.errors ?? []).map((e) => e.invoiceNumber));
      const successRows = submittedRows.filter((r) => !erroredNumbers.has(r.invoiceNumber));
      const successTotal = successRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const successCreditMemoNumbers = successRows
        .filter((r) => r.kind === "credit_memo")
        .map((r) => r.invoiceNumber);

      const outcome: RecordInvoiceOutcome = {
        created: res.created ?? successRows.length,
        errors: res.errors ?? [],
        supplierId,
        supplierName: supplier?.name ?? "Supplier",
        successInvoiceNumbers: successRows.map((r) => r.invoiceNumber),
        successCreditMemoNumbers,
        successTotal,
      };

      // If NOTHING was created (server returned errors for every row), keep the
      // modal open and surface the issue inline so the user can fix and retry.
      if (outcome.created === 0 && outcome.errors.length > 0) {
        setError(
          `Could not record invoice${outcome.errors.length === 1 ? "" : "s"}: ${outcome.errors
            .map((e) => `${e.invoiceNumber} — ${e.message}`)
            .join("; ")}`,
        );
        return;
      }

      // Partial or full success → hand off to parent (toast + list refresh + row pulse).
      onCreated(outcome);
      onClose();
    } catch (err: unknown) {
      // Network / 4xx / 5xx — the save did not happen at all.
      const normalized = normalizeFieldErrors(err, INVOICE_FIELD_ALIASES, "Failed to record invoices");
      const message = normalized.message;
      setFieldErrors(normalized.fieldErrors);
      setError(message);
      toast.error("Could not record invoice", {
        description: message || "Please try again or check your connection",
        duration: Infinity, // manual dismiss only on errors
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Record Supplier Invoices</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Supplier */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier *</label>
            {supplierError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{supplierError}</div>
            ) : (
              <>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    setFieldErrors((current) => {
                      if (!current.supplierId) return current;
                      const next = { ...current };
                      delete next.supplierId;
                      return next;
                    });
                  }}
                  aria-invalid={Boolean(firstFieldError(fieldErrors, "supplierId"))}
                  className={cn("w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary", fieldClass(fieldErrors, "supplierId"))}
                  required
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {selectedSupplier && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Terms: <span className="font-medium text-foreground">{termsLabel(paymentTermsDays)}</span>
                  </div>
                )}
                <InlineFieldError fieldErrors={fieldErrors} field="supplierId" />
              </>
            )}
          </div>

          {/* Invoice Rows */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Invoices & Credit Memos</label>
                <p className="text-[11px] text-muted-foreground">
                  Credit memos are saved as negative CM entries and reduce supplier balances.
                </p>
              </div>
              <button type="button" onClick={addRow}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10">
                <Plus size={12} /> Add Row
              </button>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 px-2 py-1.5 text-center">#</th>
                    <th className="w-32 px-2 py-1.5 text-left">Type</th>
                    <th className="px-2 py-1.5 text-left">Invoice #</th>
                    <th className="w-36 px-2 py-1.5 text-left">Date</th>
                    <th className="w-32 px-2 py-1.5 text-right">Amount</th>
                    <th className="w-8 px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.key} className="border-t border-border/40">
                      <td className="px-2 py-1 text-center text-[10px] text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-1">
                        <select
                          value={row.kind}
                          onChange={(e) => updateRow(row.key, "kind", e.target.value as InvoiceRow["kind"])}
                          className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                        >
                          <option value="invoice">Invoice</option>
                          <option value="credit_memo">Credit Memo</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          ref={idx === rows.length - 1 ? lastInvRef : undefined}
                          type="text"
                          value={row.invoiceNumber}
                          onChange={(e) => handleInvoiceNumberChange(row.key, e.target.value)}
                          placeholder={row.kind === "credit_memo" ? "Credit memo #" : "Invoice #"}
                          className={cn("h-8 w-full rounded border bg-background px-2 text-[12px] outline-none focus:border-primary", fieldClass(fieldErrors, "invoices"))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={row.invoiceDate}
                          onChange={(e) => updateRow(row.key, "invoiceDate", e.target.value)}
                          className={cn("h-8 w-full rounded border bg-background px-2 text-[12px] outline-none focus:border-primary", fieldClass(fieldErrors, "invoices"))}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={(e) => updateRow(row.key, "amount", e.target.value)}
                          placeholder={row.kind === "credit_memo" ? "Credit" : "0.00"}
                          className={cn(
                            "h-8 w-full rounded border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary",
                            row.kind === "credit_memo" && "text-emerald-700",
                            fieldClass(fieldErrors, "invoices"),
                          )}
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        {rows.length > 1 && (
                          <button type="button" onClick={() => removeRow(row.key)}
                            className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InlineFieldError fieldErrors={fieldErrors} field="invoices" />

            {validRows.length > 0 && (
              <div className="mt-1 text-right text-[12px] tabular-nums font-semibold">
                {creditMemoCount > 0 ? "Net total" : "Total"}: {fmtPeso(total)}
              </div>
            )}
          </div>

          {/* PO Reference + Notes (shared) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">PO Reference (shared)</label>
              <input type="text" value={poReference} onChange={(e) => setPoReference(e.target.value)}
                placeholder="e.g. PO-2024-0001"
                aria-invalid={Boolean(firstFieldError(fieldErrors, "poReference"))}
                className={cn("w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary", fieldClass(fieldErrors, "poReference"))} />
              <InlineFieldError fieldErrors={fieldErrors} field="poReference" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (shared)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                aria-invalid={Boolean(firstFieldError(fieldErrors, "notes"))}
                className={cn("w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary", fieldClass(fieldErrors, "notes"))} />
              <InlineFieldError fieldErrors={fieldErrors} field="notes" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving || validRows.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving..." : recordButtonLabel(invoiceCount, creditMemoCount)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
