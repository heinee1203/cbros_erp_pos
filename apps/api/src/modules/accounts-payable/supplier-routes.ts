import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseQuery } from "../../lib/validate-query";
import { assertApRole } from "./route-support";
import { queryAuditLog } from "./accounts-payable-audit-service";
import {
  bulkUpdateSupplierTerms,
  createSupplierAP,
  getSupplierAPDetail,
  getSupplierAPOverview,
  listSupplierActivity,
  listSuppliersWithAPStats,
  mergeSupplierAP,
  updateSupplierAP,
  verifySupplierBank,
} from "./supplier-service";

const supplierActivityQuerySchema = z.object({
  kind: z.enum(["invoices", "pos", "returns", "soas", "dvs", "audit"]),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

export function registerSupplierRoutes(app: FastifyInstance) {
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await listSuppliersWithAPStats(orgId);
    return reply.send({ data });
  });

  app.get("/suppliers/:id/overview", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const result = await getSupplierAPOverview(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Supplier not found" });
    }
    return reply.send(result);
  });

  app.get("/suppliers/:id/activity", async (request, reply) => {
    const q = parseQuery(supplierActivityQuerySchema, request.query, reply);
    if (!q) return;

    const { role } = request.user;
    if (q.kind === "audit") {
      try {
        assertApRole(role);
      } catch (err: any) {
        return reply.status(err.statusCode ?? 403).send({ error: err.message });
      }
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await listSupplierActivity(orgId, id, q);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
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

  app.get("/suppliers/:id/audit-log", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const query = request.query as { cursor?: string; limit?: string };
    const parsedLimit = query.limit ? Number.parseInt(query.limit, 10) : 50;
    const result = await queryAuditLog({
      orgId,
      entityType: "SUPPLIER",
      entityId: id,
      cursor: query.cursor,
      limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50,
    });

    return reply.send(result);
  });

  app.post("/suppliers", async (request, reply) => {
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await createSupplierAP(orgId, request.body as any, {
        userId,
        ipAddress: request.ip,
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/suppliers/:id/verify-bank", async (request, reply) => {
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await verifySupplierBank(orgId, id, {
        userId,
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/suppliers/:id/merge", async (request, reply) => {
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      sourceSupplierId?: string;
      reason?: string;
      dryRun?: boolean;
    };
    if (!body.sourceSupplierId) {
      return reply.status(400).send({ error: "sourceSupplierId is required" });
    }

    try {
      const result = await mergeSupplierAP(
        orgId,
        id,
        {
          sourceSupplierId: body.sourceSupplierId,
          reason: body.reason,
          dryRun: body.dryRun,
        },
        {
          userId,
          ipAddress: request.ip,
        },
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message, details: err.details });
    }
  });

  // Keep this before PATCH /suppliers/:id so "bulk-terms" is never treated
  // as a supplier id by Fastify's method-specific router.
  app.patch("/suppliers/bulk-terms", async (request, reply) => {
    const { userId, role } = request.user;
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
      const result = await bulkUpdateSupplierTerms(orgId, body, {
        userId,
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/suppliers/:id", async (request, reply) => {
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await updateSupplierAP(orgId, id, request.body as any, {
        userId,
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
