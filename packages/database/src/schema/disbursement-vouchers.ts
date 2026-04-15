import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  numeric,
  date,
  text,
  timestamp,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { suppliers } from "./suppliers";
import { supplierSoaRecords } from "./supplier-soa-records";

// ── Enums ──

export const dvStatusEnum = pgEnum("dv_status", [
  "DRAFT",
  "PRINTED",
  "CONFIRMED",
  "VOIDED",
]);

export const dvPaymentMethodEnum = pgEnum("dv_payment_method", [
  "CHECK",
  "CASH",
  "BANK_TRANSFER",
  "ONLINE",
]);

// ── Disbursement Vouchers ──

export const supplierDisbursementVouchers = pgTable(
  "supplier_disbursement_vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dvNumber: varchar("dv_number", { length: 50 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** Nullable — standalone DVs (utilities, rent) don't reference an SOA */
    soaId: uuid("soa_id").references(() => supplierSoaRecords.id),
    /** Net disbursed amount (gross - deductions). Equals payments[] sum. */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** SOA total before deductions */
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }),
    /** Sum of all deduction lines */
    totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).default("0"),
    /** Actual disbursed amount = gross - deductions (same as amount) */
    netAmount: numeric("net_amount", { precision: 14, scale: 2 }),
    /** @deprecated — primary method stored on header for backward compat; use supplier_dv_payments */
    paymentMethod: dvPaymentMethodEnum("payment_method")
      .notNull()
      .default("CHECK"),
    /** @deprecated — use supplier_dv_payments */
    checkNumber: varchar("check_number", { length: 50 }),
    /** @deprecated — use supplier_dv_payments */
    checkDate: date("check_date"),
    /** @deprecated — use supplier_dv_payments */
    bankName: varchar("bank_name", { length: 100 }),
    paymentDate: date("payment_date").notNull(),
    remarks: text("remarks"),
    status: dvStatusEnum("status").notNull().default("DRAFT"),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by"),
    voidReason: varchar("void_reason", { length: 500 }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_dv_org_number").on(table.orgId, table.dvNumber),
    index("idx_dv_org_supplier").on(table.orgId, table.supplierId),
    index("idx_dv_org_status").on(table.orgId, table.status),
    index("idx_dv_org_soa").on(table.orgId, table.soaId),
  ],
);

// ── DV Payment Lines (child table — one DV can have multiple payments) ──

export const supplierDvPayments = pgTable(
  "supplier_dv_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dvId: uuid("dv_id")
      .notNull()
      .references(() => supplierDisbursementVouchers.id, { onDelete: "cascade" }),
    paymentMethod: dvPaymentMethodEnum("payment_method").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** Check #, bank transfer ref, online transaction ID */
    referenceNumber: varchar("reference_number", { length: 100 }),
    /** Bank name — for CHECK and BANK_TRANSFER methods */
    bankName: varchar("bank_name", { length: 100 }),
    /** Check date, transfer date, or transaction date */
    transactionDate: date("transaction_date"),
    /** Online platform — GCash, Maya, PayPal, etc. */
    platform: varchar("platform", { length: 50 }),
    /** Person who received cash — CASH method only */
    receivedBy: varchar("received_by", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Check lifecycle: OUTSTANDING → RELEASED → CLEARED/BOUNCED, or OUTSTANDING → CANCELLED */
    status: text("status").default("OUTSTANDING"),
    /** Reason the check bounced (only for BOUNCED status) */
    bounceReason: text("bounce_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_dv_payments_dv").on(table.dvId),
  ],
);

// ── DV Deduction Lines ──

export const supplierDvDeductions = pgTable(
  "supplier_dv_deductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dvId: uuid("dv_id")
      .notNull()
      .references(() => supplierDisbursementVouchers.id, { onDelete: "cascade" }),
    /** EWT, CREDIT_MEMO, RETURN, OTHER */
    deductionType: text("deduction_type").notNull(),
    /** Human-readable: "EWT 1%", "CM #31324", etc. */
    description: text("description").notNull(),
    referenceNumber: text("reference_number"),
    /** Always positive — displayed as negative on the voucher */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_dv_deductions_dv_id").on(table.dvId),
  ],
);

// ── Number Sequence ──

export const dvNumberSequence = pgTable(
  "dv_number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_dv_seq_org_year").on(table.orgId, table.year),
  ],
);

// ── DV ↔ SOA Junction Table (many-to-many) ──

export const supplierDvSoas = pgTable(
  "supplier_dv_soas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dvId: uuid("dv_id")
      .notNull()
      .references(() => supplierDisbursementVouchers.id, { onDelete: "cascade" }),
    soaId: uuid("soa_id")
      .notNull()
      .references(() => supplierSoaRecords.id),
    allocatedAmount: numeric("allocated_amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_dv_soa_unique").on(table.dvId, table.soaId),
    index("idx_dv_soa_dv").on(table.dvId),
  ],
);
