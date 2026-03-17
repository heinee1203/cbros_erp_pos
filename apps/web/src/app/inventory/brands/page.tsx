"use client";

import { useState, useMemo, useCallback } from "react";
import { Tag, Search, ArrowUpDown, Plus, Hash, X, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand, type Brand } from "@/hooks/use-brands";

type SortKey = "name" | "productCount";
type SortDir = "asc" | "desc";
type ModalMode = "create" | "edit" | null;

export default function BrandsPage() {
  const { token, locationId } = useAuth();
  const brandsQuery = useBrands(token, locationId);
  const brands = brandsQuery.data?.data ?? [];

  const createMut = useCreateBrand(token, locationId);
  const updateMut = useUpdateBrand(token, locationId);
  const deleteMut = useDeleteBrand(token, locationId);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editBrand, setEditBrand] = useState<Brand | null>(null);
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  const filtered = useMemo(() => {
    let result = brands;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((b) => b.name.toLowerCase().includes(q) || b.slug.includes(q));
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [brands, search, sortKey, sortDir]);

  const totalProducts = brands.reduce((sum, b) => sum + (b.productCount ?? 0), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditBrand(null);
    setFormName("");
    setFormError("");
  }, []);

  const openEdit = useCallback((b: Brand) => {
    setModalMode("edit");
    setEditBrand(b);
    setFormName(b.name);
    setFormError("");
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setEditBrand(null);
    setFormName("");
    setFormError("");
  }, []);

  const slug = formName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSubmit = useCallback(async () => {
    const name = formName.trim();
    if (!name) { setFormError("Name is required"); return; }
    const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    setFormError("");

    try {
      if (modalMode === "create") {
        await createMut.mutateAsync({ name, slug: s });
      } else if (modalMode === "edit" && editBrand) {
        await updateMut.mutateAsync({ id: editBrand.id, name, slug: s });
      }
      closeModal();
    } catch (err: any) {
      setFormError(err?.message ?? "Something went wrong");
    }
  }, [formName, modalMode, editBrand, createMut, updateMut, closeModal]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const isPending = createMut.isPending || updateMut.isPending;

  if (brandsQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Tag size={16} className="text-primary" /></div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Brands</h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Manage product brands and manufacturers.</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Tag size={16} className="text-primary" /></div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Brands</h1>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Manage product brands and manufacturers.</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} />Add Brand
          </button>
        </div>
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Tag size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Brands</span><span className="font-semibold tabular-nums text-foreground">{brands.length}</span></div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Total Items</span><span className="font-semibold tabular-nums text-foreground">{totalProducts.toLocaleString()}</span></div>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brands by name..." className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]" style={{ paddingLeft: "2.125rem" }} />
        </div>
        <button onClick={() => toggleSort("name")} className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors", sortKey === "name" ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <ArrowUpDown size={12} />Name{sortKey === "name" && <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "A-Z" : "Z-A"}</span>}
        </button>
        <button onClick={() => toggleSort("productCount")} className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors", sortKey === "productCount" ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <ArrowUpDown size={12} />Items{sortKey === "productCount" && <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "Low" : "High"}</span>}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Brand</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items</div>
          <div className="w-20" />
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Search size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No brands found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{search ? "Try adjusting your search query" : "Create your first brand to get started"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((b) => (
              <div key={b.id} className="group flex w-full items-center px-4 py-3 transition-colors duration-100 hover:bg-accent/60">
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 transition-colors group-hover:bg-muted"><Tag size={14} className="text-muted-foreground" /></div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-tight text-foreground truncate">{b.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] leading-tight text-muted-foreground truncate">{b.slug}</div>
                  </div>
                </div>
                <div className="w-28 text-right"><span className="inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-foreground">{b.productCount}</span></div>
                <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(b)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit brand">
                    <Pencil size={13} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(b)}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    title={b.productCount > 0 ? `Cannot delete — ${b.productCount} products assigned` : "Delete brand"}
                    disabled={b.productCount > 0}
                  >
                    <Trash2 size={13} className={b.productCount > 0 ? "text-muted-foreground/30" : "text-red-500"} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Showing {filtered.length} of {brands.length} brands</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{totalProducts.toLocaleString()} items</span>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-foreground">
                {modalMode === "create" ? "Create Brand" : "Edit Brand"}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-md hover:bg-muted"><X size={16} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-muted-foreground mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="e.g. Bosch"
                  autoFocus
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
              </div>
              {slug && (
                <div>
                  <label className="block text-[12px] font-medium text-muted-foreground mb-1">Slug (auto-generated)</label>
                  <div className="h-9 flex items-center rounded-lg border border-border bg-muted/40 px-3 text-[13px] font-mono text-muted-foreground">{slug}</div>
                </div>
              )}
              {formError && <p className="text-[12px] text-red-500">{formError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeModal} className="rounded-lg border border-border bg-background px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || !formName.trim()}
                className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isPending ? "Saving..." : modalMode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Delete Brand</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              Delete brand &quot;{deleteTarget.name}&quot;? Products will be unlinked but not deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-border bg-background px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {deleteMut.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
