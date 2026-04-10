import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "MANAGER",
  "CASHIER",
  "WAREHOUSE_STAFF",
  "STAFF",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  primaryLocationId: uuid("primary_location_id").references(
    () => locations.id,
    { onDelete: "set null" },
  ),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("CASHIER"),
  /** RBAC role FK — when set, use permissions from this role instead of the legacy enum */
  roleId: uuid("role_id"),
  pinHash: varchar("pin_hash", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
