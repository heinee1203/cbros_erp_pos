import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    stockLevel: integer("stock_level").notNull().default(0),
    reservedLevel: integer("reserved_level").notNull().default(0),
    reorderPoint: integer("reorder_point").notNull().default(10),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_inventory_product_location").on(
      table.productId,
      table.locationId,
    ),
    index("idx_inventory_location_id").on(table.locationId),
    index("idx_inventory_org_id").on(table.orgId),
    check("chk_reserved_level_non_negative", sql`reserved_level >= 0`),
  ],
);
