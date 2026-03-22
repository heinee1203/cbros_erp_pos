import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { users } from "./users";

export const deviceStatusEnum = pgEnum("device_status", [
  "ACTIVATED",
  "DEACTIVATED",
]);

export const posDevices = pgTable(
  "pos_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    /** Android unique device identifier from react-native-device-info */
    deviceId: varchar("device_id", { length: 100 }).notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    status: deviceStatusEnum("status").notNull().default("ACTIVATED"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    appVersion: varchar("app_version", { length: 20 }),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    registeredByUserId: uuid("registered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("idx_pos_devices_org_device").on(table.orgId, table.deviceId),
    index("idx_pos_devices_org_location").on(table.orgId, table.locationId),
  ],
);
