import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertAdmin, assertApRole } from "./route-support";
import {
  confirmDisbursementVoucher,
  createDisbursementVoucher,
  getDisbursementVoucher,
  listDisbursementVouchers,
  printDisbursementVoucher,
  voidDisbursementVoucher,
} from "./disbursement-voucher-service";

// Narrow schema for additionalCharges only. The rest of the DV body stays on
// manual validation to preserve the existing route contract.
const dvAdditionalChargeSchema = z.object({
  // The DB stores charge_type as text and older DV screens/tests used values
  // outside the current dropdown, so accept any non-empty type here.
  chargeType: z.string().trim().min(1),
  description: z.string().min(1),
  referenceNumber: z.string().optional().nullable(),
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? v : String(v)))
    .refine((v) => parseFloat(v) > 0, { message: "amount must be > 0" }),
});

const dvAdditionalChargesArraySchema = z
  .array(dvAdditionalChargeSchema)
  .optional()
  .default([]);

export function registerDisbursementVoucherRoutes(app: FastifyInstance) {
  app.post("/disbursement-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as any;
    if (!body.supplierId || (!body.grossAmount && !body.amount) || !body.paymentDate) {
      return reply.status(400).send({
        error: "supplierId, grossAmount, and paymentDate are required",
      });
    }

    // Backward compat: if grossAmount not provided, use amount.
    if (!body.grossAmount && body.amount) {
      body.grossAmount = body.amount;
    }

    const chargesParse = dvAdditionalChargesArraySchema.safeParse(body.additionalCharges);
    if (!chargesParse.success) {
      return reply.status(422).send({
        error: "Invalid additionalCharges",
        details: chargesParse.error.flatten(),
      });
    }

    try {
      const result = await createDisbursementVoucher(orgId, userId, {
        ...body,
        additionalCharges: chargesParse.data,
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err?.code === "DV_REQUIRES_SOA") {
        return reply.status(400).send({
          error: "DV_REQUIRES_SOA",
          details: err.details,
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/disbursement-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as any;
    const result = await listDisbursementVouchers(orgId, {
      search: q.search,
      status: q.status,
      supplierId: q.supplierId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit: q.limit ? parseInt(q.limit) : undefined,
      includeVoided: q.includeVoided === "1" || q.includeVoided === "true",
    });
    return reply.send(result);
  });

  app.get("/disbursement-vouchers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await getDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/print", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { id } = request.params as { id: string };
    try {
      const result = await printDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/confirm", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { id } = request.params as { id: string };
    try {
      const result = await confirmDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err?.code === "DV_HAS_NO_SOA_LINK") {
        return reply.status(400).send({
          error: "DV_HAS_NO_SOA_LINK",
          details: err.details,
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/void", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { id } = request.params as { id: string };
    const { reason } = (request.body as any) ?? {};
    if (!reason) {
      return reply.status(400).send({ error: "Void reason is required" });
    }

    try {
      const result = await voidDisbursementVoucher(orgId, id, userId, reason);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
