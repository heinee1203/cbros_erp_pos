import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";
import { users } from "./users";

export const journalReferenceTypeEnum = pgEnum("journal_reference_type", [
  "SALE",
  "RECEIVING",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "ADJUSTMENT",
  "RETURN",
  "STOCKTAKE",
  "VOID",
  "JOB_CARD_ISSUE",
  "JOB_CARD_RETURN",
  "OPENING_BALANCE",
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "USER",
  "SYSTEM",
  "INTEGRATION",
]);

export const adjustmentReasonCodeEnum = pgEnum("adjustment_reason_code", [
  "COUNT_GAIN",
  "FOUND_STOCK",
  "OPENING_BALANCE",
  "COUNT_LOSS",
  "DAMAGE_IN_TRANSIT",
  "DAMAGE_WAREHOUSE",
  "DAMAGE_SHOWROOM",
  "WARRANTY_WRITE_OFF",
  "SHRINKAGE_MISSING",
  "OBSOLETE_WRITE_OFF",
  "TRANSFER_SHORTAGE_CONFIRMED",
  "DATA_CORRECTION",
]);

export const stockJournal = pgTable(
  "stock_journal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorType: actorTypeEnum("actor_type").notNull().default("USER"),
    changeQuantity: integer("change_quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    referenceType: journalReferenceTypeEnum("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    referenceLineId: uuid("reference_line_id"),
    reasonCode: adjustmentReasonCodeEnum("reason_code"),
    idempotencyKey: varchar("idempotency_key", { length: 255 })
      .notNull()
      .unique(),
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 12,
      scale: 2,
    }),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: varchar("notes", { length: 500 }),
    reversalOfJournalId: uuid("reversal_of_journal_id"),
    // Immutable ledger — no updated_at
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_journal_product_location").on(
      table.productId,
      table.locationId,
    ),
    index("idx_journal_reference").on(table.referenceType, table.referenceId),
    index("idx_journal_effective_at").on(table.effectiveAt),
    index("idx_journal_org_id").on(table.orgId),
  ],
);
