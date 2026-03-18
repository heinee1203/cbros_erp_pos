import { pgTable, uuid, varchar, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    keyHash: varchar("key_hash", { length: 128 }).notNull(), // SHA-256 hash of the actual key
    label: varchar("label", { length: 255 }).notNull(), // e.g., "AutoServ Pro"
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_api_keys_hash").on(table.keyHash),
  ],
);
