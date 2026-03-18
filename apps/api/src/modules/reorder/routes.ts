import type { FastifyPluginAsync } from "fastify";
import {
  refreshReorderSuggestions,
  queryReorderSuggestions,
  queryReorderSummary,
  getReorderCounts,
  exportReorderCSV,
  loadSettings,
} from "./service";
import { db } from "@apex/database";
import { reorderSuggestions, reorderSettings } from "@apex/database/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export const reorderRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /counts — lightweight badge counts ───
  app.get("/counts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getReorderCounts(orgId));
  });

  // ─── GET /export — CSV download ───
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const rows = await exportReorderCSV({
      orgId,
      search: q.search,
      priority: q.priority,
      supplierId: q.supplierId,
      brandId: q.brandId,
      categoryId: q.categoryId,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
    });

    const headers =
      "Priority,ABC,Item,SKU,Supplier,Stock,Pending,Demand/day,Safety Stock,ROP,Suggested Qty,Target,Notes";
    const csvRows = rows.map((r) =>
      [
        r.priority,
        r.abcClass,
        `"${(r.productName || "").replace(/"/g, '""')}"`,
        r.sku,
        r.supplierName || "",
        r.currentStock,
        r.pendingInbound,
        r.avgDailyDemand,
        r.safetyStock,
        r.reorderPoint,
        r.suggestedQty,
        r.targetStock,
        r.notes || "",
      ].join(","),
    );

    reply.header("Content-Type", "text/csv");
    reply.header(
      "Content-Disposition",
      'attachment; filename="reorder-suggestions.csv"',
    );
    return reply.send(headers + "\n" + csvRows.join("\n"));
  });

  // ─── GET /settings — org reorder settings ───
  app.get("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db
      .select()
      .from(reorderSettings)
      .where(eq(reorderSettings.orgId, orgId));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.settingKey] = r.settingValue;
    return reply.send({ data: map });
  });

  // ─── PATCH /settings — update settings (ADMIN only) ───
  app.patch("/settings", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const { orgId } = request.storeContext!;
    const body = request.body as Record<string, string>;

    for (const [key, value] of Object.entries(body)) {
      await db.execute(sql`
        INSERT INTO reorder_settings (id, org_id, setting_key, setting_value, updated_at)
        VALUES (gen_random_uuid(), ${orgId}, ${key}, ${value}, NOW())
        ON CONFLICT (org_id, setting_key) DO UPDATE SET setting_value = ${value}, updated_at = NOW()
      `);
    }
    return reply.send({ success: true });
  });

  // ─── POST /refresh — trigger recomputation (ADMIN/MANAGER) ───
  app.post("/refresh", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply
        .status(403)
        .send({ error: "Admin or Manager required" });
    }
    const { orgId } = request.storeContext!;
    const count = await refreshReorderSuggestions(orgId);
    return reply.send({
      success: true,
      suggestionsCount: count,
      computedAt: new Date().toISOString(),
    });
  });

  // ─── PATCH /:id/dismiss — mark suggestion as DISMISSED ───
  app.patch("/:id/dismiss", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.userId;

    await db
      .update(reorderSuggestions)
      .set({
        status: "DISMISSED",
        actionedAt: new Date(),
        actionedBy: userId,
      })
      .where(
        and(
          eq(reorderSuggestions.id, id),
          eq(reorderSuggestions.orgId, orgId),
        ),
      );
    return reply.send({ success: true });
  });

  // ─── PATCH /:id/qty — update suggested qty inline ───
  app.patch("/:id/qty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const { suggestedQty } = request.body as { suggestedQty: number };

    if (!suggestedQty || suggestedQty < 1) {
      return reply
        .status(400)
        .send({ error: "suggestedQty must be >= 1" });
    }

    await db
      .update(reorderSuggestions)
      .set({ suggestedQty })
      .where(
        and(
          eq(reorderSuggestions.id, id),
          eq(reorderSuggestions.orgId, orgId),
        ),
      );
    return reply.send({ success: true });
  });

  // ─── POST /create-pos — Bulk: group by supplier, create draft POs ───
  app.post("/create-pos", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;
    const { suggestionIds } = request.body as { suggestionIds: string[] };

    if (!suggestionIds || suggestionIds.length === 0) {
      return reply
        .status(400)
        .send({ error: "suggestionIds array is required" });
    }

    // Fetch the selected suggestions
    const suggestions = await db
      .select()
      .from(reorderSuggestions)
      .where(
        and(
          eq(reorderSuggestions.orgId, orgId),
          eq(reorderSuggestions.status, "PENDING"),
          inArray(reorderSuggestions.id, suggestionIds),
        ),
      );

    if (suggestions.length === 0) {
      return reply
        .status(400)
        .send({ error: "No valid pending suggestions selected" });
    }

    // Group by supplier
    const bySupplier = new Map<string, typeof suggestions>();
    for (const s of suggestions) {
      const key = s.supplierId ?? "no-supplier";
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key)!.push(s);
    }

    const createdPOs: string[] = [];
    const skippedNoSupplier = bySupplier.has("no-supplier")
      ? bySupplier.get("no-supplier")!.length
      : 0;

    await db.transaction(async (tx) => {
      for (const [supplierId, items] of bySupplier) {
        if (supplierId === "no-supplier") continue; // skip items without supplier

        // Generate PO number
        const seqRows = await tx.execute(
          sql`SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM 4) AS INTEGER)), 0) + 1 AS next_num FROM purchase_orders WHERE org_id = ${orgId}`,
        );
        const nextNum = (seqRows as any[])[0].next_num;
        const poNo = `PO-${String(nextNum).padStart(6, "0")}`;

        // Get a destination location (first active location)
        const locRows = await tx.execute(
          sql`SELECT id FROM locations WHERE org_id = ${orgId} AND is_active = true LIMIT 1`,
        );
        const locationId = (locRows as any[])[0]?.id;
        if (!locationId) continue;

        // Create PO
        const poRows = await tx.execute(sql`
          INSERT INTO purchase_orders (
            id, org_id, po_no, supplier_id, destination_location_id,
            status, created_by_user_id, idempotency_key, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), ${orgId}, ${poNo}, ${supplierId}, ${locationId},
            'DRAFT', ${userId}, gen_random_uuid(), NOW(), NOW()
          )
          RETURNING id, po_no
        `);
        const po = (poRows as any[])[0];

        // Create PO lines with cost prices from products
        for (const item of items) {
          await tx.execute(sql`
            INSERT INTO po_lines (
              id, purchase_order_id, org_id, product_id, ordered_qty, unit_cost,
              created_at, updated_at
            )
            VALUES (
              gen_random_uuid(), ${po.id}, ${orgId}, ${item.productId}, ${item.suggestedQty},
              COALESCE((SELECT cost_price FROM products WHERE id = ${item.productId}), '0.00'),
              NOW(), NOW()
            )
          `);
        }

        createdPOs.push(po.po_no);

        // Mark suggestions as ORDERED
        const itemIds = items.map((i) => i.id);
        await tx.execute(sql`
          UPDATE reorder_suggestions
          SET status = 'ORDERED', actioned_at = NOW(), actioned_by = ${userId}
          WHERE id = ANY(${itemIds})
        `);
      }
    });

    return reply.send({
      success: true,
      createdPOs,
      skippedNoSupplier,
    });
  });

  // ─── GET / — Paginated suggestions list with summary (register LAST) ───
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const data = await queryReorderSuggestions({
      orgId,
      search: q.search,
      priority: q.priority,
      supplierId: q.supplierId,
      brandId: q.brandId,
      categoryId: q.categoryId,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    const summary = await queryReorderSummary(orgId);
    return reply.send({ ...data, summary });
  });
};
