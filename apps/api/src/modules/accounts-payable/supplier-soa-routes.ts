import type { FastifyInstance } from "fastify";
import { parseQuery } from "../../lib/validate-query";
import {
  generateSupplierSOA,
  getAgingReport,
  getSupplierSOA,
  getSupplierSOAById,
  getSupplierSOAOverview,
  listAllSupplierSOAs,
  listSupplierSOAs,
  paySupplierSOA,
  updateSupplierSOAStatus,
} from "./supplier-soa-service";
import { assertApRole, soaQuerySchema } from "./route-support";

export function registerSupplierSoaRoutes(app: FastifyInstance) {
  app.get("/reports/aging", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getAgingReport(orgId);
    return reply.send(result);
  });

  app.get("/reports/soa/:supplierId", async (request, reply) => {
    const { supplierId } = request.params as { supplierId: string };
    const { orgId } = request.storeContext!;

    const q = parseQuery(soaQuerySchema, request.query, reply);
    if (!q) return;

    try {
      const result = await getSupplierSOA(orgId, supplierId, q.dateFrom, q.dateTo);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/reports/supplier-soa", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getSupplierSOAOverview(orgId);
    return reply.send(result);
  });

  app.post("/supplier-soa/generate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId?: string;
      invoiceIds?: string[];
      notes?: string;
    };
    if (!body?.supplierId) {
      return reply.status(400).send({ error: "supplierId is required" });
    }
    if (!Array.isArray(body.invoiceIds) || body.invoiceIds.length === 0) {
      return reply.status(400).send({ error: "invoiceIds must be a non-empty array" });
    }

    try {
      const result = await generateSupplierSOA(
        orgId,
        body.supplierId,
        body.invoiceIds,
        userId,
        body.notes,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/suppliers/:supplierId/soa-history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { supplierId } = request.params as { supplierId: string };
    try {
      const data = await listSupplierSOAs(orgId, supplierId);
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/supplier-soa/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      search?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string;
    };
    const limit = Math.min(parseInt(q.limit || "100", 10) || 100, 200);

    try {
      const result = await listAllSupplierSOAs(orgId, {
        search: q.search,
        status: q.status,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        limit,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/supplier-soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    try {
      const result = await getSupplierSOAById(orgId, soaId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/supplier-soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { soaId } = request.params as { soaId: string };
    const { status } = (request.body as { status?: string }) ?? {};
    if (!status) {
      return reply.status(400).send({ error: "status is required" });
    }

    try {
      const result = await updateSupplierSOAStatus(orgId, soaId, status as any);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      if (err?.code === "SOA_HAS_ACTIVE_DV") {
        return reply.status(400).send({ error: "SOA_HAS_ACTIVE_DV", details: err.details });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/supplier-soa/:soaId/pay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { soaId } = request.params as { soaId: string };
    const body = request.body as {
      amount: string;
      paymentDate: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    };

    if (!body.amount || !body.paymentDate) {
      return reply.status(400).send({
        error: "amount and paymentDate are required",
      });
    }

    try {
      const result = await paySupplierSOA(orgId, soaId, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
