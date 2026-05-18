import type { BackorderItem, SupplierGroup } from "../types";

function matchesBackorderSearch(item: BackorderItem, query: string) {
  return (
    item.productName.toLowerCase().includes(query) ||
    item.sku.toLowerCase().includes(query) ||
    item.supplierName.toLowerCase().includes(query) ||
    (item.sourcePONumber ?? "").toLowerCase().includes(query)
  );
}

export function filterSupplierGroups(
  supplierGroups: SupplierGroup[],
  searchQuery: string,
) {
  if (!searchQuery.trim()) return supplierGroups;

  const q = searchQuery.toLowerCase();
  return supplierGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.productName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          (item.sourcePONumber ?? "").toLowerCase().includes(q),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function filterBackorderItems(
  flatItems: BackorderItem[],
  searchQuery: string,
) {
  if (!searchQuery.trim()) return flatItems;

  const q = searchQuery.toLowerCase();
  return flatItems.filter((item) => matchesBackorderSearch(item, q));
}

export function countGroupedPending(supplierGroups: SupplierGroup[]) {
  return supplierGroups.reduce(
    (sum, group) =>
      sum + group.items.filter((item) => item.status === "PENDING").length,
    0,
  );
}
