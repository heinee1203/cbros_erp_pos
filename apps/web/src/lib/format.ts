/**
 * Shared formatting utilities for the Apex POS web dashboard.
 * All monetary values use PHP (₱) and en-PH locale.
 */

export function fmtPeso(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "\u2014";
  return `\u20B1${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-PH");
}

export function fmtPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

/**
 * Build a display name for a product, prepending the parent name for variants.
 * Matches the established pattern: "Parent Name (Variant Name)" for variants,
 * or just "Product Name" for standalone products.
 */
/** Relative time string like "3d ago", "2w ago", "1mo ago" */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function getProductDisplayName(product: {
  name: string;
  parentName?: string | null;
  parentProductId?: string | null;
}): string {
  if (product.parentName && product.parentProductId) {
    return `${product.parentName} (${product.name})`;
  }
  return product.name;
}
