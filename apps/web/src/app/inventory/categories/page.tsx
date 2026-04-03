"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Grid3x3,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Loader2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Package,
  Layers,
  FolderTree,
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
import {
  useProductFamilies,
  type ProductFamily,
} from "@/hooks/use-products";
import {
  useSubcategories,
  useCreateSubcategory,
  useUpdateSubcategory,
  useDeleteSubcategory,
  type SubcategoryRow,
} from "@/hooks/use-subcategories";
import { useUpdateFamily, useDeleteFamily } from "@/hooks/use-families";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const PRESET_COLORS = [
  "#2563EB", "#DC2626", "#D97706", "#059669",
  "#7C3AED", "#DB2777", "#0891B2", "#4F46E5",
  "#CA8A04", "#16A34A", "#9333EA", "#E11D48",
];

const INITIAL_VISIBLE = 10;
const EMPTY_CATEGORIES: CategoryRow[] = [];

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function CategoriesPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showAllCategories, setShowAllCategories] = useState<Set<string>>(new Set());
  const [showAllSubcategories, setShowAllSubcategories] = useState<Set<string>>(new Set());

  // Modals
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">("closed");
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  // Family inline editing
  const [editingFamily, setEditingFamily] = useState<ProductFamily | null>(null);
  const [deleteFamilyTarget, setDeleteFamilyTarget] = useState<ProductFamily | null>(null);
  const [createCategoryForFamily, setCreateCategoryForFamily] = useState<ProductFamily | null>(null);

  // Inline subcategory editing
  const [addingSubcategoryFor, setAddingSubcategoryFor] = useState<string | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<SubcategoryRow | null>(null);
  const [deleteSubTarget, setDeleteSubTarget] = useState<SubcategoryRow | null>(null);

  // Debounce
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  // Data
  const { data: familiesData, isLoading: familiesLoading } = useProductFamilies(token, locationId);
  // Fetch ALL categories (no server-side search) — search is done client-side across the full hierarchy
  const { data: categoriesData, isLoading: categoriesLoading, isError } = useCategories(token, locationId, {});
  const { data: subcategoriesData, isLoading: subcategoriesLoading } = useSubcategories(token, locationId);

  const createCatMut = useCreateCategory(token, locationId);
  const updateCatMut = useUpdateCategory(token, locationId);
  const deleteCatMut = useDeleteCategory(token, locationId);
  const createSubMut = useCreateSubcategory(token, locationId);
  const updateSubMut = useUpdateSubcategory(token, locationId);
  const deleteSubMut = useDeleteSubcategory(token, locationId);
  const updateFamilyMut = useUpdateFamily(token, locationId);
  const deleteFamilyMut = useDeleteFamily(token, locationId);

  const families = familiesData?.data ?? [];
  const allCategories = categoriesData?.data ?? EMPTY_CATEGORIES;
  const allSubcategories = subcategoriesData?.data ?? [];

  const isLoading = familiesLoading || categoriesLoading || subcategoriesLoading;

  // Build tree: families -> categories (by familyId) -> subcategories (by categoryId)
  const { categoriesByFamily, ungroupedCategories, subcategoriesByCategory } = useMemo(() => {
    const catMap = new Map<string, CategoryRow[]>();
    const ungrouped: CategoryRow[] = [];

    for (const cat of allCategories) {
      if (cat.familyId) {
        const list = catMap.get(cat.familyId) ?? [];
        list.push(cat);
        catMap.set(cat.familyId, list);
      } else {
        ungrouped.push(cat);
      }
    }

    // Sort categories by name within each group
    for (const [, list] of catMap) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    ungrouped.sort((a, b) => a.name.localeCompare(b.name));

    // Build subcategories map
    const subMap = new Map<string, SubcategoryRow[]>();
    for (const sub of allSubcategories) {
      const list = subMap.get(sub.categoryId) ?? [];
      list.push(sub);
      subMap.set(sub.categoryId, list);
    }
    for (const [, list] of subMap) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }

    return {
      categoriesByFamily: catMap,
      ungroupedCategories: ungrouped,
      subcategoriesByCategory: subMap,
    };
  }, [allCategories, allSubcategories]);

  // When searching, auto-expand families/categories that have matching items or subcategories
  const searchExpandedFamilyIds = useMemo(() => {
    if (!debouncedSearch) return null;
    const q = debouncedSearch.toLowerCase();
    const ids = new Set<string>();
    for (const family of families) {
      const cats = categoriesByFamily.get(family.id) ?? [];
      const familyMatches = family.name.toLowerCase().includes(q);
      const anyCatMatches = cats.some(c => c.name.toLowerCase().includes(q));
      // Check if any sub-category matches
      const anySubMatches = cats.some(c => {
        const subs = subcategoriesByCategory.get(c.id) ?? [];
        return subs.some(s => s.name.toLowerCase().includes(q));
      });
      if (cats.length > 0 || familyMatches || anyCatMatches || anySubMatches) {
        ids.add(family.id);
      }
    }
    if (ungroupedCategories.length > 0) ids.add("__ungrouped__");
    return ids;
  }, [debouncedSearch, families, categoriesByFamily, ungroupedCategories, subcategoriesByCategory]);

  const searchExpandedCategoryIds = useMemo(() => {
    if (!debouncedSearch) return null;
    const q = debouncedSearch.toLowerCase();
    const ids = new Set<string>();
    for (const cat of allCategories) {
      const subs = subcategoriesByCategory.get(cat.id) ?? [];
      const catMatches = cat.name.toLowerCase().includes(q);
      const anySubMatches = subs.some(s => s.name.toLowerCase().includes(q));
      if (subs.length > 0 || catMatches || anySubMatches) {
        ids.add(cat.id);
      }
    }
    return ids;
  }, [debouncedSearch, allCategories, subcategoriesByCategory]);

  const effectiveExpandedFamilies = searchExpandedFamilyIds ?? expandedFamilies;
  const effectiveExpandedCategories = searchExpandedCategoryIds ?? expandedCategories;

  function toggleFamily(id: string) {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(id: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShowAllCategories(familyId: string) {
    setShowAllCategories((prev) => {
      const next = new Set(prev);
      if (next.has(familyId)) next.delete(familyId);
      else next.add(familyId);
      return next;
    });
  }

  function toggleShowAllSubcategories(categoryId: string) {
    setShowAllSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

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
    deleteCatMut.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }

  function handleDeleteSubConfirm() {
    if (!deleteSubTarget) return;
    deleteSubMut.mutate(deleteSubTarget.id, {
      onSuccess: () => setDeleteSubTarget(null),
    });
  }

  // Summary stats — use unfiltered data for header totals
  const totalFamilies = families.length;
  const totalCategories = allCategories.length;
  const totalSubcategories = allSubcategories.length;
  // Items count: sum from categories + subcategories (whichever is more complete)
  const itemsFromCategories = allCategories.reduce((sum, c) => sum + c.productCount, 0);
  const itemsFromSubcategories = allSubcategories.reduce((sum, s: any) => sum + (s.productCount ?? 0), 0);
  const totalItems = Math.max(itemsFromCategories, itemsFromSubcategories);

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-2 sm:px-0">
      {/* Header */}
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
              Manage product families, categories, and sub-categories
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} />
            Add Category
          </button>
        </div>

        {/* Summary */}
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Layers size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Families</span>
            <span className="font-semibold tabular-nums text-foreground">{totalFamilies}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Grid3x3 size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Categories</span>
            <span className="font-semibold tabular-nums text-foreground">{totalCategories}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <FolderTree size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Sub-categories</span>
            <span className="font-semibold tabular-nums text-foreground">{totalSubcategories}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted">
              <Package size={11} className="text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Items</span>
            <span className="font-semibold tabular-nums text-foreground">{totalItems.toLocaleString()}</span>
          </div>
          <div className="ml-auto">
            <button
              onClick={async () => {
                if (!confirm("Remove all empty categories and subcategories (0 items)? This cannot be undone.")) return;
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/categories/remove-empty`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "X-Location-ID": locationId },
                  });
                  const data = await res.json();
                  alert(`Removed ${data.categoriesRemoved} empty categories and ${data.subcategoriesRemoved} empty subcategories`);
                  window.location.reload();
                } catch (err: any) {
                  alert("Failed: " + (err.message || "Unknown error"));
                }
              }}
              className="rounded-md border border-destructive/30 px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/5 transition-colors"
            >
              Remove Empty
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search families, categories, and sub-categories..."
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
      </div>

      {/* Content */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
            <span className="ml-2 text-[13px] text-muted-foreground">Loading categories...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle size={20} className="text-destructive" />
            <p className="mt-2 text-[13px] text-destructive">Failed to load categories</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Family groups */}
            {families.filter((family) => {
              // When searching, hide families with no matches
              if (searchExpandedFamilyIds && !searchExpandedFamilyIds.has(family.id)) return false;
              return true;
            }).map((family) => {
              const allFamilyCats = categoriesByFamily.get(family.id) ?? [];
              const q = debouncedSearch?.toLowerCase();
              const familyNameMatches = q && family.name.toLowerCase().includes(q);

              // When searching, filter categories and subcategories to only matching ones
              let familyCats = allFamilyCats;
              let filteredSubsMap = subcategoriesByCategory;
              if (q && !familyNameMatches) {
                // Filter categories to those matching OR having matching subcategories
                familyCats = allFamilyCats.filter(cat => {
                  if (cat.name.toLowerCase().includes(q)) return true;
                  const subs = subcategoriesByCategory.get(cat.id) ?? [];
                  return subs.some(s => s.name.toLowerCase().includes(q));
                });
                // Also filter subcategories within each category
                filteredSubsMap = new Map(
                  familyCats.map(cat => {
                    const subs = subcategoriesByCategory.get(cat.id) ?? [];
                    const catMatches = cat.name.toLowerCase().includes(q);
                    return [cat.id, catMatches ? subs : subs.filter(s => s.name.toLowerCase().includes(q))];
                  })
                );
              }
              const familyItemCount = familyCats.reduce((s, c) => s + c.productCount, 0);

              return (
                <FamilyGroup
                  key={family.id}
                  family={family}
                  categories={familyCats}
                  familyItemCount={familyItemCount}
                  subcategoriesByCategory={filteredSubsMap}
                  isExpanded={effectiveExpandedFamilies.has(family.id)}
                  showAllCats={showAllCategories.has(family.id)}
                  expandedCategories={effectiveExpandedCategories}
                  showAllSubcategories={showAllSubcategories}
                  onToggleFamily={() => toggleFamily(family.id)}
                  onToggleShowAllCats={() => toggleShowAllCategories(family.id)}
                  onToggleCategory={toggleCategory}
                  onToggleShowAllSubs={toggleShowAllSubcategories}
                  onEditCategory={openEdit}
                  onDeleteCategory={(cat) => setDeleteTarget(cat)}
                  onAddSubcategory={(catId) => setAddingSubcategoryFor(catId)}
                  onEditSubcategory={(sub) => setEditingSubcategory(sub)}
                  onDeleteSubcategory={(sub) => setDeleteSubTarget(sub)}
                  onAddCategory={() => setCreateCategoryForFamily(family)}
                  onEditFamily={() => setEditingFamily(family)}
                  onDeleteFamily={() => setDeleteFamilyTarget(family)}
                />
              );
            })}

            {/* Ungrouped categories (familyId === null) */}
            {(() => {
              const q = debouncedSearch?.toLowerCase();
              // Filter ungrouped categories by search term
              let filteredUngrouped = ungroupedCategories;
              let filteredUngroupedSubsMap = subcategoriesByCategory;
              if (q) {
                filteredUngrouped = ungroupedCategories.filter(cat => {
                  if (cat.name.toLowerCase().includes(q)) return true;
                  const subs = subcategoriesByCategory.get(cat.id) ?? [];
                  return subs.some(s => s.name.toLowerCase().includes(q));
                });
                filteredUngroupedSubsMap = new Map(
                  filteredUngrouped.map(cat => {
                    const subs = subcategoriesByCategory.get(cat.id) ?? [];
                    const catMatches = cat.name.toLowerCase().includes(q);
                    return [cat.id, catMatches ? subs : subs.filter(s => s.name.toLowerCase().includes(q))];
                  })
                );
              }
              if (filteredUngrouped.length === 0) return null;
              return (
              <FamilyGroup
                key="__ungrouped__"
                family={{
                  id: "__ungrouped__",
                  name: debouncedSearch ? "Search Results" : "Ungrouped",
                  slug: "ungrouped",
                  productCount: filteredUngrouped.reduce((s, c) => s + c.productCount, 0),
                }}
                categories={filteredUngrouped}
                familyItemCount={filteredUngrouped.reduce((s, c) => s + c.productCount, 0)}
                subcategoriesByCategory={filteredUngroupedSubsMap}
                isExpanded={effectiveExpandedFamilies.has("__ungrouped__") || (!!debouncedSearch && families.length === 0)}
                showAllCats={showAllCategories.has("__ungrouped__")}
                expandedCategories={effectiveExpandedCategories}
                showAllSubcategories={showAllSubcategories}
                onToggleFamily={() => toggleFamily("__ungrouped__")}
                onToggleShowAllCats={() => toggleShowAllCategories("__ungrouped__")}
                onToggleCategory={toggleCategory}
                onToggleShowAllSubs={toggleShowAllSubcategories}
                onEditCategory={openEdit}
                onDeleteCategory={(cat) => setDeleteTarget(cat)}
                onAddSubcategory={(catId) => setAddingSubcategoryFor(catId)}
                onEditSubcategory={(sub) => setEditingSubcategory(sub)}
                onDeleteSubcategory={(sub) => setDeleteSubTarget(sub)}
                onAddCategory={() => openCreate()}
                onEditFamily={() => {}}
                onDeleteFamily={() => {}}
              />
              );
            })()}

            {/* Empty state */}
            {(families.length === 0 || (searchExpandedFamilyIds && searchExpandedFamilyIds.size === 0)) && ungroupedCategories.length === 0 && (
              <div className="py-16 text-center text-[13px] text-muted-foreground">
                {debouncedSearch ? "No categories match your search" : "No categories found"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Category Modal */}
      {(modalMode !== "closed" || createCategoryForFamily) && (
        <CategoryModal
          mode={createCategoryForFamily ? "create" : modalMode as "create" | "edit"}
          initial={editingCategory}
          families={families}
          lockedFamilyId={createCategoryForFamily?.id}
          lockedFamilyName={createCategoryForFamily?.name}
          onClose={() => { closeModal(); setCreateCategoryForFamily(null); }}
          onSubmit={(form) => {
            if (createCategoryForFamily || modalMode === "create") {
              createCatMut.mutate(
                {
                  name: form.name,
                  slug: form.slug,
                  description: form.description || undefined,
                  color: form.color || undefined,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                  familyId: createCategoryForFamily?.id || form.familyId || undefined,
                } as any,
                { onSuccess: () => { closeModal(); setCreateCategoryForFamily(null); } },
              );
            } else if (editingCategory) {
              updateCatMut.mutate(
                {
                  categoryId: editingCategory.id,
                  name: form.name,
                  slug: form.slug,
                  description: form.description || undefined,
                  color: form.color || undefined,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                  familyId: form.familyId ?? null,
                } as any,
                { onSuccess: closeModal },
              );
            }
          }}
          submitting={createCatMut.isPending || updateCatMut.isPending}
          error={createCatMut.error?.message || updateCatMut.error?.message || null}
        />
      )}

      {/* Edit Family Modal */}
      {editingFamily && (
        <FamilyEditModal
          family={editingFamily}
          onClose={() => setEditingFamily(null)}
          onSubmit={(name) => {
            updateFamilyMut.mutate(
              { id: editingFamily.id, name },
              { onSuccess: () => setEditingFamily(null) },
            );
          }}
          submitting={updateFamilyMut.isPending}
          error={updateFamilyMut.error?.message || null}
        />
      )}

      {/* Delete Family Confirmation */}
      {deleteFamilyTarget && (
        <DeleteConfirmModal
          title="Delete Family"
          itemName={deleteFamilyTarget.name}
          itemCount={categoriesByFamily.get(deleteFamilyTarget.id)?.length ?? 0}
          warningMessage={
            (categoriesByFamily.get(deleteFamilyTarget.id)?.length ?? 0) > 0
              ? `This family has ${categoriesByFamily.get(deleteFamilyTarget.id)!.length} categories assigned. Move or delete them first.`
              : undefined
          }
          onClose={() => setDeleteFamilyTarget(null)}
          onConfirm={() => {
            deleteFamilyMut.mutate(deleteFamilyTarget.id, {
              onSuccess: () => setDeleteFamilyTarget(null),
            });
          }}
          submitting={deleteFamilyMut.isPending}
          error={deleteFamilyMut.error?.message || null}
        />
      )}

      {/* Inline Add Subcategory Modal */}
      {addingSubcategoryFor && (
        <SubcategoryModal
          mode="create"
          categoryId={addingSubcategoryFor}
          initial={null}
          onClose={() => setAddingSubcategoryFor(null)}
          onSubmit={(form) => {
            createSubMut.mutate(
              {
                categoryId: addingSubcategoryFor,
                name: form.name,
                slug: form.slug,
                sortOrder: form.sortOrder,
                isActive: form.isActive,
              },
              { onSuccess: () => setAddingSubcategoryFor(null) },
            );
          }}
          submitting={createSubMut.isPending}
          error={createSubMut.error?.message || null}
        />
      )}

      {/* Edit Subcategory Modal */}
      {editingSubcategory && (
        <SubcategoryModal
          mode="edit"
          categoryId={editingSubcategory.categoryId}
          initial={editingSubcategory}
          onClose={() => setEditingSubcategory(null)}
          onSubmit={(form) => {
            updateSubMut.mutate(
              {
                id: editingSubcategory.id,
                name: form.name,
                slug: form.slug,
                sortOrder: form.sortOrder,
                isActive: form.isActive,
              },
              { onSuccess: () => setEditingSubcategory(null) },
            );
          }}
          submitting={updateSubMut.isPending}
          error={updateSubMut.error?.message || null}
        />
      )}

      {/* Delete Category Confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          title="Delete Category"
          itemName={deleteTarget.name}
          itemCount={deleteTarget.productCount}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          submitting={deleteCatMut.isPending}
          error={deleteCatMut.error?.message || null}
        />
      )}

      {/* Delete Subcategory Confirmation */}
      {deleteSubTarget && (
        <DeleteConfirmModal
          title="Delete Sub-category"
          itemName={deleteSubTarget.name}
          itemCount={deleteSubTarget.productCount}
          onClose={() => setDeleteSubTarget(null)}
          onConfirm={handleDeleteSubConfirm}
          submitting={deleteSubMut.isPending}
          error={deleteSubMut.error?.message || null}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * LEVEL 1 — FAMILY GROUP (collapsible)
 * ═══════════════════════════════════════════════════════ */

function FamilyGroup({
  family,
  categories,
  familyItemCount,
  subcategoriesByCategory,
  isExpanded,
  showAllCats,
  expandedCategories,
  showAllSubcategories,
  onToggleFamily,
  onToggleShowAllCats,
  onToggleCategory,
  onToggleShowAllSubs,
  onEditCategory,
  onDeleteCategory,
  onAddSubcategory,
  onEditSubcategory,
  onDeleteSubcategory,
  onAddCategory,
  onEditFamily,
  onDeleteFamily,
}: {
  family: ProductFamily;
  categories: CategoryRow[];
  familyItemCount: number;
  subcategoriesByCategory: Map<string, SubcategoryRow[]>;
  isExpanded: boolean;
  showAllCats: boolean;
  expandedCategories: Set<string>;
  showAllSubcategories: Set<string>;
  onToggleFamily: () => void;
  onToggleShowAllCats: () => void;
  onToggleCategory: (id: string) => void;
  onToggleShowAllSubs: (id: string) => void;
  onEditCategory: (cat: CategoryRow) => void;
  onDeleteCategory: (cat: CategoryRow) => void;
  onAddSubcategory: (categoryId: string) => void;
  onEditSubcategory: (sub: SubcategoryRow) => void;
  onDeleteSubcategory: (sub: SubcategoryRow) => void;
  onAddCategory: () => void;
  onEditFamily: () => void;
  onDeleteFamily: () => void;
}) {
  const visibleCats = showAllCats ? categories : categories.slice(0, INITIAL_VISIBLE);
  const hasMoreCats = categories.length > INITIAL_VISIBLE && !showAllCats;
  const isUngrouped = family.id === "__ungrouped__";

  return (
    <div>
      {/* Family row */}
      <div
        onClick={onToggleFamily}
        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        {/* Chevron */}
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          {isExpanded ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>

        {/* Icon */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/[0.08]">
          <Layers size={13} className="text-primary" />
        </div>

        {/* Name */}
        <span className="flex-1 text-[14px] font-semibold text-foreground">
          {family.name}
        </span>

        {/* Stats */}
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {familyItemCount.toLocaleString()} items
        </span>
        <span className="text-[11px] text-muted-foreground/60">&middot;</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </span>

        {/* Family actions */}
        {!isUngrouped && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onAddCategory(); }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              title="Add category under this family"
            >
              <Plus size={12} />
              Category
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEditFamily(); }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit family"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteFamily(); }}
              disabled={categories.length > 0}
              className={cn(
                "rounded-md p-1.5 transition-all",
                categories.length > 0
                  ? "text-muted-foreground/30 cursor-not-allowed"
                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              )}
              title={categories.length > 0 ? `Cannot delete — ${categories.length} categories assigned` : "Delete family"}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Categories (expandable) */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {visibleCats.length > 0 ? (
            <div className="border-t border-border/50 bg-muted/20">
              {visibleCats.map((cat) => (
                <CategoryGroup
                  key={cat.id}
                  category={cat}
                  subcategories={subcategoriesByCategory.get(cat.id) ?? []}
                  isExpanded={expandedCategories.has(cat.id)}
                  showAllSubs={showAllSubcategories.has(cat.id)}
                  onToggleExpand={() => onToggleCategory(cat.id)}
                  onToggleShowAllSubs={() => onToggleShowAllSubs(cat.id)}
                  onEdit={() => onEditCategory(cat)}
                  onDelete={() => onDeleteCategory(cat)}
                  onAddSubcategory={() => onAddSubcategory(cat.id)}
                  onEditSubcategory={onEditSubcategory}
                  onDeleteSubcategory={onDeleteSubcategory}
                />
              ))}

              {hasMoreCats && (
                <button
                  onClick={onToggleShowAllCats}
                  className="w-full py-2.5 text-center text-[12px] font-medium text-primary hover:bg-accent/40 transition-colors"
                >
                  Show all {categories.length} categories
                </button>
              )}
            </div>
          ) : isExpanded ? (
            <div className="border-t border-border/50 bg-muted/20 py-6 text-center text-[12px] text-muted-foreground">
              No categories in this family
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * LEVEL 2 — CATEGORY GROUP (nested, collapsible)
 * ═══════════════════════════════════════════════════════ */

function CategoryGroup({
  category: cat,
  subcategories,
  isExpanded,
  showAllSubs,
  onToggleExpand,
  onToggleShowAllSubs,
  onEdit,
  onDelete,
  onAddSubcategory,
  onEditSubcategory,
  onDeleteSubcategory,
}: {
  category: CategoryRow;
  subcategories: SubcategoryRow[];
  isExpanded: boolean;
  showAllSubs: boolean;
  onToggleExpand: () => void;
  onToggleShowAllSubs: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubcategory: () => void;
  onEditSubcategory: (sub: SubcategoryRow) => void;
  onDeleteSubcategory: (sub: SubcategoryRow) => void;
}) {
  const visibleSubs = showAllSubs ? subcategories : subcategories.slice(0, INITIAL_VISIBLE);
  const hasMoreSubs = subcategories.length > INITIAL_VISIBLE && !showAllSubs;

  return (
    <div>
      {/* Category row */}
      <div className="group flex items-center gap-3 py-2.5 pl-8 pr-4 transition-colors hover:bg-accent/40">
        {/* Expand chevron */}
        <button
          onClick={onToggleExpand}
          className="flex h-5 w-5 shrink-0 items-center justify-center"
        >
          {subcategories.length > 0 ? (
            isExpanded ? (
              <ChevronDown size={12} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="text-muted-foreground" />
            )
          ) : (
            <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          )}
        </button>

        {/* Color dot */}
        <div
          className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: cat.color || "#94A3B8" }}
        />

        {/* Name - clickable to expand */}
        <button
          onClick={onToggleExpand}
          className="flex-1 min-w-0 truncate text-left text-[13px] font-medium text-foreground"
        >
          {cat.name}
        </button>

        {/* Stats */}
        <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
          {cat.productCount.toLocaleString()} items
        </span>
        {subcategories.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {subcategories.length} sub
          </span>
        )}

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onAddSubcategory}
            className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="Add sub-category"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={onEdit}
            className="rounded p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="Edit category"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            className={cn(
              "rounded p-1.5 transition-all group-hover:opacity-100",
              cat.productCount > 0
                ? "text-muted-foreground/30 cursor-not-allowed opacity-0"
                : "text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive",
            )}
            title={cat.productCount > 0 ? `${cat.productCount} items assigned` : "Delete category"}
            disabled={cat.productCount > 0}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Subcategories (expandable) */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {isExpanded && (
            <div className="bg-muted/10">
              {visibleSubs.map((sub) => (
                <SubcategoryRow
                  key={sub.id}
                  subcategory={sub}
                  onEdit={() => onEditSubcategory(sub)}
                  onDelete={() => onDeleteSubcategory(sub)}
                />
              ))}

              {hasMoreSubs && (
                <button
                  onClick={onToggleShowAllSubs}
                  className="w-full py-2 text-center text-[11px] font-medium text-primary hover:bg-accent/40 transition-colors"
                >
                  Show all {subcategories.length} sub-categories
                </button>
              )}

              {subcategories.length === 0 && (
                <div className="py-3 pl-14 pr-4 text-[12px] text-muted-foreground">
                  No sub-categories
                </div>
              )}

              {/* Add sub-category button */}
              <button
                onClick={onAddSubcategory}
                className="flex w-full items-center gap-1.5 py-2 pl-14 pr-4 text-[12px] font-medium text-primary/80 transition-colors hover:bg-accent/40 hover:text-primary"
              >
                <Plus size={11} strokeWidth={2.5} />
                Add Sub-category
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * LEVEL 3 — SUBCATEGORY ROW
 * ═══════════════════════════════════════════════════════ */

function SubcategoryRow({
  subcategory: sub,
  onEdit,
  onDelete,
}: {
  subcategory: SubcategoryRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 py-2 pl-14 pr-4 transition-colors hover:bg-accent/40">
      <div className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="flex-1 min-w-0 truncate text-[12px] text-foreground">
        {sub.name}
      </span>

      <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-primary/[0.04] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
        {sub.productCount.toLocaleString()} items
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={onEdit}
          className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
          title="Edit sub-category"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={onDelete}
          className={cn(
            "rounded p-1 transition-all group-hover:opacity-100",
            sub.productCount > 0
              ? "text-muted-foreground/30 cursor-not-allowed opacity-0"
              : "text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive",
          )}
          title={sub.productCount > 0 ? `${sub.productCount} items assigned` : "Delete sub-category"}
          disabled={sub.productCount > 0}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * CATEGORY CREATE / EDIT MODAL
 * ═══════════════════════════════════════════════════════ */

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  familyId: string | null;
}

function CategoryModal({
  mode,
  initial,
  families,
  lockedFamilyId,
  lockedFamilyName,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: "create" | "edit";
  initial: CategoryRow | null;
  families: ProductFamily[];
  lockedFamilyId?: string;
  lockedFamilyName?: string;
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
        familyId: initial.familyId,
      };
    }
    return {
      name: "",
      slug: "",
      description: "",
      color: "#2563EB",
      sortOrder: 0,
      isActive: true,
      familyId: lockedFamilyId ?? families[0]?.id ?? null,
    };
  });

  const [autoSlug, setAutoSlug] = useState(mode === "create");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-foreground">
            {mode === "create" ? "New Category" : "Edit Category"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Brake Parts"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Slug *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="brake-parts"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Family dropdown */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Family</label>
            {lockedFamilyName ? (
              <div className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/50 px-3 text-[13px] text-foreground">
                {lockedFamilyName}
              </div>
            ) : (
              <select
                value={form.familyId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, familyId: e.target.value || null }))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              >
                <option value="">None (Ungrouped)</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 resize-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Color + Active toggle */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-all",
                      form.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

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
              <span className="text-[13px] text-foreground">{form.isActive ? "Active" : "Inactive"}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
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
            onClick={() => onSubmit(form)}
            disabled={!isValid || submitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
            {mode === "create" ? "Create" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUBCATEGORY CREATE / EDIT MODAL
 * ═══════════════════════════════════════════════════════ */

interface SubcategoryFormData {
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

function SubcategoryModal({
  mode,
  categoryId: _categoryId,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  mode: "create" | "edit";
  categoryId: string;
  initial: SubcategoryRow | null;
  onClose: () => void;
  onSubmit: (form: SubcategoryFormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<SubcategoryFormData>(() => {
    if (initial) {
      return {
        name: initial.name,
        slug: initial.slug,
        sortOrder: initial.sortOrder,
        isActive: initial.isActive,
      };
    }
    return {
      name: "",
      slug: "",
      sortOrder: 0,
      isActive: true,
    };
  });

  const [autoSlug, setAutoSlug] = useState(mode === "create");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-foreground">
            {mode === "create" ? "New Sub-category" : "Edit Sub-category"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Brake Pads"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Slug *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="brake-pads"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
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
            <span className="text-[13px] text-foreground">{form.isActive ? "Active" : "Inactive"}</span>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
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
            onClick={() => onSubmit(form)}
            disabled={!isValid || submitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
            {mode === "create" ? "Create" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * DELETE CONFIRMATION (shared for categories & subcategories)
 * ═══════════════════════════════════════════════════════ */

function DeleteConfirmModal({
  title,
  itemName,
  itemCount,
  warningMessage,
  onClose,
  onConfirm,
  submitting,
  error,
}: {
  title: string;
  itemName: string;
  itemCount: number;
  warningMessage?: string;
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
              <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-foreground">
            Are you sure you want to delete <span className="font-semibold">{itemName}</span>?
          </p>

          {itemCount > 0 && (
            <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[12px] text-warning">
              {warningMessage || `This item has ${itemCount.toLocaleString()} products assigned. Reassign them before deleting.`}
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
            disabled={submitting || itemCount > 0}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-[13px] font-medium text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * FAMILY EDIT MODAL
 * ═══════════════════════════════════════════════════════ */

function FamilyEditModal({
  family,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  family: ProductFamily;
  onClose: () => void;
  onSubmit: (name: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(family.name);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const isValid = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-foreground">Edit Family</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engine Parts"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              onKeyDown={(e) => { if (e.key === "Enter" && isValid && !submitting) onSubmit(name.trim()); }}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
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
            onClick={() => onSubmit(name.trim())}
            disabled={!isValid || submitting}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
