import type { SortDir, SortField } from "./stock-level-route-service";

export const VALID_STOCK_STATUSES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"];

export const VALID_SORT_FIELDS: SortField[] = [
  "name",
  "sku",
  "category",
  "location",
  "stockLevel",
  "reservedLevel",
  "available",
  "reorderPoint",
  "lastSoldAt",
  "status",
];

export const VALID_SORT_DIRS: SortDir[] = ["asc", "desc"];

export function isManagerRole(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

export function getUserRole(request: { user?: unknown }) {
  return (request.user as any)?.role as string | undefined;
}
