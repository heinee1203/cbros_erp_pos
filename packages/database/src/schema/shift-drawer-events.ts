import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { shifts } from "./shifts";
import { users } from "./users";

export const shiftDrawerEvents = pgTable(
  "shift_drawer_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    cashierUserId: uuid("cashier_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByName: varchar("approved_by_name", { length: 160 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
    reason: varchar("reason", { length: 500 }).notNull().default(""),
    authorizationMethod: varchar("authorization_method", { length: 20 }).notNull(),
    drawerOpened: boolean("drawer_opened").notNull().default(false),
    drawerError: varchar("drawer_error", { length: 500 }),
    clientEventId: varchar("client_event_id", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_shift_drawer_events_org_shift_created").on(
      table.orgId,
      table.shiftId,
      table.createdAt,
    ),
    index("idx_shift_drawer_events_org_location_created").on(
      table.orgId,
      table.locationId,
      table.createdAt,
    ),
    uniqueIndex("idx_shift_drawer_events_org_client_event").on(
      table.orgId,
      table.clientEventId,
    ),
    check("chk_shift_drawer_events_action", sql`action IN ('NO_SALE', 'PAID_IN', 'PAID_OUT')`),
    check("chk_shift_drawer_events_amount_nonnegative", sql`amount >= 0`),
  ],
);
