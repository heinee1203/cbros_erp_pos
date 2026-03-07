import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
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
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "USER",
  "SYSTEM",
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
    changeQuantity: integer("change_quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    referenceType: journalReferenceTypeEnum("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    referenceLineId: uuid("reference_line_id"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 12, scale: 2 }),
    actorType: actorTypeEnum("actor_type").notNull().default("USER"),
    effectiveAt: timestamp("effective_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: varchar("notes", { length: 500 }),
    // Immutable ledger — no updated_at
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_journal_product_location").on(table.productId, table.locationId),
    index("idx_journal_reference_type").on(table.referenceType),
    index("idx_journal_effective_at").on(table.effectiveAt),
    index("idx_journal_org_id").on(table.orgId),
  ],
);
