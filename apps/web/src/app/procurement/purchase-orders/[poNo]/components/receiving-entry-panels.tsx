"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";

/* ═══════════════════════════════════════════════════════
 * SERIAL ENTRY PANEL — inline in receiving grid for serialized items
 * ═══════════════════════════════════════════════════════ */

export function SerialEntryPanel({
  lineId,
  productId,
  requiredCount,
  serials,
  disabled,
  token,
  locationId,
  onUpdate,
}: {
  lineId: string;
  productId: string;
  requiredCount: number;
  serials: { serialNumber: string; dotCode?: string }[];
  disabled: boolean;
  token: string;
  locationId: string;
  onUpdate: (serials: { serialNumber: string; dotCode?: string }[]) => void;
}) {
  const [input, setInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isComplete = serials.length >= requiredCount;

  async function addSerial() {
    const sn = input.trim();
    if (!sn) return;

    // Check local duplicates
    if (serials.some((s) => s.serialNumber === sn)) {
      setError(`"${sn}" already entered`);
      return;
    }

    // Validate against DB
    setValidating(true);
    setError(null);
    try {
      const res = await apiFetch<{ exists: boolean; status: string | null }>(
        `/inventory/serials/validate?serialNumber=${encodeURIComponent(sn)}&productId=${productId}`,
        { token, locationId },
      );
      if (res.exists) {
        setError(`"${sn}" already exists in system (${res.status})`);
        setValidating(false);
        return;
      }
    } catch {
      // If validation fails, allow it — the server will catch duplicates on submit
    }
    setValidating(false);

    onUpdate([...serials, { serialNumber: sn }]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  function removeSerial(index: number) {
    onUpdate(serials.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Serial Numbers
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          isComplete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}>
          {serials.length} / {requiredCount}
        </span>
      </div>

      {!isComplete && (
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSerial(); } }}
            disabled={disabled || isComplete}
            placeholder="Scan or type serial number..."
            className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
            autoFocus
          />
          <button
            type="button"
            onClick={addSerial}
            disabled={disabled || !input.trim() || validating}
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {validating ? "..." : "Add"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[10px] text-destructive">{error}</p>
      )}

      {serials.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {serials.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-2 py-0.5 text-xs">
              <span className="font-mono text-foreground">{s.serialNumber}</span>
              <button
                type="button"
                onClick={() => removeSerial(i)}
                disabled={disabled}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * DOT BATCH ENTRY PANEL — for tire products during receiving
 * ═══════════════════════════════════════════════════════ */

export function DotBatchEntryPanel({
  requiredCount,
  batches,
  disabled,
  onUpdate,
}: {
  requiredCount: number;
  batches: { dotCode: string; quantity: number }[];
  disabled: boolean;
  onUpdate: (batches: { dotCode: string; quantity: number }[]) => void;
}) {
  const [dotInput, setDotInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allocated = batches.reduce((s, b) => s + b.quantity, 0);
  const remaining = requiredCount - allocated;
  const isComplete = remaining <= 0;

  function parseDotLocal(code: string) {
    const digits = code.replace(/[^0-9]/g, "").slice(-4);
    if (!/^\d{4}$/.test(digits)) return null;
    const wk = parseInt(digits.slice(0, 2), 10);
    const yr = 2000 + parseInt(digits.slice(2, 4), 10);
    if (wk < 1 || wk > 53) return null;
    const now = new Date();
    const ageMonths = Math.max(0, (now.getFullYear() - yr) * 12 + now.getMonth() - (wk <= 26 ? 5 : 11));
    const expired = ageMonths >= 72;
    const warning = ageMonths >= 60;
    const dateStr = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Math.floor((wk - 1) / 4.33)]} ${yr}`;
    return { digits, wk, yr, ageMonths, expired, warning, dateStr };
  }

  function addBatch() {
    const code = dotInput.trim();
    const qty = parseInt(qtyInput, 10);
    if (!code) { setError("Enter a DOT code"); return; }
    if (!qty || qty < 1) { setError("Quantity must be at least 1"); return; }
    if (qty > remaining) { setError(`Only ${remaining} units remaining`); return; }

    const parsed = parseDotLocal(code);
    if (!parsed) { setError("Invalid DOT code — need 4 digits (WWYY)"); return; }
    if (parsed.expired) { setError(`DOT ${parsed.digits} is expired (${(parsed.ageMonths / 12).toFixed(1)} years old). Cannot receive.`); return; }

    onUpdate([...batches, { dotCode: code, quantity: qty }]);
    setDotInput("");
    setQtyInput("");
    setError(null);
  }

  function removeBatch(index: number) {
    onUpdate(batches.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          🛞 DOT Batches
        </span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          isComplete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}>
          {allocated} / {requiredCount} units
        </span>
      </div>

      {!isComplete && (
        <div className="flex gap-1.5 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground">DOT Code</label>
            <input
              type="text"
              value={dotInput}
              onChange={(e) => { setDotInput(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBatch(); } }}
              disabled={disabled}
              placeholder="e.g. DOT 1K2 2FYC8B 2825"
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              autoFocus
            />
          </div>
          <div className="w-16">
            <label className="text-[10px] text-muted-foreground">Qty</label>
            <input
              type="number"
              min={1}
              max={remaining}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBatch(); } }}
              disabled={disabled}
              className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-xs text-right outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            onClick={addBatch}
            disabled={disabled || !dotInput.trim() || !qtyInput}
            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}

      {batches.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {batches.map((b, i) => {
            const parsed = parseDotLocal(b.dotCode);
            return (
              <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-2 py-0.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-foreground">{b.dotCode}</span>
                  <span className="text-muted-foreground">×{b.quantity}</span>
                  {parsed && (
                    <span className={`text-[10px] ${parsed.warning ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                      {parsed.dateStr} ({(parsed.ageMonths / 12).toFixed(1)}y)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeBatch(i)}
                  disabled={disabled}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
