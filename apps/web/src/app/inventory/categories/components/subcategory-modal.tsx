import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import type { SubcategoryRow } from "@/hooks/use-subcategories";
import { cn } from "@/lib/utils";

export interface SubcategoryFormData {
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

type SubcategoryModalProps = {
  mode: "create" | "edit";
  categoryId: string;
  initial: SubcategoryRow | null;
  onClose: () => void;
  onSubmit: (form: SubcategoryFormData) => void;
  submitting: boolean;
  error: string | null;
};

export function SubcategoryModal({
  mode,
  categoryId: _categoryId,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: SubcategoryModalProps) {
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
        className="w-full max-w-md rounded-xl border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
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
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="e.g. Brake Pads"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Slug *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="brake-pads"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
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
