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
  locationId: string | null;
  orgId: string;
  locationType: string | null;
}

// ── Stock Journal ──
export const stockJournalEntrySchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  changeQuantity: z.number().int(),
  referenceType: z.enum(["SALE", "RECEIVING", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "RETURN", "STOCKTAKE", "VOID", "JOB_CARD_ISSUE", "JOB_CARD_RETURN", "OPENING_BALANCE", "SUPPLIER_RETURN", "SUPPLIER_RETURN_CANCEL"]),
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

// Variant definition for inline variant creation
const variantItemSchema = z.object({
  suffix: z.string().min(1, "Variant name is required").max(100),
  sku: z.string().min(1, "SKU is required").max(50),
  unitPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Unit price must be a valid decimal" },
  ),
  costPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Cost price must be a valid decimal" },
  ),
  barcode: z.string().max(50).optional(),
});
export type VariantItem = z.infer<typeof variantItemSchema>;

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  sku: z.string().max(50).optional().default(""), // optional when hasVariants=true (parent has no SKU)
  mnemonicSku: z
    .string()
    .length(10, "Mnemonic SKU must be exactly 10 characters")
    .regex(/^[A-Z]{10}$/, "Mnemonic SKU must be 10 uppercase letters")
    .optional(),
  category: z.enum(PRODUCT_CATEGORIES, { required_error: "Category is required" }),
  unitPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Unit price must be a non-negative decimal (e.g. '10.00')" },
  ),
  costPrice: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Cost price must be a non-negative decimal (e.g. '5.00')" },
  ),
  barcode: z.string().min(1).max(50).optional(),
  oemNumber: z.string().max(100).nullable().optional(),
  familyId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  isParent: z.boolean().default(false),
  parentProductId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  unitsPerCase: z.number().int().min(1).default(1),
  packagingUnit: z.string().max(50).nullable().optional(),
  primarySupplierId: z.string().uuid().nullable().optional(),
  isSerialized: z.boolean().default(false),
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
  // Inline variant creation — when present, product becomes a parent
  variants: z.array(variantItemSchema).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// ── Product: Update ──
export const updateProductSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  unitPrice: z.string().refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Unit price must be a non-negative decimal (e.g. '10.00')" },
  ).optional(),
  costPrice: z.string().refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Cost price must be a non-negative decimal (e.g. '5.00')" },
  ).optional(),
  barcode: z.string().min(1).max(50).optional(),
  oemNumber: z.string().max(100).nullable().optional(),
  familyId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  isParent: z.boolean().optional(),
  parentProductId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  unitsPerCase: z.number().int().min(1).optional(),
  packagingUnit: z.string().max(50).nullable().optional(),
  primarySupplierId: z.string().uuid().nullable().optional(),
  isSerialized: z.boolean().optional(),
  reorderPoint: z.number().int().min(0).optional(),
  reorderEnabled: z.boolean().optional(),
  customReorderPoint: z.number().int().min(0).nullable().optional(),
  // Add new variants to an existing parent product
  newVariants: z.array(variantItemSchema).optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ── Product: Bulk Import ──
const importLocationSchema = z.object({
  locationName: z.string().min(1).max(255),
  availableForSale: z.boolean().default(true),
  price: z.string().nullable().optional(),
  inStock: z.coerce.number().int().min(0).default(0),
  lowStock: z.coerce.number().int().min(0).default(0),
  optimalStock: z.coerce.number().int().min(0).default(0),
});

const importRowSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  sku: z.string().min(1, "SKU is required").max(50),
  handle: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  oemNumber: z.string().max(100).optional(),
  family: z.string().max(255).optional(),
  category: z.string().max(255).optional(),
  subcategory: z.string().max(255).optional(),
  brand: z.string().max(255).optional(),
  unitPrice: z.string().optional(),
  costPrice: z.string().optional(),
  description: z.string().max(2000).optional(),
  isVariablePrice: z.boolean().optional(),
  unitsPerCase: z.coerce.number().int().min(1).optional(),
  packagingUnit: z.string().max(50).optional(),
  trackStock: z.boolean().optional(),
  locations: z.array(importLocationSchema).optional(),
});

export const bulkImportSchema = z.object({
  dryRun: z.boolean().default(false),
  rows: z.array(importRowSchema).min(1).max(5000),
});
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;

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
  yearStart: z.number().int().min(1900).max(2100).optional(),
  yearEnd: z.number().int().min(1900).max(2100).optional(),
  engine: z.string().max(100).optional(),
  notes: z.string().max(255).optional(),
});
export type VehicleCompatibilityInput = z.infer<typeof vehicleCompatibilitySchema>;

export const addVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  yearStart: z.number().int().min(1900).max(2100).optional(),
  yearEnd: z.number().int().min(1900).max(2100).optional(),
  engine: z.string().max(100).optional(),
  notes: z.string().max(255).optional(),
});
export type AddVehicleInput = z.infer<typeof addVehicleSchema>;

export const updateVehicleSchema = addVehicleSchema.partial();
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

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

// ── Transfer: Update (DRAFT only) ──
export const updateTransferSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export type UpdateTransferInput = z.infer<typeof updateTransferSchema>;

// ── Transfer: Add Line Item (DRAFT only) ──
export const addTransferItemSchema = z.object({
  productId: z.string().uuid(),
  requestedQty: z.number().int().min(1),
});
export type AddTransferItemInput = z.infer<typeof addTransferItemSchema>;

// ── Transfer: Update Line Item (DRAFT only) ──
export const updateTransferItemSchema = z.object({
  requestedQty: z.number().int().min(1),
});
export type UpdateTransferItemInput = z.infer<typeof updateTransferItemSchema>;

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
// CARD is deprecated — existing records reclassified to CREDIT_CARD in migration 0020
const PAYMENT_METHODS = ["CASH", "CREDIT_CARD", "DEBIT_CARD", "EFT", "QRPH", "GCASH", "MAYA", "BANK_TRANSFER", "ACCOUNT", "OTHER"] as const;

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
  overrideApproval: z.object({
    pin: z.string().length(4),
  }).optional(),
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
        listPrice: z.string().optional(),
        discountChain: z.string().max(100).optional(),
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
  supplierDrNo: z.string().min(1).max(100),
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
// Inventory Counts
// ══════════════════════════════════════════════

const COUNT_TYPES = ["FULL", "CYCLE"] as const;

// ── Count: Create ──
export const createCountSchema = z.object({
  countType: z.enum(COUNT_TYPES),
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(2000).optional(),
  filterCriteria: z.object({
    categoryId: z.string().uuid().optional(),
    brandId: z.string().uuid().optional(),
  }).optional(),
});
export type CreateCountInput = z.infer<typeof createCountSchema>;

// ── Count: Record items ──
export const recordCountItemsSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().uuid(),
    countedQty: z.number().int().min(0),
    notes: z.string().max(1000).optional(),
  })).min(1).max(500),
});
export type RecordCountItemsInput = z.infer<typeof recordCountItemsSchema>;

// ── Count: Complete (requires approval pin) ──
export const completeCountSchema = z.object({
  approvalPin: z.string().min(1).max(50),
});
export type CompleteCountInput = z.infer<typeof completeCountSchema>;

// ── Count: Cancel ──
export const cancelCountSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type CancelCountInput = z.infer<typeof cancelCountSchema>;

// ══════════════════════════════════════════════
// Brands
// ══════════════════════════════════════════════

// ── Brand: Create ──
export const createBrandSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

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
  familyId: z.string().uuid().nullable().optional(),
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
  familyId: z.string().uuid().nullable().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ══════════════════════════════════════════════
// Sub-categories
// ══════════════════════════════════════════════

export const createSubcategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;

export const updateSubcategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  categoryId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSubcategoryInput = z.infer<typeof updateSubcategorySchema>;

// ══════════════════════════════════════════════
// Product Option Types & Variants
// ══════════════════════════════════════════════

export const createOptionTypeSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.array(z.string().min(1).max(255)).min(1, "At least one value required"),
});
export type CreateOptionTypeInput = z.infer<typeof createOptionTypeSchema>;

export const updateOptionTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type UpdateOptionTypeInput = z.infer<typeof updateOptionTypeSchema>;

export const createVariantSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(255).optional(),
  mnemonicSku: z.string().length(10).regex(/^[A-Z]{10}$/).optional(),
  unitPrice: z.string().default("0.00"),
  costPrice: z.string().default("0.00"),
  barcode: z.string().max(50).optional(),
  isVariablePrice: z.boolean().default(false),
  optionValueIds: z.array(z.string().uuid()).min(1, "At least one option value required"),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const createVariantBatchSchema = z.object({
  variants: z.array(createVariantSchema).min(1).max(500),
});
export type CreateVariantBatchInput = z.infer<typeof createVariantBatchSchema>;

// ══════════════════════════════════════════════
// Location Management
// ══════════════════════════════════════════════

const LOCATION_TYPES = [
  "WAREHOUSE",
  "RETAIL_STORE",
  "SHOWROOM",
  "STORE",
  "TRANSIT_BUFFER",
] as const;

export const createLocationSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  code: z.string().min(1, "Code is required").max(50),
  type: z.enum(LOCATION_TYPES, { required_error: "Type is required" }),
  address: z.string().max(500).optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  type: z.enum(LOCATION_TYPES).optional(),
  address: z.string().max(500).nullable().optional(),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ── Customer: Create (with AR fields) ──
const CUSTOMER_TYPES = ["INDIVIDUAL", "SHOP", "FLEET", "WHOLESALE"] as const;

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(255),
  customerType: z.enum(CUSTOMER_TYPES).default("INDIVIDUAL"),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().min(1).max(50),
  email: z.string().email().max(255).optional(),
  address: z.string().max(2000).optional(),
  tin: z.string().max(20).optional(),
  creditLimit: z.string().default("0.00").refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Credit limit must be a valid decimal" },
  ),
  paymentTermsDays: z.number().int().min(1).max(365).default(30),
  notes: z.string().max(5000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// ── Customer: Update ──
export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  contactPerson: z.string().max(255).nullable().optional(),
  phone: z.string().min(1).max(50).optional(),
  email: z.string().email().max(255).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  tin: z.string().max(20).nullable().optional(),
  creditLimit: z.string().refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val),
    { message: "Credit limit must be a valid decimal" },
  ).optional(),
  paymentTermsDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ── Customer: Record Payment ──
export const recordPaymentSchema = z.object({
  amount: z.string().min(1).refine(
    (val) => /^\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) > 0,
    { message: "Amount must be a positive decimal" },
  ),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CHECK", "GCASH", "MAYA", "QRPH", "OTHER"]),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ── Customer: Manual Adjustment ──
export const customerAdjustmentSchema = z.object({
  amount: z.string().min(1).refine(
    (val) => /^-?\d+(\.\d{1,2})?$/.test(val) && parseFloat(val) !== 0,
    { message: "Amount must be a non-zero decimal (positive to increase, negative to decrease)" },
  ),
  notes: z.string().min(1).max(1000),
});
export type CustomerAdjustmentInput = z.infer<typeof customerAdjustmentSchema>;

// ── Customer Vehicle: Create ──
export const createCustomerVehicleSchema = z.object({
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.number().int().min(1900).max(2100).optional(),
  plateNo: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateCustomerVehicleInput = z.infer<typeof createCustomerVehicleSchema>;

// ══════════════════════════════════════════════
// Organization Settings
// ══════════════════════════════════════════════

export const updateCompanySettingsSchema = z.object({
  legalName: z.string().max(200).optional(),
  tin: z.string().max(50).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(200).optional(),
  address: z.string().max(500).optional(),
  logoUrl: z.string().url().max(500).optional(),
  invoiceTerms: z.string().max(2000).optional(),
  invoiceFooter: z.string().max(500).optional(),
});
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;

// ══════════════════════════════════════════════
// Returns
// ══════════════════════════════════════════════

const RETURN_REASONS = [
  "WRONG_FITMENT",
  "DEFECTIVE",
  "CUSTOMER_CHANGED_MIND",
  "WARRANTY",
  "DUPLICATE_PURCHASE",
  "OTHER",
] as const;

const REFUND_METHODS = [
  "CASH",
  "ORIGINAL_METHOD",
  "STORE_CREDIT",
  "ACCOUNT_CREDIT",
] as const;

const RETURN_CONDITIONS = [
  "RESELLABLE",
  "DAMAGED",
  "DEFECTIVE",
] as const;

// ── Return: Create ──
export const createReturnSchema = z.object({
  originalSaleId: z.string().uuid(),
  returnReason: z.enum(RETURN_REASONS),
  reasonNotes: z.string().max(1000).optional(),
  refundMethod: z.enum(REFUND_METHODS),
  lines: z.array(z.object({
    originalSaleLineId: z.string().uuid(),
    quantity: z.number().int().positive(),
    condition: z.enum(RETURN_CONDITIONS).default("RESELLABLE"),
    restock: z.boolean().default(true),
    restockLocationId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  })).min(1),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

// ── Return: Complete (with PIN) ──
export const completeReturnSchema = z.object({
  approvalPin: z.string().min(4).max(6),
});
export type CompleteReturnInput = z.infer<typeof completeReturnSchema>;

// ── Return: Void ──
export const voidReturnSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type VoidReturnInput = z.infer<typeof voidReturnSchema>;

// ══════════════════════════════════════════════
// Supplier Returns (RTV)
// ══════════════════════════════════════════════

const SUPPLIER_RETURN_REASONS = [
  "DEFECTIVE",
  "DAMAGED_ON_DELIVERY",
  "WRONG_ITEM",
  "OVERSHIPMENT",
  "WARRANTY",
  "EXPIRED",
  "OTHER",
] as const;

const SUPPLIER_RETURN_CONDITIONS = [
  "DEFECTIVE",
  "DAMAGED",
  "WRONG_ITEM",
  "EXPIRED",
  "OTHER",
] as const;

const SUPPLIER_RETURN_CREDIT_TYPES = [
  "CREDIT_MEMO",
  "REPLACEMENT",
  "CASH_REFUND",
  "DEDUCTED_FROM_NEXT_PO",
] as const;

// ── Supplier Return: Create ──
export const createSupplierReturnSchema = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid(),
  reason: z.enum(SUPPLIER_RETURN_REASONS),
  reasonNotes: z.string().max(1000).optional(),
  sourcePoId: z.string().uuid().optional(),
  sourceCustomerReturnId: z.string().uuid().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    costPrice: z.string(),
    condition: z.enum(SUPPLIER_RETURN_CONDITIONS),
    sourcePoLineId: z.string().uuid().optional(),
    sourceCustomerReturnLineId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  })).min(1),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});
export type CreateSupplierReturnInput = z.infer<typeof createSupplierReturnSchema>;

// ── Supplier Return: Update Draft ──
export const updateSupplierReturnSchema = z.object({
  reason: z.enum(SUPPLIER_RETURN_REASONS).optional(),
  reasonNotes: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    costPrice: z.string(),
    condition: z.enum(SUPPLIER_RETURN_CONDITIONS),
    sourcePoLineId: z.string().uuid().optional(),
    sourceCustomerReturnLineId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  })).min(1).optional(),
});
export type UpdateSupplierReturnInput = z.infer<typeof updateSupplierReturnSchema>;

// ── Supplier Return: Receive Credit ──
export const receiveCreditSchema = z.object({
  creditAmount: z.string(),
  creditType: z.enum(SUPPLIER_RETURN_CREDIT_TYPES),
  creditReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});
export type ReceiveCreditInput = z.infer<typeof receiveCreditSchema>;

// ── Supplier Return: Cancel ──
export const cancelSupplierReturnSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelSupplierReturnInput = z.infer<typeof cancelSupplierReturnSchema>;

// ── Supplier Return: Status Transition Notes ──
export const supplierReturnNotesSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type SupplierReturnNotesInput = z.infer<typeof supplierReturnNotesSchema>;

// ── Supplier Return: Close Without Credit ──
export const closeWithoutCreditSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CloseWithoutCreditInput = z.infer<typeof closeWithoutCreditSchema>;
