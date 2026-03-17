import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_brands_org_slug").on(table.orgId, table.slug),
    index("idx_brands_org_id").on(table.orgId),
  ],
);
