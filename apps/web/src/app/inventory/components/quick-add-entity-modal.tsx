"use client";

import { useState } from "react";

export type QuickAddEntityType = "family" | "category" | "subcategory" | "brand";

interface EntityOption {
  id: string;
  name: string;
}

interface EntityCreateMutation<TInput> {
  mutateAsync: (input: TInput) => Promise<unknown>;
}

interface QuickAddEntityModalProps {
  type: QuickAddEntityType;
  families: EntityOption[];
  categories: EntityOption[];
  onClose: () => void;
  onCreated: (type: QuickAddEntityType, id: string) => void;
  createFamily: EntityCreateMutation<{ name: string }>;
  createCategory: EntityCreateMutation<{ name: string; slug: string; familyId?: string }>;
  createSubcategory: EntityCreateMutation<{ name: string; slug: string; categoryId: string }>;
  createBrand: EntityCreateMutation<{ name: string; slug: string }>;
}

export function QuickAddEntityModal({
  type,
  families,
  categories,
  onClose,
  onCreated,
  createFamily,
  createCategory,
  createSubcategory,
  createBrand,
}: QuickAddEntityModalProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const titles: Record<QuickAddEntityType, string> = {
    family: "Add New Family",
    category: "Add New Category",
    subcategory: "Add New Sub-category",
    brand: "Add New Brand",
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setSaving(true);
    setError("");
    try {
      let result: unknown;
      if (type === "family") {
        result = await createFamily.mutateAsync({ name: name.trim() });
      } else if (type === "category") {
        result = await createCategory.mutateAsync({ name: name.trim(), slug, familyId: parentId || undefined });
      } else if (type === "subcategory") {
        if (!parentId) {
          setError("Category is required");
          setSaving(false);
          return;
        }
        result = await createSubcategory.mutateAsync({ name: name.trim(), slug, categoryId: parentId });
      } else {
        result = await createBrand.mutateAsync({ name: name.trim(), slug });
      }
      onCreated(type, getCreatedId(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setSaving(false);
    }
  };

  const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold">{titles[type]}</h3>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={`Enter ${type} name...`}
              className={fieldClass}
            />
          </div>
          {type === "category" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Family</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={fieldClass}>
                <option value="">No family</option>
                {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
              </select>
            </div>
          )}
          {type === "subcategory" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category *</label>
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={fieldClass}>
                <option value="">Select category...</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getCreatedId(result: unknown): string {
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    return typeof id === "string" ? id : "";
  }
  return "";
}
