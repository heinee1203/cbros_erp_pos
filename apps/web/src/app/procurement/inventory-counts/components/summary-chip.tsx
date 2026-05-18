type SummaryChipProps = {
  label: string;
  value: string;
  color?: string;
};

export function SummaryChip({ label, value, color }: SummaryChipProps) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${color ?? "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
