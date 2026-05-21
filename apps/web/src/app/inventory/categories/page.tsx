"use client";

import { useState, useMemo, useRef } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { CategoriesPageHeader } from "./components/categories-page-header";
import { CategorySearchBar } from "./components/category-search-bar";
import { CategoryModal } from "./components/category-modal";
import { FamilyGroup } from "./components/category-tree";
import { DeleteConfirmModal } from "./components/delete-confirm-modal";
import { FamilyEditModal } from "./components/family-edit-modal";
import { SubcategoryModal } from "./components/subcategory-modal";
import { EMPTY_CATEGORIES } from "./constants";

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

  async function handleRemoveEmpty() {
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
      <CategoriesPageHeader
        totalFamilies={totalFamilies}
        totalCategories={totalCategories}
        totalSubcategories={totalSubcategories}
        totalItems={totalItems}
        onCreate={openCreate}
        onRemoveEmpty={handleRemoveEmpty}
      />

      <CategorySearchBar
        value={searchQuery}
        onChange={handleSearchChange}
        onClear={() => {
          setSearchQuery("");
          setDebouncedSearch("");
        }}
      />

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
