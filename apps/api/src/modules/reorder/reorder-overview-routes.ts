import type { FastifyInstance } from "fastify";
import { refreshReorderSuggestions } from "./reorder-refresh-service";
import { exportReorderCSV, getReorderCounts } from "./reorder-query-service";
import {
  getReorderSettings,
  updateReorderSettings,
} from "./reorder-settings-service";

export async function registerReorderOverviewRoutes(app: FastifyInstance) {
  // GET /counts - lightweight badge counts
  app.get("/counts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getReorderCounts(orgId));
  });

  // GET /export - CSV download
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

  // GET /settings - org reorder settings
  app.get("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await getReorderSettings(orgId);
    return reply.send({ data });
  });

  // PATCH /settings - update settings (ADMIN only)
  app.patch("/settings", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const { orgId } = request.storeContext!;
    const body = request.body as Record<string, string>;

    await updateReorderSettings(orgId, body);
    return reply.send({ success: true });
  });

  // POST /refresh - trigger recomputation (ADMIN/MANAGER)
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
}
