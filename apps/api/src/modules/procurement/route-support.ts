import { PROCUREMENT_ROLES } from "@apex/types";

export function assertProcurementRole(role: string) {
  if (!PROCUREMENT_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for procurement operations");
  }
}

export function isIdempotencyError(err: any): boolean {
  return (
    err.code === "23505" ||
    err.message?.includes("unique constraint") ||
    err.message?.includes("idempotency")
  );
}

export function isContentionError(err: any): boolean {
  return (
    err.code === "55P03" ||
    err.message?.includes("could not obtain lock") ||
    err.message?.includes("deadlock detected")
  );
}
