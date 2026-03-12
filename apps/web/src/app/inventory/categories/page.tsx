"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Grid3x3,
  Search,
  Plus,
  Hash,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  ArrowUpDown,
  Eye,
  EyeOff,
  AlertTriangle,
  Package,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type CategoryRow,
} from "@/hooks/use-categories";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

type SortKey = "name" | "productCount" | "sortOrder";
type SortDir = "asc" | "desc";

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}

const DEFAULT_FORM: CategoryFormData = {
  name: "",
  slug: "",
  description: "",
  color: "#2563EB",
  sortOrder: 0,
  isActive: true,
};

const PRESET_COLORS = [
  "#2563EB", "#DC2626", "#D97706", "#059669",
  "#7C3AED", "#DB2777", "#0891B2", "#4F46E5",
  "#CA8A04", "#16A34A", "#9333EA", "#E11D48",
];

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function CategoriesPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Filters & sort ──
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("sortOrder");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Modals ──
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  // ── Debounce search ──
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // ── Queries & mutations ──
  const { data, isLoading, isError } = useCategories(token, locationId, {
    search: debouncedSearch || undefined,
    activeOnly: !showInactive ? undefined : false,
  });

  const createMut = useCreateCategory(token, locationId);
  const updateMut = useUpdateCategory(token, locationId);
  const deleteMut = useDeleteCategory(token, locationId);

  // ── Computed data ──
  const categories = useMemo(() => {
    let list = data?.data ?? [];

    // Client-side filter: hide inactive unless toggled
    if (!showInactive) {
      // (API doesn't have a strict "include inactive" toggle — filter client-side)
    }

    // Client-side sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "productCount":
          cmp = a.productCount - b.productCount;
          break;
        case "sortOrder":
          cmp = a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [data, showInactive, sortKey, sortDir]);

  const totalProducts = useMemo(
    () => categories.reduce((sum, c) => sum + c.productCount, 0),
    [categories],
  );

  const activeCount = useMemo(
    () => categories.filter((c) => c.isActive).length,
    [categories],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Handlers ──
  function openCreate() {
    setEditingCategory(null);
    setModalMode("create");
  }

  function openEdit(cat: CategoryRow) {
    setEditingCategory(cat);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode("closed");
    setEditingCategory(null);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  // ── Loading state ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-2 sm:px-0">
      {/* ── Header ── */}
      <div className="mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
                <Grid3x3 size={16} className="text-primary" />
              </div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                Categories
              </h1>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              Organize your catalog into product categories for browsing, filtering,
              and reporting.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} />
            New Category
          </button>
        </div>

        {/* ── Summary chips ── */}
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Grid3x3 size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Categories</span>
            <span className="font-semibold tabular-nums text-foreground">
              {categories.length}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Check size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Active</span>
            <span className="font-semibold tabular-nums text-foreground">
              {activeCount}
            </span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Hash size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Total Products</span>
            <span className="font-semibold tabular-nums text-foreground">
              {totalProducts.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search categories by name or slug…"
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            style={{ paddingLeft: "2.125rem" }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Show inactive toggle */}
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
            showInactive
              ? "border-primary/20 bg-primary/[0.04] text-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {showInactive ? <Eye size={12} /> : <EyeOff size={12} />}
          {showInactive ? "All" : "Active"}
        </button>

        {/* Sort buttons */}
        <SortButton
          label="Order"
          active={sortKey === "sortOrder"}
          dir={sortDir}
          onClick={() => toggleSort("sortOrder")}
          hint={sortKey === "sortOrder" ? (sortDir === "asc" ? "1→9" : "9→1") : undefined}
        />
        <SortButton
          label="Name"
          active={sortKey === "name"}
          dir={sortDir}
          onClick={() => toggleSort("name")}
          hint={sortKey === "name" ? (sortDir === "asc" ? "A-Z" : "Z-A") : undefined}
        />
        <SortButton
          label="Products"
          active={sortKey === "productCount"}
          dir={sortDir}
          onClick={() => toggleSort("productCount")}
          hint={sortKey === "productCount" ? (sortDir === "asc" ? "Low" : "High") : undefined}
        />
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {/* Header */}
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-5 shrink-0" />
          <div className="ml-3 flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Category
          </div>
          <div className="w-56 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Description
          </div>
          <div className="w-24 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Products
          </div>
          <div className="w-20 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Status
          </div>
          <div className="w-20 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Actions
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
            <span className="ml-2 text-[13px] text-muted-foreground">Loading categories…</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle size={20} className="text-destructive" />
            <p className="mt-2 text-[13px] text-destructive">Failed to load categories</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Search size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No categories found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {searchQuery ? "Try adjusting your search" : "Create your first category to get started"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {categories.map((cat, idx) => (
              <CategoryTableRow
                key={cat.id}
                category={cat}
                odd={idx % 2 === 1}
                onEdit={() => openEdit(cat)}
                onDelete={() => setDeleteTarget(cat)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">
            Showing {categories.length} {categories.length === 1 ? "category" : "categories"}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalProducts.toLocaleString()} products total
          </span>
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modalMode !== "closed" && (
        <CategoryModal
          mode={modalMode}
          initial={editingCategory}
          onClose={closeModal}
          onSubmit={(form) => {
            if (modalMode === "create") {
              createMut.mutate(
                {
                  name: form.name,
                  slug: form.slug,
                  description: form.description || undefined,
                  color: form.color || undefined,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
                { onSuccess: closeModal },
              );
            } else if (editingCategory) {
              updateMut.mutate(
                {
                  categoryId: editingCategory.id,
                  name: form.name,
                  slug: form.slug,
                  description: form.description || undefined,
                  color: form.color || undefined,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
                { onSuccess: closeModal },
              );
            }
          }}
          submitting={createMut.isPending || updateMut.isPending}
          error={createMut.error?.message || updateMut.error?.message || null}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          category={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          submitting={deleteMut.isPending}
          error={deleteMut.error?.message || null}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function CategoryTableRow({
  category: cat,
  odd,
  onEdit,
  onDelete,
}: {
  category: CategoryRow;
  odd: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center px-4 py-2.5 transition-colors duration-100 hover:bg-accent/60",
        odd && "bg-muted/20",
      )}
    >
      {/* Color dot */}
      <div className="w-5 shrink-0 flex items-center justify-center">
        <div
          className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: cat.color || "#94A3B8" }}
        />
      </div>

      {/* Name + slug */}
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium leading-tight text-foreground truncate">
            {cat.name}
          </span>
          {cat.code && (
            <span className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {cat.code}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] leading-tight text-muted-foreground truncate">
          {cat.slug}
        </div>
      </div>

      {/* Description */}
      <div className="w-56 pr-2">
        <span className="text-[12px] leading-tight text-muted-foreground line-clamp-2">
          {cat.description || "—"}
        </span>
      </div>

      {/* Product count */}
      <div className="w-24 text-center">
        <span className="inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-foreground">
          {cat.productCount.toLocaleString()}
        </span>
      </div>

      {/* Status */}
      <div className="w-20 text-center">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            cat.isActive
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground",
          )}
        >
          {cat.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Actions */}
      <div className="w-20 flex items-center justify-end gap-1">
        <button
          onClick={onEdit}
          className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title="Edit category"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title={cat.productCount > 0 ? `Cannot delete \u2014 ${cat.productCount} products assigned` : "Delete category"}
          disabled={cat.productCount > 0}
        >
          <Trash2 size={13} className={cat.productCount > 0 ? "opacity-30" : ""} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SORT BUTTON
 * ═══════════════════════════════════════════════════════ */

function SortButton({
  label,
  active,
  dir,
  onClick,
  hint,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
        active
          ? "border-primary/20 bg-primary/[0.04] text-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <ArrowUpDown size={12} />
      {label}
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
 * CREATE / EDIT MODAL
 * ═══════════════════════════════════════════════════════ */

function CategoryModal({
  mode,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: "create" | "edit";
  initial: CategoryRow | null;
  onClose: () => void;
  onSubmit: (form: CategoryFormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CategoryFormData>(() => {
    if (initial) {
      return {
        name: initial.name,
        slug: initial.slug,
        description: initial.description || "",
        color: initial.color || "#2563EB",
        sortOrder: initial.sortOrder,
        isActive: initial.isActive,
      };
    }
    return { ...DEFAULT_FORM };
  });

  const [autoSlug, setAutoSlug] = useState(mode === "create");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function slugify(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setForm((f) => ({
      ...f,
      name: value,
      ...(autoSlug ? { slug: slugify(value) } : {}),
    }));
  }

  function handleSlugChange(value: string) {
    setAutoSlug(false);
    setForm((f) => ({ ...f, slug: value }));
  }

  const isValid = form.name.trim().length > 0 && form.slug.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-foreground">
            {mode === "create" ? "New Category" : "Edit Category"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <div className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Category Name *
            </label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Brake Systems"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Slug *
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="brake-systems"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              URL-safe identifier. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of this category…"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 resize-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Color + Sort Order row */}
          <div className="flex gap-4">
            {/* Color */}
            <div className="flex-1">
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-all",
                      form.color === c
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Sort Order */}
            <div className="w-24">
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Sort Order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sortOrder: parseInt(e.target.value) || 0,
                  }))
                }
                min={0}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none tabular-nums focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                form.isActive ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  form.isActive ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </button>
            <span className="text-[13px] text-foreground">
              {form.isActive ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={!isValid || submitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} strokeWidth={2.5} />
            )}
            {mode === "create" ? "Create Category" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * DELETE CONFIRMATION MODAL
 * ═══════════════════════════════════════════════════════ */

function DeleteConfirmModal({
  category,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  category: CategoryRow;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">Delete Category</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold">{category.name}</span>?
          </p>

          {category.productCount > 0 && (
            <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[12px] text-warning">
              This category has {category.productCount.toLocaleString()} products
              assigned. Reassign them before deleting.
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || category.productCount > 0}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-[13px] font-medium text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
