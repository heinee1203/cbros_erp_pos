import { pgTable, uuid, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customerTransactions } from "./customer-transactions";

export const arPaymentAllocations = pgTable("ar_payment_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  paymentTransactionId: uuid("payment_transaction_id").notNull().references(() => customerTransactions.id, { onDelete: "cascade" }),
  chargeTransactionId: uuid("charge_transaction_id").notNull().references(() => customerTransactions.id),
  allocatedAmount: numeric("allocated_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex("idx_ar_alloc_unique").on(table.paymentTransactionId, table.chargeTransactionId),
  index("idx_ar_alloc_payment").on(table.paymentTransactionId),
  index("idx_ar_alloc_charge").on(table.chargeTransactionId),
  index("idx_ar_alloc_org").on(table.orgId),
]);
