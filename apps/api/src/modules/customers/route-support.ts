import { AR_ROLES } from "@apex/types";

export function assertArRole(role: string) {
  if (!AR_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for customer account operations");
  }
}

export function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new Error("Only ADMIN can perform this operation");
  }
}
