import { REFUND_ROLES } from "@apex/types";
import { z } from "zod";

export const returnsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  originalSaleId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

export function canAccessReturnsAcrossLocations(role: string) {
  return ["ADMIN", "MANAGER"].includes(role);
}

export function canCreateReturn(role: string) {
  return REFUND_ROLES.includes(role as any);
}

export function isDuplicateReturnRequestError(err: unknown) {
  const error = err as { code?: string; message?: string };

  return (
    error.code === "23505" ||
    error.message?.includes("unique constraint") ||
    error.message?.includes("idempotency")
  );
}
