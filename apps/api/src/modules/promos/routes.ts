import type { FastifyPluginAsync } from "fastify";
import {
  listPromos,
  getPromo,
  createPromo,
  updatePromo,
  deactivatePromo,
  evaluatePromos,
  recordPromoUsage,
  type CartLineInput,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const promoRoutes: FastifyPluginAsync = async (app) => {
  // ── List promo rules ──
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rules = await listPromos(orgId);
    return reply.send({ data: rules });
  });

  // ── Get single rule with triggers + rewards ──
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const rule = await getPromo(id, orgId);
    if (!rule) return reply.status(404).send({ error: "Promo rule not found" });
    return reply.send(rule);
  });

  // ── Create promo rule ──
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const rule = await createPromo(orgId, userId, body);
    return reply.status(201).send(rule);
  });

  // ── Update promo rule ──
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGE_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const updated = await updatePromo(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Promo rule not found" });
    return reply.send(updated);
  });

  // ── Deactivate promo rule ──
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    await deactivatePromo(id, orgId);
    return reply.send({ success: true });
  });

  // ── Evaluate cart against active promos ──
  app.post("/evaluate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { cartLines } = request.body as { cartLines: CartLineInput[] };
    if (!cartLines || !Array.isArray(cartLines)) {
      return reply.status(400).send({ error: "cartLines array is required" });
    }
    const applicable = await evaluatePromos(orgId, cartLines);
    return reply.send({ applicablePromos: applicable });
  });

  // ── Record promo usage on sale completion ──
  app.post("/apply", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId } = request.user;
    const { promoRuleId, saleId, discountAmount, freeItems } = request.body as {
      promoRuleId: string;
      saleId: string;
      discountAmount: number;
      freeItems?: any;
    };
    await recordPromoUsage(orgId, promoRuleId, saleId, discountAmount, freeItems, userId);
    return reply.send({ success: true });
  });
};
