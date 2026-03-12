import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { users } from "./users";
import { suppliers } from "./suppliers";
import { products } from "./products";

// ── Purchase Order Status Enum ──

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "DRAFT",
  "SUBMITTED",
  "PARTIALLY_RECEIVED",
  "FULLY_RECEIVED",
  "CLOSED_WITH_VARIANCE",
  "CANCELLED",
]);

// ── Purchase Orders ──

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    poNo: varchar("po_no", { length: 50 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    status: purchaseOrderStatusEnum("status").notNull().default("DRAFT"),
    expectedDeliveryDate: timestamp("expected_delivery_date", {
      withTimezone: true,
    }),
    notes: varchar("notes", { length: 1000 }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    submittedByUserId: uuid("submitted_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    cancelledByUserId: uuid("cancelled_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
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
    index("idx_purchase_orders_org_id").on(table.orgId),
    index("idx_purchase_orders_status").on(table.status),
    index("idx_purchase_orders_supplier_id").on(table.supplierId),
    index("idx_purchase_orders_destination").on(table.destinationLocationId),
    uniqueIndex("idx_purchase_orders_org_po_no").on(table.orgId, table.poNo),
    uniqueIndex("idx_purchase_orders_idempotency_key").on(
      table.idempotencyKey,
    ),
  ],
);

// ── Purchase Order Lines ──

export const poLines = pgTable(
  "po_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    orderedQty: integer("ordered_qty").notNull(),
    receivedAcceptedQty: integer("received_accepted_qty")
      .notNull()
      .default(0),
    rejectedQty: integer("rejected_qty").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_po_lines_purchase_order_id").on(table.purchaseOrderId),
    index("idx_po_lines_product_id").on(table.productId),
    check("chk_po_ordered_qty_positive", sql`ordered_qty > 0`),
    check(
      "chk_po_received_accepted_non_negative",
      sql`received_accepted_qty >= 0`,
    ),
    check("chk_po_rejected_non_negative", sql`rejected_qty >= 0`),
    // Total received + rejected can never exceed ordered
    check(
      "chk_po_received_lte_ordered",
      sql`received_accepted_qty + rejected_qty <= ordered_qty`,
    ),
  ],
);

// ── PO Receipt Events (Append-Only Immutable Ledger) ──

export const poReceiptEvents = pgTable(
  "po_receipt_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => poLines.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    receivedAcceptedQty: integer("received_accepted_qty").notNull(),
    rejectedQty: integer("rejected_qty").notNull(),
    /** Actual cost at delivery — may differ from PO line unitCost */
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    notes: varchar("notes", { length: 500 }),
    receivedByUserId: uuid("received_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 })
      .notNull()
      .unique(),
    // Immutable ledger — no updated_at
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_po_receipt_events_po_id").on(table.purchaseOrderId),
    index("idx_po_receipt_events_po_line_id").on(table.poLineId),
    index("idx_po_receipt_events_product_id").on(table.productId),
    // Each receipt line must have accepted + rejected > 0
    check(
      "chk_receipt_qty_positive",
      sql`received_accepted_qty + rejected_qty > 0`,
    ),
    check(
      "chk_receipt_accepted_non_negative",
      sql`received_accepted_qty >= 0`,
    ),
    check("chk_receipt_rejected_non_negative", sql`rejected_qty >= 0`),
  ],
);
