/**
 * POS role and permission matrix.
 *
 * Android remains POS-only: this matrix controls store-floor actions, while
 * user/role administration stays in ERP.
 */
export const ROLE_LEVEL: Record<string, number> = {
  CASHIER: 1,
  WAREHOUSE_STAFF: 1,
  SALES: 1,
  LEAD_CASHIER: 2,
  SHIFT_LEAD: 2,
  SUPERVISOR: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export const POS_PERMISSIONS = {
  processSale: 1,
  holdCart: 1,
  searchProducts: 1,
  addToCart: 1,
  printBarcode: 1,
  stockCheckAllLocations: 1,
  reprintOwnReceipt: 1,

  applyLineDiscount5: 1,
  applyLineDiscount15: 2,
  applyCartDiscount: 2,
  zReading: 2,
  viewAllTransactions: 2,
  reprintAnyReceipt: 2,
  runSetupWizard: 2,

  applyLineDiscountAny: 3,
  voidSale: 3,
  processRefund: 3,
  priceOverride: 3,
  cashDrawerException: 3,
  closeShift: 3,
  reviewOfflineConflicts: 3,
  certifyHardware: 3,
  viewManagerAudit: 3,
  overrideDotFIFO: 3,
  overrideNegativeStock: 3,
  viewSalesReports: 3,
  viewCostPrice: 3,
  viewMargin: 3,

  posSettings: 4,
  changeStoreBinding: 4,
} as const;

export type PosPermission = keyof typeof POS_PERMISSIONS;

export function getDiscountPermissionLevel(percentage: number): number {
  if (percentage <= 5) return POS_PERMISSIONS.applyLineDiscount5;
  if (percentage <= 15) return POS_PERMISSIONS.applyLineDiscount15;
  return POS_PERMISSIONS.applyLineDiscountAny;
}

export function getRoleLevel(role: string | undefined | null): number {
  return ROLE_LEVEL[(role ?? '').toUpperCase()] ?? 1;
}

export function getRequiredRoleLabel(requiredLevel: number): string {
  if (requiredLevel >= 4) return 'Admin';
  if (requiredLevel >= 3) return 'Manager';
  if (requiredLevel >= 2) return 'Lead Cashier';
  return 'Cashier';
}
