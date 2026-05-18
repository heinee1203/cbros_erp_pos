import type { FastifyInstance } from "fastify";
import { parseQuery } from "../../lib/validate-query";
import {
  bulkCreateInvoices,
  bulkMarkInvoicesPaid,
  createInvoice,
  getInvoice,
  listInvoices,
  updateInvoice,
  voidInvoice,
} from "./invoice-service";
import { assertAdmin, assertApRole, invoiceQuerySchema } from "./route-support";

export function registerSupplierInvoiceRoutes(app: FastifyInstance) {
  app.get("/invoices", async (request, reply) => {
    const q = parseQuery(invoiceQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId } = request.storeContext!;
    const result = await listInvoices(
      orgId,
      {
        status: q.status,
        supplierId: q.supplierId,
        overdue: q.overdue === "true",
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        search: q.search,
      },
      q.cursor,
      q.limit,
    );
    return reply.send(result);
  });

  app.get("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getInvoice(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Invoice not found" });
    }
    return reply.send(result);
  });

  app.post("/invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId: string;
      invoiceNumber: string;
      invoiceDate: string;
      totalAmount: string;
      paymentTermsDays?: number;
      currency?: string;
      sourcePoId?: string;
      sourceReceiptId?: string;
      notes?: string;
    };

    if (!body.supplierId || !body.invoiceNumber || !body.invoiceDate || !body.totalAmount) {
      return reply.status(400).send({
        error: "supplierId, invoiceNumber, invoiceDate, and totalAmount are required",
      });
    }

    try {
      const result = await createInvoice(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/invoices/bulk-create", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const body = request.body as {
      supplierId: string;
      sourcePoId?: string;
      notes?: string;
      invoices: Array<{
        invoiceNumber: string;
        invoiceDate: string;
        amount: string;
        kind?: "invoice" | "credit_memo";
      }>;
    };
    if (!body.supplierId || !Array.isArray(body.invoices) || body.invoices.length === 0) {
      return reply.status(400).send({ error: "supplierId and invoices[] are required" });
    }
    try {
      const result = await bulkCreateInvoices(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/invoices/bulk-pay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      invoiceIds: string[];
      useInvoiceDateAsPaymentDate: boolean;
      paymentDate?: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    };

    if (!Array.isArray(body.invoiceIds) || body.invoiceIds.length === 0) {
      return reply.status(400).send({
        error: "invoiceIds must be a non-empty array",
      });
    }

    if (body.invoiceIds.length > 100) {
      return reply.status(400).send({
        error: "Maximum 100 invoices per bulk pay request",
      });
    }

    if (!body.useInvoiceDateAsPaymentDate && !body.paymentDate) {
      return reply.status(400).send({
        error: "paymentDate is required when useInvoiceDateAsPaymentDate is false",
      });
    }

    try {
      const result = await bulkMarkInvoicesPaid(orgId, userId, body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      invoiceNumber?: string;
      invoiceDate?: string;
      totalAmount?: string;
      paymentTermsDays?: number;
      notes?: string;
    };

    try {
      const result = await updateInvoice(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Invoice not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/invoices/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await voidInvoice(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Invoice not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
