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
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { suppliers } from "./suppliers";
import { purchaseOrders } from "./purchase-orders";

// ── Enums ──

export const backorderPriorityEnum = pgEnum("backorder_priority", [
  "HIGH",
  "NORMAL",
  "LOW",
]);

export const backorderStatusEnum = pgEnum("backorder_status", [
  "PENDING",
  "INCLUDED_IN_PO",
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
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    quantity: integer("quantity").notNull(),
    originalPoId: uuid("original_po_id").references(() => purchaseOrders.id),
    originalPoNumber: varchar("original_po_number", { length: 50 }),
    reason: varchar("reason", { length: 255 }),
    priority: backorderPriorityEnum("priority").notNull().default("NORMAL"),
    status: backorderStatusEnum("status").notNull().default("PENDING"),
    targetPoId: uuid("target_po_id").references(() => purchaseOrders.id),
    targetPoNumber: varchar("target_po_number", { length: 50 }),
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
    index("idx_backorders_org_supplier_status").on(table.orgId, table.supplierId, table.status),
    index("idx_backorders_org_product_status").on(table.orgId, table.productId, table.status),
    index("idx_backorders_org_original_po").on(table.orgId, table.originalPoId),
  ],
);
