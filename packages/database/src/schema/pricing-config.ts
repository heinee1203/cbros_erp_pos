import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const pricingConfig = pgTable(
  "pricing_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    velocityClass: varchar("velocity_class", { length: 30 }).notNull(),
    ageBracketMin: integer("age_bracket_min").notNull().default(0),
    ageBracketMax: integer("age_bracket_max"),
    baseMarkupPct: numeric("base_markup_pct", { precision: 5, scale: 2 }).notNull(),
    maxMarkupPct: numeric("max_markup_pct", { precision: 5, scale: 2 }),
    inflationRateAnnual: numeric("inflation_rate_annual", { precision: 4, scale: 2 }).notNull().default("5.00"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_pricing_config_unique").on(table.orgId, table.velocityClass, table.ageBracketMin),
    index("idx_pricing_config_org").on(table.orgId),
  ],
);
