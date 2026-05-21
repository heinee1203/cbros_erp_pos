import type { ReactNode } from "react";

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
