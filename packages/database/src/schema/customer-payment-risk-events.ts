import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { customerTransactions } from "./customer-transactions";
import { users } from "./users";

export const customerPaymentRiskEvents = pgTable(
  "customer_payment_risk_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    paymentTransactionId: uuid("payment_transaction_id").references(
      () => customerTransactions.id,
      { onDelete: "set null" },
    ),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("OPEN"),
    referenceNumber: varchar("reference_number", { length: 100 }),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_customer_payment_risk_org_customer").on(
      table.orgId,
      table.customerId,
      table.createdAt,
    ),
    index("idx_customer_payment_risk_org_type").on(table.orgId, table.eventType),
    index("idx_customer_payment_risk_payment").on(table.paymentTransactionId),
  ],
);
