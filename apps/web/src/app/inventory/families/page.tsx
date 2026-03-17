"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Layers, Search, ArrowUpDown, Plus, Hash, Tag, X, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useProductFamilies, type ProductFamily } from "@/hooks/use-products";
import { useCreateFamily, useUpdateFamily, useDeleteFamily } from "@/hooks/use-families";

type SortKey = "name" | "productCount";
type SortDir = "asc" | "desc";
type ModalMode = "create" | "edit" | null;

export default function FamiliesPage() {
  const { token, locationId } = useAuth();
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];

  const createMut = useCreateFamily(token, locationId);
  const updateMut = useUpdateFamily(token, locationId);
  const deleteMut = useDeleteFamily(token, locationId);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editFamily, setEditFamily] = useState<ProductFamily | null>(null);
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState("");

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ProductFamily | null>(null);

  const filtered = useMemo(() => {
    let result = families;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q) || f.slug.includes(q));
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [families, search, sortKey, sortDir]);

  const totalProducts = families.reduce((sum, f) => sum + (f.productCount ?? 0), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const openCreate = useCallback(() => {
    setModalMode("create");
    setEditFamily(null);
    setFormName("");
    setFormError("");
  }, []);

  const openEdit = useCallback((f: ProductFamily) => {
    setModalMode("edit");
    setEditFamily(f);
    setFormName(f.name);
    setFormError("");
  }, []);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setEditFamily(null);
    setFormName("");
    setFormError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    const name = formName.trim();
    if (!name) { setFormError("Name is required"); return; }
    setFormError("");

    try {
      if (modalMode === "create") {
        await createMut.mutateAsync({ name });
      } else if (modalMode === "edit" && editFamily) {
        await updateMut.mutateAsync({ id: editFamily.id, name });
      }
      closeModal();
    } catch (err: any) {
      setFormError(err?.message ?? "Something went wrong");
    }
  }, [formName, modalMode, editFamily, createMut, updateMut, closeModal]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  const slug = formName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const isPending = createMut.isPending || updateMut.isPending;

  if (familiesQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Layers size={16} className="text-primary" /></div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Item Families</h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Group related items by brand or product line for catalog organization.</p>
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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Layers size={16} className="text-primary" /></div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Item Families</h1>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Group related items by brand or product line for catalog organization.</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} />Create Family
          </button>
        </div>
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Layers size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Families</span><span className="font-semibold tabular-nums text-foreground">{families.length}</span></div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Total Items Grouped</span><span className="font-semibold tabular-nums text-foreground">{totalProducts}</span></div>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search families by name or slug..." className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]" style={{ paddingLeft: "2.125rem" }} />
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
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Family</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items</div>
          <div className="w-20" />
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Search size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No families found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try adjusting your search query</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((f) => (
              <div key={f.slug} className="group flex w-full items-center px-4 py-3 transition-colors duration-100 hover:bg-accent/60">
                <Link href={`/inventory/families/${f.slug}`} className="flex flex-1 items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 transition-colors group-hover:bg-muted"><Tag size={14} className="text-muted-foreground" /></div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-tight text-foreground truncate">{f.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] leading-tight text-muted-foreground truncate">{f.slug}</div>
                  </div>
                </Link>
                <div className="w-28 text-right"><span className="inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-foreground">{f.productCount}</span></div>
                <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.preventDefault(); openEdit(f); }} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit">
                    <Pencil size={13} className="text-muted-foreground" />
                  </button>
                  <button onClick={(e) => { e.preventDefault(); setDeleteTarget(f); }} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" title="Delete" disabled={f.productCount > 0}>
                    <Trash2 size={13} className={f.productCount > 0 ? "text-muted-foreground/30" : "text-red-500"} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Showing {filtered.length} of {families.length} families</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{totalProducts} items grouped</span>
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold text-foreground">
                {modalMode === "create" ? "Create Family" : "Edit Family"}
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
                  placeholder="e.g. Body Parts"
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

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[16px] font-semibold text-foreground mb-2">Delete Family</h2>
            <p className="text-[13px] text-muted-foreground mb-5">
              Delete family &quot;{deleteTarget.name}&quot;? Products will be unlinked but not deleted.
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
