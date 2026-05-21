import { ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2 } from "lucide-react";

import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import type { SubcategoryRow as SubcategoryRecord } from "@/hooks/use-subcategories";
import { cn } from "@/lib/utils";
import { INITIAL_VISIBLE } from "../constants";

type FamilyGroupProps = {
  family: ProductFamily;
  categories: CategoryRow[];
  familyItemCount: number;
  subcategoriesByCategory: Map<string, SubcategoryRecord[]>;
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
  onEditSubcategory: (sub: SubcategoryRecord) => void;
  onDeleteSubcategory: (sub: SubcategoryRecord) => void;
  onAddCategory: () => void;
  onEditFamily: () => void;
  onDeleteFamily: () => void;
};

export function FamilyGroup({
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
}: FamilyGroupProps) {
  const visibleCats = showAllCats ? categories : categories.slice(0, INITIAL_VISIBLE);
  const hasMoreCats = categories.length > INITIAL_VISIBLE && !showAllCats;
  const isUngrouped = family.id === "__ungrouped__";

  return (
    <div>
      <div
        onClick={onToggleFamily}
        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          {isExpanded ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </div>

        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/[0.08]">
          <Layers size={13} className="text-primary" />
        </div>

        <span className="flex-1 text-[14px] font-semibold text-foreground">{family.name}</span>

        <span className="text-[12px] tabular-nums text-muted-foreground">
          {familyItemCount.toLocaleString()} items
        </span>
        <span className="text-[11px] text-muted-foreground/60">&middot;</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {categories.length} {categories.length === 1 ? "category" : "categories"}
        </span>

        {!isUngrouped && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAddCategory();
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              title="Add category under this family"
            >
              <Plus size={12} />
              Category
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onEditFamily();
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit family"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDeleteFamily();
              }}
              disabled={categories.length > 0}
              className={cn(
                "rounded-md p-1.5 transition-all",
                categories.length > 0
                  ? "cursor-not-allowed text-muted-foreground/30"
                  : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              )}
              title={categories.length > 0 ? `Cannot delete - ${categories.length} categories assigned` : "Delete family"}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

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
                  className="w-full py-1.5 text-center text-[12px] font-medium text-primary transition-colors hover:bg-accent/40"
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

type CategoryGroupProps = {
  category: CategoryRow;
  subcategories: SubcategoryRecord[];
  isExpanded: boolean;
  showAllSubs: boolean;
  onToggleExpand: () => void;
  onToggleShowAllSubs: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddSubcategory: () => void;
  onEditSubcategory: (sub: SubcategoryRecord) => void;
  onDeleteSubcategory: (sub: SubcategoryRecord) => void;
};

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
}: CategoryGroupProps) {
  const visibleSubs = showAllSubs ? subcategories : subcategories.slice(0, INITIAL_VISIBLE);
  const hasMoreSubs = subcategories.length > INITIAL_VISIBLE && !showAllSubs;

  return (
    <div>
      <div className="group flex items-center gap-3 py-1.5 pl-8 pr-4 transition-colors hover:bg-accent/40">
        <button onClick={onToggleExpand} className="flex h-5 w-5 shrink-0 items-center justify-center">
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

        <div
          className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: cat.color || "#94A3B8" }}
        />

        <button
          onClick={onToggleExpand}
          className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-foreground"
        >
          {cat.name}
        </button>

        <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
          {cat.productCount.toLocaleString()} items
        </span>
        {subcategories.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">{subcategories.length} sub</span>
        )}

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
                ? "cursor-not-allowed text-muted-foreground/30 opacity-0"
                : "text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive",
            )}
            title={cat.productCount > 0 ? `${cat.productCount} items assigned` : "Delete category"}
            disabled={cat.productCount > 0}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

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
                  className="w-full py-2 text-center text-[11px] font-medium text-primary transition-colors hover:bg-accent/40"
                >
                  Show all {subcategories.length} sub-categories
                </button>
              )}

              {subcategories.length === 0 && (
                <div className="py-3 pl-14 pr-4 text-[12px] text-muted-foreground">No sub-categories</div>
              )}

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

type SubcategoryRowProps = {
  subcategory: SubcategoryRecord;
  onEdit: () => void;
  onDelete: () => void;
};

function SubcategoryRow({ subcategory: sub, onEdit, onDelete }: SubcategoryRowProps) {
  return (
    <div className="group flex items-center gap-3 py-2 pl-14 pr-4 transition-colors hover:bg-accent/40">
      <div className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{sub.name}</span>

      <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary/[0.04] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
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
              ? "cursor-not-allowed text-muted-foreground/30 opacity-0"
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
