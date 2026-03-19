import { pgTable, uuid, numeric, varchar, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";

export const priceFieldEnum = pgEnum("price_field", ["SELL_PRICE", "COST_PRICE"]);

export const priceChanges = pgTable(
  "price_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    field: priceFieldEnum("field").notNull(),
    oldValue: numeric("old_value", { precision: 12, scale: 2 }).notNull(),
    newValue: numeric("new_value", { precision: 12, scale: 2 }).notNull(),
    changeReason: varchar("change_reason", { length: 255 }),
    batchId: uuid("batch_id"),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_price_changes_product_date").on(table.orgId, table.productId, table.changedAt),
    index("idx_price_changes_batch").on(table.orgId, table.batchId),
  ],
);
