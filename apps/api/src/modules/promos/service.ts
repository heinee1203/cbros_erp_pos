import { db } from "@apex/database";
import {
  promoRules,
  promoTriggers,
  promoRewards,
  promoUsage,
  products,
} from "@apex/database/schema";
import { eq, and, sql, desc, lte, gte, or } from "drizzle-orm";

// ── Types ──

export interface CartLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  categoryId?: string | null;
  brandId?: string | null;
  familyId?: string | null;
  tagIds?: string[];
}

export interface ApplicablePromo {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  timesApplicable: number;
  reward: {
    type: string;
    productId: string | null;
    productName: string | null;
    quantity: number;
    discountPercent: number | null;
    discountAmount: number | null;
    fixedPrice: number | null;
    appliesTo: string;
    value: number;
  };
  autoApply: boolean;
  message: string;
}

// ── In-memory cache for active rules ──

interface CachedRule {
  id: string;
  name: string;
  ruleType: string;
  priority: number;
  maxUsesTotal: number | null;
  maxUsesPerSale: number;
  usesCount: number;
  requiresApproval: boolean;
  triggers: Array<{
    triggerType: string;
    triggerId: string | null;
    minQuantity: number;
    minAmount: string | null;
  }>;
  rewards: Array<{
    rewardType: string;
    productId: string | null;
    productName: string | null;
    productPrice: number;
    quantity: number;
    discountPercent: string | null;
    discountAmount: string | null;
    fixedPrice: string | null;
    appliesTo: string;
  }>;
}

const ruleCache = new Map<string, { rules: CachedRule[]; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getActiveRules(orgId: string): Promise<CachedRule[]> {
  const cached = ruleCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;

  const today = new Date().toISOString().split("T")[0];

  const rules = await db
    .select()
    .from(promoRules)
    .where(
      and(
        eq(promoRules.orgId, orgId),
        eq(promoRules.isActive, true),
        or(sql`${promoRules.startDate} IS NULL`, lte(promoRules.startDate, today)),
        or(sql`${promoRules.endDate} IS NULL`, gte(promoRules.endDate, today)),
      ),
    )
    .orderBy(desc(promoRules.priority));

  const enriched: CachedRule[] = [];
  for (const rule of rules) {
    // Skip maxed out rules
    if (rule.maxUsesTotal && rule.usesCount >= rule.maxUsesTotal) continue;

    const triggers = await db
      .select()
      .from(promoTriggers)
      .where(eq(promoTriggers.promoRuleId, rule.id));

    const rewards = await db
      .select({
        rewardType: promoRewards.rewardType,
        productId: promoRewards.productId,
        productName: products.name,
        productPrice: products.unitPrice,
        quantity: promoRewards.quantity,
        discountPercent: promoRewards.discountPercent,
        discountAmount: promoRewards.discountAmount,
        fixedPrice: promoRewards.fixedPrice,
        appliesTo: promoRewards.appliesTo,
      })
      .from(promoRewards)
      .leftJoin(products, eq(products.id, promoRewards.productId))
      .where(eq(promoRewards.promoRuleId, rule.id));

    enriched.push({
      id: rule.id,
      name: rule.name,
      ruleType: rule.ruleType,
      priority: rule.priority,
      maxUsesTotal: rule.maxUsesTotal,
      maxUsesPerSale: rule.maxUsesPerSale,
      usesCount: rule.usesCount,
      requiresApproval: rule.requiresApproval,
      triggers: triggers.map((t) => ({
        triggerType: t.triggerType,
        triggerId: t.triggerId,
        minQuantity: t.minQuantity,
        minAmount: t.minAmount,
      })),
      rewards: rewards.map((r) => ({
        rewardType: r.rewardType,
        productId: r.productId,
        productName: r.productName,
        productPrice: parseFloat(r.productPrice ?? "0"),
        quantity: r.quantity,
        discountPercent: r.discountPercent,
        discountAmount: r.discountAmount,
        fixedPrice: r.fixedPrice,
        appliesTo: r.appliesTo,
      })),
    });
  }

  ruleCache.set(orgId, { rules: enriched, expiresAt: Date.now() + CACHE_TTL });
  return enriched;
}

export function invalidatePromoCache(orgId: string) {
  ruleCache.delete(orgId);
}

// ══════════════════════════════════════════════════════
// EVALUATION ENGINE
// ══════════════════════════════════════════════════════

export async function evaluatePromos(
  orgId: string,
  cartLines: CartLineInput[],
): Promise<ApplicablePromo[]> {
  const rules = await getActiveRules(orgId);
  const applicable: ApplicablePromo[] = [];

  for (const rule of rules) {
    if (rule.triggers.length === 0 || rule.rewards.length === 0) continue;

    const trigger = rule.triggers[0]; // v1: single trigger per rule
    const reward = rule.rewards[0]; // v1: single reward per rule

    // Match trigger against cart
    const matchResult = matchTrigger(trigger, cartLines);
    if (!matchResult.met) continue;

    // Calculate how many times the promo can apply
    const timesFromQty = Math.floor(matchResult.qualifyingQty / trigger.minQuantity);
    const timesApplicable = Math.min(timesFromQty, rule.maxUsesPerSale);

    // Calculate reward value
    let rewardValue = 0;
    if (reward.rewardType === "FREE_ITEM" && reward.productPrice) {
      rewardValue = reward.productPrice * reward.quantity;
    } else if (reward.rewardType === "DISCOUNT_PERCENT" && reward.discountPercent) {
      const cheapest = [...cartLines].sort((a, b) => a.unitPrice - b.unitPrice)[0];
      rewardValue = cheapest ? cheapest.unitPrice * (parseFloat(reward.discountPercent) / 100) : 0;
    } else if (reward.rewardType === "DISCOUNT_AMOUNT" && reward.discountAmount) {
      rewardValue = parseFloat(reward.discountAmount);
    }

    const message = buildMessage(rule, trigger, reward, timesApplicable);

    applicable.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      timesApplicable,
      reward: {
        type: reward.rewardType,
        productId: reward.productId,
        productName: reward.productName,
        quantity: reward.quantity,
        discountPercent: reward.discountPercent ? parseFloat(reward.discountPercent) : null,
        discountAmount: reward.discountAmount ? parseFloat(reward.discountAmount) : null,
        fixedPrice: reward.fixedPrice ? parseFloat(reward.fixedPrice) : null,
        appliesTo: reward.appliesTo,
        value: rewardValue,
      },
      autoApply: !rule.requiresApproval,
      message,
    });

    // v1: only one promo per cart (highest priority wins)
    break;
  }

  return applicable;
}

function matchTrigger(
  trigger: CachedRule["triggers"][0],
  cartLines: CartLineInput[],
): { met: boolean; qualifyingQty: number } {
  let matching: CartLineInput[];

  switch (trigger.triggerType) {
    case "PRODUCT":
      matching = cartLines.filter((l) => l.productId === trigger.triggerId);
      break;
    case "CATEGORY":
      matching = cartLines.filter((l) => l.categoryId === trigger.triggerId);
      break;
    case "BRAND":
      matching = cartLines.filter((l) => l.brandId === trigger.triggerId);
      break;
    case "FAMILY":
      matching = cartLines.filter((l) => l.familyId === trigger.triggerId);
      break;
    case "TAG":
      matching = cartLines.filter((l) => l.tagIds?.includes(trigger.triggerId!));
      break;
    case "ANY":
      matching = cartLines;
      break;
    default:
      matching = [];
  }

  const totalQty = matching.reduce((sum, l) => sum + l.quantity, 0);
  return { met: totalQty >= trigger.minQuantity, qualifyingQty: totalQty };
}

function buildMessage(
  rule: CachedRule,
  trigger: CachedRule["triggers"][0],
  reward: CachedRule["rewards"][0],
  times: number,
): string {
  if (reward.rewardType === "FREE_ITEM" && reward.productName) {
    return `Buy ${trigger.minQuantity}+ qualifying items — includes FREE ${reward.productName}!`;
  }
  if (reward.rewardType === "DISCOUNT_PERCENT") {
    return `${rule.name} — ${reward.discountPercent}% off!`;
  }
  if (reward.rewardType === "DISCOUNT_AMOUNT") {
    return `${rule.name} — ₱${reward.discountAmount} off!`;
  }
  return rule.name;
}

// ══════════════════════════════════════════════════════
// PROMO CRUD
// ══════════════════════════════════════════════════════

export async function listPromos(orgId: string) {
  const rules = await db
    .select()
    .from(promoRules)
    .where(eq(promoRules.orgId, orgId))
    .orderBy(desc(promoRules.priority), desc(promoRules.createdAt));

  // Batch fetch triggers and rewards
  const result = [];
  for (const rule of rules) {
    const triggers = await db.select().from(promoTriggers).where(eq(promoTriggers.promoRuleId, rule.id));
    const rewards = await db
      .select({
        id: promoRewards.id,
        rewardType: promoRewards.rewardType,
        productId: promoRewards.productId,
        productName: products.name,
        quantity: promoRewards.quantity,
        discountPercent: promoRewards.discountPercent,
        discountAmount: promoRewards.discountAmount,
        fixedPrice: promoRewards.fixedPrice,
        appliesTo: promoRewards.appliesTo,
      })
      .from(promoRewards)
      .leftJoin(products, eq(products.id, promoRewards.productId))
      .where(eq(promoRewards.promoRuleId, rule.id));

    result.push({ ...rule, triggers, rewards });
  }
  return result;
}

export async function getPromo(id: string, orgId: string) {
  const [rule] = await db
    .select()
    .from(promoRules)
    .where(and(eq(promoRules.id, id), eq(promoRules.orgId, orgId)))
    .limit(1);
  if (!rule) return null;

  const triggers = await db.select().from(promoTriggers).where(eq(promoTriggers.promoRuleId, id));
  const rewards = await db
    .select({
      id: promoRewards.id,
      rewardType: promoRewards.rewardType,
      productId: promoRewards.productId,
      productName: products.name,
      quantity: promoRewards.quantity,
      discountPercent: promoRewards.discountPercent,
      discountAmount: promoRewards.discountAmount,
      fixedPrice: promoRewards.fixedPrice,
      appliesTo: promoRewards.appliesTo,
    })
    .from(promoRewards)
    .leftJoin(products, eq(products.id, promoRewards.productId))
    .where(eq(promoRewards.promoRuleId, id));

  return { ...rule, triggers, rewards };
}

export async function createPromo(
  orgId: string,
  userId: string,
  input: {
    name: string;
    description?: string;
    ruleType: string;
    startDate?: string | null;
    endDate?: string | null;
    priority?: number;
    maxUsesTotal?: number | null;
    maxUsesPerSale?: number;
    requiresApproval?: boolean;
    triggers: Array<{
      triggerType: string;
      triggerId?: string | null;
      minQuantity?: number;
    }>;
    rewards: Array<{
      rewardType: string;
      productId?: string | null;
      quantity?: number;
      discountPercent?: number | null;
      discountAmount?: number | null;
      fixedPrice?: number | null;
      appliesTo?: string;
    }>;
  },
) {
  return db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(promoRules)
      .values({
        orgId,
        name: input.name,
        description: input.description ?? null,
        ruleType: input.ruleType as any,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        priority: input.priority ?? 0,
        maxUsesTotal: input.maxUsesTotal ?? null,
        maxUsesPerSale: input.maxUsesPerSale ?? 1,
        requiresApproval: input.requiresApproval ?? false,
        createdBy: userId,
      })
      .returning();

    for (const t of input.triggers) {
      await tx.insert(promoTriggers).values({
        promoRuleId: rule.id,
        triggerType: t.triggerType as any,
        triggerId: t.triggerId ?? null,
        minQuantity: t.minQuantity ?? 1,
      });
    }

    for (const r of input.rewards) {
      await tx.insert(promoRewards).values({
        promoRuleId: rule.id,
        rewardType: r.rewardType as any,
        productId: r.productId ?? null,
        quantity: r.quantity ?? 1,
        discountPercent: r.discountPercent ? String(r.discountPercent) : null,
        discountAmount: r.discountAmount ? String(r.discountAmount) : null,
        fixedPrice: r.fixedPrice ? String(r.fixedPrice) : null,
        appliesTo: (r.appliesTo as any) ?? "SPECIFIC_PRODUCT",
      });
    }

    invalidatePromoCache(orgId);
    return rule;
  });
}

export async function updatePromo(id: string, orgId: string, updates: Record<string, any>) {
  const [updated] = await db
    .update(promoRules)
    .set(updates)
    .where(and(eq(promoRules.id, id), eq(promoRules.orgId, orgId)))
    .returning();
  invalidatePromoCache(orgId);
  return updated;
}

export async function deactivatePromo(id: string, orgId: string) {
  return updatePromo(id, orgId, { isActive: false });
}

export async function recordPromoUsage(
  orgId: string,
  promoRuleId: string,
  saleId: string,
  discountAmount: number,
  freeItems: any,
  userId: string,
) {
  await db.insert(promoUsage).values({
    orgId,
    promoRuleId,
    saleId,
    discountAmount: String(discountAmount),
    freeItems,
    appliedBy: userId,
  });

  // Increment uses count
  await db
    .update(promoRules)
    .set({ usesCount: sql`${promoRules.usesCount} + 1` })
    .where(eq(promoRules.id, promoRuleId));

  invalidatePromoCache(orgId);
}
