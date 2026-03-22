"use client";

import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useWarrantyPolicies, useCreatePolicy, useUpdatePolicy, type WarrantyPolicy } from "@/hooks/use-warranties";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";

const WARRANTY_TYPES = [
  { value: "FULL_REPLACEMENT", label: "Full Replacement" },
  { value: "PRORATED", label: "Prorated" },
  { value: "REPAIR_ONLY", label: "Repair Only" },
  { value: "EXCHANGE_ONLY", label: "Exchange Only" },
];

export default function WarrantyPoliciesPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const { data, isLoading } = useWarrantyPolicies(token, locationId);
  const createMut = useCreatePolicy(token, locationId);
  const updateMut = useUpdatePolicy(token, locationId);
  const brandsQuery = useBrands(token, locationId);
  const categoriesQuery = useCategories(token, locationId, {});

  const brands = brandsQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const policies = data?.data ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WarrantyPolicy | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"brand" | "category" | "product">("brand");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [durationKm, setDurationKm] = useState("");
  const [warrantyType, setWarrantyType] = useState("FULL_REPLACEMENT");
  const [proratedMonths, setProratedMonths] = useState("");
  const [coverage, setCoverage] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [requiresSerial, setRequiresSerial] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName(""); setScope("brand"); setBrandId(""); setCategoryId("");
    setDurationMonths("12"); setDurationKm(""); setWarrantyType("FULL_REPLACEMENT");
    setProratedMonths(""); setCoverage(""); setExclusions(""); setRequiresSerial(false);
    setShowModal(true);
  };

  const openEdit = (p: WarrantyPolicy) => {
    setEditing(p);
    setName(p.name);
    setScope(p.productId ? "product" : p.categoryId ? "category" : "brand");
    setBrandId(p.brandId ?? ""); setCategoryId(p.categoryId ?? "");
    setDurationMonths(String(p.durationMonths));
    setDurationKm(p.durationKm ? String(p.durationKm) : "");
    setWarrantyType(p.warrantyType);
    setProratedMonths(p.proratedFullMonths ? String(p.proratedFullMonths) : "");
    setCoverage(p.coverageDescription ?? ""); setExclusions(p.exclusions ?? "");
    setRequiresSerial(p.requiresSerial);
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload: any = {
      name,
      durationMonths: parseInt(durationMonths) || 12,
      durationKm: durationKm ? parseInt(durationKm) : null,
      warrantyType,
      proratedFullMonths: proratedMonths ? parseInt(proratedMonths) : null,
      coverageDescription: coverage || null,
      exclusions: exclusions || null,
      requiresSerial,
      brandId: scope === "brand" ? brandId || null : null,
      categoryId: scope === "category" ? categoryId || null : null,
      productId: null,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    setShowModal(false);
  };

  const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Warranty Policies</h2>
          <p className="text-sm text-muted-foreground">Define warranty terms for brands, categories, or specific products</p>
        </div>
        <button onClick={openCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 inline h-4 w-4" /> New Policy
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Policy Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scope</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">No warranty policies yet. Click "New Policy" to create one.</td></tr>
            ) : policies.map((p, i) => (
              <tr key={p.id} className={`border-b border-border transition-colors hover:bg-accent ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.productId ? "Product" : p.categoryId ? "Category" : p.brandId ? "Brand" : "—"}
                </td>
                <td className="px-3 py-2">
                  {p.durationMonths} months{p.durationKm ? ` / ${p.durationKm.toLocaleString()} km` : ""}
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {p.warrantyType.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => openEdit(p)} className="text-xs font-medium text-primary hover:underline">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold">{editing ? "Edit Policy" : "New Warranty Policy"}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Policy Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Bridgestone Tire Standard Warranty" className={fieldClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Scope</label>
                  <select value={scope} onChange={(e) => setScope(e.target.value as any)} className={fieldClass}>
                    <option value="brand">Brand</option>
                    <option value="category">Category</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{scope === "brand" ? "Brand" : "Category"}</label>
                  {scope === "brand" ? (
                    <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={fieldClass}>
                      <option value="">Select brand…</option>
                      {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  ) : (
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
                      <option value="">Select category…</option>
                      {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration (months) *</label>
                  <input type="number" min="1" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Mileage Limit (km)</label>
                  <input type="number" min="0" value={durationKm} onChange={(e) => setDurationKm(e.target.value)} placeholder="Optional" className={fieldClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
                  <select value={warrantyType} onChange={(e) => setWarrantyType(e.target.value)} className={fieldClass}>
                    {WARRANTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              {warrantyType === "PRORATED" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Full Replacement Period (months)</label>
                  <input type="number" min="1" value={proratedMonths} onChange={(e) => setProratedMonths(e.target.value)} placeholder="e.g., 12" className={fieldClass} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Full replacement before proration begins</p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Coverage Description</label>
                <textarea value={coverage} onChange={(e) => setCoverage(e.target.value)} rows={2} placeholder="What's covered…" className={fieldClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Exclusions</label>
                <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={2} placeholder="What's NOT covered…" className={fieldClass} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requiresSerial} onChange={(e) => setRequiresSerial(e.target.checked)} />
                Requires serial number for claims
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSave} disabled={!name || !durationMonths} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {editing ? "Update" : "Create"} Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
