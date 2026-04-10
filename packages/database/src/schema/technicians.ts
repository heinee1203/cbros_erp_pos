import {
  pgTable,
  uuid,
  varchar,
  decimal,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";

export const technicians = pgTable("technicians", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  nickname: varchar("nickname", { length: 50 }),
  role: varchar("role", { length: 50 }).default("mechanic"),
  phone: varchar("phone", { length: 20 }),

  // Commission setup
  commissionType: varchar("commission_type", { length: 30 }).default("percentage").notNull(),
  commissionRate: decimal("commission_rate", { precision: 7, scale: 2 }).default("0").notNull(),
  commissionRateAlt: decimal("commission_rate_alt", { precision: 7, scale: 2 }),

  // Location assignment
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),

  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
