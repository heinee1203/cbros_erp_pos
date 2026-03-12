import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { users } from "./users";

export const shiftStatusEnum = pgEnum("shift_status", [
  "OPEN",
  "CLOSED",
  "FORCE_CLOSED",
]);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: shiftStatusEnum("status").notNull().default("OPEN"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    openingFloat: numeric("opening_float", { precision: 12, scale: 2 })
      .notNull()
      .default("0.00"),
    actualCash: numeric("actual_cash", { precision: 12, scale: 2 }),
    cashVariance: numeric("cash_variance", { precision: 12, scale: 2 }),
    zReadingSnapshot: jsonb("z_reading_snapshot"),
    notes: varchar("notes", { length: 1000 }),
    timezone: varchar("timezone", { length: 50 }).notNull().default("Asia/Manila"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_shifts_org_loc_user_status").on(
      table.orgId,
      table.locationId,
      table.userId,
      table.status,
    ),
    index("idx_shifts_opened_at").on(table.openedAt),
    // Partial unique index: only one OPEN shift per cashier per location
    uniqueIndex("idx_shifts_one_open_per_user_location")
      .on(table.orgId, table.locationId, table.userId)
      .where(sql`status = 'OPEN'`),
  ],
);
