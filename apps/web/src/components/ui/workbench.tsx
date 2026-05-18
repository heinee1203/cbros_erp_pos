import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkbenchPanelProps {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WorkbenchPanel({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  children,
  className,
}: WorkbenchPanelProps) {
  return (
    <section className={cn("surface-card overflow-hidden rounded-2xl", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Icon size={15} strokeWidth={1.8} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
            {description && (
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</div>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}

export function MetricCard({
  label,
  value,
  color = "text-foreground",
  highlight = false,
}: MetricCardProps) {
  return (
    <div className="bg-background/78 px-4 py-3">
      <div className={cn("text-xl font-bold tabular-nums tracking-[-0.03em]", color, highlight && "animate-pulse")}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

interface KpiCardProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  subtitle: string;
  alert?: boolean;
}

export function KpiCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtitle,
  alert = false,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "surface-card rounded-2xl px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        alert && "border-amber-300/80 bg-amber-50/35",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", iconColor)}>
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-[20px] font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
    </div>
  );
}

interface WorkbenchLinkProps {
  icon: LucideIcon;
  label: string;
  href: string;
}

export function WorkbenchLink({ icon: Icon, label, href }: WorkbenchLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-md"
    >
      <Icon size={13} strokeWidth={1.75} className="text-muted-foreground" />
      {label}
    </Link>
  );
}
