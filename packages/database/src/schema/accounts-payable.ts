import { pgTable, uuid, varchar, numeric, integer, boolean, date, timestamp, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { suppliers } from "./suppliers";

// Enums
export const supplierInvoiceStatusEnum = pgEnum("supplier_invoice_status", [
  "OPEN", "PARTIALLY_PAID", "PAID", "VOIDED", "DISPUTED"
]);

export const checkVoucherStatusEnum = pgEnum("check_voucher_status", [
  "DRAFT", "APPROVED", "PRINTED", "RELEASED", "CLEARED", "VOIDED", "STALE"
]);

// supplier_invoices
export const supplierInvoices = pgTable("supplier_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
  status: supplierInvoiceStatusEnum("status").notNull().default("OPEN"),
  paymentTermsDays: integer("payment_terms_days"),
  currency: varchar("currency", { length: 3 }).notNull().default("PHP"),
  sourcePoId: uuid("source_po_id"),
  sourceReceiptId: uuid("source_receipt_id"),
  rtvCreditAmount: numeric("rtv_credit_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: varchar("notes", { length: 2000 }),
  recordedBy: uuid("recorded_by"),
  // SOA billing tracking — mirrors customer_transactions.billed / billed_soa_id.
  // Set to true when an invoice is included in a generated supplier_soa_records row;
  // cleared back to false if the SOA is voided.
  billed: boolean("billed").notNull().default(false),
  billedSoaId: uuid("billed_soa_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("idx_supplier_invoices_unique").on(table.orgId, table.supplierId, table.invoiceNumber),
  index("idx_supplier_invoices_status").on(table.orgId, table.status),
  index("idx_supplier_invoices_due").on(table.orgId, table.dueDate),
  index("idx_supplier_invoices_supplier_status").on(table.orgId, table.supplierId, table.status),
  index("idx_supplier_invoices_po").on(table.orgId, table.sourcePoId),
  index("idx_supplier_invoices_billed_soa").on(table.billedSoaId),
]);

// check_vouchers
export const checkVouchers = pgTable("check_vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  cvNumber: varchar("cv_number", { length: 50 }).notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  checkDate: date("check_date").notNull(),
  checkNumber: varchar("check_number", { length: 50 }),
  bankName: varchar("bank_name", { length: 100 }),
  bankAccount: varchar("bank_account", { length: 50 }),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  deductions: numeric("deductions", { precision: 14, scale: 2 }).notNull().default("0"),
  netAmount: numeric("net_amount", { precision: 14, scale: 2 }).notNull(),
  status: checkVoucherStatusEnum("status").notNull().default("DRAFT"),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by"),
  voidReason: varchar("void_reason", { length: 500 }),
  notes: varchar("notes", { length: 2000 }),
  preparedBy: uuid("prepared_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("idx_check_vouchers_cv_number").on(table.orgId, table.cvNumber),
  index("idx_check_vouchers_supplier").on(table.orgId, table.supplierId),
  index("idx_check_vouchers_status").on(table.orgId, table.status),
  index("idx_check_vouchers_date").on(table.orgId, table.checkDate),
]);

// check_voucher_lines
export const checkVoucherLines = pgTable("check_voucher_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkVoucherId: uuid("check_voucher_id").notNull().references(() => checkVouchers.id, { onDelete: "cascade" }),
  supplierInvoiceId: uuid("supplier_invoice_id").notNull().references(() => supplierInvoices.id),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  deductionAmount: numeric("deduction_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  deductionReason: varchar("deduction_reason", { length: 500 }),
}, (table) => [
  index("idx_cv_lines_voucher").on(table.checkVoucherId),
  index("idx_cv_lines_invoice").on(table.supplierInvoiceId),
]);

// cv_number_sequence
export const cvNumberSequence = pgTable("cv_number_sequence", {
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  lastNumber: integer("last_number").notNull().default(0),
}, (table) => [
  uniqueIndex("idx_cv_sequence_unique").on(table.orgId, table.year),
]);

// bank_accounts
export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 50 }).notNull(),
  accountNumberDisplay: varchar("account_number_display", { length: 20 }),
  branch: varchar("branch", { length: 100 }),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_bank_accounts_active").on(table.orgId, table.isActive),
]);
