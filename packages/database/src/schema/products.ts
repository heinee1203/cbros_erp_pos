import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  numeric,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { productFamilies } from "./product-families";
import { brands } from "./brands";
import { categories } from "./categories";
import { productSubcategories } from "./product-subcategories";

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
    /** Last received cost price from PO receipt, updated on each accepted delivery */
    currentCostPrice: numeric("current_cost_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    /** Deterministic 10-char KINGSCOBRA cipher of currentCostPrice in centavos */
    mnemonicCostCode: varchar("mnemonic_cost_code", { length: 10 }),
    /** Barcode — any format up to 50 chars, nullable, unique per org when set */
    barcode: varchar("barcode", { length: 50 }),
    /** Soft delete — inactive products are hidden from POS and search by default */
    isActive: boolean("is_active").notNull().default(true),
    /** Variable price flag — cashier must enter price at time of sale */
    isVariablePrice: boolean("is_variable_price").notNull().default(false),
    /** Granular category FK from Loyverse import (separate from the broad enum) */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => productSubcategories.id, { onDelete: "set null" }),
    parentProductId: uuid("parent_product_id").references((): any => products.id, { onDelete: "cascade" }),
    isParent: boolean("is_parent").notNull().default(false),
    familyId: uuid("family_id").references(() => productFamilies.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    /** OEM part number — manufacturer's reference code for cross-referencing */
    oemNumber: varchar("oem_number", { length: 100 }),
    /** Product description — notes, specs, customer-facing detail */
    description: varchar("description", { length: 2000 }),
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
    index("idx_products_family_id").on(table.familyId),
    uniqueIndex("idx_products_org_barcode").on(table.orgId, table.barcode).where(sql`barcode IS NOT NULL`),
    index("idx_products_category_id").on(table.categoryId),
    index("idx_products_subcategory_id").on(table.subcategoryId),
    index("idx_products_parent_id").on(table.parentProductId),
    index("idx_products_is_active").on(table.isActive),
    index("idx_products_brand_id").on(table.brandId),
    index("idx_products_oem_number").on(table.oemNumber),
  ],
);
