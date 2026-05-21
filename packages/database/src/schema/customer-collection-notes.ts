import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { customers } from "./customers";
import { users } from "./users";

export const customerCollectionNotes = pgTable(
  "customer_collection_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    noteType: varchar("note_type", { length: 40 }).notNull().default("NOTE"),
    contactMethod: varchar("contact_method", { length: 40 }),
    outcome: varchar("outcome", { length: 60 }),
    priority: varchar("priority", { length: 20 }).notNull().default("NORMAL"),
    note: text("note").notNull(),
    promisedAmount: numeric("promised_amount", { precision: 12, scale: 2 }),
    promiseToPayDate: date("promise_to_pay_date"),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_customer_collection_notes_org_customer").on(
      table.orgId,
      table.customerId,
      table.createdAt,
    ),
    index("idx_customer_collection_notes_org_followup").on(
      table.orgId,
      table.followUpAt,
    ),
    index("idx_customer_collection_notes_org_open").on(
      table.orgId,
      table.resolvedAt,
    ),
  ],
);
