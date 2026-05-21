type QuickAddIdentifiersSectionProps = {
  barcode: string;
  oemNumber: string;
  setBarcode: (value: string) => void;
  setOemNumber: (value: string) => void;
};

export function QuickAddIdentifiersSection({
  barcode,
  oemNumber,
  setBarcode,
  setOemNumber,
}: QuickAddIdentifiersSectionProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          Barcode
        </label>
        <input
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value.slice(0, 50))}
          placeholder="Auto-generated if empty"
          maxLength={50}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">Leave blank to auto-generate a unique barcode</p>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
          OEM Number
        </label>
        <input
          type="text"
          value={oemNumber}
          onChange={(e) => setOemNumber(e.target.value.slice(0, 100))}
          placeholder="e.g. MB295982, 04465-0K160"
          maxLength={100}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        />
      </div>
    </>
  );
}
