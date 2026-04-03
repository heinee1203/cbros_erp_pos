import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";

export const printerTypeEnum = pgEnum("printer_type", ["zpl", "escpos"]);
export const connectionTypeEnum = pgEnum("connection_type", [
  "tcp",
  "bluetooth",
  "usb",
]);

export const printers = pgTable(
  "printers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: varchar("name", { length: 100 }).notNull(),
    printerType: printerTypeEnum("printer_type").notNull().default("zpl"),
    connectionType: connectionTypeEnum("connection_type").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    port: integer("port").default(9100),
    bluetoothMac: varchar("bluetooth_mac", { length: 17 }),
    labelWidthMm: numeric("label_width_mm", { precision: 6, scale: 1 })
      .notNull()
      .default("50"),
    labelHeightMm: numeric("label_height_mm", { precision: 6, scale: 1 })
      .notNull()
      .default("30"),
    dpmm: integer("dpmm").notNull().default(8),
    darkness: integer("darkness").default(15),
    speed: integer("speed").default(4),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_printers_location").on(table.locationId),
    index("idx_printers_org").on(table.orgId),
  ],
);
