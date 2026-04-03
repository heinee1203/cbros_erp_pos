"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Printer,
  Plus,
  Trash2,
  Edit,
  Wifi,
  WifiOff,
  Star,
  TestTube,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PrinterRow {
  id: string;
  name: string;
  printerType: "zpl" | "escpos";
  connectionType: "tcp" | "bluetooth" | "usb";
  ipAddress: string | null;
  port: number | null;
  bluetoothMac: string | null;
  labelWidthMm: string;
  labelHeightMm: string;
  dpmm: number;
  darkness: number | null;
  speed: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const EMPTY_FORM = {
  name: "",
  connectionType: "tcp" as "tcp" | "bluetooth" | "usb",
  printerType: "zpl" as "zpl" | "escpos",
  ipAddress: "",
  port: 9100,
  bluetoothMac: "",
  labelWidthMm: "50",
  labelHeightMm: "30",
  dpmm: 8,
  darkness: 15,
  speed: 4,
  isDefault: false,
};

export default function PrintersSettingsPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, "sending" | "ok" | "fail">>({});

  const fetchPrinters = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PrinterRow[] }>("/printing/printers", {
        token,
        locationId,
      });
      setPrinters(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading) fetchPrinters();
  }, [authLoading, fetchPrinters]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  };

  const openEdit = (p: PrinterRow) => {
    setForm({
      name: p.name,
      connectionType: p.connectionType,
      printerType: p.printerType,
      ipAddress: p.ipAddress || "",
      port: p.port || 9100,
      bluetoothMac: p.bluetoothMac || "",
      labelWidthMm: p.labelWidthMm,
      labelHeightMm: p.labelHeightMm,
      dpmm: p.dpmm,
      darkness: p.darkness ?? 15,
      speed: p.speed ?? 4,
      isDefault: p.isDefault,
    });
    setEditId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!token || !locationId || !form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await apiFetch(`/printing/printers/${editId}`, {
          token,
          locationId,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/printing/printers", {
          token,
          locationId,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setShowForm(false);
      fetchPrinters();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this printer?")) return;
    await apiFetch(`/printing/printers/${id}`, {
      token: token!,
      locationId: locationId!,
      method: "DELETE",
    });
    fetchPrinters();
  };

  const handleTestPrint = async (p: PrinterRow) => {
    if (!p.ipAddress) return;
    setTestStatus((s) => ({ ...s, [p.id]: "sending" }));
    try {
      await apiFetch("/printing/zpl/test", {
        token: token!,
        locationId: locationId!,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerIp: p.ipAddress, port: p.port || 9100 }),
      });
      setTestStatus((s) => ({ ...s, [p.id]: "ok" }));
    } catch {
      setTestStatus((s) => ({ ...s, [p.id]: "fail" }));
    }
    setTimeout(() => setTestStatus((s) => { const n = { ...s }; delete n[p.id]; return n; }), 4000);
  };

  const handleSetDefault = async (id: string) => {
    await apiFetch(`/printing/printers/${id}`, {
      token: token!,
      locationId: locationId!,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    fetchPrinters();
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading printers…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Label Printers</h2>
          <p className="text-[12px] text-muted-foreground">
            Configure thermal label printers for barcode and price tag printing
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Plus size={15} /> Add Printer
        </button>
      </div>

      {/* Printer List */}
      {printers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <Printer size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No printers configured</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">
            Add a thermal printer to start printing barcode labels
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {printers.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-4 rounded-xl border bg-background px-5 py-4 transition-all",
                p.isDefault ? "border-primary/30 ring-1 ring-primary/10" : "border-border",
              )}
            >
              <div className="shrink-0 rounded-lg bg-muted p-2.5">
                <Printer size={20} className="text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-foreground">{p.name}</p>
                  {p.isDefault && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {p.connectionType === "tcp" ? <Wifi size={11} /> : <WifiOff size={11} />}
                    {p.connectionType.toUpperCase()}
                  </span>
                  {p.ipAddress && <span className="font-mono">{p.ipAddress}:{p.port}</span>}
                  {p.bluetoothMac && <span className="font-mono">{p.bluetoothMac}</span>}
                  <span>{p.labelWidthMm}×{p.labelHeightMm}mm</span>
                  <span>{p.dpmm === 8 ? "203" : p.dpmm === 12 ? "300" : p.dpmm} DPI</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {p.connectionType === "tcp" && p.ipAddress && (
                  <button
                    onClick={() => handleTestPrint(p)}
                    disabled={testStatus[p.id] === "sending"}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all",
                      testStatus[p.id] === "ok" && "bg-emerald-50 text-emerald-700",
                      testStatus[p.id] === "fail" && "bg-red-50 text-red-700",
                      !testStatus[p.id] && "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {testStatus[p.id] === "sending" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : testStatus[p.id] === "ok" ? (
                      <Check size={12} />
                    ) : testStatus[p.id] === "fail" ? (
                      <X size={12} />
                    ) : (
                      <TestTube size={12} />
                    )}
                    {testStatus[p.id] === "ok" ? "Sent!" : testStatus[p.id] === "fail" ? "Failed" : "Test"}
                  </button>
                )}
                {!p.isDefault && (
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Set as default"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[15px] font-semibold text-foreground">
                {editId ? "Edit Printer" : "Add Printer"}
              </h3>
              <button onClick={() => setShowForm(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Printer Name
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Zebra ZD230 — Counter"
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {/* Connection Type */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Connection
                </label>
                <div className="flex gap-1.5">
                  {(["tcp", "bluetooth", "usb"] as const).map((ct) => (
                    <button
                      key={ct}
                      onClick={() => setForm({ ...form, connectionType: ct })}
                      className={cn(
                        "flex-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-center transition-all",
                        form.connectionType === ct
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {ct === "tcp" ? "Network (TCP)" : ct === "bluetooth" ? "Bluetooth" : "USB"}
                    </button>
                  ))}
                </div>
              </div>

              {/* TCP fields */}
              {form.connectionType === "tcp" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      IP Address
                    </label>
                    <input
                      value={form.ipAddress}
                      onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                      placeholder="192.168.1.100"
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                  <div className="w-24">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 9100 })}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>
              )}

              {/* Bluetooth MAC */}
              {form.connectionType === "bluetooth" && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Bluetooth MAC Address
                  </label>
                  <input
                    value={form.bluetoothMac}
                    onChange={(e) => setForm({ ...form, bluetoothMac: e.target.value })}
                    placeholder="AC:3F:A4:12:34:56"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-mono outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              )}

              {/* Label Size */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Label Width (mm)
                  </label>
                  <input
                    type="number"
                    value={form.labelWidthMm}
                    onChange={(e) => setForm({ ...form, labelWidthMm: e.target.value })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Label Height (mm)
                  </label>
                  <input
                    type="number"
                    value={form.labelHeightMm}
                    onChange={(e) => setForm({ ...form, labelHeightMm: e.target.value })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    DPI
                  </label>
                  <select
                    value={form.dpmm}
                    onChange={(e) => setForm({ ...form, dpmm: parseInt(e.target.value, 10) })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-[13px] outline-none focus:border-primary/40"
                  >
                    <option value={8}>203</option>
                    <option value={12}>300</option>
                  </select>
                </div>
              </div>

              {/* Advanced: Darkness + Speed */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Darkness (0-30)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={form.darkness}
                    onChange={(e) => setForm({ ...form, darkness: parseInt(e.target.value, 10) || 15 })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Speed (2-14)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={14}
                    value={form.speed}
                    onChange={(e) => setForm({ ...form, speed: parseInt(e.target.value, 10) || 4 })}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              {/* Default */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-[13px] text-foreground">Set as default printer for this location</span>
              </label>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editId ? "Update" : "Add Printer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
