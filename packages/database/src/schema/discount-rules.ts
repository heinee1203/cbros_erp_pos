import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const customerTiers = pgTable(
  "customer_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    defaultDiscount: numeric("default_discount", { precision: 5, scale: 2 }).default("0"),
    color: varchar("color", { length: 7 }),
    sortOrder: integer("sort_order").default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_customer_tiers_org").on(table.orgId),
  ],
);

export const discountRules = pgTable(
  "discount_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    type: varchar("type", { length: 30 }).notNull(), // percentage, fixed_amount, fixed_price, buy_x_get_y
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    scope: varchar("scope", { length: 30 }).notNull().default("all"), // all, category, brand, family, product
    scopeIds: text("scope_ids"), // JSON array of UUIDs
    minQuantity: integer("min_quantity"),
    minAmount: numeric("min_amount", { precision: 10, scale: 2 }),
    customerTierId: uuid("customer_tier_id").references(() => customerTiers.id, { onDelete: "set null" }),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    stackable: boolean("stackable").notNull().default(false),
    locationIds: text("location_ids"), // JSON array of location UUIDs, null = all
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_discount_rules_org").on(table.orgId),
    index("idx_discount_rules_active").on(table.orgId, table.isActive),
    index("idx_discount_rules_tier").on(table.customerTierId),
  ],
);
