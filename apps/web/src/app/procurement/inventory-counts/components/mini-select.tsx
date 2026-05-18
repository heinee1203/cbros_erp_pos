import { ChevronDown } from "lucide-react";

type MiniSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

export function MiniSelect({ value, onChange, options }: MiniSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 appearance-none rounded border border-border bg-background pl-2 pr-6 text-[11px] text-foreground outline-none focus:border-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/60"
      />
    </div>
  );
}
