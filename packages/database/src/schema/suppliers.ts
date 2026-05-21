import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    address: varchar("address", { length: 500 }),
    /** Two-letter user-nominated mnemonic code for this supplier (e.g. "PP" for PhilParts) */
    mnemonicCode: varchar("mnemonic_code", { length: 2 }),
    avgLeadTimeDays: integer("avg_lead_time_days").notNull().default(7),

    // ── Contact + tax ──
    contactPerson: varchar("contact_person", { length: 255 }),
    tin: varchar("tin", { length: 20 }),

    // ── Credit terms (mirror the customers table shape) ──
    /** Net payment terms in days. 0 = COD. Defaults to Net 30. */
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    /** Maximum outstanding payable we're willing to carry. 0 = unlimited. */
    creditLimit: numeric("credit_limit", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),

    // ── Bank details (used to auto-fill check voucher fields) ──
    bankName: varchar("bank_name", { length: 100 }),
    bankAccountNumber: varchar("bank_account_number", { length: 50 }),
    bankAccountName: varchar("bank_account_name", { length: 255 }),
    bankVerifiedAt: timestamp("bank_verified_at", { withTimezone: true }),
    bankVerifiedBy: uuid("bank_verified_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // ── Notes + soft-delete ──
    notes: text("notes"),
    /** False = deactivated (hidden from default list, no new POs/invoices). */
    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_suppliers_org_id").on(table.orgId),
    index("idx_suppliers_org_active").on(table.orgId, table.isActive),
    index("idx_suppliers_name").on(table.name),
  ],
);
