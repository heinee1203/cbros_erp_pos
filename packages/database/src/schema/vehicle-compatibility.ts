import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { vehicles } from "./vehicles";

export const vehicleCompatibility = pgTable(
  "vehicle_compatibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Link to master vehicle record (nullable for legacy entries) */
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    make: varchar("make", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    yearStart: integer("year_start"),
    yearEnd: integer("year_end"),
    engine: varchar("engine", { length: 100 }),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_compat_product_id").on(table.productId),
    index("idx_compat_make_model").on(table.make, table.model),
  ],
);
