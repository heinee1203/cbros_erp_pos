import { POS_ROLES, REFUND_ROLES } from "@apex/types";

export function assertPosRole(role: string) {
  if (!POS_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for POS operations");
  }
}

export function canRefundWithRole(role: string | undefined) {
  return REFUND_ROLES.includes(role as any);
}

export function canVoidWithRole(role: string | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}
