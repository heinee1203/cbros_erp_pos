import {
  pgTable,
  uuid,
  integer,
  varchar,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { stockTransfers } from "./stock-transfers";
import { stockTransferItems } from "./stock-transfers";
import { locations } from "./locations";
import { users } from "./users";

export const stockTransferReceipts = pgTable(
  "stock_transfer_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    transferItemId: uuid("transfer_item_id")
      .notNull()
      .references(() => stockTransferItems.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    receivedQty: integer("received_qty").notNull(),
    notes: varchar("notes", { length: 500 }),
    receivedByUserId: uuid("received_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_receipts_transfer_id").on(table.transferId),
    index("idx_receipts_transfer_item_id").on(table.transferItemId),
    check("chk_receipt_qty_positive", sql`received_qty > 0`),
  ],
);
