import {
  pgTable,
  uuid,
  varchar,
  integer,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Daily sales summary — one row per business day per org, tracking sales
 * totals for every division (cash and on-account) plus AR collections.
 *
 * Populated initially from the historical SALES_CBROS Excel workbook
 * (2019-06-01 onward) via apps/api/scripts/import-daily-sales.ts, and
 * going forward via a manual entry form in the admin dashboard.
 *
 * Amounts are stored in CENTAVOS (integer) for numeric precision and to
 * match the rest of the system. int32 max = ~21.47M pesos per column per
 * day, which is well above any realistic single-day figure. Divide by 100
 * to get peso values.
 */
export const dailySalesSummary = pgTable(
  "daily_sales_summary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Business date this summary row covers (YYYY-MM-DD) */
    date: date("date").notNull(),

    // ── Auto Parts ──
    /** A/P - OLD — Old Auto Parts branch, cash sales (centavos) */
    apOldSales: integer("ap_old_sales").notNull().default(0),
    /** A/P - NEW — C Autoparts (new) branch, cash sales (centavos) */
    apNewSales: integer("ap_new_sales").notNull().default(0),
    /** A/P ON ACCT — Auto Parts credit / on-account sales (centavos) */
    apOnAccount: integer("ap_on_account").notNull().default(0),

    // ── Accessories ──
    /** A/C — Accessories cash sales (centavos) */
    acSales: integer("ac_sales").notNull().default(0),
    /** A/C ON ACCT — Accessories credit sales (centavos) */
    acOnAccount: integer("ac_on_account").notNull().default(0),

    // ── Service ──
    /** SERVICE — Auto Service cash sales (centavos) */
    serviceSales: integer("service_sales").notNull().default(0),
    /** S - ON ACCT — Service credit sales (centavos) */
    serviceOnAccount: integer("service_on_account").notNull().default(0),

    // ── Painting ──
    /** PAINTING — Painting division cash sales (centavos) */
    paintingSales: integer("painting_sales").notNull().default(0),
    /** P- ON ACCT — Painting credit sales (centavos) */
    paintingOnAccount: integer("painting_on_account").notNull().default(0),

    // ── Junior branch ──
    /** JUNIOR — Junior Branch daily sales (centavos) */
    juniorSales: integer("junior_sales").notNull().default(0),

    // ── Collections ──
    /** PAYMENT — AR collections received that day (centavos) */
    payments: integer("payments").notNull().default(0),

    // ── Provenance ──
    /**
     * Where this row came from:
     *   'IMPORT' → loaded from the legacy SALES_CBROS Excel file
     *   'MANUAL' → entered through the admin dashboard form
     * Kept as varchar rather than an enum so future sources can be added
     * without a migration.
     */
    source: varchar("source", { length: 20 }).notNull().default("IMPORT"),
    /** Freeform notes/annotations for this day (manual entry) */
    notes: varchar("notes", { length: 500 }),
    /** Admin user who entered/edited this row (null for bulk import) */
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),

    // ── Audit ──
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One row per org per day — prevents duplicate imports and supports
    // efficient lookups by date range within an org.
    uniqueIndex("idx_daily_sales_org_date").on(table.orgId, table.date),
    index("idx_daily_sales_date").on(table.date),
  ],
);
