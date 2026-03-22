import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

// ── Enums ──

export const notificationTypeEnum = pgEnum("notification_type", [
  "STOCKOUT",
  "LOW_STOCK_DIGEST",
  "PO_RECEIVED",
  "TRANSFER_COMPLETED",
  "BACKORDER_AGING",
  "SYSTEM",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "CRITICAL",
  "URGENT",
  "NORMAL",
  "INFO",
]);

// ── Notifications Table ──

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Target user. NULL = org-wide (all admins/managers see it) */
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    type: notificationTypeEnum("type").notNull(),
    priority: notificationPriorityEnum("priority").notNull().default("NORMAL"),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    /** URL to navigate to when clicked (e.g., "/procurement/suggested-orders") */
    link: varchar("link", { length: 500 }),
    /** Entity type: 'product', 'purchase_order', 'transfer', etc. */
    referenceType: varchar("reference_type", { length: 50 }),
    /** ID of the referenced entity (for deduplication and linking) */
    referenceId: uuid("reference_id"),
    isRead: boolean("is_read").notNull().default(false),
    isEmailed: boolean("is_emailed").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_user_unread").on(
      table.orgId,
      table.userId,
      table.isRead,
      table.createdAt,
    ),
    index("idx_notifications_dedup").on(
      table.orgId,
      table.referenceId,
      table.type,
      table.isRead,
    ),
    index("idx_notifications_created").on(table.orgId, table.createdAt),
  ],
);

// ── Notification Settings Table ──

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyDigestEnabled: boolean("daily_digest_enabled")
      .notNull()
      .default(true),
    dailyDigestTime: varchar("daily_digest_time", { length: 5 })
      .notNull()
      .default("07:00"),
    stockoutEmailEnabled: boolean("stockout_email_enabled")
      .notNull()
      .default(true),
    stockoutInappEnabled: boolean("stockout_inapp_enabled")
      .notNull()
      .default(true),
    lowStockThreshold: varchar("low_stock_threshold", { length: 20 })
      .notNull()
      .default("REORDER_POINT"),
    emailAddress: varchar("email_address", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_notification_settings_user").on(
      table.orgId,
      table.userId,
    ),
  ],
);
