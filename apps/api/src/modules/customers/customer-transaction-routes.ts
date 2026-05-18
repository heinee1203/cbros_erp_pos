import type { FastifyInstance } from "fastify";
import { customerAdjustmentSchema, recordPaymentSchema } from "@apex/types";
import {
  deleteTransaction,
  editTransactionAmount,
  getPaymentSettledInvoices,
  listTransactions,
  reassignTransaction,
  recordAdjustment,
  recordManualCharge,
  recordPayment,
} from "./customer-transaction-service";
import { assertAdmin, assertArRole } from "./route-support";

export function registerCustomerTransactionRoutes(app: FastifyInstance) {
  app.get("/:id/transactions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { type, from, to, cursor, limit } = request.query as {
      type?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 100);

    const result = await listTransactions(id, orgId, {
      type,
      from,
      to,
      cursor,
      limit: parsedLimit,
    });

    return reply.send(result);
  });

  app.post("/:id/payments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);

    const parsed = recordPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await recordPayment(id, parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err?.code === "ALLOCATION_SOA_MISMATCH") {
        return reply
          .status(400)
          .send({ error: "ALLOCATION_SOA_MISMATCH", details: err.details });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/charges", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);

    const body = request.body as {
      amount: string;
      referenceNumber?: string;
      description?: string;
      chargeDate?: string;
      dueDate?: string;
      notes?: string;
    };

    const amount = parseFloat(body.amount);
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: "Amount must be greater than 0" });
    }
    if (!body.referenceNumber?.trim()) {
      return reply.status(400).send({ error: "Reference number is required" });
    }
    if (body.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)) {
      return reply.status(400).send({ error: "dueDate must be YYYY-MM-DD" });
    }

    try {
      const txn = await recordManualCharge(
        orgId,
        id,
        {
          amount,
          referenceNumber: body.referenceNumber!.trim(),
          description: body.description,
          chargeDate: body.chargeDate,
          dueDate: body.dueDate,
          notes: body.notes,
        },
        userId,
      );
      return reply.status(201).send(txn);
    } catch (err: any) {
      const status = err.statusCode || 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.post("/:id/adjustments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);

    const parsed = customerAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await recordAdjustment(id, parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/:id/transactions/:txnId/reassign", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { newCustomerId, reason } = request.body as {
      newCustomerId: string;
      reason: string;
    };
    if (!newCustomerId || !reason)
      return reply
        .status(400)
        .send({ error: "newCustomerId and reason are required" });
    try {
      const result = await reassignTransaction(
        id,
        txnId,
        newCustomerId,
        reason,
        orgId,
        userId,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/:id/transactions/:txnId", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { amount, reason, dueDate } = request.body as {
      amount: number;
      reason: string;
      dueDate?: string | null;
    };
    if (!amount || !reason)
      return reply
        .status(400)
        .send({ error: "amount and reason are required" });
    if (
      dueDate !== undefined &&
      dueDate !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ) {
      return reply
        .status(400)
        .send({ error: "dueDate must be YYYY-MM-DD or null" });
    }
    try {
      const result = await editTransactionAmount(
        id,
        txnId,
        amount,
        reason,
        orgId,
        userId,
        dueDate,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/:id/transactions/:txnId", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { reason } = (request.body as { reason?: string }) || {};
    try {
      const result = await deleteTransaction(
        id,
        txnId,
        reason || "Deleted by admin",
        orgId,
        userId,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/:id/transactions/:txnId/settled-invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { txnId } = request.params as { txnId: string };
    const data = await getPaymentSettledInvoices(txnId, orgId);
    return reply.send({ data });
  });
}
