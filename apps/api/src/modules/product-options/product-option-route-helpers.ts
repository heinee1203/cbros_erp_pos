export const PRODUCT_OPTION_MANAGE_ROLES = ["ADMIN", "MANAGER"];
export const PRODUCT_OPTION_PERMISSION_ERROR =
  "Only ADMIN or MANAGER can manage options";

export type ProductOptionValueBody = {
  value?: string;
};

export function getProductOptionUserRole(user: unknown) {
  return (user as { role?: string } | null | undefined)?.role;
}

export function canManageProductOptions(role: string | undefined) {
  return PRODUCT_OPTION_MANAGE_ROLES.includes(role ?? "");
}

export function getProductOptionErrorMessage(err: unknown) {
  return (err as { message?: string }).message;
}

export function hasProductOptionValue(
  body: ProductOptionValueBody,
): body is { value: string } {
  return !!body.value && body.value.length > 0;
}
