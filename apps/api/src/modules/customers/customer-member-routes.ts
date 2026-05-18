import type { FastifyInstance } from "fastify";
import { updateCustomerSchema } from "@apex/types";
import {
  checkCustomerCredit,
  getCustomer,
  softDeleteCustomer,
  updateCustomer,
} from "./customer-member-service";
import { assertAdmin, assertArRole } from "./route-support";

export function registerCustomerMemberRoutes(app: FastifyInstance) {
  app.post("/:id/credit-check", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { amount?: string | number };
    const chargeAmount =
      typeof body.amount === "string"
        ? parseFloat(body.amount)
        : Number(body.amount);

    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
      return reply.status(400).send({
        error: "Charge amount must be greater than 0",
      });
    }

    const result = await checkCustomerCredit(id, orgId, chargeAmount);

    if (result.status === "not_found") {
      return reply.status(404).send({ error: "Customer not found" });
    }

    if (result.status === "inactive") {
      return reply.status(409).send({
        code: "CUSTOMER_INACTIVE",
        error: "Customer account is inactive",
      });
    }

    return reply.send(result.data);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getCustomer(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Customer not found" });
    }

    return reply.send(result);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = updateCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updated = await updateCustomer(id, parsed.data, orgId);
    if (!updated) {
      return reply.status(404).send({ error: "Customer not found" });
    }

    return reply.send(updated);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertAdmin(role);

    try {
      const result = await softDeleteCustomer(id, orgId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
