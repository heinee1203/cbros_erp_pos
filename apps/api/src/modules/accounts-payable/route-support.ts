import { z } from "zod";

const AP_ROLES = ["ADMIN", "MANAGER"];

export function assertApRole(role: string) {
  if (!AP_ROLES.includes(role)) {
    throw Object.assign(new Error("Insufficient role for AP operations"), { statusCode: 403 });
  }
}

export function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw Object.assign(new Error("Only ADMIN can perform this action"), { statusCode: 403 });
  }
}

export const invoiceQuerySchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
});

export const cvQuerySchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const soaQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
