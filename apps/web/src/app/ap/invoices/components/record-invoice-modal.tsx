"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Supplier {
  id: string;
  name: string;
}

const TERMS_MAP: Record<string, number> = {
  COD: 0, NET_7: 7, NET_15: 15, NET_30: 30, NET_45: 45, NET_60: 60,
  NET_90: 90, NET_120: 120, NET_150: 150, NET_180: 180,
};

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({
    supplierId: "",
    invoiceNo: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: "",
    paymentTerms: "NET_30",
    poReference: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  useEffect(() => {
    if (open && token && locationId) {
      setSupplierError(null);
      apiFetch<{ data: Supplier[] }>("/procurement/suppliers", {
        token,
        locationId,
      })
        .then((res) => setSuppliers(res.data))
        .catch(() => setSupplierError("Failed to load suppliers"));
    }
  }, [open, token, locationId]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.invoiceNo || !form.amount) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/ap/invoices", {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({
          supplierId: form.supplierId,
          invoiceNumber: form.invoiceNo,
          invoiceDate: form.invoiceDate,
          totalAmount: form.amount,
          paymentTermsDays: TERMS_MAP[form.paymentTerms] ?? 30,
          sourcePoId: form.poReference || undefined,
          notes: form.notes || undefined,
        }),
      });
      onCreated();
      onClose();
      setForm({
        supplierId: "",
        invoiceNo: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        amount: "",
        paymentTerms: "NET_30",
        poReference: "",
        notes: "",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to record invoice";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Record Supplier Invoice</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-muted"
          >
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Supplier *
            </label>
            {supplierError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {supplierError}
              </div>
            ) : (
              <select
                value={form.supplierId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierId: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Invoice # and Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invoice # *
              </label>
              <input
                type="text"
                value={form.invoiceNo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceNo: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Invoice Date *
              </label>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, invoiceDate: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {/* Amount and Payment Terms */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Payment Terms
              </label>
              <select
                value={form.paymentTerms}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentTerms: e.target.value }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="COD">COD</option>
                <option value="NET_7">Net 7</option>
                <option value="NET_15">Net 15</option>
                <option value="NET_30">Net 30</option>
                <option value="NET_45">Net 45</option>
                <option value="NET_60">Net 60</option>
              </select>
            </div>
          </div>

          {/* PO Reference */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              PO Reference
            </label>
            <input
              type="text"
              value={form.poReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, poReference: e.target.value }))
              }
              placeholder="e.g. PO-2024-0001"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Record Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
