import {
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
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
import { customers } from "./customers";
import { customerVehicles } from "./customer-vehicles";
import { products } from "./products";
import { serviceOperations } from "./service-operations";

// ── Job Card Status Enum ──

export const jobCardStatusEnum = pgEnum("job_card_status", [
  "SCHEDULED",
  "CHECKED_IN",
  "ESTIMATING",
  "APPROVED",
  "WAITING_FOR_PARTS",
  "READY_FOR_BAY",
  "IN_PROGRESS",
  "WORK_COMPLETED",
  "INVOICED",
  "CLOSED",
  "CANCELLED",
]);

// ── Job Cards ──

export const jobCards = pgTable(
  "job_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobNo: varchar("job_no", { length: 50 }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    customerVehicleId: uuid("customer_vehicle_id")
      .notNull()
      .references(() => customerVehicles.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    status: jobCardStatusEnum("status").notNull().default("SCHEDULED"),
    assignedTechnicianUserId: uuid("assigned_technician_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    odometerReading: integer("odometer_reading"),
    notes: varchar("notes", { length: 2000 }),
    // Actor tracking
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    checkedInByUserId: uuid("checked_in_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Timestamp tracking
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_job_cards_org_id").on(table.orgId),
    index("idx_job_cards_status").on(table.status),
    index("idx_job_cards_location_id").on(table.locationId),
    index("idx_job_cards_customer_id").on(table.customerId),
    index("idx_job_cards_vehicle_id").on(table.customerVehicleId),
    uniqueIndex("idx_job_cards_org_job_no").on(table.orgId, table.jobNo),
    uniqueIndex("idx_job_cards_idempotency_key").on(table.idempotencyKey),
  ],
);

// ── Job Card Labor Lines ──

export const jobCardLabor = pgTable(
  "job_card_labor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobCardId: uuid("job_card_id")
      .notNull()
      .references(() => jobCards.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    serviceOperationId: uuid("service_operation_id")
      .notNull()
      .references(() => serviceOperations.id),
    description: varchar("description", { length: 500 }),
    qtyHours: numeric("qty_hours", { precision: 6, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_job_card_labor_job_card_id").on(table.jobCardId),
    index("idx_job_card_labor_service_op_id").on(table.serviceOperationId),
  ],
);

// ── Job Card Part Lines ──

export const jobCardParts = pgTable(
  "job_card_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobCardId: uuid("job_card_id")
      .notNull()
      .references(() => jobCards.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    plannedQty: integer("planned_qty").notNull(),
    reservedQty: integer("reserved_qty").notNull().default(0),
    issuedQty: integer("issued_qty").notNull().default(0),
    returnedQty: integer("returned_qty").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_job_card_parts_job_card_id").on(table.jobCardId),
    index("idx_job_card_parts_product_id").on(table.productId),
    index("idx_job_card_parts_location_id").on(table.locationId),
    // CHECK constraints from design doc
    check("chk_jcp_planned_qty_positive", sql`planned_qty > 0`),
    check("chk_jcp_reserved_qty_non_negative", sql`reserved_qty >= 0`),
    check("chk_jcp_issued_qty_non_negative", sql`issued_qty >= 0`),
    check("chk_jcp_returned_qty_non_negative", sql`returned_qty >= 0`),
    check(
      "chk_jcp_returned_lte_issued",
      sql`returned_qty <= issued_qty`,
    ),
    check(
      "chk_jcp_commitment_lte_planned",
      sql`reserved_qty + issued_qty - returned_qty <= planned_qty`,
    ),
  ],
);
