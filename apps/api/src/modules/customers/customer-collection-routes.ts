import type { FastifyInstance } from "fastify";
import { createCustomerSchema } from "@apex/types";
import { createCustomer, listCustomers } from "./customer-collection-service";
import { assertArRole } from "./route-support";

export function registerCustomerCollectionRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { search, type, hasBalance, sortBy, cursor, limit, dateFrom, dateTo } =
      request.query as {
        search?: string;
        type?: string;
        hasBalance?: string;
        sortBy?: string;
        cursor?: string;
        limit?: string;
        dateFrom?: string;
        dateTo?: string;
      };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 200);

    const result = await listCustomers(orgId, {
      search,
      type,
      hasBalance: hasBalance === "true",
      sortBy,
      cursor,
      limit: parsedLimit,
      dateFrom,
      dateTo,
    });

    return reply.send(result);
  });

  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const customer = await createCustomer(parsed.data, orgId);
      return reply.status(201).send(customer);
    } catch (err: any) {
      const errStr =
        String(err.message ?? "") +
        String(err.cause?.message ?? "") +
        String(err.cause?.code ?? "");
      const isUnique =
        err.code === "23505" ||
        err.cause?.code === "23505" ||
        errStr.includes("unique") ||
        errStr.includes("duplicate key") ||
        errStr.includes("23505");
      if (isUnique) {
        return reply
          .status(409)
          .send({ error: "A customer with this phone number already exists" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
