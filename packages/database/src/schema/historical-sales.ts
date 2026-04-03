import { pgTable, uuid, varchar, integer, numeric, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";

export const historyReasonTypeEnum = pgEnum("history_reason_type", [
  "SALE", "REFUND", "PO_RECEIPT", "TRANSFER_IN", "TRANSFER_OUT",
  "COUNT_ADJUSTMENT", "DAMAGE", "LOSS",
]);

export const historyDirectionEnum = pgEnum("history_direction", ["IN", "OUT"]);

export const historicalSales = pgTable(
  "historical_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    sku: varchar("sku", { length: 100 }).notNull(),
    productName: varchar("product_name", { length: 255 }).notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    locationName: varchar("location_name", { length: 100 }).notNull(),
    employeeName: varchar("employee_name", { length: 100 }),
    reasonType: historyReasonTypeEnum("reason_type").notNull(),
    reasonReference: varchar("reason_reference", { length: 50 }),
    quantity: integer("quantity").notNull(),
    /** Unit price per item (from Loyverse Net sales / Quantity) */
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
    /** Net sales amount for this line (after discounts) */
    netSales: numeric("net_sales", { precision: 12, scale: 2 }),
    /** Cost of goods for this line */
    costAmount: numeric("cost_amount", { precision: 12, scale: 2 }),
    /** Discount amount applied */
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
    /** Customer name from CSV */
    customerName: varchar("customer_name", { length: 255 }),
    direction: historyDirectionEnum("direction").notNull(),
    movementDate: timestamp("movement_date", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    importBatchId: uuid("import_batch_id").notNull(),
  },
  (table) => [
    index("idx_hist_org_product_reason_date").on(table.orgId, table.productId, table.reasonType, table.movementDate),
    index("idx_hist_org_date").on(table.orgId, table.movementDate),
    index("idx_hist_org_reason").on(table.orgId, table.reasonType),
    index("idx_hist_org_sku").on(table.orgId, table.sku),
    index("idx_hist_batch").on(table.importBatchId),
  ],
);
