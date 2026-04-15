"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useCreateCount } from "@/hooks/use-inventory-counts";
import { useProductFamilies } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useBrands } from "@/hooks/use-brands";

/* ═══════════════════════════════════════════════════════
 * NEW COUNT PAGE
 * ═══════════════════════════════════════════════════════ */

export default function NewCountPage() {
  const { token, locationId, apiLocationId, locations, loading: authLoading } = useAuth();
  const router = useRouter();

  const [selectedLocation, setSelectedLocation] = useState(() =>
    locationId === "ALL" ? apiLocationId : locationId,
  );
  const createMutation = useCreateCount(token, selectedLocation);
  const [scope, setScope] = useState("FULL_LOCATION");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");

  const isCycle = scope !== "FULL_LOCATION";

  // Data for filter dropdowns
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const allCategories = categoriesQuery.data?.data ?? [];
  const subcategoriesQuery = useSubcategories(token, locationId, categoryId || undefined);
  const allSubcategories = subcategoriesQuery.data?.data ?? [];
  const brandsQuery = useBrands(token, locationId);
  const brandsList = brandsQuery.data?.data ?? [];

  // Cascading filters
  const filteredCategories = familyId
    ? allCategories.filter((c: any) => c.familyId === familyId)
    : allCategories;
  const filteredSubcategories = categoryId
    ? allSubcategories.filter((s: any) => s.categoryId === categoryId)
    : allSubcategories;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      {
        countType: scope === "FULL_LOCATION" ? "FULL" : "CYCLE",
        title: label,
        notes: notes || undefined,
        filterCriteria: isCycle ? {
          familyId: familyId || undefined,
          categoryId: categoryId || undefined,
          subcategoryId: subcategoryId || undefined,
          brandId: brandId || undefined,
        } : undefined,
      },
      {
        onSuccess: (data) => {
          router.push(`/inventory/counts/${data.id}`);
        },
      },
    );
  };

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-6 py-5">
        <Link
          href="/inventory/counts"
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent"
        >
          <ChevronLeft size={16} className="text-muted-foreground" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <ClipboardCheck size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">New Inventory Count</h1>
            <p className="text-xs text-muted-foreground">
              Set up a new physical count or cycle count session
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto">
        <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6 px-6 py-8">
          {/* Location */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Location <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                required
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>

          {/* Count Type */}
          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">
              Count Type
            </label>
            <div className="flex gap-3">
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  scope === "FULL_LOCATION"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-foreground hover:bg-accent"
                }`}
              >
                <input
                  type="radio"
                  name="countType"
                  value="FULL_LOCATION"
                  checked={scope === "FULL_LOCATION"}
                  onChange={() => {
                    setScope("FULL_LOCATION");
                    setFamilyId("");
                    setCategoryId("");
                    setSubcategoryId("");
                    setBrandId("");
                  }}
                  className="sr-only"
                />
                Full
              </label>
              <label
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  isCycle
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-foreground hover:bg-accent"
                }`}
              >
                <input
                  type="radio"
                  name="countType"
                  value="CATEGORY"
                  checked={isCycle}
                  onChange={() => setScope("CATEGORY")}
                  className="sr-only"
                />
                Cycle
              </label>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {scope === "FULL_LOCATION"
                ? "Count all items at the selected location."
                : "Count a subset of items filtered by category or brand."}
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. March 2026 Full Count"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
              required
            />
          </div>

          {/* Cycle filters */}
          {isCycle && (
            <div className="space-y-4 rounded-md border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">Filter items to count (all optional — leave blank to include all items at this location)</p>
              <div className="grid grid-cols-2 gap-4">
                {/* Family */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Family</label>
                  <div className="relative">
                    <select
                      value={familyId}
                      onChange={(e) => { setFamilyId(e.target.value); setCategoryId(""); setSubcategoryId(""); }}
                      className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="">All Families</option>
                      {families.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Category</label>
                  <div className="relative">
                    <select
                      value={categoryId}
                      onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}
                      className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="">All Categories</option>
                      {filteredCategories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {/* Sub-category */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Sub-category</label>
                  <div className="relative">
                    <select
                      value={subcategoryId}
                      onChange={(e) => setSubcategoryId(e.target.value)}
                      className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="">All Sub-categories</option>
                      {filteredSubcategories.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {/* Brand */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Brand</label>
                  <div className="relative">
                    <select
                      value={brandId}
                      onChange={(e) => setBrandId(e.target.value)}
                      className="h-10 w-full appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                    >
                      <option value="">All Brands</option>
                      {brandsList.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Notes <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason, frequency, or special instructions..."
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Error */}
          {createMutation.isError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {(createMutation.error as any)?.message ?? "Failed to create count"}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/inventory/counts"
              className="flex-1 rounded-md border border-border px-4 py-1.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!label || createMutation.isPending}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {createMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Create Count
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
