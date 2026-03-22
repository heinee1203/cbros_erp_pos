import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "RENT",
  "UTILITIES",
  "PAYROLL",
  "INSURANCE",
  "LOAN_PAYMENT",
  "OTHER",
]);

export const recurringExpenses = pgTable(
  "recurring_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    category: expenseCategoryEnum("category").notNull().default("OTHER"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** Day of month this expense is due (1-31). 31 = last day of month. */
    dueDay: integer("due_day").notNull(),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_recurring_expenses_org_active").on(table.orgId, table.isActive),
  ],
);
