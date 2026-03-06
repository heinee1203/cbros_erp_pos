import { z } from "zod";
import { LocationType, UserRole, ProductCategory, TransferStatus } from "./enums.js";

// ── Auth ──
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  orgName: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
});
export type RegisterInput = z.infer<typeof registerSchema>;

// ── Mnemonic SKU ──
export const mnemonicSkuSchema = z
  .string()
  .length(10, "Mnemonic SKU must be exactly 10 characters")
  .regex(/^[A-Z]{10}$/, "Mnemonic SKU must be 10 uppercase letters");
export type MnemonicSku = z.infer<typeof mnemonicSkuSchema>;

// ── Pagination ──
export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

// ── Paginated Response ──
export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── JWT Payload ──
export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  primaryLocationId: string;
}

// ── Store Context ──
export interface StoreContext {
  locationId: string;
  orgId: string;
  locationType: string;
}
