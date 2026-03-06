import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  numeric,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";

export const productCategoryEnum = pgEnum("product_category", [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 500 }).notNull(),
    sku: varchar("sku", { length: 50 }).notNull(),
    mnemonicSku: varchar("mnemonic_sku", { length: 10 }).notNull(),
    category: productCategoryEnum("category").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_products_sku").on(table.sku),
    index("idx_products_mnemonic_sku").on(table.mnemonicSku),
    index("idx_products_org_id").on(table.orgId),
    // GIN trigram index for fast partial name search
    // Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
    index("idx_products_name_trgm").using("gin", sql`name gin_trgm_ops`),
    // Enforce exactly 10 characters for mnemonic SKU at DB level
    check("chk_mnemonic_sku_length", sql`char_length(mnemonic_sku) = 10`),
  ],
);
