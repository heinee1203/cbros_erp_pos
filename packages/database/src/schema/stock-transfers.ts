import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { locations } from "./locations.js";
import { users } from "./users.js";
import { products } from "./products.js";

export const transferStatusEnum = pgEnum("transfer_status", [
  "DRAFT",
  "PENDING",
  "IN_TRANSIT",
  "RECEIVED",
  "CANCELLED",
]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    status: transferStatusEnum("status").notNull().default("DRAFT"),
    notes: varchar("notes", { length: 1000 }),
    createdBy: uuid("created_by").references(() => users.id, {
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
    index("idx_stock_transfers_org_id").on(table.orgId),
    index("idx_stock_transfers_status").on(table.status),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    receivedQuantity: integer("received_quantity"),
  },
  (table) => [index("idx_transfer_items_transfer_id").on(table.transferId)],
);
