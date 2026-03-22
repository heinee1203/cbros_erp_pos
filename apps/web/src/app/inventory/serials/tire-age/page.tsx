"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

interface TireAgeItem {
  id: string;
  serialNumber: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  locationName: string | null;
  dotCode: string;
  manufactureWeek: number;
  manufactureYear: number;
  manufactureDate: string;
  ageMonths: number;
  ageStatus: "ok" | "warning" | "expired";
}

interface TireAgeSummary {
  total: number;
  ok: number;
  warning: number;
  expired: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: "bg-success/10", text: "text-success", label: "OK" },
  warning: { bg: "bg-warning/10", text: "text-warning", label: "Warning" },
  expired: { bg: "bg-destructive/10", text: "text-destructive", label: "Expired" },
};

function formatAge(months: number): string {
  const years = Math.floor(months / 12);
  const m = months % 12;
  if (years === 0) return `${m}mo`;
  return `${years}.${Math.round((m / 12) * 10)}yr`;
}

export default function TireAgeReportPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [summary, setSummary] = useState<TireAgeSummary>({ total: 0, ok: 0, warning: 0, expired: 0 });
  const [items, setItems] = useState<TireAgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiFetch<{ summary: TireAgeSummary; data: TireAgeItem[] }>(
        `/inventory/serials/tire-age-report?${params}`,
        { token, locationId },
      );
      setSummary(res.summary);
      setItems(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token, locationId, statusFilter]);

  useEffect(() => {
    if (!authLoading) fetchReport();
  }, [authLoading, fetchReport]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading tire age report…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Tire Age Report</h2>
        <p className="text-sm text-muted-foreground">DOT code tracking — identify aging tires in stock</p>
      </div>

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <SummaryCard label="Total Tires" value={summary.total} color="text-foreground" onClick={() => setStatusFilter("")} active={!statusFilter} />
        <SummaryCard label="OK (< 5yr)" value={summary.ok} color="text-success" onClick={() => setStatusFilter("ok")} active={statusFilter === "ok"} />
        <SummaryCard label="Warning (5-6yr)" value={summary.warning} color="text-warning" onClick={() => setStatusFilter("warning")} active={statusFilter === "warning"} />
        <SummaryCard label="Expired (> 6yr)" value={summary.expired} color="text-destructive" onClick={() => setStatusFilter("expired")} active={statusFilter === "expired"} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Serial</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">DOT</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manufactured</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Age</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {statusFilter ? `No tires with "${statusFilter}" status` : "No tires with DOT codes in stock"}
                </td>
              </tr>
            ) : items.map((item, i) => {
              const style = STATUS_STYLES[item.ageStatus];
              return (
                <tr key={item.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.productName}</div>
                    {item.brandName && <div className="text-[10px] text-muted-foreground">{item.brandName}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{item.serialNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">{item.dotCode}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {item.manufactureDate ? new Date(item.manufactureDate).toLocaleDateString("en-PH", { month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className={`px-3 py-2 text-xs font-semibold ${style.text}`}>
                    {formatAge(item.ageMonths)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{item.locationName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text}`}>
                      {item.ageStatus === "ok" ? "OK" : item.ageStatus === "warning" ? "⚠️ Old" : "🚫 Expired"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, onClick, active }: { label: string; value: number; color: string; onClick: () => void; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </button>
  );
}
