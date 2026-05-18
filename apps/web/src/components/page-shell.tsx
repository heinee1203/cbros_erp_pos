import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState, WorkspacePage } from "@/components/ui/layout";

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
    <WorkspacePage>
      <EmptyState
        icon={Icon}
        title={title}
        description={description}
        action={relatedHref && (
          <Link
            href={relatedHref}
            className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
          >
            {relatedLabel ?? "Go to related page"}
          </Link>
        )}
      />
    </WorkspacePage>
  );
}
