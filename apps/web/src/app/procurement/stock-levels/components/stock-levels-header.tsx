import Link from "next/link";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/layout";

export function StockLevelsHeader() {
  return (
    <PageHeader
      icon={Warehouse}
      eyebrow="Procurement Control"
      title="Stock Levels"
      description="Monitor on-hand, reserved, and available stock, then identify items below reorder point before the shelves go quiet."
      actions={
        <>
          <Link
            href="/procurement/suggested-orders"
            className="rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/[0.04] hover:shadow-md"
          >
            Suggested Orders
          </Link>
          <Link
            href="/procurement/purchase-orders"
            className="rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md"
          >
            Purchase Orders
          </Link>
        </>
      }
    />
  );
}
