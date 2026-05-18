import type { FastifyInstance } from "fastify";
import {
  generateSOA,
  getSOAInvoices,
  getSOAPaymentSummary,
  listSOARecords,
  updateSOAStatus,
} from "./customer-soa-service";
import { assertArRole } from "./route-support";

export function registerCustomerSoaRoutes(app: FastifyInstance) {
  app.post("/:id/soa/generate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    const { id: customerId } = request.params as { id: string };
    const body = request.body as {
      from: string;
      to: string;
      unbilledOnly?: boolean;
      transactionIds?: string[];
    };
    if (!body?.from || !body?.to) {
      return reply.status(400).send({ error: "from and to are required" });
    }
    try {
      const result = await generateSOA(
        customerId,
        orgId,
        body.from,
        body.to,
        userId,
        body.unbilledOnly,
        body.transactionIds,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/:id/soa/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id: customerId } = request.params as { id: string };
    const data = await listSOARecords(customerId, orgId);
    return reply.send({ data });
  });

  app.get("/:id/soa/:soaId/payment-summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    const data = await getSOAPaymentSummary(soaId, orgId);
    return reply.send({ data });
  });

  app.get("/:id/soa/:soaId/invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    const data = await getSOAInvoices(soaId, orgId);
    return reply.send({ data });
  });

  app.patch("/:id/soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);
    const { soaId } = request.params as { soaId: string };
    const body = request.body as { status: string; paidAmount?: string };
    if (!body?.status) return reply.status(400).send({ error: "status is required" });
    try {
      await updateSOAStatus(soaId, orgId, body.status, body.paidAmount);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
