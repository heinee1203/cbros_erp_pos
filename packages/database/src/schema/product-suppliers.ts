import { pgTable, uuid, integer, numeric, varchar, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { suppliers } from "./suppliers";

export const productSuppliers = pgTable(
  "product_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(1),
    supplierSku: varchar("supplier_sku", { length: 100 }),
    supplierCost: numeric("supplier_cost", { precision: 12, scale: 2 }),
    minOrderQty: integer("min_order_qty").notNull().default(1),
    leadTimeDays: integer("lead_time_days"),
    isActive: boolean("is_active").notNull().default(true),
    notes: varchar("notes", { length: 1000 }),
    lastOrderedAt: timestamp("last_ordered_at", { withTimezone: true }),
    lastCost: numeric("last_cost", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_product_suppliers_unique").on(table.orgId, table.productId, table.supplierId),
    index("idx_product_suppliers_priority").on(table.orgId, table.productId, table.priority),
    index("idx_product_suppliers_supplier").on(table.orgId, table.supplierId),
  ],
);
