import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface PageShellProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional link to a related functional page */
  relatedHref?: string;
  relatedLabel?: string;
}

export function PageShell({ icon: Icon, title, description, relatedHref, relatedLabel }: PageShellProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Icon size={24} className="text-muted-foreground" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <span className="mt-4 inline-flex items-center rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
        In Development
      </span>
      {relatedHref && (
        <Link
          href={relatedHref}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          {relatedLabel ?? "Go to related page"} →
        </Link>
      )}
    </div>
  );
}
