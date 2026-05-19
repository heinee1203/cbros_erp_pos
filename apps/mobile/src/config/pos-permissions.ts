/**
 * POS Role-Based Access Control
 *
 * Maps existing user roles to numeric permission levels:
 *   CASHIER (1)         — basic: sell, search, scan, print
 *   MANAGER (2)         — elevated: discount >5%, void, Z-read, DOT override
 *   ADMIN (3)           — full: refund, price override, settings, see costs
 *   WAREHOUSE_STAFF (1) — treated as CASHIER level on POS
 */

export const ROLE_LEVEL: Record<string, number> = {
  CASHIER: 1,
  WAREHOUSE_STAFF: 1,
  SALES: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export const POS_PERMISSIONS = {
  // Basic POS operations (level 1 — all roles)
  processSale: 1,
  holdCart: 1,
  searchProducts: 1,
  addToCart: 1,
  printBarcode: 1,
  stockCheckAllLocations: 1,
  reprintOwnReceipt: 1,

  // Tiered discount control
  applyLineDiscount5: 1,    // CASHIER+ — up to 5%
  applyLineDiscount15: 2,   // MANAGER+ — up to 15%
  applyLineDiscountAny: 3,  // ADMIN only — any %
  applyCartDiscount: 2,     // MANAGER+

  // Elevated actions (level 2 — MANAGER+)
  voidSale: 2,
  zReading: 2,
  viewAllTransactions: 2,
  reprintAnyReceipt: 2,
  overrideDotFIFO: 2,
  overrideNegativeStock: 2,
  viewSalesReports: 2,
  manageProductPrice: 2,

  // Full access (level 3 — ADMIN only)
  processRefund: 3,
  priceOverride: 3,
  viewCostPrice: 3,
  viewMargin: 3,
  posSettings: 3,
  changeStoreBinding: 3,
} as const;

export type PosPermission = keyof typeof POS_PERMISSIONS;

/**
 * Get the minimum required level for a given discount percentage.
 */
export function getDiscountPermissionLevel(percentage: number): number {
  if (percentage <= 5) return POS_PERMISSIONS.applyLineDiscount5;
  if (percentage <= 15) return POS_PERMISSIONS.applyLineDiscount15;
  return POS_PERMISSIONS.applyLineDiscountAny;
}
