import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import type { CategoryRow } from "@/hooks/use-categories";
import type { ProductFamily } from "@/hooks/use-products";
import { cn } from "@/lib/utils";
import { PRESET_COLORS } from "../constants";

export interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  familyId: string | null;
}

type CategoryModalProps = {
  mode: "create" | "edit";
  initial: CategoryRow | null;
  families: ProductFamily[];
  lockedFamilyId?: string;
  lockedFamilyName?: string;
  onClose: () => void;
  onSubmit: (form: CategoryFormData) => void;
  submitting: boolean;
  error: string | null;
};

export function CategoryModal({
  mode,
  initial,
  families,
  lockedFamilyId,
  lockedFamilyName,
  onClose,
  onSubmit,
  submitting,
  error,
}: CategoryModalProps) {
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

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      ...(autoSlug ? { slug: slugify(value) } : {}),
    }));
  }

  function handleSlugChange(value: string) {
    setAutoSlug(false);
    setForm((current) => ({ ...current, slug: value }));
  }

  const isValid = form.name.trim().length > 0 && form.slug.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
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
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="e.g. Brake Parts"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Slug *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="brake-parts"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Family</label>
            {lockedFamilyName ? (
              <div className="flex h-9 w-full items-center rounded-lg border border-border bg-muted/50 px-3 text-[13px] text-foreground">
                {lockedFamilyName}
              </div>
            ) : (
              <select
                value={form.familyId ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, familyId: event.target.value || null }))}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              >
                <option value="">None (Ungrouped)</option>
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Brief description..."
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-all",
                      form.color === color ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
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
            className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
