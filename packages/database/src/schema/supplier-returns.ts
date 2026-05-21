import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { suppliers } from "./suppliers";
import { products } from "./products";
import { purchaseOrders, poLines } from "./purchase-orders";

// ── Enums ──

export const supplierReturnStatusEnum = pgEnum("supplier_return_status", [
  "DRAFT",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "CREDIT_RECEIVED",
  "CLOSED",
  "CLOSED_WITHOUT_CREDIT",
  "CANCELLED",
]);

export const supplierReturnReasonEnum = pgEnum("supplier_return_reason", [
  "DEFECTIVE",
  "DAMAGED_ON_DELIVERY",
  "WRONG_ITEM",
  "OVERSHIPMENT",
  "WARRANTY",
  "EXPIRED",
  "OTHER",
]);

export const supplierReturnCreditTypeEnum = pgEnum(
  "supplier_return_credit_type",
  ["CREDIT_MEMO", "REPLACEMENT", "CASH_REFUND", "DEDUCTED_FROM_NEXT_PO"],
);

export const supplierReturnConditionEnum = pgEnum(
  "supplier_return_condition",
  ["DEFECTIVE", "DAMAGED", "WRONG_ITEM", "EXPIRED", "OTHER"],
);

// ── Supplier Returns (header) ──

export const supplierReturns = pgTable(
  "supplier_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    rtvNumber: varchar("rtv_number", { length: 50 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: supplierReturnStatusEnum("status").notNull().default("DRAFT"),
    reason: supplierReturnReasonEnum("reason").notNull(),
    reasonNotes: text("reason_notes"),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    creditAmount: numeric("credit_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    creditType: supplierReturnCreditTypeEnum("credit_type"),
    creditReference: varchar("credit_reference", { length: 100 }),
    sourcePoId: uuid("source_po_id").references(() => purchaseOrders.id),
    sourceCustomerReturnId: uuid("source_customer_return_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    creditReceivedAt: timestamp("credit_received_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by"),
    notes: text("notes"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_supplier_returns_org_number").on(
      table.orgId,
      table.rtvNumber,
    ),
    index("idx_supplier_returns_org_supplier").on(
      table.orgId,
      table.supplierId,
    ),
    index("idx_supplier_returns_org_status").on(table.orgId, table.status),
    index("idx_supplier_returns_org_po").on(table.orgId, table.sourcePoId),
    index("idx_supplier_returns_org_created").on(
      table.orgId,
      table.createdAt,
    ),
  ],
);

// ── Supplier Return Lines ──

export const supplierReturnLines = pgTable(
  "supplier_return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierReturnId: uuid("supplier_return_id")
      .notNull()
      .references(() => supplierReturns.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    quantity: integer("quantity").notNull(),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    condition: supplierReturnConditionEnum("condition").notNull(),
    sourcePoLineId: uuid("source_po_line_id").references(() => poLines.id),
    sourceCustomerReturnLineId: uuid("source_customer_return_line_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_supplier_return_lines_return").on(table.supplierReturnId),
  ],
);

// ── Supplier Return Status History ──

export const supplierReturnStatusHistory = pgTable(
  "supplier_return_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierReturnId: uuid("supplier_return_id")
      .notNull()
      .references(() => supplierReturns.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }).notNull(),
    changedBy: uuid("changed_by"),
    notes: text("notes"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sr_status_history_return").on(table.supplierReturnId),
  ],
);

// ── Supplier Return Proof Attachments ──

export const supplierReturnAttachments = pgTable(
  "supplier_return_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierReturnId: uuid("supplier_return_id")
      .notNull()
      .references(() => supplierReturns.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    attachmentType: varchar("attachment_type", { length: 50 })
      .notNull()
      .default("OTHER"),
    dataUrl: text("data_url").notNull(),
    uploadedBy: uuid("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sr_attachments_return").on(table.supplierReturnId),
    index("idx_sr_attachments_org_created").on(table.orgId, table.createdAt),
  ],
);
