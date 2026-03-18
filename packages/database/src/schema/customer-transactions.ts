import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
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
