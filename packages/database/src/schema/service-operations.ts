import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

// ── Service Operation Category Enum ──

export const serviceOperationCategoryEnum = pgEnum(
  "service_operation_category",
  [
    "MECHANICAL",
    "ELECTRICAL",
    "BODY",
    "TIRE_SERVICE",
    "DIAGNOSTIC",
    "OTHER",
  ],
);

// ── Service Operations ──

export const serviceOperations = pgTable(
  "service_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: serviceOperationCategoryEnum("category").notNull(),
    defaultLaborRate: numeric("default_labor_rate", {
      precision: 12,
      scale: 2,
    }).notNull(),
    estimatedHours: numeric("estimated_hours", {
      precision: 6,
      scale: 2,
    }).notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_service_operations_org_id").on(table.orgId),
    uniqueIndex("idx_service_operations_org_code").on(table.orgId, table.code),
    index("idx_service_operations_category").on(table.category),
  ],
);
