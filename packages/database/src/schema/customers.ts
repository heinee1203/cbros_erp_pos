import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const customerTypeEnum = pgEnum("customer_type", [
  "INDIVIDUAL",
  "SHOP",
  "FLEET",
  "WHOLESALE",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    customerType: customerTypeEnum("customer_type")
      .notNull()
      .default("INDIVIDUAL"),
    contactPerson: varchar("contact_person", { length: 255 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    tin: varchar("tin", { length: 20 }),
    creditLimit: numeric("credit_limit", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    currentBalance: numeric("current_balance", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    totalPurchases: numeric("total_purchases", { precision: 14, scale: 2 })
      .notNull()
      .default("0.00"),
    creditStatus: varchar("credit_status", { length: 40 }).notNull().default("OK"),
    creditHoldType: varchar("credit_hold_type", { length: 40 }).notNull().default("NONE"),
    creditHoldReason: text("credit_hold_reason"),
    creditHoldNote: text("credit_hold_note"),
    creditHoldApprovedBy: uuid("credit_hold_approved_by"),
    creditHoldApprovedAt: timestamp("credit_hold_approved_at", { withTimezone: true }),
    mergedIntoCustomerId: uuid("merged_into_customer_id"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergedByUserId: uuid("merged_by_user_id"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    tierId: uuid("tier_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_customers_org_phone").on(table.orgId, table.phone),
    index("idx_customers_org_id").on(table.orgId),
    index("idx_customers_name").on(table.name),
    index("idx_customers_org_type").on(table.orgId, table.customerType),
    index("idx_customers_org_active").on(table.orgId, table.isActive),
  ],
);
