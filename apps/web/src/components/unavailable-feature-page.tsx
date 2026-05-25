import Link from "next/link";
import { Construction } from "lucide-react";

interface UnavailableFeaturePageProps {
  title: string;
  description: string;
  returnHref: string;
  returnLabel: string;
}

export function UnavailableFeaturePage({
  title,
  description,
  returnHref,
  returnLabel,
}: UnavailableFeaturePageProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
          <Construction size={24} />
        </div>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.18em] text-amber-800">
          Hidden until operational
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        <Link
          href={returnHref}
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-border bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {returnLabel}
        </Link>
      </div>
    </div>
  );
}
