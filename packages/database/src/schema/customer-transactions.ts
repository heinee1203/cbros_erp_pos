import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  jsonb,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { users } from "./users";

export const customerTransactionTypeEnum = pgEnum(
  "customer_transaction_type",
  ["CHARGE", "PAYMENT", "CREDIT_NOTE", "ADJUSTMENT"],
);

export const customerTransactions = pgTable(
  "customer_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    type: customerTransactionTypeEnum("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 })
      .notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: uuid("reference_id"),
    referenceNumber: varchar("reference_number", { length: 100 }),
    paymentMethod: varchar("payment_method", { length: 50 }),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Whether this CHARGE has been included in a billing statement */
    billed: boolean("billed").default(false),
    /** Which SOA this transaction was billed in */
    billedSoaId: uuid("billed_soa_id"),
    /** Payment receipt number (PAY-2026-0001) */
    paymentNumber: varchar("payment_number", { length: 20 }),
    /** Credit card payment fields */
    batchNumber: varchar("batch_number", { length: 50 }),
    traceNumber: varchar("trace_number", { length: 50 }),
    cardType: varchar("card_type", { length: 20 }),
    /** Split payment details: array of { method, amount, reference?, bank?, checkNumber?, checkDate?, cardType?, batchNumber?, traceNumber? } */
    paymentLines: jsonb("payment_lines"),
    /** Where this charge came from: MANUAL (Customer Invoices page), POS
     * (chargeCustomerAccount on a sale), or IMPORT (future AR import path).
     * CHECK constraint at the SQL layer enforces the enum. */
    source: text("source").notNull().default("MANUAL"),
    /** Due date for charges — drives the Overdue KPI and Due Date column on
     * the Customer Invoices page. NULL on historical rows (no inferred default). */
    dueDate: date("due_date"),
  },
  (table) => [
    index("idx_customer_txn_org_cust_date").on(
      table.orgId,
      table.customerId,
      table.recordedAt,
    ),
    index("idx_customer_txn_org_ref").on(table.orgId, table.referenceId),
  ],
);
