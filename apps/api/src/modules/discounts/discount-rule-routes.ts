import type { FastifyInstance } from "fastify";
import {
  createRule,
  deleteRule,
  getRule,
  listRules,
  toggleRule,
  updateRule,
} from "./discount-route-service";
import {
  parseDiscountRuleFilters,
  type DiscountRuleQuery,
} from "./discount-route-helpers";

export async function registerDiscountRuleRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as DiscountRuleQuery;
    const data = await listRules(orgId, parseDiscountRuleFilters(query));
    return reply.send({ data });
  });

  app.get("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const rule = await getRule(id, orgId);
    if (!rule) return reply.status(404).send({ error: "Rule not found" });
    return reply.send(rule);
  });

  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as any;
    const rule = await createRule(orgId, body);
    return reply.status(201).send(rule);
  });

  app.put("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const rule = await updateRule(id, orgId, body);
    return reply.send(rule);
  });

  app.post("/:id/toggle", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const rule = await toggleRule(id, orgId);
    return reply.send(rule);
  });

  app.delete("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    await deleteRule(id, orgId);
    return reply.send({ success: true });
  });
}
