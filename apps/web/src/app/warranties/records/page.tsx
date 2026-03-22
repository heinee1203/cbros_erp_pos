"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useWarrantyRecords } from "@/hooks/use-warranties";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success",
  EXPIRED: "bg-muted text-muted-foreground",
  CLAIMED: "bg-warning/10 text-warning",
  VOIDED: "bg-destructive/10 text-destructive",
};

const EXPIRY_FILTERS = [
  { key: "", label: "All" },
  { key: "7", label: "Expiring in 7 days" },
  { key: "30", label: "Expiring in 30 days" },
  { key: "90", label: "Expiring in 90 days" },
];

export default function WarrantyRecordsPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("");
  const [expiringDays, setExpiringDays] = useState("");

  const opts: Record<string, string> = { limit: "50" };
  if (status) opts.status = status;
  if (expiringDays) opts.expiringWithinDays = expiringDays;

  const { data, isLoading } = useWarrantyRecords(token, locationId, opts);
  const records = data?.data ?? [];

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Active Warranties</h2>
        <p className="text-sm text-muted-foreground">All warranty records from completed sales</p>
      </div>

      {/* Filters */}
      <div className="mb-3 flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="CLAIMED">Claimed</option>
          <option value="VOIDED">Voided</option>
        </select>
        <select value={expiringDays} onChange={(e) => setExpiringDays(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
          {EXPIRY_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Serial</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Purchased</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expires</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {expiringDays ? "No warranties expiring in this period" : "No warranty records yet"}
              </td></tr>
            ) : records.map((r, i) => {
              const daysLeft = Math.ceil((new Date(r.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return (
                <tr key={r.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.productName}</div>
                    {r.sku && <div className="text-[10px] text-muted-foreground font-mono">{r.sku}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.serialNumber || "—"}</td>
                  <td className="px-3 py-2 text-sm">{r.customerName || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.purchaseDate).toLocaleDateString("en-PH")}</td>
                  <td className="px-3 py-2 text-xs">
                    {new Date(r.expiryDate).toLocaleDateString("en-PH")}
                    {r.status === "ACTIVE" && daysLeft > 0 && (
                      <span className={`ml-1 text-[10px] ${daysLeft <= 30 ? "text-warning font-medium" : "text-muted-foreground"}`}>
                        ({daysLeft}d)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.warrantyType.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status] ?? "bg-muted text-muted-foreground"}`}>
                      {r.status}
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
