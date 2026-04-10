export const LocationType = {
  WAREHOUSE: "WAREHOUSE",
  RETAIL_STORE: "RETAIL_STORE",
  SHOWROOM: "SHOWROOM",
  STORE: "STORE",
  TRANSIT_BUFFER: "TRANSIT_BUFFER",
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const UserRole = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAREHOUSE_STAFF: "WAREHOUSE_STAFF",
  STAFF: "STAFF",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ProductCategory = {
  TIRES: "TIRES",
  LUBRICANTS: "LUBRICANTS",
  HARD_PARTS: "HARD_PARTS",
  ACCESSORIES: "ACCESSORIES",
  LABOR_SERVICES: "LABOR_SERVICES",
} as const;
export type ProductCategory =
  (typeof ProductCategory)[keyof typeof ProductCategory];

export const TransferStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  PICKING: "PICKING",
  DISPATCHED: "DISPATCHED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  DISCREPANCY_REVIEW: "DISCREPANCY_REVIEW",
  RECEIVED: "RECEIVED",
  CLOSED_WITH_VARIANCE: "CLOSED_WITH_VARIANCE",
  CANCELLED: "CANCELLED",
} as const;
export type TransferStatus =
  (typeof TransferStatus)[keyof typeof TransferStatus];

export const JournalReferenceType = {
  SALE: "SALE",
  RECEIVING: "RECEIVING",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  ADJUSTMENT: "ADJUSTMENT",
  RETURN: "RETURN",
  STOCKTAKE: "STOCKTAKE",
  VOID: "VOID",
  JOB_CARD_ISSUE: "JOB_CARD_ISSUE",
  JOB_CARD_RETURN: "JOB_CARD_RETURN",
  OPENING_BALANCE: "OPENING_BALANCE",
  SUPPLIER_RETURN: "SUPPLIER_RETURN",
  SUPPLIER_RETURN_CANCEL: "SUPPLIER_RETURN_CANCEL",
} as const;
export type JournalReferenceType =
  (typeof JournalReferenceType)[keyof typeof JournalReferenceType];

export const ActorType = {
  USER: "USER",
  SYSTEM: "SYSTEM",
  INTEGRATION: "INTEGRATION",
} as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const AdjustmentReasonCode = {
  // Positive-only
  COUNT_GAIN: "COUNT_GAIN",
  FOUND_STOCK: "FOUND_STOCK",
  OPENING_BALANCE: "OPENING_BALANCE",
  // Negative-only
  COUNT_LOSS: "COUNT_LOSS",
  DAMAGE_IN_TRANSIT: "DAMAGE_IN_TRANSIT",
  DAMAGE_WAREHOUSE: "DAMAGE_WAREHOUSE",
  DAMAGE_SHOWROOM: "DAMAGE_SHOWROOM",
  WARRANTY_WRITE_OFF: "WARRANTY_WRITE_OFF",
  SHRINKAGE_MISSING: "SHRINKAGE_MISSING",
  OBSOLETE_WRITE_OFF: "OBSOLETE_WRITE_OFF",
  TRANSFER_SHORTAGE_CONFIRMED: "TRANSFER_SHORTAGE_CONFIRMED",
  // Restricted (admin/owner only, notes mandatory)
  DATA_CORRECTION: "DATA_CORRECTION",
} as const;
export type AdjustmentReasonCode =
  (typeof AdjustmentReasonCode)[keyof typeof AdjustmentReasonCode];

export const AdjustmentDirection = {
  IN: "IN",
  OUT: "OUT",
} as const;
export type AdjustmentDirection =
  (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

export const ShiftStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  FORCE_CLOSED: "FORCE_CLOSED",
} as const;
export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus];

/** Roles allowed to force-close shifts */
export const SHIFT_FORCE_CLOSE_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

export const SaleStatus = {
  QUOTE: "QUOTE",
  OPEN: "OPEN",
  PARKED: "PARKED",
  COMPLETED: "COMPLETED",
  VOIDED: "VOIDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

export const PaymentMethod = {
  CASH: "CASH",
  CARD: "CARD",
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "DEBIT_CARD",
  EFT: "EFT",
  QRPH: "QRPH",
  GCASH: "GCASH",
  MAYA: "MAYA",
  BANK_TRANSFER: "BANK_TRANSFER",
  ACCOUNT: "ACCOUNT",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const CustomerType = {
  INDIVIDUAL: "INDIVIDUAL",
  SHOP: "SHOP",
  FLEET: "FLEET",
  WHOLESALE: "WHOLESALE",
} as const;
export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];

export const CustomerTransactionType = {
  CHARGE: "CHARGE",
  PAYMENT: "PAYMENT",
  CREDIT_NOTE: "CREDIT_NOTE",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
export type CustomerTransactionType =
  (typeof CustomerTransactionType)[keyof typeof CustomerTransactionType];

/** Roles allowed to manage customer accounts (create, edit, record payments) */
export const AR_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

export const PurchaseOrderStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
  FULLY_RECEIVED: "FULLY_RECEIVED",
  CLOSED_WITH_VARIANCE: "CLOSED_WITH_VARIANCE",
  CANCELLED: "CANCELLED",
} as const;
export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const JobCardStatus = {
  SCHEDULED: "SCHEDULED",
  CHECKED_IN: "CHECKED_IN",
  ESTIMATING: "ESTIMATING",
  APPROVED: "APPROVED",
  WAITING_FOR_PARTS: "WAITING_FOR_PARTS",
  READY_FOR_BAY: "READY_FOR_BAY",
  IN_PROGRESS: "IN_PROGRESS",
  WORK_COMPLETED: "WORK_COMPLETED",
  INVOICED: "INVOICED",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED",
} as const;
export type JobCardStatus = (typeof JobCardStatus)[keyof typeof JobCardStatus];

export const ServiceOperationCategory = {
  MECHANICAL: "MECHANICAL",
  ELECTRICAL: "ELECTRICAL",
  BODY: "BODY",
  TIRE_SERVICE: "TIRE_SERVICE",
  DIAGNOSTIC: "DIAGNOSTIC",
  OTHER: "OTHER",
} as const;
export type ServiceOperationCategory =
  (typeof ServiceOperationCategory)[keyof typeof ServiceOperationCategory];

export const CountStatus = {
  DRAFT: "DRAFT",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  REVIEWED: "REVIEWED",
  POSTED: "POSTED",
  CANCELLED: "CANCELLED",
} as const;
export type CountStatus = (typeof CountStatus)[keyof typeof CountStatus];

export const CountScope = {
  FULL_LOCATION: "FULL_LOCATION",
  CATEGORY: "CATEGORY",
  FAMILY: "FAMILY",
  SELECTED_SKUS: "SELECTED_SKUS",
} as const;
export type CountScope = (typeof CountScope)[keyof typeof CountScope];

/** Roles allowed to create / manage inventory counts */
export const COUNT_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_STAFF] as const;

/** Roles allowed to review and post count variances */
export const COUNT_REVIEW_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

// ── Domain Validation Helpers ──

/** Valid status transitions for sales */
export const SALE_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  [SaleStatus.QUOTE]: [SaleStatus.OPEN, SaleStatus.VOIDED],
  [SaleStatus.OPEN]: [SaleStatus.COMPLETED, SaleStatus.PARKED, SaleStatus.VOIDED],
  [SaleStatus.PARKED]: [SaleStatus.OPEN, SaleStatus.VOIDED],
  [SaleStatus.COMPLETED]: [SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED],
  [SaleStatus.PARTIALLY_REFUNDED]: [SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED],
  [SaleStatus.VOIDED]: [],
  [SaleStatus.REFUNDED]: [],
};

/** Check if a sale status transition is valid */
export function isValidSaleTransition(from: SaleStatus, to: SaleStatus): boolean {
  return SALE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Roles allowed to operate the POS */
export const POS_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER] as const;

/** Roles allowed to refund */
export const REFUND_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

/** Roles allowed to manage procurement */
export const PROCUREMENT_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_STAFF] as const;

export const SupplierReturnStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  CREDIT_RECEIVED: "CREDIT_RECEIVED",
  CLOSED: "CLOSED",
  CLOSED_WITHOUT_CREDIT: "CLOSED_WITHOUT_CREDIT",
  CANCELLED: "CANCELLED",
} as const;
export type SupplierReturnStatus =
  (typeof SupplierReturnStatus)[keyof typeof SupplierReturnStatus];

/** Roles allowed to manage supplier returns */
export const SUPPLIER_RETURN_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

export const BackorderStatus = {
  PENDING: "PENDING",
  INCLUDED_IN_PO: "INCLUDED_IN_PO",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
} as const;
export type BackorderStatus = (typeof BackorderStatus)[keyof typeof BackorderStatus];

export const BackorderPriority = {
  HIGH: "HIGH",
  NORMAL: "NORMAL",
  LOW: "LOW",
} as const;
export type BackorderPriority = (typeof BackorderPriority)[keyof typeof BackorderPriority];

/** Roles allowed to manage backorders */
export const BACKORDER_ROLES = [UserRole.ADMIN, UserRole.MANAGER] as const;

/** Valid status transitions for purchase orders */
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.SUBMITTED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.SUBMITTED]: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.FULLY_RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.FULLY_RECEIVED,
    PurchaseOrderStatus.CLOSED_WITH_VARIANCE,
  ],
  [PurchaseOrderStatus.FULLY_RECEIVED]: [],
  [PurchaseOrderStatus.CLOSED_WITH_VARIANCE]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

/** Check if a PO status transition is valid */
export function isValidPOTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return PO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Reason codes that ONLY allow positive (IN) adjustments */
export const POSITIVE_ONLY_REASON_CODES: AdjustmentReasonCode[] = [
  AdjustmentReasonCode.COUNT_GAIN,
  AdjustmentReasonCode.FOUND_STOCK,
  AdjustmentReasonCode.OPENING_BALANCE,
];

/** Reason codes that ONLY allow negative (OUT) adjustments */
export const NEGATIVE_ONLY_REASON_CODES: AdjustmentReasonCode[] = [
  AdjustmentReasonCode.COUNT_LOSS,
  AdjustmentReasonCode.DAMAGE_IN_TRANSIT,
  AdjustmentReasonCode.DAMAGE_WAREHOUSE,
  AdjustmentReasonCode.DAMAGE_SHOWROOM,
  AdjustmentReasonCode.WARRANTY_WRITE_OFF,
  AdjustmentReasonCode.SHRINKAGE_MISSING,
  AdjustmentReasonCode.OBSOLETE_WRITE_OFF,
  AdjustmentReasonCode.TRANSFER_SHORTAGE_CONFIRMED,
];

/** Reason codes restricted to admin/owner roles */
export const RESTRICTED_REASON_CODES: AdjustmentReasonCode[] = [
  AdjustmentReasonCode.DATA_CORRECTION,
];

/** Reason codes valid for variance reporting on transfers */
export const VARIANCE_REASON_CODES: AdjustmentReasonCode[] = [
  AdjustmentReasonCode.DAMAGE_IN_TRANSIT,
  AdjustmentReasonCode.TRANSFER_SHORTAGE_CONFIRMED,
];

/** Valid status transitions for transfers */
export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  [TransferStatus.DRAFT]: [TransferStatus.APPROVED, TransferStatus.CANCELLED],
  [TransferStatus.APPROVED]: [TransferStatus.PICKING, TransferStatus.DISPATCHED, TransferStatus.CANCELLED],
  [TransferStatus.PICKING]: [TransferStatus.DISPATCHED, TransferStatus.CANCELLED],
  [TransferStatus.DISPATCHED]: [TransferStatus.PARTIALLY_RECEIVED, TransferStatus.RECEIVED, TransferStatus.DISCREPANCY_REVIEW],
  [TransferStatus.PARTIALLY_RECEIVED]: [TransferStatus.RECEIVED, TransferStatus.DISCREPANCY_REVIEW, TransferStatus.CLOSED_WITH_VARIANCE],
  [TransferStatus.DISCREPANCY_REVIEW]: [TransferStatus.PARTIALLY_RECEIVED, TransferStatus.RECEIVED, TransferStatus.CLOSED_WITH_VARIANCE],
  [TransferStatus.RECEIVED]: [],
  [TransferStatus.CLOSED_WITH_VARIANCE]: [],
  [TransferStatus.CANCELLED]: [],
};

/** Check if a transfer status transition is valid */
export function isValidTransferTransition(from: TransferStatus, to: TransferStatus): boolean {
  return TRANSFER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Check if reason code direction matches request direction */
export function isReasonCodeValidForDirection(
  reasonCode: AdjustmentReasonCode,
  direction: AdjustmentDirection,
): boolean {
  if (reasonCode === AdjustmentReasonCode.DATA_CORRECTION) {
    return true; // DATA_CORRECTION can be either direction
  }
  if (direction === AdjustmentDirection.IN) {
    return POSITIVE_ONLY_REASON_CODES.includes(reasonCode);
  }
  return NEGATIVE_ONLY_REASON_CODES.includes(reasonCode);
}

// ── Phase 7: Job Card Transitions ──

/** Valid status transitions for job cards */
export const JOB_CARD_TRANSITIONS: Record<JobCardStatus, JobCardStatus[]> = {
  [JobCardStatus.SCHEDULED]: [JobCardStatus.CHECKED_IN, JobCardStatus.CANCELLED],
  [JobCardStatus.CHECKED_IN]: [JobCardStatus.ESTIMATING, JobCardStatus.CANCELLED],
  [JobCardStatus.ESTIMATING]: [JobCardStatus.APPROVED, JobCardStatus.CANCELLED],
  [JobCardStatus.APPROVED]: [
    JobCardStatus.WAITING_FOR_PARTS,
    JobCardStatus.READY_FOR_BAY,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.WAITING_FOR_PARTS]: [
    JobCardStatus.READY_FOR_BAY,
    JobCardStatus.CANCELLED,
  ],
  [JobCardStatus.READY_FOR_BAY]: [JobCardStatus.IN_PROGRESS, JobCardStatus.CANCELLED],
  [JobCardStatus.IN_PROGRESS]: [JobCardStatus.WORK_COMPLETED, JobCardStatus.CANCELLED],
  [JobCardStatus.WORK_COMPLETED]: [JobCardStatus.INVOICED, JobCardStatus.CANCELLED],
  [JobCardStatus.INVOICED]: [JobCardStatus.CLOSED],
  [JobCardStatus.CLOSED]: [],
  [JobCardStatus.CANCELLED]: [],
};

/** Check if a job card status transition is valid */
export function isValidJobCardTransition(
  from: JobCardStatus,
  to: JobCardStatus,
): boolean {
  return JOB_CARD_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that are pre-INVOICED (eligible for cancellation if net_issued = 0) */
export const PRE_INVOICED_STATUSES: JobCardStatus[] = [
  JobCardStatus.SCHEDULED,
  JobCardStatus.CHECKED_IN,
  JobCardStatus.ESTIMATING,
  JobCardStatus.APPROVED,
  JobCardStatus.WAITING_FOR_PARTS,
  JobCardStatus.READY_FOR_BAY,
  JobCardStatus.IN_PROGRESS,
  JobCardStatus.WORK_COMPLETED,
];

/** Statuses where parts can be added or modified */
export const PARTS_EDITABLE_STATUSES: JobCardStatus[] = [
  JobCardStatus.ESTIMATING,
  JobCardStatus.APPROVED,
  JobCardStatus.WAITING_FOR_PARTS,
  JobCardStatus.READY_FOR_BAY,
  JobCardStatus.IN_PROGRESS,
];

/** Statuses where parts can be issued */
export const PARTS_ISSUABLE_STATUSES: JobCardStatus[] = [
  JobCardStatus.IN_PROGRESS,
];

/** Roles allowed to manage job cards */
export const SERVICE_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.CASHIER,
] as const;
