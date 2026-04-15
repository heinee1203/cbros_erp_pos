"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";

interface Supplier {
  id: string;
  name: string;
  isActive: boolean;
  paymentTermsDays: number | null;
}

interface InvoiceRow {
  key: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
}

function newRow(date: string): InvoiceRow {
  return { key: Math.random().toString(36).slice(2), invoiceNumber: "", invoiceDate: date, amount: "" };
}

function termsLabel(days: number): string {
  return days === 0 ? "COD" : `Net ${days}`;
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
  onCreated: () => void;
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
    }
  }, [open, today]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );
  const paymentTermsDays = selectedSupplier?.paymentTermsDays ?? 30;

  const validRows = useMemo(
    () => rows.filter((r) => r.invoiceNumber.trim() && parseFloat(r.amount) > 0),
    [rows],
  );
  const total = useMemo(
    () => validRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [validRows],
  );

  const updateRow = (key: string, field: keyof InvoiceRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
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
    if (!supplierId || validRows.length === 0) return;

    // Check for duplicate invoice numbers within the batch
    const nums = validRows.map((r) => r.invoiceNumber.trim());
    const dupSet = new Set<string>();
    for (const n of nums) {
      if (dupSet.has(n)) { setError(`Duplicate invoice number in batch: ${n}`); return; }
      dupSet.add(n);
    }

    setSaving(true);
    setError(null);
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
            invoices: validRows.map((r) => ({
              invoiceNumber: r.invoiceNumber.trim(),
              invoiceDate: r.invoiceDate,
              amount: r.amount,
            })),
          }),
        },
      );
      if (res.errors && res.errors.length > 0) {
        setError(`${res.created} created, ${res.errors.length} failed: ${res.errors.map((e) => `${e.invoiceNumber}: ${e.message}`).join(", ")}`);
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to record invoices";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl">
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
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
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
              </>
            )}
          </div>

          {/* Invoice Rows */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Invoices</label>
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
                        <input
                          ref={idx === rows.length - 1 ? lastInvRef : undefined}
                          type="text"
                          value={row.invoiceNumber}
                          onChange={(e) => handleInvoiceNumberChange(row.key, e.target.value)}
                          placeholder="Invoice #"
                          className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={row.invoiceDate}
                          onChange={(e) => updateRow(row.key, "invoiceDate", e.target.value)}
                          className="h-8 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus:border-primary"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          onChange={(e) => updateRow(row.key, "amount", e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-full rounded border border-border bg-background px-2 text-right text-[12px] tabular-nums outline-none focus:border-primary"
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

            {total > 0 && (
              <div className="mt-1 text-right text-[12px] tabular-nums font-semibold">
                Total: {fmtPeso(total)}
              </div>
            )}
          </div>

          {/* PO Reference + Notes (shared) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">PO Reference (shared)</label>
              <input type="text" value={poReference} onChange={(e) => setPoReference(e.target.value)}
                placeholder="e.g. PO-2024-0001"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (shared)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving || validRows.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving..." : `Record ${validRows.length} Invoice${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
