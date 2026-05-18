import type { FastifyInstance } from "fastify";
import { parseQuery } from "../../lib/validate-query";
import {
  approveCheckVoucher,
  clearCheckVoucher,
  createCheckVoucher,
  deleteCheckVoucher,
  getCheckVoucher,
  listCheckVouchers,
  markPrinted,
  releaseCheckVoucher,
  updateCheckVoucher,
  voidCheckVoucher,
} from "./check-voucher-service";
import { assertAdmin, assertApRole, cvQuerySchema } from "./route-support";

export function registerCheckVoucherRoutes(app: FastifyInstance) {
  app.get("/check-vouchers", async (request, reply) => {
    const q = parseQuery(cvQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId } = request.storeContext!;
    const result = await listCheckVouchers(
      orgId,
      {
        status: q.status,
        supplierId: q.supplierId,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
      },
      q.cursor,
      q.limit,
    );
    return reply.send(result);
  });

  app.get("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getCheckVoucher(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Check voucher not found" });
    }
    return reply.send(result);
  });

  app.post("/check-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId: string;
      checkDate: string;
      checkNumber?: string;
      bankName?: string;
      bankAccount?: string;
      notes?: string;
      lines: Array<{
        supplierInvoiceId: string;
        amount: string;
        deductionAmount?: string;
        deductionReason?: string;
      }>;
    };

    if (!body.supplierId || !body.checkDate || !body.lines) {
      return reply.status(400).send({
        error: "supplierId, checkDate, and lines are required",
      });
    }

    try {
      const result = await createCheckVoucher(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique constraint")) {
        return reply.status(409).send({ error: "Duplicate CV number" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      checkDate?: string;
      checkNumber?: string;
      bankName?: string;
      bankAccount?: string;
      notes?: string;
    };

    try {
      const result = await updateCheckVoucher(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      await deleteCheckVoucher(orgId, id);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-vouchers/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await approveCheckVoucher(orgId, id, userId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-vouchers/:id/mark-printed", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await markPrinted(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-vouchers/:id/release", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await releaseCheckVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-vouchers/:id/clear", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await clearCheckVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/check-vouchers/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as { reason?: string };
    if (!body.reason) {
      return reply.status(400).send({ error: "Void reason is required" });
    }

    try {
      const result = await voidCheckVoucher(orgId, id, userId, body.reason);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
