export const MANAGE_PRODUCT_SUPPLIER_ROLES = ["ADMIN", "MANAGER"];

export type ProductSupplierCreateBody = {
  supplierId: string;
  priority?: number;
  supplierSku?: string;
  supplierCost?: string;
  minOrderQty?: number;
  leadTimeDays?: number;
  notes?: string;
};

export type ProductSupplierUpdateBody = {
  priority?: number;
  supplierSku?: string | null;
  supplierCost?: string | null;
  minOrderQty?: number;
  leadTimeDays?: number | null;
  isActive?: boolean;
  notes?: string | null;
};

export type ProductSupplierReorderBody = {
  orderedIds: string[];
};

export function canManageProductSuppliers(role: string) {
  return MANAGE_PRODUCT_SUPPLIER_ROLES.includes(role);
}

export function isProductSupplierMappingNotFoundError(err: unknown) {
  return (
    (err as { message?: string }).message ===
    "Product-supplier mapping not found"
  );
}

export function hasOrderedProductSupplierIds(
  body: Partial<ProductSupplierReorderBody>,
) {
  return (
    !!body.orderedIds &&
    Array.isArray(body.orderedIds) &&
    body.orderedIds.length > 0
  );
}
