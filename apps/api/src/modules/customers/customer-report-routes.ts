import type { FastifyInstance } from "fastify";
import {
  generateSOA,
  getAgingReport,
  getARSummary,
  getSOA,
  getSOAById,
  recomputeCustomerSOAStatus,
  searchSOARecords,
} from "./customer-report-service";
import { assertArRole } from "./route-support";

export function registerCustomerReportRoutes(app: FastifyInstance) {
  app.get("/reports/aging", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { asOfDate?: string };
    const result = await getAgingReport(orgId, { asOfDate: q.asOfDate });
    return reply.send(result);
  });

  app.get("/reports/soa/:customerId", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const { orgId } = request.storeContext!;
    const { from, to, includeUnbilled } = request.query as {
      from?: string;
      to?: string;
      includeUnbilled?: string;
    };

    const now = new Date();
    const defaultFrom = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const defaultTo = now.toISOString();

    try {
      const result = await getSOA(
        customerId,
        orgId,
        from || defaultFrom,
        to || defaultTo,
        { includeUnbilled: includeUnbilled === "true" || includeUnbilled === "1" },
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.get("/reports/soa-by-id/:soaId", async (request, reply) => {
    const { soaId } = request.params as { soaId: string };
    const { orgId } = request.storeContext!;
    try {
      const result = await getSOAById(soaId, orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.post("/soa/:soaId/recompute", async (request, reply) => {
    const { role } = request.user;
    assertArRole(role);
    const { soaId } = request.params as { soaId: string };
    const { orgId } = request.storeContext!;
    try {
      const result = await recomputeCustomerSOAStatus(orgId, soaId);
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await getARSummary(orgId);
    return reply.send(data);
  });

  app.get("/soa/search", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      search?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string;
      offset?: string;
    };
    return reply.send(await searchSOARecords(orgId, q));
  });

  app.post("/soa/batch-generate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    const body = request.body as {
      customerIds: string[];
      from: string;
      to: string;
      unbilledOnly?: boolean;
    };
    if (!body?.customerIds?.length || !body?.from || !body?.to) {
      return reply
        .status(400)
        .send({ error: "customerIds, from, and to are required" });
    }

    const results: string[] = [];
    const errors: string[] = [];
    for (const customerId of body.customerIds) {
      try {
        const soa = await generateSOA(
          customerId,
          orgId,
          body.from,
          body.to,
          userId,
          body.unbilledOnly ?? true,
        );
        results.push(soa.soaNumber ?? customerId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${customerId}: ${msg}`);
      }
    }
    return reply.send({ generated: results.length, soaNumbers: results, errors });
  });
}
