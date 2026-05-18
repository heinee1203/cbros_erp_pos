import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspacePageProps {
  children: React.ReactNode;
  className?: string;
}

export function WorkspacePage({ children, className }: WorkspacePageProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1500px] flex-col gap-5", className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="surface-card relative overflow-hidden rounded-2xl px-5 py-4 sm:px-6">
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(181,101,29,0.13),transparent_18rem)]" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Icon size={18} strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.03em] text-foreground">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  label?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, label = "In Development", action }: EmptyStateProps) {
  return (
    <div className="surface-card relative overflow-hidden rounded-3xl px-6 py-16 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_22rem)]" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/10">
          <Icon size={26} strokeWidth={1.8} />
        </div>
        <span className="mt-6 inline-flex items-center rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <div className="flex min-h-[18rem] items-center justify-center">
      <div className="surface-card flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        {label}
      </div>
    </div>
  );
}
