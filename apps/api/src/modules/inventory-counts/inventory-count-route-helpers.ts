import { z } from "zod";

export const MANAGER_ROLES = ["ADMIN", "MANAGER"];

export const countsQuerySchema = z.object({
  status: z.string().optional(),
  locationId: z.string().uuid().optional(),
  countType: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

export const countItemsQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export function isInventoryCountManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

export function getInventoryCountErrorStatus(err: { message?: string }) {
  return err.message?.includes("not found") ? 404 : 400;
}
