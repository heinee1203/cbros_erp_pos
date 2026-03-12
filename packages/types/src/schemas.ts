import { z } from "zod";

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
  referenceType: z.enum(["SALE", "RECEIVING", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "RETURN", "STOCKTAKE", "VOID", "JOB_CARD_ISSUE", "JOB_CARD_RETURN"]),
  referenceId: z.string().uuid(),
  referenceLineId: z.string().uuid().optional(),
  unitCostSnapshot: z.string().optional(),
  actorType: z.enum(["USER", "SYSTEM", "INTEGRATION"]).default("USER"),
  effectiveAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});
export type StockJournalEntry = z.infer<typeof stockJournalEntrySchema>;

// ── Product: Create ──
const PRODUCT_CATEGORIES = [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
] as const;

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  sku: z.string().min(1, "SKU is required").max(50),
  mnemonicSku: z
    .string()
    .length(10, "Mnemonic SKU must be exactly 10 characters")
    .regex(/^[A-Z]{10}$/, "Mnemonic SKU must be 10 uppercase letters"),
  category: z.enum(PRODUCT_CATEGORIES, { required_error: "Category is required" }),
  unitPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Unit price must be a non-negative decimal (e.g. '10.00')" },
  ),
  costPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Cost price must be a non-negative decimal (e.g. '5.00')" },
  ),
  barcode: z.string().regex(/^\d{13}$/, "Barcode must be exactly 13 digits").optional(),
  familyId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  trackInventory: z.boolean().default(true),
  reorderPoint: z.number().int().min(0).default(10),
  leadTimeDays: z.number().int().min(0).default(7),
  initialStock: z.number().int().min(0).default(0),
  locationIds: z.array(z.string().uuid()).optional(), // locations to seed inventory
  vehicleCompatibility: z
    .array(
      z.object({
        make: z.string().min(1).max(100),
        model: z.string().min(1).max(100),
        yearStart: z.number().int().min(1900).max(2100),
        yearEnd: z.number().int().min(1900).max(2100),
        engine: z.string().max(100).optional(),
        notes: z.string().max(255).optional(),
      }),
    )
    .optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

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

// ══════════════════════════════════════════════
// Phase 3: Transfer & Adjustment Schemas
// ══════════════════════════════════════════════

const ADJUSTMENT_REASON_CODES = [
  "COUNT_GAIN",
  "FOUND_STOCK",
  "OPENING_BALANCE",
  "COUNT_LOSS",
  "DAMAGE_IN_TRANSIT",
  "DAMAGE_WAREHOUSE",
  "DAMAGE_SHOWROOM",
  "WARRANTY_WRITE_OFF",
  "SHRINKAGE_MISSING",
  "OBSOLETE_WRITE_OFF",
  "TRANSFER_SHORTAGE_CONFIRMED",
  "DATA_CORRECTION",
] as const;

const VARIANCE_REASON_CODES = [
  "DAMAGE_IN_TRANSIT",
  "TRANSFER_SHORTAGE_CONFIRMED",
] as const;

// ── Transfer: Create Draft ──
export const createTransferSchema = z.object({
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        requestedQty: z.number().int().min(1),
      }),
    )
    .min(1, "At least one transfer line is required"),
});
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// ── Transfer: Approve ──
export const approveTransferSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type ApproveTransferInput = z.infer<typeof approveTransferSchema>;

// ── Transfer: Start Picking ──
export const startPickingSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
});
export type StartPickingInput = z.infer<typeof startPickingSchema>;

// ── Transfer: Dispatch ──
export const dispatchTransferSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        transferItemId: z.string().uuid(),
        dispatchQty: z.number().int().min(1),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
export type DispatchTransferInput = z.infer<typeof dispatchTransferSchema>;

// ── Transfer: Receive ──
export const receiveTransferSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        transferItemId: z.string().uuid(),
        receiveQty: z.number().int().min(1),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;

// ── Transfer: Report Variance ──
export const reportVarianceSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        transferItemId: z.string().uuid(),
        varianceQty: z.number().int().min(1),
        reasonCode: z.enum(VARIANCE_REASON_CODES),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
});
export type ReportVarianceInput = z.infer<typeof reportVarianceSchema>;

// ── Transfer: Cancel ──
export const cancelTransferSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;

// ── Manual Adjustment ──
export const createAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  direction: z.enum(["IN", "OUT"]),
  reasonCode: z.enum(ADJUSTMENT_REASON_CODES),
  notes: z.string().max(500).optional(),
  effectiveAt: z.string().datetime().optional(),
  idempotencyKey: z.string().min(1).max(255),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

// ══════════════════════════════════════════════
// Phase 5: POS / Sales Schemas
// ══════════════════════════════════════════════

const SALE_STATUSES = [
  "QUOTE",
  "OPEN",
  "PARKED",
  "COMPLETED",
  "VOIDED",
  "REFUNDED",
] as const;

// ── Sale: Create ──
export const createSaleSchema = z.object({
  locationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  customerVehicleId: z.string().uuid().optional(),
  receiptNumber: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
        overridePrice: z.string().optional(), // numeric as string
        discountAmount: z.string().optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1, "At least one line item is required"),
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// ── Sale: Complete (checkout) ──
const PAYMENT_METHODS = ["CASH", "CARD", "CREDIT_CARD", "DEBIT_CARD", "EFT", "QRPH", "GCASH", "MAYA", "BANK_TRANSFER", "ACCOUNT", "OTHER"] as const;

export const completeSaleSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amount: z.string().min(1),
        reference: z.string().max(255).optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .optional(),
  allowNegativeStock: z.boolean().optional(),
});
export type CompleteSaleInput = z.infer<typeof completeSaleSchema>;

// ── Sale: Void ──
export const voidSaleSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;

// ── Sale: Refund ──
export const refundSaleSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  reason: z.string().min(1).max(500),
  lines: z.array(
    z.object({
      saleLineId: z.string().uuid(),
      quantity: z.number().int().positive(),
    }),
  ).min(1, "At least one line must be selected for refund"),
  notes: z.string().max(1000).optional(),
});
export type RefundSaleInput = z.infer<typeof refundSaleSchema>;

// ══════════════════════════════════════════════
// Phase 6: Procurement / Purchase Order Schemas
// ══════════════════════════════════════════════

// ── PO: Create Draft ──
export const createPOSchema = z.object({
  supplierId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        orderedQty: z.number().int().min(1),
        unitCost: z.string().min(1), // numeric as string
      }),
    )
    .min(1, "At least one PO line is required"),
});
export type CreatePOInput = z.infer<typeof createPOSchema>;

// ── PO: Submit ──
export const submitPOSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type SubmitPOInput = z.infer<typeof submitPOSchema>;

// ── PO: Receive (the critical path) ──
export const receivePOSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        poLineId: z.string().uuid(),
        receivedAcceptedQty: z.number().int().min(0),
        rejectedQty: z.number().int().min(0),
        unitCost: z.string().min(1), // actual cost at delivery
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
export type ReceivePOInput = z.infer<typeof receivePOSchema>;

// ── PO: Close with Variance ──
export const closeVariancePOSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type CloseVariancePOInput = z.infer<typeof closeVariancePOSchema>;

// ── PO: Cancel ──
export const cancelPOSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type CancelPOInput = z.infer<typeof cancelPOSchema>;

// ══════════════════════════════════════════════
// Phase 7: Job Cards / Service Integration
// ══════════════════════════════════════════════

const SERVICE_OPERATION_CATEGORIES = [
  "MECHANICAL",
  "ELECTRICAL",
  "BODY",
  "TIRE_SERVICE",
  "DIAGNOSTIC",
  "OTHER",
] as const;

const JOB_CARD_STATUSES = [
  "SCHEDULED",
  "CHECKED_IN",
  "ESTIMATING",
  "APPROVED",
  "WAITING_FOR_PARTS",
  "READY_FOR_BAY",
  "IN_PROGRESS",
  "WORK_COMPLETED",
  "INVOICED",
  "CLOSED",
  "CANCELLED",
] as const;

// ── Service Operation: Create ──
export const createServiceOperationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  category: z.enum(SERVICE_OPERATION_CATEGORIES),
  defaultLaborRate: z.string().min(1), // numeric as string
  estimatedHours: z.string().min(1), // numeric as string
});
export type CreateServiceOperationInput = z.infer<typeof createServiceOperationSchema>;

// ── Service Operation: Update ──
export const updateServiceOperationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.enum(SERVICE_OPERATION_CATEGORIES).optional(),
  defaultLaborRate: z.string().min(1).optional(),
  estimatedHours: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateServiceOperationInput = z.infer<typeof updateServiceOperationSchema>;

// ── Job Card: Create (SCHEDULED) ──
export const createJobCardSchema = z.object({
  customerId: z.string().uuid(),
  customerVehicleId: z.string().uuid(),
  locationId: z.string().uuid(),
  assignedTechnicianUserId: z.string().uuid().optional(),
  odometerReading: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateJobCardInput = z.infer<typeof createJobCardSchema>;

// ── Job Card: Check-In ──
export const checkInJobCardSchema = z.object({
  odometerReading: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});
export type CheckInJobCardInput = z.infer<typeof checkInJobCardSchema>;

// ── Job Card: Add Labor Lines ──
export const addLaborSchema = z.object({
  lines: z
    .array(
      z.object({
        serviceOperationId: z.string().uuid(),
        description: z.string().max(500).optional(),
        qtyHours: z.string().min(1), // numeric as string
        unitPrice: z.string().min(1), // numeric as string
      }),
    )
    .min(1, "At least one labor line is required"),
});
export type AddLaborInput = z.infer<typeof addLaborSchema>;

// ── Job Card: Add Part Lines ──
export const addPartsSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        locationId: z.string().uuid(),
        plannedQty: z.number().int().min(1),
        unitPrice: z.string().min(1), // numeric as string (selling price)
      }),
    )
    .min(1, "At least one part line is required"),
});
export type AddPartsInput = z.infer<typeof addPartsSchema>;

// ── Job Card: Update Part Planned Qty (scope expansion) ──
export const updatePartQtySchema = z.object({
  plannedQty: z.number().int().min(1),
  notes: z.string().max(500).optional(), // audit reason for increase
});
export type UpdatePartQtyInput = z.infer<typeof updatePartQtySchema>;

// ── Job Card: Approve (triggers partial reservation) ──
export const approveJobCardSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(2000).optional(),
});
export type ApproveJobCardInput = z.infer<typeof approveJobCardSchema>;

// ── Job Card: Issue Parts ──
export const issuePartsSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        jobCardPartId: z.string().uuid(),
        issueQty: z.number().int().min(1),
      }),
    )
    .min(1),
  notes: z.string().max(500).optional(),
});
export type IssuePartsInput = z.infer<typeof issuePartsSchema>;

// ── Job Card: Return Parts ──
export const returnPartsSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  lines: z
    .array(
      z.object({
        jobCardPartId: z.string().uuid(),
        returnQty: z.number().int().min(1),
      }),
    )
    .min(1),
  notes: z.string().max(500).optional(),
});
export type ReturnPartsInput = z.infer<typeof returnPartsSchema>;

// ── Job Card: Cancel ──
export const cancelJobCardSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(2000).optional(),
});
export type CancelJobCardInput = z.infer<typeof cancelJobCardSchema>;

// ── Job Card: Generic Transition (check-in, start, complete, invoice, close) ──
export const transitionJobCardSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(2000).optional(),
});
export type TransitionJobCardInput = z.infer<typeof transitionJobCardSchema>;

// ══════════════════════════════════════════════
// Phase 10: Inventory Counts / Cycle Counts
// ══════════════════════════════════════════════

const COUNT_SCOPES = [
  "FULL_LOCATION",
  "CATEGORY",
  "FAMILY",
  "SELECTED_SKUS",
] as const;

// ── Count Session: Create ──
export const createCountSchema = z.object({
  locationId: z.string().uuid(),
  label: z.string().min(1).max(255),
  scope: z.enum(COUNT_SCOPES),
  scopeFilter: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateCountInput = z.infer<typeof createCountSchema>;

// ── Count Session: Update (label/notes only while DRAFT) ──
export const updateCountSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  notes: z.string().max(1000).optional(),
});
export type UpdateCountInput = z.infer<typeof updateCountSchema>;

// ── Count Line: Record a physical count ──
export const recordCountLineSchema = z.object({
  countedQty: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});
export type RecordCountLineInput = z.infer<typeof recordCountLineSchema>;

// ── Count Session: Post variances ──
export const postCountSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  notes: z.string().max(1000).optional(),
});
export type PostCountInput = z.infer<typeof postCountSchema>;

// ══════════════════════════════════════════════
// Phase 11: Categories
// ══════════════════════════════════════════════

// ── Category: Create ──
export const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  code: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().max(7).regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value like #2563EB").optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// ── Category: Update ──
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  color: z.string().max(7).regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ── Customer: Create ──
export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(1).max(50),
  notes: z.string().max(1000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Customer Vehicle: Create ──
export const createCustomerVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(2100).optional(),
  plateNo: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateCustomerVehicleInput = z.infer<typeof createCustomerVehicleSchema>;
