import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function ImportItemsHeader() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Import Center</h1>
          <p className="text-sm text-muted-foreground">Import data from Loyverse CSV exports</p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-border">
        <Link
          href="/inventory/import"
          className="border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
        >
          Item Catalog
        </Link>
        <Link
          href="/inventory/import-sales"
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Sales Receipts
        </Link>
        <Link
          href="/inventory/import/history"
          className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Inventory Movements
        </Link>
      </div>
    </>
  );
}
