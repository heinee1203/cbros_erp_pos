import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    make: varchar("make", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    engine: varchar("engine", { length: 100 }),
    variant: varchar("variant", { length: 100 }),
    bodyType: varchar("body_type", { length: 50 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_vehicles_make_model").on(table.orgId, table.make, table.model),
    index("idx_vehicles_make").on(table.orgId, table.make),
    uniqueIndex("idx_vehicles_unique").on(
      table.orgId,
      table.make,
      table.model,
      table.yearFrom,
      table.yearTo,
      table.engine,
      table.variant,
    ),
  ],
);
