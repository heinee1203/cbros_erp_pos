import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { sales, saleLines } from "./sales";
import { customers } from "./customers";
import { products } from "./products";

export const returnStatusEnum = pgEnum("return_status", [
  "DRAFT",
  "COMPLETED",
  "VOIDED",
]);

export const returnReasonEnum = pgEnum("return_reason", [
  "WRONG_FITMENT",
  "DEFECTIVE",
  "CUSTOMER_CHANGED_MIND",
  "WARRANTY",
  "DUPLICATE_PURCHASE",
  "OTHER",
]);

export const refundMethodEnum = pgEnum("refund_method", [
  "CASH",
  "ORIGINAL_METHOD",
  "STORE_CREDIT",
  "ACCOUNT_CREDIT",
]);

export const returnConditionEnum = pgEnum("return_condition", [
  "RESELLABLE",
  "DAMAGED",
  "DEFECTIVE",
]);

export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    returnNumber: varchar("return_number", { length: 50 }).notNull(),
    originalSaleId: uuid("original_sale_id")
      .notNull()
      .references(() => sales.id),
    customerId: uuid("customer_id").references(() => customers.id),
    status: returnStatusEnum("status").notNull().default("DRAFT"),
    returnReason: returnReasonEnum("return_reason").notNull(),
    reasonNotes: text("reason_notes"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    total: numeric("total", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    refundMethod: refundMethodEnum("refund_method").notNull(),
    refundReference: varchar("refund_reference", { length: 100 }),
    approvedBy: uuid("approved_by"),
    processedBy: uuid("processed_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by"),
    voidReason: text("void_reason"),
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
    uniqueIndex("idx_returns_org_number").on(table.orgId, table.returnNumber),
    index("idx_returns_org_sale").on(table.orgId, table.originalSaleId),
    index("idx_returns_org_status").on(table.orgId, table.status),
    index("idx_returns_org_created").on(table.orgId, table.createdAt),
  ],
);

export const returnLines = pgTable(
  "return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    originalSaleLineId: uuid("original_sale_line_id")
      .notNull()
      .references(() => saleLines.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    condition: returnConditionEnum("condition").notNull().default("RESELLABLE"),
    restock: boolean("restock").notNull().default(true),
    restockLocationId: uuid("restock_location_id").references(() => locations.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_return_lines_return").on(table.returnId),
    index("idx_return_lines_sale_line").on(table.originalSaleLineId),
  ],
);
