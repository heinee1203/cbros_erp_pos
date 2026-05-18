import type { FastifyInstance } from "fastify";
import { assertApRole } from "./route-support";
import {
  bulkUpdateSupplierTerms,
  createSupplierAP,
  getSupplierAPDetail,
  listSuppliersWithAPStats,
  updateSupplierAP,
} from "./supplier-service";

export function registerSupplierRoutes(app: FastifyInstance) {
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await listSuppliersWithAPStats(orgId);
    return reply.send({ data });
  });

  app.get("/suppliers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const result = await getSupplierAPDetail(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Supplier not found" });
    }
    return reply.send(result);
  });

  app.post("/suppliers", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await createSupplierAP(orgId, request.body as any);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Keep this before PATCH /suppliers/:id so "bulk-terms" is never treated
  // as a supplier id by Fastify's method-specific router.
  app.patch("/suppliers/bulk-terms", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      supplierIds: string[];
      paymentTermsDays: number;
    };

    if (!Array.isArray(body.supplierIds) || body.supplierIds.length === 0) {
      return reply.status(400).send({
        error: "supplierIds must be a non-empty array",
      });
    }

    if (typeof body.paymentTermsDays !== "number" || body.paymentTermsDays < 0) {
      return reply.status(400).send({
        error: "paymentTermsDays must be a non-negative integer",
      });
    }

    try {
      const result = await bulkUpdateSupplierTerms(orgId, body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await updateSupplierAP(orgId, id, request.body as any);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
