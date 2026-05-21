import { SelectWithQuickAdd } from "@/components/select-with-quick-add";
import type { Brand } from "@/hooks/use-brands";
import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import type { SubcategoryRow } from "@/hooks/use-subcategories";

type QuickAddTaxonomySectionProps = {
  brandId: string;
  brandsList: Brand[];
  categoryId: string;
  families: ProductFamily[];
  familyId: string;
  filteredCategories: CategoryRow[];
  handleCategoryChange: (id: string) => void;
  handleFamilyChange: (id: string) => void;
  quickAddBrand: (name: string) => Promise<{ id: string }>;
  quickAddCategory: (name: string) => Promise<{ id: string }>;
  quickAddSubcategory: (name: string) => Promise<{ id: string }>;
  setBrandId: (value: string) => void;
  setSubcategoryId: (value: string) => void;
  subcategories: SubcategoryRow[];
  subcategoryId: string;
};

export function QuickAddTaxonomySection({
  brandId,
  brandsList,
  categoryId,
  families,
  familyId,
  filteredCategories,
  handleCategoryChange,
  handleFamilyChange,
  quickAddBrand,
  quickAddCategory,
  quickAddSubcategory,
  setBrandId,
  setSubcategoryId,
  subcategories,
  subcategoryId,
}: QuickAddTaxonomySectionProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          Family <span className="text-destructive">*</span>
        </label>
        <select
          value={familyId}
          onChange={(e) => handleFamilyChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">Select family…</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <SelectWithQuickAdd
        label="Category"
        value={categoryId}
        onChange={handleCategoryChange}
        options={filteredCategories}
        placeholder="Select category…"
        disabledPlaceholder="Select a family first"
        disabled={!familyId}
        labelClassName="text-[12px] font-medium text-muted-foreground"
        canAdd={!!familyId}
        onQuickAdd={quickAddCategory}
      />

      <SelectWithQuickAdd
        label="Sub-category"
        value={subcategoryId}
        onChange={(v) => setSubcategoryId(v)}
        options={subcategories}
        placeholder="Select sub-category…"
        disabledPlaceholder="Select a category first"
        disabled={!categoryId}
        labelClassName="text-[12px] font-medium text-muted-foreground"
        canAdd={!!categoryId}
        onQuickAdd={quickAddSubcategory}
      />

      <SelectWithQuickAdd
        label="Brand"
        value={brandId}
        onChange={(v) => setBrandId(v)}
        options={brandsList}
        placeholder="No Brand"
        labelClassName="text-[12px] font-medium text-muted-foreground"
        onQuickAdd={quickAddBrand}
      />
    </>
  );
}
