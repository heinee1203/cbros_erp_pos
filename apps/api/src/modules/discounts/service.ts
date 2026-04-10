import { db } from "@apex/database";
import { discountRules, customerTiers } from "@apex/database/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";

// ── Customer Tiers ──

export async function listTiers(orgId: string) {
  return db
    .select()
    .from(customerTiers)
    .where(eq(customerTiers.orgId, orgId))
    .orderBy(asc(customerTiers.sortOrder));
}

export async function createTier(orgId: string, data: {
  name: string;
  description?: string;
  defaultDiscount?: string;
  color?: string;
  sortOrder?: number;
}) {
  const [tier] = await db.insert(customerTiers).values({
    orgId,
    name: data.name,
    description: data.description ?? null,
    defaultDiscount: data.defaultDiscount ?? "0",
    color: data.color ?? null,
    sortOrder: data.sortOrder ?? 0,
  }).returning();
  return tier;
}

export async function updateTier(id: string, orgId: string, data: Partial<{
  name: string;
  description: string;
  defaultDiscount: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
}>) {
  const [tier] = await db
    .update(customerTiers)
    .set(data)
    .where(and(eq(customerTiers.id, id), eq(customerTiers.orgId, orgId)))
    .returning();
  return tier;
}

export async function deleteTier(id: string, orgId: string) {
  // Check if any customers use this tier
  const [check] = await db.execute(
    sql`SELECT count(*)::int AS cnt FROM customers WHERE tier_id = ${id} AND org_id = ${orgId}`,
  );
  if ((check as any).cnt > 0) {
    throw new Error(`Cannot delete tier — ${(check as any).cnt} customers are assigned to it`);
  }
  await db.delete(customerTiers).where(and(eq(customerTiers.id, id), eq(customerTiers.orgId, orgId)));
}

export async function seedDefaultTiers(orgId: string) {
  const existing = await db.select({ id: customerTiers.id }).from(customerTiers).where(eq(customerTiers.orgId, orgId)).limit(1);
  if (existing.length > 0) return; // already seeded

  await db.insert(customerTiers).values([
    { orgId, name: "Walk-In", description: "Default tier for walk-in customers", defaultDiscount: "0", color: "#22c55e", sortOrder: 0 },
    { orgId, name: "Mechanic Shop", description: "Registered repair shops and garages", defaultDiscount: "10", color: "#3b82f6", sortOrder: 1 },
    { orgId, name: "Wholesale / Reseller", description: "Bulk buyers and resellers", defaultDiscount: "15", color: "#8b5cf6", sortOrder: 2 },
    { orgId, name: "Fleet / Corporate", description: "Corporate fleet accounts with negotiated pricing", defaultDiscount: "20", color: "#f59e0b", sortOrder: 3 },
  ]);
}

// ── Discount Rules ──

export async function listRules(orgId: string, opts?: { isActive?: boolean; type?: string; scope?: string }) {
  const conditions = [eq(discountRules.orgId, orgId)];
  if (opts?.isActive !== undefined) conditions.push(eq(discountRules.isActive, opts.isActive));
  if (opts?.type) conditions.push(eq(discountRules.type, opts.type));
  if (opts?.scope) conditions.push(eq(discountRules.scope, opts.scope));

  const rows = await db.execute(sql`
    SELECT dr.*, ct.name AS tier_name
    FROM discount_rules dr
    LEFT JOIN customer_tiers ct ON ct.id = dr.customer_tier_id
    WHERE dr.org_id = ${orgId}
      ${opts?.isActive !== undefined ? sql`AND dr.is_active = ${opts.isActive}` : sql``}
      ${opts?.type ? sql`AND dr.type = ${opts.type}` : sql``}
    ORDER BY dr.priority DESC, dr.created_at DESC
  `);

  return (rows as any[]).map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    value: r.value,
    scope: r.scope,
    scopeIds: r.scope_ids ? JSON.parse(r.scope_ids) : [],
    minQuantity: r.min_quantity,
    minAmount: r.min_amount,
    customerTierId: r.customer_tier_id,
    tierName: r.tier_name,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    priority: r.priority,
    stackable: r.stackable,
    locationIds: r.location_ids ? JSON.parse(r.location_ids) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getRule(id: string, orgId: string) {
  const rows = await db.execute(sql`
    SELECT dr.*, ct.name AS tier_name
    FROM discount_rules dr
    LEFT JOIN customer_tiers ct ON ct.id = dr.customer_tier_id
    WHERE dr.id = ${id} AND dr.org_id = ${orgId}
    LIMIT 1
  `);
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    ...r,
    scopeIds: r.scope_ids ? JSON.parse(r.scope_ids) : [],
    locationIds: r.location_ids ? JSON.parse(r.location_ids) : null,
    tierName: r.tier_name,
  };
}

export async function createRule(orgId: string, data: {
  name: string;
  description?: string;
  type: string;
  value: string;
  scope?: string;
  scopeIds?: string[];
  minQuantity?: number;
  minAmount?: string;
  customerTierId?: string;
  startDate?: string;
  endDate?: string;
  priority?: number;
  stackable?: boolean;
  locationIds?: string[];
}) {
  const [rule] = await db.insert(discountRules).values({
    orgId,
    name: data.name,
    description: data.description ?? null,
    type: data.type,
    value: data.value,
    scope: data.scope ?? "all",
    scopeIds: data.scopeIds?.length ? JSON.stringify(data.scopeIds) : null,
    minQuantity: data.minQuantity ?? null,
    minAmount: data.minAmount ?? null,
    customerTierId: data.customerTierId ?? null,
    startDate: data.startDate ? new Date(data.startDate) : null,
    endDate: data.endDate ? new Date(data.endDate) : null,
    priority: data.priority ?? 0,
    stackable: data.stackable ?? false,
    locationIds: data.locationIds?.length ? JSON.stringify(data.locationIds) : null,
  }).returning();
  return rule;
}

export async function updateRule(id: string, orgId: string, data: Record<string, any>) {
  const setFields: Record<string, any> = { updatedAt: new Date() };
  if (data.name !== undefined) setFields.name = data.name;
  if (data.description !== undefined) setFields.description = data.description;
  if (data.type !== undefined) setFields.type = data.type;
  if (data.value !== undefined) setFields.value = data.value;
  if (data.scope !== undefined) setFields.scope = data.scope;
  if (data.scopeIds !== undefined) setFields.scopeIds = data.scopeIds?.length ? JSON.stringify(data.scopeIds) : null;
  if (data.minQuantity !== undefined) setFields.minQuantity = data.minQuantity;
  if (data.minAmount !== undefined) setFields.minAmount = data.minAmount;
  if (data.customerTierId !== undefined) setFields.customerTierId = data.customerTierId || null;
  if (data.startDate !== undefined) setFields.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) setFields.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.isActive !== undefined) setFields.isActive = data.isActive;
  if (data.priority !== undefined) setFields.priority = data.priority;
  if (data.stackable !== undefined) setFields.stackable = data.stackable;
  if (data.locationIds !== undefined) setFields.locationIds = data.locationIds?.length ? JSON.stringify(data.locationIds) : null;

  const [rule] = await db
    .update(discountRules)
    .set(setFields)
    .where(and(eq(discountRules.id, id), eq(discountRules.orgId, orgId)))
    .returning();
  return rule;
}

export async function toggleRule(id: string, orgId: string) {
  const [rule] = await db.execute(
    sql`UPDATE discount_rules SET is_active = NOT is_active, updated_at = now() WHERE id = ${id} AND org_id = ${orgId} RETURNING *`,
  );
  return rule;
}

export async function deleteRule(id: string, orgId: string) {
  await db.delete(discountRules).where(and(eq(discountRules.id, id), eq(discountRules.orgId, orgId)));
}

// ── Calculator ──

interface CartItem {
  productId: string;
  categoryId?: string;
  brandId?: string;
  familyId?: string;
  quantity: number;
  unitPrice: number;
}

export async function calculateDiscounts(orgId: string, items: CartItem[], customerId: string | null, locationId: string) {
  // Get customer tier
  let tierId: string | null = null;
  if (customerId) {
    const [cust] = await db.execute(sql`SELECT tier_id FROM customers WHERE id = ${customerId} AND org_id = ${orgId}`);
    tierId = (cust as any)?.tier_id ?? null;
  }

  // Get all active rules for this org, ordered by priority
  const now = new Date();
  const rules = await db.execute(sql`
    SELECT * FROM discount_rules
    WHERE org_id = ${orgId}
      AND is_active = true
      AND (start_date IS NULL OR start_date <= ${now.toISOString()})
      AND (end_date IS NULL OR end_date >= ${now.toISOString()})
    ORDER BY priority DESC
  `);

  const lineDiscounts: any[] = [];
  let appliedNonStackable = false;

  for (const item of items) {
    let bestDiscount: any = null;
    let bestSavings = 0;

    for (const rule of rules as any[]) {
      // Check stackability
      if (appliedNonStackable && !rule.stackable) continue;

      // Check customer tier
      if (rule.customer_tier_id && rule.customer_tier_id !== tierId) continue;

      // Check location
      if (rule.location_ids) {
        const locs = JSON.parse(rule.location_ids);
        if (!locs.includes(locationId)) continue;
      }

      // Check scope
      let inScope = false;
      if (rule.scope === "all") {
        inScope = true;
      } else if (rule.scope === "category" && item.categoryId) {
        const ids = rule.scope_ids ? JSON.parse(rule.scope_ids) : [];
        inScope = ids.includes(item.categoryId);
      } else if (rule.scope === "brand" && item.brandId) {
        const ids = rule.scope_ids ? JSON.parse(rule.scope_ids) : [];
        inScope = ids.includes(item.brandId);
      } else if (rule.scope === "family" && item.familyId) {
        const ids = rule.scope_ids ? JSON.parse(rule.scope_ids) : [];
        inScope = ids.includes(item.familyId);
      } else if (rule.scope === "product") {
        const ids = rule.scope_ids ? JSON.parse(rule.scope_ids) : [];
        inScope = ids.includes(item.productId);
      }
      if (!inScope) continue;

      // Check conditions
      if (rule.min_quantity && item.quantity < rule.min_quantity) continue;
      const lineTotal = item.quantity * item.unitPrice;
      if (rule.min_amount && lineTotal < parseFloat(rule.min_amount)) continue;

      // Calculate discount
      let savings = 0;
      const val = parseFloat(rule.value);
      if (rule.type === "percentage") {
        savings = lineTotal * (val / 100);
      } else if (rule.type === "fixed_amount") {
        savings = Math.min(val * item.quantity, lineTotal);
      } else if (rule.type === "fixed_price") {
        savings = Math.max(0, (item.unitPrice - val) * item.quantity);
      }

      if (savings > bestSavings) {
        bestSavings = savings;
        bestDiscount = {
          productId: item.productId,
          discountRuleId: rule.id,
          discountName: rule.name,
          originalPrice: item.unitPrice,
          discountedPrice: item.unitPrice - savings / item.quantity,
          savings: Math.round(savings * 100) / 100,
        };
        if (!rule.stackable) appliedNonStackable = true;
      }
    }

    if (bestDiscount) lineDiscounts.push(bestDiscount);
  }

  const totalBefore = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalSavings = lineDiscounts.reduce((s, d) => s + d.savings, 0);

  return {
    lineDiscounts,
    totalBeforeDiscount: Math.round(totalBefore * 100) / 100,
    totalAfterDiscount: Math.round((totalBefore - totalSavings) * 100) / 100,
    totalSavings: Math.round(totalSavings * 100) / 100,
  };
}
