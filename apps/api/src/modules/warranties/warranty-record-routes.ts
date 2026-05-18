import type { FastifyInstance } from "fastify";
import {
  getRecord,
  listRecords,
  lookupWarranty,
  voidWarranty,
} from "./warranty-route-service";
import {
  buildWarrantyRecordFilters,
  isWarrantyAdmin,
  type WarrantyRecordQuery,
} from "./warranty-route-helpers";

export async function registerWarrantyRecordRoutes(app: FastifyInstance) {
  app.get("/lookup", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      serial?: string;
      receiptNumber?: string;
      customerId?: string;
    };
    const result = await lookupWarranty(orgId, q);
    return reply.send(result);
  });

  app.get("/records", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as WarrantyRecordQuery;
    const result = await listRecords(orgId, buildWarrantyRecordFilters(q));
    return reply.send(result);
  });

  app.get("/records/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const record = await getRecord(id, orgId);
    if (!record) {
      return reply.status(404).send({ error: "Warranty record not found" });
    }
    return reply.send(record);
  });

  app.post("/records/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!isWarrantyAdmin(role)) {
      return reply.status(403).send({ error: "Admin required" });
    }
    const { reason } = request.body as { reason: string };
    const voided = await voidWarranty(id, orgId, reason || "Voided by admin");
    return reply.send(voided);
  });
}
