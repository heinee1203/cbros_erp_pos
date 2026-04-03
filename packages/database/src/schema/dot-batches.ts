import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";
import { purchaseOrders } from "./purchase-orders";
import { suppliers } from "./suppliers";
import { users } from "./users";

export const dotBatches = pgTable(
  "dot_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    // DOT code
    dotCode: text("dot_code").notNull(),
    manufactureWeek: integer("manufacture_week"),
    manufactureYear: integer("manufacture_year"),
    manufactureDate: date("manufacture_date"),

    // Inventory tracking
    quantityReceived: integer("quantity_received").notNull().default(0),
    quantityInStock: integer("quantity_in_stock").notNull().default(0),
    quantitySold: integer("quantity_sold").notNull().default(0),
    quantityReturned: integer("quantity_returned").notNull().default(0),

    // Receiving info
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    poNumber: varchar("po_number", { length: 50 }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => users.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),

    // Timestamps
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_dot_batches_unique").on(
      table.orgId,
      table.productId,
      table.locationId,
      table.dotCode,
      table.purchaseOrderId,
    ),
    index("idx_dot_batches_product_location").on(table.productId, table.locationId),
    index("idx_dot_batches_org_product").on(table.orgId, table.productId),
    index("idx_dot_batches_manufacture").on(table.manufactureDate),
    check("dot_batches_positive_stock", sql`quantity_in_stock >= 0`),
  ],
);
