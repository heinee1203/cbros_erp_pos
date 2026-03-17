import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";

export const productOptionTypes = pgTable(
  "product_option_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_option_types_product_name").on(
      table.orgId,
      table.productId,
      table.name,
    ),
    index("idx_option_types_product_id").on(table.productId),
  ],
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionTypeId: uuid("option_type_id")
      .notNull()
      .references(() => productOptionTypes.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_option_values_type_value").on(table.optionTypeId, table.value),
    index("idx_option_values_type_id").on(table.optionTypeId),
  ],
);

export const productVariantOptions = pgTable(
  "product_variant_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    optionValueId: uuid("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_variant_options_product_value").on(
      table.productId,
      table.optionValueId,
    ),
    index("idx_variant_options_product_id").on(table.productId),
    index("idx_variant_options_value_id").on(table.optionValueId),
  ],
);
