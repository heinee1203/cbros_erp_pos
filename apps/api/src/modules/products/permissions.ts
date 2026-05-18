export const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export function hasProductManageRole(role: string | null | undefined) {
  return MANAGE_ROLES.includes(role ?? "");
}
