type QuickAddIdentitySectionProps = {
  name: string;
  setName: (value: string) => void;
  setSku: (value: string) => void;
  sku: string;
};

export function QuickAddIdentitySection({
  name,
  setName,
  setSku,
  sku,
}: QuickAddIdentitySectionProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          Item Name <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Castrol Edge 5W-30 4L"
          autoFocus
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          SKU <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          placeholder="e.g. LUB-005001"
          className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
      </div>

    </>
  );
}
