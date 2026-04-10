import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import {
  listTiers, createTier, updateTier, deleteTier, seedDefaultTiers,
  listRules, getRule, createRule, updateRule, toggleRule, deleteRule,
  calculateDiscounts,
} from "./service";

const discountRoutes: FastifyPluginAsync = async (app) => {
  // ── Customer Tiers ──

  app.get("/tiers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    await seedDefaultTiers(orgId);
    const data = await listTiers(orgId);
    // Attach customer count per tier
    const enriched = await Promise.all(data.map(async (tier) => {
      const rows = await db.execute(sql`SELECT count(*)::int AS cnt FROM customers WHERE tier_id = ${tier.id} AND org_id = ${orgId}`);
      return { ...tier, customerCount: (rows as any[])[0]?.cnt ?? 0 };
    }));
    return reply.send({ data: enriched });
  });

  app.post("/tiers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as any;
    const tier = await createTier(orgId, body);
    return reply.status(201).send(tier);
  });

  app.put("/tiers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const tier = await updateTier(id, orgId, body);
    return reply.send(tier);
  });

  app.delete("/tiers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      await deleteTier(id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Discount Rules ──

  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { isActive?: string; type?: string; scope?: string };
    const data = await listRules(orgId, {
      isActive: q.isActive === "true" ? true : q.isActive === "false" ? false : undefined,
      type: q.type,
      scope: q.scope,
    });
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

  // ── Calculator ──

  app.post("/calculate", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const body = request.body as { items: any[]; customerId?: string };
    const result = await calculateDiscounts(orgId, body.items, body.customerId ?? null, locationId);
    return reply.send(result);
  });
};

export default discountRoutes;
