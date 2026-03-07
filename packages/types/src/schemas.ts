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

// ── Stock Journal ──
export const stockJournalEntrySchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  changeQuantity: z.number().int(),
  referenceType: z.enum(["SALE", "RECEIVING", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "RETURN", "STOCKTAKE", "VOID"]),
  referenceId: z.string().uuid(),
  referenceLineId: z.string().uuid().optional(),
  unitCostSnapshot: z.string().optional(),
  actorType: z.enum(["USER", "SYSTEM"]).default("USER"),
  effectiveAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type StockJournalEntry = z.infer<typeof stockJournalEntrySchema>;

// ── Product Family ──
export const productFamilySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
});
export type ProductFamilyInput = z.infer<typeof productFamilySchema>;

// ── Vehicle Compatibility ──
export const vehicleCompatibilitySchema = z.object({
  productId: z.string().uuid(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  yearStart: z.number().int().min(1900).max(2100),
  yearEnd: z.number().int().min(1900).max(2100),
  engine: z.string().max(100).optional(),
  notes: z.string().max(255).optional(),
});
export type VehicleCompatibilityInput = z.infer<typeof vehicleCompatibilitySchema>;
