import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index, pgEnum, integer, date } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";

export const serialStatusEnum = pgEnum("serial_status", [
  "IN_STOCK",
  "SOLD",
  "RETURNED",
  "DEFECTIVE",
  "RTV",
]);

export const serialNumbers = pgTable(
  "serial_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    serialNumber: varchar("serial_number", { length: 100 }).notNull(),
    status: serialStatusEnum("status").notNull().default("IN_STOCK"),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    receivedVia: varchar("received_via", { length: 50 }),
    receivedReferenceId: uuid("received_reference_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    soldViaSaleId: uuid("sold_via_sale_id"),
    soldViaSaleLineId: uuid("sold_via_sale_line_id"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    soldToCustomerId: uuid("sold_to_customer_id"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedViaReturnId: uuid("returned_via_return_id"),
    notes: varchar("notes", { length: 1000 }),
    /** DOT date code for tires — 4-digit WWYY format (e.g., "1724" = week 17, 2024) */
    dotCode: varchar("dot_code", { length: 4 }),
    /** Parsed manufacture week (1-52) from DOT code */
    manufactureWeek: integer("manufacture_week"),
    /** Parsed full manufacture year (e.g., 2024) from DOT code */
    manufactureYear: integer("manufacture_year"),
    /** Approximate manufacture date (first day of that week) */
    manufactureDate: date("manufacture_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_serial_org_product_sn").on(table.orgId, table.productId, table.serialNumber),
    index("idx_serial_org_sn").on(table.orgId, table.serialNumber),
    index("idx_serial_org_status").on(table.orgId, table.status),
    index("idx_serial_sale").on(table.soldViaSaleId),
  ],
);

export const saleLineSerials = pgTable(
  "sale_line_serials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleLineId: uuid("sale_line_id").notNull(),
    serialNumberId: uuid("serial_number_id").notNull().references(() => serialNumbers.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_sale_line_serials_line").on(table.saleLineId),
    uniqueIndex("idx_sale_line_serials_sn").on(table.serialNumberId),
  ],
);
