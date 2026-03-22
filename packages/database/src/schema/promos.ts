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
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { products } from "./products";
import { sales } from "./sales";

// ── Enums ──

export const promoRuleTypeEnum = pgEnum("promo_rule_type", [
  "BUY_X_GET_Y_FREE",
  "BOGO",
  "BUY_X_GET_Y_DISCOUNT",
  "BUNDLE",
]);

export const promoTriggerTypeEnum = pgEnum("promo_trigger_type", [
  "PRODUCT",
  "CATEGORY",
  "BRAND",
  "FAMILY",
  "TAG",
  "ANY",
]);

export const promoRewardTypeEnum = pgEnum("promo_reward_type", [
  "FREE_ITEM",
  "DISCOUNT_PERCENT",
  "DISCOUNT_AMOUNT",
  "FIXED_PRICE",
]);

export const promoRewardAppliesToEnum = pgEnum("promo_reward_applies_to", [
  "SPECIFIC_PRODUCT",
  "CHEAPEST_IN_CART",
  "TRIGGER_ITEMS",
]);

// ── Promo Rules ──

export const promoRules = pgTable(
  "promo_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    ruleType: promoRuleTypeEnum("rule_type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    startDate: date("start_date"),
    endDate: date("end_date"),
    priority: integer("priority").notNull().default(0),
    maxUsesTotal: integer("max_uses_total"),
    maxUsesPerSale: integer("max_uses_per_sale").notNull().default(1),
    usesCount: integer("uses_count").notNull().default(0),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_promo_rules_org_active").on(table.orgId, table.isActive),
  ],
);

// ── Promo Triggers ──

export const promoTriggers = pgTable(
  "promo_triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoRuleId: uuid("promo_rule_id")
      .notNull()
      .references(() => promoRules.id, { onDelete: "cascade" }),
    triggerType: promoTriggerTypeEnum("trigger_type").notNull(),
    triggerId: uuid("trigger_id"),
    minQuantity: integer("min_quantity").notNull().default(1),
    minAmount: numeric("min_amount", { precision: 12, scale: 2 }),
  },
  (table) => [
    index("idx_promo_triggers_rule").on(table.promoRuleId),
  ],
);

// ── Promo Rewards ──

export const promoRewards = pgTable(
  "promo_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoRuleId: uuid("promo_rule_id")
      .notNull()
      .references(() => promoRules.id, { onDelete: "cascade" }),
    rewardType: promoRewardTypeEnum("reward_type").notNull(),
    productId: uuid("product_id").references(() => products.id),
    quantity: integer("quantity").notNull().default(1),
    discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
    fixedPrice: numeric("fixed_price", { precision: 12, scale: 2 }),
    appliesTo: promoRewardAppliesToEnum("applies_to").notNull().default("SPECIFIC_PRODUCT"),
  },
  (table) => [
    index("idx_promo_rewards_rule").on(table.promoRuleId),
  ],
);

// ── Promo Usage ──

export const promoUsage = pgTable(
  "promo_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    promoRuleId: uuid("promo_rule_id")
      .notNull()
      .references(() => promoRules.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull(),
    freeItems: jsonb("free_items"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    appliedBy: uuid("applied_by").references(() => users.id),
  },
  (table) => [
    index("idx_promo_usage_rule").on(table.promoRuleId),
    index("idx_promo_usage_sale").on(table.saleId),
  ],
);
