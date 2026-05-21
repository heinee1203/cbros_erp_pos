"use client";

import type { ElementType, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]";

export function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive"> *</span>}
    </label>
  );
}

export function CurrencyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
        {"\u20b1"}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
        className={cn(fieldClass, "pl-7")}
      />
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function FormSection({
  icon: Icon,
  title,
  collapsed,
  onToggle,
  badge,
  children,
}: {
  id: string;
  icon: ElementType;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <span className="flex-1 text-[13px] font-semibold text-foreground">
          {title}
        </span>
        {badge && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
        {collapsed ? (
          <ChevronRight size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <div className="border-t border-border px-4 pb-4 pt-3">{children}</div>
      )}
    </div>
  );
}
