import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const locationTypeEnum = pgEnum("location_type", [
  "WAREHOUSE",
  "RETAIL_STORE",
  "SHOWROOM",
  "STORE",
  "TRANSIT_BUFFER",
]);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull().default(""),
    type: locationTypeEnum("type").notNull(),
    address: varchar("address", { length: 500 }),
    isSystem: boolean("is_system").notNull().default(false),
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
    index("idx_locations_org_id").on(table.orgId),
    uniqueIndex("idx_locations_org_code").on(table.orgId, table.code),
  ],
);
