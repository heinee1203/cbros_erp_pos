"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Layers, Search, Pencil, Trash2, Package, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useConfirm } from "@/components/confirm-dialog";
import { useFamilyDetail, useFamilyProducts, useUpdateFamily, useDeleteFamily } from "@/hooks/use-families";

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function formatPrice(price: string | number): string {
  return parseFloat(String(price)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ─────────────────────────────────────────────
 * Skeleton Row
 * ───────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <div className="flex items-center px-4 py-3 gap-4">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="w-28 flex justify-end">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="w-28 flex justify-end">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="w-20 flex justify-end">
        <div className="h-3 w-10 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Page Component
 * ───────────────────────────────────────────── */

export default function FamilyDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const { token, locationId } = useAuth();
  const confirm = useConfirm();

  // ── Data queries ──
  const detailQuery = useFamilyDetail(token, locationId, slug);
  const family = detailQuery.data;

  const [search, setSearch] = useState("");
  const productsQuery = useFamilyProducts(token, locationId, slug, search);
  const products = productsQuery.data?.data ?? [];

  // ── Mutations ──
  const updateMutation = useUpdateFamily(token, locationId);
  const deleteMutation = useDeleteFamily(token, locationId);

  // ── Inline edit state ──
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // ── Handlers ──
  const handleEdit = useCallback(() => {
    if (!family) return;
    setEditName(family.name);
    setEditing(true);
  }, [family]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditName("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!family || !editName.trim()) return;
    try {
      const result = await updateMutation.mutateAsync({
        id: family.id,
        name: editName.trim(),
      });
      setEditing(false);
      // Navigate to new slug if it changed
      if (result.slug && result.slug !== slug) {
        router.replace(`/inventory/families/${result.slug}`);
      }
    } catch {
      // mutation error is surfaced via updateMutation.error
    }
  }, [family, editName, updateMutation, slug, router]);

  const handleDelete = useCallback(async () => {
    if (!family) return;
    const confirmed = await confirm({
      title: "Delete Family",
      message: `Delete family "${family.name}"? Products will be unlinked but not deleted.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(family.id);
      router.push("/inventory/families");
    } catch {
      // mutation error is surfaced via deleteMutation.error
    }
  }, [family, deleteMutation, router, confirm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSave, handleCancelEdit]
  );

  /* ─────────────────────────────────────────────
   * Loading State
   * ───────────────────────────────────────────── */

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        {/* Back link skeleton */}
        <div className="mb-4">
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
        </div>
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
        {/* Table skeleton */}
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          </div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────
   * Error State
   * ───────────────────────────────────────────── */

  if (detailQuery.isError) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <Link
          href="/inventory/families"
          className="mb-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Item Families
        </Link>
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-12 text-center dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-[13px] font-medium text-red-600 dark:text-red-400">
            Failed to load family details
          </p>
          <p className="mt-1 text-[12px] text-red-500/80 dark:text-red-400/60">
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "An unexpected error occurred"}
          </p>
          <button
            onClick={() => detailQuery.refetch()}
            className="mt-4 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!family) return null;

  /* ─────────────────────────────────────────────
   * Main Render
   * ───────────────────────────────────────────── */

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      {/* ── Back Link ── */}
      <Link
        href="/inventory/families"
        className="mb-4 flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        Item Families
      </Link>

      {/* ── Header Section ── */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {editing ? (
              /* ── Inline Edit Mode ── */
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.06]">
                  <Layers size={16} className="text-primary" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-[18px] font-semibold tracking-tight text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  placeholder="Family name..."
                />
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !editName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                >
                  <Check size={14} strokeWidth={2.5} />
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            ) : (
              /* ── Display Mode ── */
              <>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
                    <Layers size={16} className="text-primary" />
                  </div>
                  <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
                    {family.name}
                  </h1>
                </div>
                <p className="mt-1 ml-[42px] font-mono text-[11px] text-muted-foreground">
                  {family.slug}
                </p>
              </>
            )}
          </div>

          {/* ── Right side: badge + action buttons ── */}
          {!editing && (
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-foreground">
                {family.productCount} {family.productCount === 1 ? "product" : "products"}
              </span>
              <button
                onClick={handleEdit}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-background px-3 py-1.5 text-[12px] font-medium text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}
        </div>

        {/* ── Stats row ── */}
        {!editing && (
          <div className="mt-4 flex gap-5">
            <div className="flex items-center gap-2 text-[13px]">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
                <Package size={11} className="text-muted-foreground" />
              </div>
              <span className="text-muted-foreground">Items</span>
              <span className="font-semibold tabular-nums text-foreground">
                {family.productCount}
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-muted-foreground">Created</span>
              <span className="font-semibold text-foreground">
                {formatDate(family.createdAt)}
              </span>
            </div>
          </div>
        )}

        {/* ── Mutation errors ── */}
        {updateMutation.isError && (
          <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
            Failed to update family:{" "}
            {updateMutation.error instanceof Error
              ? updateMutation.error.message
              : "Unknown error"}
          </p>
        )}
        {deleteMutation.isError && (
          <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">
            Failed to delete family:{" "}
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Unknown error"}
          </p>
        )}
      </div>

      {/* ── Search Bar ── */}
      <div className="mb-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products in this family..."
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            style={{ paddingLeft: "2.125rem" }}
          />
        </div>
      </div>

      {/* ── Products Table ── */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {/* Table Header */}
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Name
          </div>
          <div className="w-28 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            SKU
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Unit Price
          </div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Cost Price
          </div>
          <div className="w-20 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Stock
          </div>
        </div>

        {/* Table Body */}
        {productsQuery.isLoading ? (
          /* ── Loading skeleton ── */
          <div className="divide-y divide-border">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : productsQuery.isError ? (
          /* ── Error state ── */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-[13px] font-medium text-red-600 dark:text-red-400">
              Failed to load products
            </p>
            <button
              onClick={() => productsQuery.refetch()}
              className="mt-3 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Package size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">
              No products in this family
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Assign products to this family from the Item List
            </p>
          </div>
        ) : (
          /* ── Product rows ── */
          <div className="divide-y divide-border">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/inventory?search=${encodeURIComponent(product.sku)}`}
                className="flex w-full items-center px-4 py-3 text-left transition-colors duration-100 hover:bg-accent/60 active:bg-accent"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight text-foreground truncate">
                    {product.name}
                  </div>
                </div>
                <div className="w-28 text-left">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {product.sku}
                  </span>
                </div>
                <div className="w-28 text-right text-[13px] tabular-nums text-foreground">
                  &#8369;{formatPrice(product.unitPrice)}
                </div>
                <div className="w-28 text-right text-[13px] tabular-nums text-muted-foreground">
                  &#8369;{formatPrice(product.costPrice)}
                </div>
                <div className="w-20 text-right text-[13px] font-medium tabular-nums text-foreground">
                  {product.stockLevel}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Table Footer */}
        {!productsQuery.isLoading && products.length > 0 && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              Showing {products.length} {products.length === 1 ? "product" : "products"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
