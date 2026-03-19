import { pgTable, uuid, varchar, timestamp, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";

export const tagTypeEnum = pgEnum("tag_type", ["TIRE_SIZE", "VEHICLE", "APPLICATION_CODE", "CUSTOM"]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  tagType: tagTypeEnum("tag_type").notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_tags_name_unique").on(table.orgId, table.name),
  index("idx_tags_type").on(table.orgId, table.tagType),
]);

export const productTags = pgTable("product_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_product_tags_unique").on(table.orgId, table.productId, table.tagId),
  index("idx_product_tags_tag").on(table.orgId, table.tagId),
]);
