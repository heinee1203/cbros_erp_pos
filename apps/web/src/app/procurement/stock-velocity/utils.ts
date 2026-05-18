export function fmtPeso(value: number): string {
  return `\u20B1${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 180) return `${Math.floor(diffDays / 30)}mo ago`;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    year: "numeric",
  });
}

export function getUrgencyColor(value: number | null): string {
  if (value === null) return "";
  if (value <= 0.5) return "bg-[rgba(181,101,29,0.6)] text-white";
  if (value <= 1.5) return "bg-[rgba(212,160,23,0.5)] text-black";
  if (value <= 3.0) return "bg-[rgba(198,142,23,0.3)]";
  return "";
}
