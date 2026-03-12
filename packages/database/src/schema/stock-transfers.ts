import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { users } from "./users";
import { products } from "./products";

export const transferStatusEnum = pgEnum("transfer_status", [
  "DRAFT",
  "APPROVED",
  "PICKING",
  "DISPATCHED",
  "PARTIALLY_RECEIVED",
  "DISCREPANCY_REVIEW",
  "RECEIVED",
  "CLOSED_WITH_VARIANCE",
  "CANCELLED",
]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    transferNo: varchar("transfer_no", { length: 50 }).notNull(),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    status: transferStatusEnum("status").notNull().default("DRAFT"),
    notes: varchar("notes", { length: 1000 }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dispatchedByUserId: uuid("dispatched_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_stock_transfers_org_id").on(table.orgId),
    index("idx_stock_transfers_status").on(table.status),
    uniqueIndex("idx_stock_transfers_org_transfer_no").on(
      table.orgId,
      table.transferNo,
    ),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    requestedQty: integer("requested_qty").notNull(),
    dispatchedQty: integer("dispatched_qty").notNull().default(0),
    receivedQty: integer("received_qty").notNull().default(0),
    varianceQty: integer("variance_qty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_transfer_items_transfer_id").on(table.transferId),
    check("chk_requested_qty_positive", sql`requested_qty > 0`),
    check("chk_dispatched_qty_non_negative", sql`dispatched_qty >= 0`),
    check("chk_received_qty_non_negative", sql`received_qty >= 0`),
    check("chk_variance_qty_non_negative", sql`variance_qty >= 0`),
    check(
      "chk_dispatched_lte_requested",
      sql`dispatched_qty <= requested_qty`,
    ),
  ],
);
