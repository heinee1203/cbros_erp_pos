export const CATEGORY_MANAGE_ROLES = ["ADMIN", "MANAGER"];
export const CATEGORY_PERMISSION_ERROR =
  "Only ADMIN or MANAGER can manage categories";

export type CategoryListQuery = Record<string, string | undefined>;

export function getCategoryUserRole(user: unknown) {
  return (user as { role?: string } | null | undefined)?.role;
}

export function canManageCategories(role: string | undefined) {
  return CATEGORY_MANAGE_ROLES.includes(role ?? "");
}

export function getCategoryRouteErrorMessage(err: unknown) {
  return (err as { message: string }).message;
}

export function getCategoryMutationErrorStatus(message: string) {
  return message.includes("not found") ? 404 : 400;
}
