import { UserRole } from "@apex/types";

export const TRANSFER_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

export function assertTransferRole(role: string) {
  if (!TRANSFER_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for transfer operations");
  }
}

export function isTransferRole(role: unknown) {
  return TRANSFER_ROLES.includes(role as any);
}

export function isTransferAdminOrManager(role: string) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}
