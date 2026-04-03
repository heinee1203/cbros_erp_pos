import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  text,
  date,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { suppliers } from "./suppliers";
import { purchaseOrders, poLines } from "./purchase-orders";

// ── Enums ──

export const backorderPriorityEnum = pgEnum("backorder_priority", [
  "HIGH",
  "NORMAL",
  "LOW",
]);

export const backorderStatusEnum = pgEnum("backorder_status", [
  "PENDING",
  "INCLUDED_IN_PO",
  "FULFILLED",
  "CANCELLED",
]);

// ── Backorders ──

export const backorders = pgTable(
  "backorders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Item
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name"),
    sku: varchar("sku", { length: 50 }),

    // Original supplier
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierName: text("supplier_name"),

    // Quantities
    quantity: integer("quantity").notNull(),
    quantityOrdered: integer("quantity_ordered"),
    quantityReceived: integer("quantity_received"),
    quantityOutstanding: integer("quantity_outstanding"),

    // Original PO reference
    originalPoId: uuid("original_po_id").references(() => purchaseOrders.id),
    originalPoNumber: varchar("original_po_number", { length: 50 }),
    originalPoLineId: uuid("original_po_line_id").references(() => poLines.id),

    // Unit cost from original PO line (for copying to new PO)
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),

    reason: varchar("reason", { length: 255 }),
    priority: backorderPriorityEnum("priority").notNull().default("NORMAL"),
    status: backorderStatusEnum("status").notNull().default("PENDING"),

    // Wait option — date until which we expect the supplier to deliver
    waitUntil: date("wait_until"),

    // Resolution — new PO created (same or different supplier)
    targetPoId: uuid("target_po_id").references(() => purchaseOrders.id),
    targetPoNumber: varchar("target_po_number", { length: 50 }),
    newSupplierId: uuid("new_supplier_id").references(() => suppliers.id),
    newSupplierName: text("new_supplier_name"),

    requestedBy: uuid("requested_by"),
    neededByDate: date("needed_by_date"),
    notes: text("notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_backorders_org_status").on(table.orgId, table.status),
    index("idx_backorders_org_supplier_status").on(
      table.orgId,
      table.supplierId,
      table.status,
    ),
    index("idx_backorders_org_product_status").on(
      table.orgId,
      table.productId,
      table.status,
    ),
    index("idx_backorders_org_original_po").on(table.orgId, table.originalPoId),
    index("idx_backorders_org_target_po").on(table.orgId, table.targetPoId),
  ],
);
