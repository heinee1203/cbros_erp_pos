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
import { soaRecords } from "./soa-records";
import { users } from "./users";

export const customerDisputes = pgTable(
  "customer_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id").references(
      () => customerTransactions.id,
      { onDelete: "set null" },
    ),
    soaId: uuid("soa_id").references(() => soaRecords.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 30 }).notNull().default("OPEN"),
    reason: varchar("reason", { length: 80 }).notNull().default("DISPUTED"),
    disputedAmount: numeric("disputed_amount", { precision: 12, scale: 2 }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_customer_disputes_org_customer").on(
      table.orgId,
      table.customerId,
      table.createdAt,
    ),
    index("idx_customer_disputes_org_status").on(table.orgId, table.status),
    index("idx_customer_disputes_transaction").on(table.transactionId),
    index("idx_customer_disputes_soa").on(table.soaId),
  ],
);
