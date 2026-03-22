import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { products } from "./products";
import { brands } from "./brands";
import { categories } from "./categories";
import { sales, saleLines } from "./sales";
import { serialNumbers } from "./serial-numbers";
// import { returns } from "./returns"; // returns table not yet migrated

// ── Enums ──

export const warrantyTypeEnum = pgEnum("warranty_type", [
  "FULL_REPLACEMENT",
  "PRORATED",
  "REPAIR_ONLY",
  "EXCHANGE_ONLY",
]);

export const warrantyStatusEnum = pgEnum("warranty_status", [
  "ACTIVE",
  "EXPIRED",
  "CLAIMED",
  "VOIDED",
]);

export const claimReasonEnum = pgEnum("warranty_claim_reason", [
  "MANUFACTURING_DEFECT",
  "PREMATURE_WEAR",
  "MATERIAL_FAILURE",
  "ROAD_HAZARD",
  "ELECTRICAL_FAILURE",
  "OTHER",
]);

export const claimStatusEnum = pgEnum("warranty_claim_status", [
  "PENDING",
  "APPROVED",
  "DENIED",
  "COMPLETED",
]);

export const claimResolutionEnum = pgEnum("warranty_claim_resolution", [
  "FULL_REPLACEMENT",
  "PRORATED_REPLACEMENT",
  "REPAIR",
  "CREDIT_NOTE",
  "DENIED",
]);

// ── Warranty Policies ──

export const warrantyPolicies = pgTable(
  "warranty_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    /** Apply to all products of this brand */
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    /** Apply to all products in this category */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Apply to a specific product only */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    durationMonths: integer("duration_months").notNull(),
    durationKm: integer("duration_km"),
    warrantyType: warrantyTypeEnum("warranty_type").notNull().default("FULL_REPLACEMENT"),
    /** For PRORATED: full replacement period before proration starts */
    proratedFullMonths: integer("prorated_full_months"),
    coverageDescription: text("coverage_description"),
    exclusions: text("exclusions"),
    requiresSerial: boolean("requires_serial").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_warranty_policies_brand").on(table.orgId, table.brandId),
    index("idx_warranty_policies_category").on(table.orgId, table.categoryId),
    index("idx_warranty_policies_product").on(table.orgId, table.productId),
  ],
);

// ── Warranty Records ──

export const warrantyRecords = pgTable(
  "warranty_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    warrantyPolicyId: uuid("warranty_policy_id")
      .notNull()
      .references(() => warrantyPolicies.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    customerId: uuid("customer_id"),
    customerName: varchar("customer_name", { length: 255 }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    saleLineId: uuid("sale_line_id")
      .notNull()
      .references(() => saleLines.id),
    serialNumberId: uuid("serial_number_id").references(() => serialNumbers.id),
    serialNumber: varchar("serial_number", { length: 100 }),
    quantity: integer("quantity").notNull().default(1),
    purchaseDate: date("purchase_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    expiryKm: integer("expiry_km"),
    warrantyType: varchar("warranty_type", { length: 50 }).notNull(),
    coverageDescription: text("coverage_description"),
    exclusions: text("exclusions"),
    status: warrantyStatusEnum("status").notNull().default("ACTIVE"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedViaReturnId: uuid("claimed_via_return_id"),
    claimNotes: text("claim_notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_warranty_records_serial").on(table.orgId, table.serialNumber),
    index("idx_warranty_records_customer").on(table.orgId, table.customerId),
    index("idx_warranty_records_sale").on(table.orgId, table.saleId),
    index("idx_warranty_records_expiry").on(table.orgId, table.expiryDate),
    index("idx_warranty_records_product_status").on(table.orgId, table.productId, table.status),
  ],
);

// ── Warranty Claims ──

export const warrantyClaims = pgTable(
  "warranty_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    warrantyRecordId: uuid("warranty_record_id")
      .notNull()
      .references(() => warrantyRecords.id),
    claimNumber: varchar("claim_number", { length: 50 }).notNull(),
    claimDate: date("claim_date").notNull(),
    claimReason: claimReasonEnum("claim_reason").notNull(),
    claimDescription: text("claim_description"),
    mileageAtClaim: integer("mileage_at_claim"),
    status: claimStatusEnum("status").notNull().default("PENDING"),
    resolution: claimResolutionEnum("resolution"),
    resolutionNotes: text("resolution_notes"),
    replacementProductId: uuid("replacement_product_id").references(() => products.id),
    replacementSerialId: uuid("replacement_serial_id").references(() => serialNumbers.id),
    creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }),
    returnId: uuid("return_id"),
    approvedBy: uuid("approved_by").references(() => users.id),
    processedBy: uuid("processed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_warranty_claims_number").on(table.orgId, table.claimNumber),
    index("idx_warranty_claims_record").on(table.orgId, table.warrantyRecordId),
  ],
);
