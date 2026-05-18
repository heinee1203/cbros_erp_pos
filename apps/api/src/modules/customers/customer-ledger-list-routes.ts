import type { FastifyInstance } from "fastify";
import {
  listInvoices,
  listPayments,
  recordManualChargeBatch,
  recordMultiCustomerPayment,
} from "./customer-ledger-service";
import { assertArRole } from "./route-support";

export function registerCustomerLedgerListRoutes(app: FastifyInstance) {
  app.get("/invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);
    const q = request.query as {
      search?: string;
      source?: string;
      status?: string;
      customerId?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
    const validSource =
      q.source && ["MANUAL", "POS", "IMPORT"].includes(q.source)
        ? (q.source as any)
        : undefined;
    const validStatus =
      q.status && ["UNPAID", "PARTIAL", "PAID"].includes(q.status)
        ? (q.status as any)
        : undefined;
    const result = await listInvoices(orgId, {
      search: q.search,
      source: validSource,
      status: validStatus,
      customerId: q.customerId,
      from: q.from,
      to: q.to,
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
    });
    return reply.send(result);
  });

  app.post("/invoices/batch", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);

    const body = request.body as {
      customerId?: string;
      invoices?: Array<{
        referenceNumber?: string;
        recordedAt?: string;
        dueDate?: string;
        amount?: number | string;
      }>;
      notes?: string;
    };
    if (!body.customerId)
      return reply.status(400).send({ error: "customerId is required" });
    if (!Array.isArray(body.invoices) || body.invoices.length === 0) {
      return reply
        .status(400)
        .send({ error: "invoices[] must contain at least one row" });
    }

    for (const [idx, inv] of body.invoices.entries()) {
      if (inv.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)) {
        return reply
          .status(400)
          .send({ error: `Row ${idx + 1}: dueDate must be YYYY-MM-DD` });
      }
    }

    const normalized = body.invoices.map((inv) => ({
      referenceNumber: (inv.referenceNumber ?? "").trim(),
      recordedAt: inv.recordedAt,
      dueDate: inv.dueDate,
      amount:
        typeof inv.amount === "string"
          ? parseFloat(inv.amount)
          : Number(inv.amount ?? 0),
    }));

    try {
      const result = await recordManualChargeBatch(
        orgId,
        body.customerId,
        { invoices: normalized, notes: body.notes },
        userId,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      const status = err.statusCode || 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.get("/payments", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      search?: string;
      paymentMethod?: string;
      customerId?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string;
    };
    const result = await listPayments(orgId, {
      search: q.search,
      paymentMethod: q.paymentMethod,
      customerId: q.customerId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    return reply.send(result);
  });

  app.post("/multi-payment", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);
    const body = request.body as any;
    if (!body?.allocations?.length)
      return reply
        .status(400)
        .send({ error: "At least one customer allocation is required" });
    if (!body?.totalAmount || !body?.method)
      return reply
        .status(400)
        .send({ error: "totalAmount and method are required" });
    try {
      const result = await recordMultiCustomerPayment(body, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
