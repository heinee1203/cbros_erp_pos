import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const importProfiles = pgTable(
  "import_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    importType: varchar("import_type", { length: 40 }).notNull().default("items"),
    importMode: varchar("import_mode", { length: 40 }).notNull(),
    locationMapping: jsonb("location_mapping")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    categoryMapping: jsonb("category_mapping")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    includeCreates: boolean("include_creates").notNull().default(true),
    includeUpdates: boolean("include_updates").notNull().default(true),
    includeNoChange: boolean("include_no_change").notNull().default(false),
    createNewCategories: boolean("create_new_categories").notNull().default(true),
    fieldLockPolicyVersion: varchar("field_lock_policy_version", { length: 80 })
      .notNull()
      .default("item-import-field-scope-v1"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_import_profiles_org_name").on(table.orgId, table.name),
    index("idx_import_profiles_org_type").on(table.orgId, table.importType),
  ],
);
