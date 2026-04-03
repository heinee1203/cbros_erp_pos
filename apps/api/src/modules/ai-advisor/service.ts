import { db } from "@apex/database";
import {
  products,
  stockMetrics,
  reorderSuggestions,
  supplierMetrics,
  inventory,
  locations,
  sales,
  saleLines,
  brands,
  categories,
  productFamilies,
  suppliers,
} from "@apex/database/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";

// ── Rate Limiter (in-memory, 20 req/hr per org) ──

const rateLimitMap = new Map<string, number[]>();

export function checkRateLimit(orgId: string): {
  allowed: boolean;
  remaining: number;
  resetMinutes: number;
} {
  const now = Date.now();
  const hourAgo = now - 3600000;
  const timestamps = (rateLimitMap.get(orgId) ?? []).filter(
    (t) => t > hourAgo,
  );
  rateLimitMap.set(orgId, timestamps);

  if (timestamps.length >= 20) {
    const oldestInWindow = Math.min(...timestamps);
    const resetMs = oldestInWindow + 3600000 - now;
    return {
      allowed: false,
      remaining: 0,
      resetMinutes: Math.ceil(resetMs / 60000),
    };
  }
  return { allowed: true, remaining: 20 - timestamps.length, resetMinutes: 0 };
}

export function recordUsage(orgId: string): void {
  const timestamps = rateLimitMap.get(orgId) ?? [];
  timestamps.push(Date.now());
  rateLimitMap.set(orgId, timestamps);
}

// ── Context Gathering ──

export interface ItemContext {
  productId: string;
  name: string;
  sku: string;
  unitPrice: string;
  costPrice: string;
  brand: string | null;
  category: string | null;
  family: string | null;
  // stock_metrics
  totalStock: number | null;
  avgDailySales30d: string | null;
  avgDailySales60d: string | null;
  avgDailySales90d: string | null;
  daysOfStock: string | null;
  stockoutDays90d: number | null;
  lastPoDate: Date | null;
  lastPoSupplierName: string | null;
  lastLeadTimeDays: number | null;
  stockStatus: string | null;
  // reorder_suggestions
  reorderPoint: string | null;
  suggestedQty: number | null;
  safetyStock: string | null;
  abcClass: string | null;
  priority: string | null;
  demandStdDev: string | null;
  avgLeadTime: string | null;
  serviceLevelZ: string | null;
  pendingInbound: number | null;
  // supplier_metrics
  supplierName: string | null;
  supplierAvgLeadTimeDays: string | null;
  supplierMinLeadTimeDays: number | null;
  supplierMaxLeadTimeDays: number | null;
  supplierReliabilityPct: string | null;
  supplierPoCount6m: number | null;
  // inventory per location
  locationBreakdown: Array<{
    locationName: string;
    locationType: string;
    stockLevel: number;
    reservedLevel: number;
  }>;
  // recent sales
  recentSales: Array<{
    saleNo: string;
    date: Date | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    locationName: string;
  }>;
}

export async function gatherItemContext(
  orgId: string,
  productIds: string[],
): Promise<ItemContext[]> {
  // Query 1: Products with brand, category, family
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      brandName: brands.name,
      categoryName: categories.name,
      familyName: productFamilies.name,
      primarySupplierId: products.primarySupplierId,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(
      and(eq(products.orgId, orgId), inArray(products.id, productIds)),
    );

  if (productRows.length === 0) return [];

  const foundIds = productRows.map((p) => p.id);

  // Query 2: Stock metrics
  const metricsRows = await db
    .select()
    .from(stockMetrics)
    .where(
      and(
        eq(stockMetrics.orgId, orgId),
        inArray(stockMetrics.productId, foundIds),
      ),
    );
  const metricsMap = new Map(metricsRows.map((m) => [m.productId, m]));

  // Query 3: Reorder suggestions
  const reorderRows = await db
    .select()
    .from(reorderSuggestions)
    .where(
      and(
        eq(reorderSuggestions.orgId, orgId),
        inArray(reorderSuggestions.productId, foundIds),
      ),
    );
  const reorderMap = new Map(reorderRows.map((r) => [r.productId, r]));

  // Query 4: Supplier metrics — gather unique supplier IDs from products + stock metrics
  const supplierIds = new Set<string>();
  for (const p of productRows) {
    if (p.primarySupplierId) supplierIds.add(p.primarySupplierId);
  }
  // Also check last PO supplier from reorder suggestions
  for (const r of reorderRows) {
    if (r.supplierId) supplierIds.add(r.supplierId);
  }

  type SupplierMetricRow = typeof supplierMetrics.$inferSelect;
  let supplierMetricsMap = new Map<string, SupplierMetricRow>();
  let supplierNameMap = new Map<string, string>();

  if (supplierIds.size > 0) {
    const supplierIdArr = [...supplierIds];
    const smRows = await db
      .select()
      .from(supplierMetrics)
      .where(
        and(
          eq(supplierMetrics.orgId, orgId),
          inArray(supplierMetrics.supplierId, supplierIdArr),
        ),
      );
    supplierMetricsMap = new Map(
      smRows.map((s) => [s.supplierId, s]),
    );

    const supplierNameRows = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIdArr));
    supplierNameMap = new Map(supplierNameRows.map((s) => [s.id, s.name]));
  }

  // Query 5: Inventory per location
  const inventoryRows = await db
    .select({
      productId: inventory.productId,
      locationName: locations.name,
      locationType: locations.type,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
    })
    .from(inventory)
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .where(
      and(
        eq(inventory.orgId, orgId),
        inArray(inventory.productId, foundIds),
      ),
    );
  const inventoryMap = new Map<string, typeof inventoryRows>();
  for (const row of inventoryRows) {
    const existing = inventoryMap.get(row.productId) ?? [];
    existing.push(row);
    inventoryMap.set(row.productId, existing);
  }

  // Query 6: Recent sales (last 10 per product)
  // Use a lateral join approach via raw SQL for efficiency
  const recentSalesRows = await db
    .select({
      productId: saleLines.productId,
      saleNo: sales.saleNo,
      completedAt: sales.completedAt,
      quantity: saleLines.quantity,
      unitPrice: saleLines.unitPrice,
      lineTotal: saleLines.lineTotal,
      locationName: locations.name,
    })
    .from(saleLines)
    .innerJoin(sales, eq(saleLines.saleId, sales.id))
    .innerJoin(locations, eq(saleLines.locationId, locations.id))
    .where(
      and(
        eq(saleLines.orgId, orgId),
        inArray(saleLines.productId, foundIds),
        eq(sales.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(sales.completedAt))
    .limit(foundIds.length * 10);

  const salesMap = new Map<string, typeof recentSalesRows>();
  for (const row of recentSalesRows) {
    const existing = salesMap.get(row.productId) ?? [];
    if (existing.length < 10) {
      existing.push(row);
      salesMap.set(row.productId, existing);
    }
  }

  // Assemble
  return productRows.map((p) => {
    const m = metricsMap.get(p.id);
    const r = reorderMap.get(p.id);
    const supplierId = p.primarySupplierId ?? r?.supplierId ?? null;
    const sm = supplierId ? supplierMetricsMap.get(supplierId) : null;

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      unitPrice: p.unitPrice,
      costPrice: p.costPrice,
      brand: p.brandName,
      category: p.categoryName,
      family: p.familyName,
      // stock metrics
      totalStock: m?.totalStock ?? null,
      avgDailySales30d: m?.avgDailySales30d ?? null,
      avgDailySales60d: m?.avgDailySales60d ?? null,
      avgDailySales90d: m?.avgDailySales90d ?? null,
      daysOfStock: m?.daysOfStock ?? null,
      stockoutDays90d: m?.stockoutDays90d ?? null,
      lastPoDate: m?.lastPoDate ?? null,
      lastPoSupplierName: m?.lastPoSupplierName ?? null,
      lastLeadTimeDays: m?.lastLeadTimeDays ?? null,
      stockStatus: m?.status ?? null,
      // reorder suggestions
      reorderPoint: r?.reorderPoint ?? null,
      suggestedQty: r?.suggestedQty ?? null,
      safetyStock: r?.safetyStock ?? null,
      abcClass: r?.abcClass ?? null,
      priority: r?.priority ?? null,
      demandStdDev: r?.demandStdDev ?? null,
      avgLeadTime: r?.avgLeadTime ?? null,
      serviceLevelZ: r?.serviceLevelZ ?? null,
      pendingInbound: r?.pendingInbound ?? null,
      // supplier metrics
      supplierName: supplierId
        ? supplierNameMap.get(supplierId) ?? m?.lastPoSupplierName ?? null
        : null,
      supplierAvgLeadTimeDays: sm?.avgLeadTimeDays ?? null,
      supplierMinLeadTimeDays: sm?.minLeadTimeDays ?? null,
      supplierMaxLeadTimeDays: sm?.maxLeadTimeDays ?? null,
      supplierReliabilityPct: sm?.reliabilityPct ?? null,
      supplierPoCount6m: sm?.poCount6m ?? null,
      // location breakdown
      locationBreakdown: (inventoryMap.get(p.id) ?? []).map((inv) => ({
        locationName: inv.locationName,
        locationType: inv.locationType,
        stockLevel: inv.stockLevel,
        reservedLevel: inv.reservedLevel,
      })),
      // recent sales
      recentSales: (salesMap.get(p.id) ?? []).map((s) => ({
        saleNo: s.saleNo,
        date: s.completedAt,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        lineTotal: s.lineTotal,
        locationName: s.locationName,
      })),
    };
  });
}

// ── Prompt Building ──

export function buildSystemPrompt(): string {
  return `You are an inventory advisor for a Philippine auto parts retail business (CBROS Genuine Autoparts & Accessories). You help the owner make ordering decisions based on real sales data, stock levels, and supplier performance.

Rules:
- Always be specific and quantitative. Reference the actual numbers provided.
- Recommend concrete actions: "Order X units from [supplier]" not "consider ordering more."
- When supplier reliability is low (<80%), suggest ordering earlier or adding buffer stock.
- Flag items where demand is bursty (high std dev relative to mean) — these need more safety stock.
- Consider that some items are "insurance stock" — low sales but critical to have (brake parts, safety items). Don't recommend discontinuing these.
- Currency is Philippine Peso (₱). Format prices with commas.
- Keep responses concise — 3 to 5 paragraphs max for single item, bullet points for multi-item.
- If the data suggests the computed reorder point is wrong (e.g., seasonal pattern, one-time bulk sale skewing velocity), say so and suggest a manual override.
- The business has multiple branch locations. Consider whether stock at other branches could cover demand via transfer before ordering new stock.`;
}

function formatCurrency(value: string | null): string {
  if (!value) return "N/A";
  const num = parseFloat(value);
  if (isNaN(num)) return "N/A";
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatItemMarkdown(item: ItemContext): string {
  const lines: string[] = [];
  lines.push(`## ${item.name} (${item.sku})`);
  lines.push("");
  lines.push(`**Brand:** ${item.brand ?? "N/A"} | **Category:** ${item.category ?? "N/A"} | **Family:** ${item.family ?? "N/A"}`);
  lines.push(`**Unit Price:** ${formatCurrency(item.unitPrice)} | **Cost Price:** ${formatCurrency(item.costPrice)}`);
  lines.push("");

  // Stock metrics
  lines.push("### Stock & Sales Velocity");
  lines.push(`- Total Stock: **${item.totalStock ?? "N/A"}** units`);
  lines.push(`- Days of Stock Remaining: **${item.daysOfStock ?? "N/A"}**`);
  lines.push(`- Avg Daily Sales (30d / 60d / 90d): **${item.avgDailySales30d ?? "0"}** / **${item.avgDailySales60d ?? "0"}** / **${item.avgDailySales90d ?? "0"}**`);
  lines.push(`- Stockout Days (last 90d): **${item.stockoutDays90d ?? 0}**`);
  lines.push(`- Stock Monitor Status: **${item.stockStatus ?? "N/A"}**`);
  lines.push("");

  // Reorder data
  lines.push("### Reorder Analysis");
  lines.push(`- ABC Class: **${item.abcClass ?? "N/A"}** | Priority: **${item.priority ?? "N/A"}**`);
  lines.push(`- Reorder Point: **${item.reorderPoint ?? "N/A"}** | Safety Stock: **${item.safetyStock ?? "N/A"}**`);
  lines.push(`- Suggested Order Qty: **${item.suggestedQty ?? "N/A"}**`);
  lines.push(`- Demand Std Dev: **${item.demandStdDev ?? "N/A"}** | Service Level Z: **${item.serviceLevelZ ?? "N/A"}**`);
  lines.push(`- Avg Lead Time: **${item.avgLeadTime ?? "N/A"}** days | Pending Inbound: **${item.pendingInbound ?? 0}** units`);
  lines.push("");

  // Supplier
  lines.push("### Supplier");
  lines.push(`- Name: **${item.supplierName ?? "N/A"}**`);
  lines.push(`- Last PO: **${item.lastPoDate ? item.lastPoDate.toISOString().split("T")[0] : "N/A"}** | Last Lead Time: **${item.lastLeadTimeDays ?? "N/A"}** days`);
  if (item.supplierAvgLeadTimeDays) {
    lines.push(`- Avg Lead Time: **${item.supplierAvgLeadTimeDays}** days (min: ${item.supplierMinLeadTimeDays ?? "N/A"}, max: ${item.supplierMaxLeadTimeDays ?? "N/A"})`);
    lines.push(`- Reliability: **${item.supplierReliabilityPct ?? "N/A"}%** | POs in last 6 months: **${item.supplierPoCount6m ?? 0}**`);
  }
  lines.push("");

  // Location breakdown
  if (item.locationBreakdown.length > 0) {
    lines.push("### Stock by Location");
    for (const loc of item.locationBreakdown) {
      lines.push(`- **${loc.locationName}** (${loc.locationType}): ${loc.stockLevel} on hand, ${loc.reservedLevel} reserved`);
    }
    lines.push("");
  }

  // Recent sales
  if (item.recentSales.length > 0) {
    lines.push("### Recent Sales (last 10)");
    for (const s of item.recentSales) {
      const date = s.date ? s.date.toISOString().split("T")[0] : "N/A";
      lines.push(`- ${date} | ${s.locationName} | ${s.quantity} units @ ${formatCurrency(s.unitPrice)} = ${formatCurrency(s.lineTotal)} (${s.saleNo})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildUserPrompt(
  items: ItemContext[],
  question?: string,
  mode?: "single" | "multi" | "budget",
  budget?: number,
): string {
  const parts: string[] = [];

  if (mode === "budget" && budget) {
    parts.push(`**Budget Constraint:** ${formatCurrency(String(budget))}\n`);
    parts.push("Prioritize the following items within this budget. Recommend which to order first and how to allocate spend.\n");
  } else if (mode === "multi") {
    parts.push("Analyze the following items and prioritize them for reordering. Use bullet points for each item.\n");
  } else {
    parts.push("Provide a deep analysis of the following item and your ordering recommendation.\n");
  }

  for (const item of items) {
    parts.push(formatItemMarkdown(item));
  }

  if (question) {
    parts.push(`\n**User Question:** ${question}`);
  }

  return parts.join("\n");
}

// ── Claude API Call ──

export async function callClaudeAPI(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  itemCount: number,
): Promise<{ analysis: string; tokensUsed: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const model = "claude-sonnet-4-20250514";
  const maxTokens = itemCount > 1 ? 3000 : 1500;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    (err as any).status = response.status;
    throw err;
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const analysis =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n") ?? "";

  return {
    analysis,
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    model: data.model ?? model,
  };
}
