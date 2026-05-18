import { UserRole } from "@apex/types";

export const ADJUSTMENT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

export function isAdjustmentRole(role: unknown) {
  return ADJUSTMENT_ROLES.includes(role as UserRole);
}

export function parseAdjustmentPagination(
  query: Record<string, string | undefined>,
) {
  const page = parseInt(query.page ?? "1", 10);
  const limit = Math.min(parseInt(query.limit ?? "50", 10), 200);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function isDuplicateAdjustmentRequestError(err: unknown) {
  const error = err as { code?: string; message?: string };

  return (
    error.code === "23505" ||
    error.message?.includes("unique constraint") ||
    error.message?.includes("duplicate key") ||
    error.message?.includes("idempotency_key")
  );
}
