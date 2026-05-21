import { cn } from "@/lib/utils";

type DetailInfoRowProps = {
  label: string;
  value: string;
  mono?: boolean;
  statusColor?: string;
};

export function DetailInfoRow({ label, value, mono, statusColor }: DetailInfoRowProps) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-[60%] truncate text-right text-sm font-medium",
          mono && "font-mono text-[13px]",
          statusColor ?? "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
