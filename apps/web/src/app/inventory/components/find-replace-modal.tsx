"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  sku: string;
  oemNumber?: string | null;
}

export function FindReplaceModal({
  productIds,
  products,
  token,
  locationId,
  onClose,
  onApplied,
}: {
  productIds: string[];
  products: Product[];
  token: string;
  locationId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [fields, setFields] = useState<Set<string>>(new Set(["name"]));
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [applying, setApplying] = useState(false);

  const toggleField = (f: string) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  // Live preview — computed client-side from loaded products
  const preview = useMemo(() => {
    if (!find) return { affected: [], total: 0 };
    const affected: { id: string; field: string; before: string; after: string }[] = [];
    const flags = caseSensitive ? "g" : "gi";
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, flags);

    for (const p of products) {
      if (fields.has("name") && p.name && re.test(p.name)) {
        affected.push({ id: p.id, field: "name", before: p.name, after: p.name.replace(re, replace) });
      }
      if (fields.has("sku") && p.sku && re.test(p.sku)) {
        affected.push({ id: p.id, field: "sku", before: p.sku, after: p.sku.replace(re, replace) });
      }
      if (fields.has("oem") && p.oemNumber && re.test(p.oemNumber)) {
        affected.push({ id: p.id, field: "oem", before: p.oemNumber, after: p.oemNumber.replace(re, replace) });
      }
    }
    return { affected, total: new Set(affected.map((a) => a.id)).size };
  }, [find, replace, fields, caseSensitive, products]);

  const handleApply = async () => {
    if (!find || preview.total === 0) return;
    setApplying(true);
    try {
      await apiFetch("/products/bulk-find-replace", {
        token,
        locationId,
        method: "POST",
        body: {
          productIds,
          find,
          replace,
          fields: Array.from(fields),
          caseSensitive,
        },
      });
      onApplied();
    } catch (err: any) {
      alert("Error: " + (err.message || "Failed to apply"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-background shadow-xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Find & Replace</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Find / Replace inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Find</label>
              <input
                type="text"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Text to find..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Replace with</label>
              <input
                type="text"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="Replacement text..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Field selection + case sensitive */}
          <div className="flex items-center gap-4 text-[12px]">
            <span className="text-muted-foreground">Apply to:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={fields.has("name")} onChange={() => toggleField("name")} className="h-3.5 w-3.5 accent-primary" />
              Item Name
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={fields.has("sku")} onChange={() => toggleField("sku")} className="h-3.5 w-3.5 accent-primary" />
              SKU
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={fields.has("oem")} onChange={() => toggleField("oem")} className="h-3.5 w-3.5 accent-primary" />
              OEM
            </label>
            <div className="ml-auto">
              <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                Case sensitive
              </label>
            </div>
          </div>

          {/* Preview */}
          {find && (
            <div>
              <div className="mb-2 text-[12px] text-muted-foreground">
                {preview.total > 0
                  ? `${preview.total} of ${productIds.length} selected items will change`
                  : "No matches found in selected items"}
              </div>
              {preview.affected.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Before</th>
                        <th className="px-1 py-1.5 text-center text-muted-foreground">→</th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.affected.slice(0, 10).map((item, i) => (
                        <tr key={`${item.id}-${item.field}-${i}`} className="border-b border-border/50">
                          <td className="px-2 py-1.5 font-mono text-foreground">{item.before}</td>
                          <td className="px-1 py-1.5 text-center text-muted-foreground">→</td>
                          <td className="px-2 py-1.5 font-mono text-primary font-medium">{item.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.affected.length > 10 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground text-center">
                      Showing 10 of {preview.affected.length} changes...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!find || preview.total === 0 || applying}
            className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {applying ? "Applying..." : `Apply to ${preview.total} items`}
          </button>
        </div>
      </div>
    </div>
  );
}
