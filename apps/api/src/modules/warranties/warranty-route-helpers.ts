export const WARRANTY_MANAGER_ROLES = ["ADMIN", "MANAGER"];

export type WarrantyRecordQuery = {
  cursor?: string;
  limit?: string;
  status?: string;
  customerId?: string;
  productId?: string;
  expiringWithinDays?: string;
};

export type WarrantyClaimQuery = {
  cursor?: string;
  limit?: string;
  status?: string;
};

export function canManageWarranties(role: string) {
  return WARRANTY_MANAGER_ROLES.includes(role);
}

export function isWarrantyAdmin(role: string) {
  return role === "ADMIN";
}

export function buildWarrantyRecordFilters(query: WarrantyRecordQuery) {
  return {
    cursor: query.cursor,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    status: query.status,
    customerId: query.customerId,
    productId: query.productId,
    expiringWithinDays: query.expiringWithinDays
      ? parseInt(query.expiringWithinDays, 10)
      : undefined,
  };
}

export function buildWarrantyClaimFilters(query: WarrantyClaimQuery) {
  return {
    cursor: query.cursor,
    limit: query.limit ? parseInt(query.limit, 10) : undefined,
    status: query.status,
  };
}
