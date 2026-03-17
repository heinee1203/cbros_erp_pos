"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  id: string;
  name: string;
}

interface SelectWithQuickAddProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabledPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  onQuickAdd: (name: string) => Promise<{ id: string } | null>;
  /** CSS class applied to the wrapper label */
  labelClassName?: string;
  /** CSS class applied to the select element */
  selectClassName?: string;
  /** Whether to show the quick add button (e.g. hide for non-admin roles) */
  canAdd?: boolean;
}

export function SelectWithQuickAdd({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabledPlaceholder,
  disabled = false,
  required = false,
  onQuickAdd,
  labelClassName,
  selectClassName,
  canAdd = true,
}: SelectWithQuickAddProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [adding]);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const result = await onQuickAdd(trimmed);
      if (result?.id) {
        onChange(result.id);
      }
      setNewName("");
      setAdding(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAdding(false);
    setNewName("");
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const displayPlaceholder = disabled && disabledPlaceholder
    ? disabledPlaceholder
    : placeholder;

  return (
    <div>
      {/* Label row */}
      <div className="mb-1 flex items-center justify-between">
        <span className={labelClassName}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {canAdd && !disabled && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
            title={`Add new ${label.toLowerCase()}`}
          >
            <Plus size={12} />
            New
          </button>
        )}
      </div>

      {adding ? (
        /* Inline quick-add form */
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`New ${label.toLowerCase()} name…`}
              disabled={saving}
              className={cn(
                "h-9 flex-1 rounded-lg border border-primary/40 bg-background px-3 text-[13px] text-foreground outline-none ring-2 ring-primary/[0.08] placeholder:text-muted-foreground/50",
                saving && "opacity-60",
              )}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
              title="Save"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
        </div>
      ) : (
        /* Normal select */
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]",
            disabled && "cursor-not-allowed opacity-50",
            selectClassName,
          )}
        >
          <option value="">{displayPlaceholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
