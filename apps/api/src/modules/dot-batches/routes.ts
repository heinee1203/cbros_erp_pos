import type { FastifyPluginAsync } from "fastify";
import { listDotBatches, getDotBatchSummary, getTiresForDotEntry, getDotBatchesForProduct, saveDotEntry, removeDotEntry } from "./service";

export const dotBatchRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /inventory/dot-batches ───────────────────
  // List DOT batches for a product at a location
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await listDotBatches(orgId, {
      productId: q.productId,
      locationId: q.locationId,
      inStock: q.inStock === "true",
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      cursor: q.cursor,
    });

    return reply.send(result);
  });

  // ─── GET /inventory/dot-batches/summary ───────────────────
  // Summary stats for a product's DOT batches
  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { productId?: string };

    if (!q.productId) {
      return reply.status(400).send({ error: "productId is required" });
    }

    const summary = await getDotBatchSummary(orgId, q.productId);
    return reply.send(summary);
  });

  // ─── GET /inventory/dot-batches/entry ───────────────
  // List tire products for DOT code entry at a location
  app.get("/entry", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { locationId?: string };
    if (!q.locationId) return reply.status(400).send({ error: "locationId required" });
    const result = await getTiresForDotEntry(orgId, q.locationId);
    return reply.send(result);
  });

  // ─── GET /inventory/dot-batches/entry/:productId ────
  // Get existing DOT batches for a product at a location
  app.get("/entry/:productId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { productId } = request.params as { productId: string };
    const q = request.query as { locationId?: string };
    if (!q.locationId) return reply.status(400).send({ error: "locationId required" });
    const data = await getDotBatchesForProduct(orgId, productId, q.locationId);
    return reply.send({ data });
  });

  // ─── POST /inventory/dot-batches/entry ──────────────
  // Save a manual DOT code entry
  app.post("/entry", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as { productId: string; locationId: string; dotCode: string; quantity?: number };
    if (!body.productId || !body.locationId || !body.dotCode) {
      return reply.status(400).send({ error: "productId, locationId, and dotCode are required" });
    }
    try {
      const result = await saveDotEntry(orgId, body.productId, body.locationId, body.dotCode, body.quantity ?? 1);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /inventory/dot-batches/entry/:id ────────
  // Remove a DOT batch entry
  app.delete("/entry/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    await removeDotEntry(id, orgId);
    return reply.send({ success: true });
  });
};
