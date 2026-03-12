import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  numeric,
  timestamp,
  text,
  index,
} from "drizzle-orm/pg-core";

// ── Phase 9: Data Migration Staging Tables ──
// These tables hold imported CSV/Excel data for validation before
// promotion to live tables. No FK references to live tables — validation
// checks referential integrity programmatically.

// ── Staging validation status ──
export const stgValidationStatusEnum = pgEnum("stg_validation_status", [
  "PENDING",
  "VALID",
  "REJECTED",
  "PROMOTED",
]);

// ═══════════════════════════════════════════════
// Stage 1: Locations
// ═══════════════════════════════════════════════
export const stgLocations = pgTable(
  "stg_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    // ── Source data (all VARCHAR for maximum import flexibility) ──
    name: varchar("name", { length: 255 }),
    code: varchar("code", { length: 50 }),
    type: varchar("type", { length: 50 }), // WAREHOUSE, RETAIL_STORE, etc.
    address: varchar("address", { length: 500 }),

    // ── Validation tracking ──
    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"), // JSON array of error strings
    promotedId: uuid("promoted_id"), // live locations.id after promotion

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_locations_batch").on(table.batchId),
    index("idx_stg_locations_status").on(table.validationStatus),
  ],
);

// ═══════════════════════════════════════════════
// Stage 1: Suppliers
// ═══════════════════════════════════════════════
export const stgSuppliers = pgTable(
  "stg_suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    name: varchar("name", { length: 255 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    address: varchar("address", { length: 500 }),
    avgLeadTimeDays: varchar("avg_lead_time_days", { length: 10 }), // VARCHAR for safe import

    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"),
    promotedId: uuid("promoted_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_suppliers_batch").on(table.batchId),
    index("idx_stg_suppliers_status").on(table.validationStatus),
  ],
);

// ═══════════════════════════════════════════════
// Stage 2: Products (46k SKUs)
// ═══════════════════════════════════════════════
export const stgProducts = pgTable(
  "stg_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    name: varchar("name", { length: 500 }),
    sku: varchar("sku", { length: 50 }),
    mnemonicSku: varchar("mnemonic_sku", { length: 10 }),
    category: varchar("category", { length: 50 }), // TIRES, LUBRICANTS, etc.
    unitPrice: varchar("unit_price", { length: 20 }), // VARCHAR for safe numeric import
    costPrice: varchar("cost_price", { length: 20 }),
    currentCostPrice: varchar("current_cost_price", { length: 20 }),
    familyName: varchar("family_name", { length: 255 }), // Text lookup, not FK

    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"),
    promotedId: uuid("promoted_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_products_batch").on(table.batchId),
    index("idx_stg_products_status").on(table.validationStatus),
    index("idx_stg_products_sku").on(table.sku),
  ],
);

// ═══════════════════════════════════════════════
// Stage 3: Customers
// ═══════════════════════════════════════════════
export const stgCustomers = pgTable(
  "stg_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    name: varchar("name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    notes: varchar("notes", { length: 1000 }),

    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"),
    promotedId: uuid("promoted_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_customers_batch").on(table.batchId),
    index("idx_stg_customers_status").on(table.validationStatus),
    index("idx_stg_customers_phone").on(table.phone),
  ],
);

// ═══════════════════════════════════════════════
// Stage 4: Customer Vehicles
// ═══════════════════════════════════════════════
export const stgCustomerVehicles = pgTable(
  "stg_customer_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    customerPhone: varchar("customer_phone", { length: 50 }), // Lookup key to stg_customers / live customers
    make: varchar("make", { length: 100 }),
    model: varchar("model", { length: 100 }),
    year: varchar("year", { length: 10 }), // VARCHAR for safe import
    plateNo: varchar("plate_no", { length: 20 }),
    notes: varchar("notes", { length: 500 }),

    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"),
    promotedId: uuid("promoted_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_customer_vehicles_batch").on(table.batchId),
    index("idx_stg_customer_vehicles_status").on(table.validationStatus),
    index("idx_stg_customer_vehicles_phone").on(table.customerPhone),
  ],
);

// ═══════════════════════════════════════════════
// Stage 5: Opening Balances
// ═══════════════════════════════════════════════
export const stgOpeningBalances = pgTable(
  "stg_opening_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),

    sku: varchar("sku", { length: 50 }), // Lookup key to products
    locationCode: varchar("location_code", { length: 50 }), // Lookup key to locations
    openingQty: varchar("opening_qty", { length: 20 }), // VARCHAR for safe integer import

    validationStatus: stgValidationStatusEnum("validation_status")
      .notNull()
      .default("PENDING"),
    validationErrors: text("validation_errors"),
    promotedId: uuid("promoted_id"), // inventory.id after promotion

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_stg_opening_bal_batch").on(table.batchId),
    index("idx_stg_opening_bal_status").on(table.validationStatus),
    index("idx_stg_opening_bal_sku").on(table.sku),
  ],
);

// ═══════════════════════════════════════════════
// Migration Batches — tracks each import run
// ═══════════════════════════════════════════════
export const migrationBatches = pgTable(
  "migration_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: varchar("entity_type", { length: 50 }).notNull(), // locations, suppliers, products, etc.
    sourceFile: varchar("source_file", { length: 500 }).notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    rejectedRows: integer("rejected_rows").notNull().default(0),
    promotedRows: integer("promoted_rows").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("STAGED"), // STAGED, VALIDATED, PROMOTED, RECONCILED
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_migration_batches_entity").on(table.entityType),
  ],
);
