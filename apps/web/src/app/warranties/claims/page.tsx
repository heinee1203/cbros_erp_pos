"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useWarrantyClaims, useResolveClaim } from "@/hooks/use-warranties";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  DENIED: "bg-destructive/10 text-destructive",
  COMPLETED: "bg-primary/10 text-primary",
};

const CLAIM_REASONS: Record<string, string> = {
  MANUFACTURING_DEFECT: "Manufacturing Defect",
  PREMATURE_WEAR: "Premature Wear",
  MATERIAL_FAILURE: "Material Failure",
  ROAD_HAZARD: "Road Hazard",
  ELECTRICAL_FAILURE: "Electrical Failure",
  OTHER: "Other",
};

const RESOLUTIONS = [
  { value: "FULL_REPLACEMENT", label: "Full Replacement" },
  { value: "PRORATED_REPLACEMENT", label: "Prorated Replacement" },
  { value: "REPAIR", label: "Repair" },
  { value: "CREDIT_NOTE", label: "Credit Note" },
  { value: "DENIED", label: "Denied" },
];

export default function WarrantyClaimsPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [statusFilter, setStatusFilter] = useState("");
  const [resolveModal, setResolveModal] = useState<string | null>(null);

  const opts: Record<string, string> = { limit: "50" };
  if (statusFilter) opts.status = statusFilter;

  const { data, isLoading } = useWarrantyClaims(token, locationId, opts);
  const resolveMut = useResolveClaim(token, locationId);
  const claims = data?.data ?? [];

  // Resolve form state
  const [decision, setDecision] = useState<"APPROVED" | "DENIED">("APPROVED");
  const [resolution, setResolution] = useState("FULL_REPLACEMENT");
  const [notes, setNotes] = useState("");

  const handleResolve = async () => {
    if (!resolveModal) return;
    await resolveMut.mutateAsync({
      id: resolveModal,
      status: decision,
      resolution: decision === "APPROVED" ? resolution : "DENIED",
      resolutionNotes: notes || undefined,
    });
    setResolveModal(null);
    setNotes("");
  };

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Warranty Claims</h2>
        <p className="text-sm text-muted-foreground">Track and resolve warranty claims</p>
      </div>

      <div className="mb-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="DENIED">Denied</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Claim #</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Product</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                No warranty claims {statusFilter ? `with status "${statusFilter}"` : "yet"}
              </td></tr>
            ) : claims.map((c, i) => (
              <tr key={c.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                <td className="px-3 py-2 font-mono text-sm font-semibold text-primary">{c.claimNumber}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.productName}</div>
                  {c.serialNumber && <div className="text-[10px] font-mono text-muted-foreground">{c.serialNumber}</div>}
                </td>
                <td className="px-3 py-2 text-sm">{c.customerName || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(c.claimDate).toLocaleDateString("en-PH")}</td>
                <td className="px-3 py-2 text-xs">{CLAIM_REASONS[c.claimReason] ?? c.claimReason}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[c.status] ?? "bg-muted text-muted-foreground"}`}>
                    {c.status}
                  </span>
                  {c.resolution && <span className="ml-1 text-[10px] text-muted-foreground">{c.resolution.replace(/_/g, " ")}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {c.status === "PENDING" && (
                    <button onClick={() => { setResolveModal(c.id); setDecision("APPROVED"); setResolution("FULL_REPLACEMENT"); setNotes(""); }}
                      className="text-xs font-medium text-primary hover:underline">
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setResolveModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">Resolve Warranty Claim</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Decision</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="radio" checked={decision === "APPROVED"} onChange={() => setDecision("APPROVED")} /> Approve
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="radio" checked={decision === "DENIED"} onChange={() => setDecision("DENIED")} /> Deny
                  </label>
                </div>
              </div>
              {decision === "APPROVED" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Resolution</label>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    {RESOLUTIONS.filter(r => r.value !== "DENIED").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Resolution notes…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setResolveModal(null)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleResolve} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
