import { cn } from "@/lib/utils";

type QuickAddPricingSectionProps = {
  costPrice: string;
  setCostPrice: (value: string) => void;
  setUnitPrice: (value: string) => void;
  showCost: boolean;
  unitPrice: string;
};

export function QuickAddPricingSection({
  costPrice,
  setCostPrice,
  setUnitPrice,
  showCost,
  unitPrice,
}: QuickAddPricingSectionProps) {
  return (
    <div className={cn("grid gap-3", showCost ? "grid-cols-2" : "grid-cols-1")}>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          Sell Price
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          />
        </div>
      </div>
      {showCost && (
        <div>
          <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
            Cost Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
