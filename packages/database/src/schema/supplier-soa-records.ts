import {
  pgTable,
  uuid,
  varchar,
  date,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { suppliers } from "./suppliers";
import { users } from "./users";

/**
 * Historical Supplier Statement of Account record — one row per generated
 * supplier SOA. Mirrors the customer side (soa_records / soa_line_items)
 * and intentionally uses the same column naming so the two modules are
 * symmetrical.
 *
 * Supplier SOAs have a simpler status model than customer SOAs: we track
 * GENERATED / SENT / VOID only. Invoice-level paid/unpaid status already
 * lives on supplier_invoices (driven by check_voucher_lines), so we don't
 * duplicate that here.
 *
 * Historical snapshots: unlike customer_transactions which are immutable
 * after creation, supplier_invoices.paid_amount/balance are MUTATED by
 * check voucher releases. We therefore freeze the per-invoice totals in
 * supplier_soa_line_items at generation time so a reprint always shows
 * the account state as of the SOA's generation date.
 */
export const supplierSoaRecords = pgTable(
  "supplier_soa_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    /** Human-readable code, e.g. "SUPP-SOA-2026-0001" */
    soaNumber: varchar("soa_number", { length: 30 }).notNull(),

    /** Date range the SOA nominally covers (earliest/latest invoice date). */
    dateFrom: date("date_from").notNull(),
    dateTo: date("date_to").notNull(),

    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
    generatedBy: uuid("generated_by").references(() => users.id),

    // ── Snapshot totals (computed at generation time) ──
    /** Sum of total_amount on every included supplier_invoice */
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Snapshot of paid_amount on every included supplier_invoice */
    totalPaid: numeric("total_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    /** Snapshot of outstanding balance = total_amount - total_paid */
    totalBalance: numeric("total_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    /** How many invoice lines the SOA includes */
    invoiceCount: integer("invoice_count").notNull().default(0),

    /** Supplier SOA status: GENERATED | SENT | VOID */
    status: varchar("status", { length: 20 }).notNull().default("GENERATED"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_supplier_soa_records_org_supplier").on(table.orgId, table.supplierId),
    index("idx_supplier_soa_records_org_number").on(table.orgId, table.soaNumber),
  ],
);

/**
 * Junction table linking a supplier SOA to the specific supplier_invoices
 * it covers. Stores a SNAPSHOT of each invoice's amount/paid/balance as of
 * the SOA's generation time so historical reprints are deterministic even
 * after future check voucher releases mutate the invoice's current paid
 * or balance values.
 */
export const supplierSoaLineItems = pgTable(
  "supplier_soa_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soaId: uuid("soa_id")
      .notNull()
      .references(() => supplierSoaRecords.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    /** Frozen values at generation time */
    invoiceAmount: numeric("invoice_amount", { precision: 14, scale: 2 }).notNull(),
    paidAtGeneration: numeric("paid_at_generation", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    balanceAtGeneration: numeric("balance_at_generation", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_supplier_soa_line_items_unique").on(table.soaId, table.invoiceId),
    index("idx_supplier_soa_line_items_invoice").on(table.invoiceId),
  ],
);

/**
 * Per-org yearly counter for generating human-readable supplier SOA numbers.
 * Same shape as soa_number_sequence on the customer side.
 */
export const supplierSoaNumberSequence = pgTable(
  "supplier_soa_number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_supplier_soa_seq_org_year").on(table.orgId, table.year),
  ],
);
