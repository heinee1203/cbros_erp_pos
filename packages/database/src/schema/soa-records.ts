import { pgTable, uuid, varchar, date, integer, numeric, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { customers } from "./customers";
import { users } from "./users";

export const soaRecords = pgTable("soa_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  soaNumber: varchar("soa_number", { length: 20 }).notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
  generatedBy: uuid("generated_by").references(() => users.id),
  totalCharges: numeric("total_charges", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCredits: numeric("total_credits", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPayable: numeric("total_payable", { precision: 12, scale: 2 }).notNull().default("0"),
  transactionCount: integer("transaction_count").notNull().default(0),
  status: varchar("status", { length: 20 }).default("GENERATED"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_soa_records_org_customer").on(table.orgId, table.customerId),
]);

export const soaLineItems = pgTable("soa_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  soaId: uuid("soa_id").notNull().references(() => soaRecords.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").notNull(),
});

export const soaNumberSequence = pgTable("soa_number_sequence", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
}, (table) => [
  uniqueIndex("idx_soa_seq_org_year").on(table.orgId, table.year),
]);
