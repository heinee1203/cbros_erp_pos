import type { FastifyInstance } from "fastify";
import {
  getDotBatchesForProduct,
  getTiresForDotEntry,
  removeDotEntry,
  saveDotEntry,
} from "./dot-batch-route-service";
import type {
  DotBatchDeleteParams,
  DotBatchEntryBody,
  DotBatchEntryParams,
  DotBatchEntryQuery,
} from "./dot-batch-route-helpers";

export async function registerDotBatchEntryRoutes(app: FastifyInstance) {
  app.get("/entry", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as DotBatchEntryQuery;
    if (!query.locationId) return reply.status(400).send({ error: "locationId required" });
    const result = await getTiresForDotEntry(orgId, query.locationId);
    return reply.send(result);
  });

  app.get("/entry/:productId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { productId } = request.params as DotBatchEntryParams;
    const query = request.query as DotBatchEntryQuery;
    if (!query.locationId) return reply.status(400).send({ error: "locationId required" });
    const data = await getDotBatchesForProduct(orgId, productId, query.locationId);
    return reply.send({ data });
  });

  app.post("/entry", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as DotBatchEntryBody;
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

  app.delete("/entry/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as DotBatchDeleteParams;
    await removeDotEntry(id, orgId);
    return reply.send({ success: true });
  });
}
