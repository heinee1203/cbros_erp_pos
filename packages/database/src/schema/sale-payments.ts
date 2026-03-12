import {
  pgTable,
  uuid,
  numeric,
  varchar,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { sales } from "./sales";

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "CARD", // @deprecated — reclassified to CREDIT_CARD in migration 0020. Kept for backward compat.
  "CREDIT_CARD",
  "DEBIT_CARD",
  "EFT",
  "QRPH",
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "ACCOUNT",
  "OTHER",
]);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reference: varchar("reference", { length: 255 }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_sale_payments_sale_id").on(table.saleId),
    index("idx_sale_payments_org_id").on(table.orgId),
  ],
);
