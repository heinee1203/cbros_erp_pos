import type { FastifyPluginAsync } from "fastify";
import {
  listPolicies,
  createPolicy,
  updatePolicy,
  deactivatePolicy,
  listRecords,
  getRecord,
  lookupWarranty,
  voidWarranty,
  listClaims,
  getClaim,
  createClaim,
  resolveClaim,
} from "./service";

const MANAGER_ROLES = ["ADMIN", "MANAGER"];

export const warrantyRoutes: FastifyPluginAsync = async (app) => {
  // ═══════════════════════════════════════════
  // WARRANTY POLICIES
  // ═══════════════════════════════════════════

  // GET /warranties/policies
  app.get("/policies", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const policies = await listPolicies(orgId);
    return reply.send({ data: policies });
  });

  // POST /warranties/policies
  app.post("/policies", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const policy = await createPolicy(orgId, body);
    return reply.status(201).send(policy);
  });

  // PATCH /warranties/policies/:id
  app.patch("/policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const updated = await updatePolicy(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Policy not found" });
    return reply.send(updated);
  });

  // DELETE /warranties/policies/:id
  app.delete("/policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    await deactivatePolicy(id, orgId);
    return reply.send({ success: true });
  });

  // ═══════════════════════════════════════════
  // WARRANTY RECORDS
  // ═══════════════════════════════════════════

  // GET /warranties/lookup — The key endpoint for counter staff
  app.get("/lookup", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { serial?: string; receiptNumber?: string; customerId?: string };
    const result = await lookupWarranty(orgId, q);
    return reply.send(result);
  });

  // GET /warranties/records
  app.get("/records", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      cursor?: string;
      limit?: string;
      status?: string;
      customerId?: string;
      productId?: string;
      expiringWithinDays?: string;
    };
    const result = await listRecords(orgId, {
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      status: q.status,
      customerId: q.customerId,
      productId: q.productId,
      expiringWithinDays: q.expiringWithinDays ? parseInt(q.expiringWithinDays, 10) : undefined,
    });
    return reply.send(result);
  });

  // GET /warranties/records/:id
  app.get("/records/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const record = await getRecord(id, orgId);
    if (!record) return reply.status(404).send({ error: "Warranty record not found" });
    return reply.send(record);
  });

  // POST /warranties/records/:id/void
  app.post("/records/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Admin required" });
    }
    const { reason } = request.body as { reason: string };
    const voided = await voidWarranty(id, orgId, reason || "Voided by admin");
    return reply.send(voided);
  });

  // ═══════════════════════════════════════════
  // WARRANTY CLAIMS
  // ═══════════════════════════════════════════

  // GET /warranties/claims
  app.get("/claims", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { cursor?: string; limit?: string; status?: string };
    const result = await listClaims(orgId, {
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      status: q.status,
    });
    return reply.send(result);
  });

  // GET /warranties/claims/:id
  app.get("/claims/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const claim = await getClaim(id, orgId);
    if (!claim) return reply.status(404).send({ error: "Claim not found" });
    return reply.send(claim);
  });

  // POST /warranties/claims
  app.post("/claims", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;
    const body = request.body as any;
    const claim = await createClaim(orgId, body, userId);
    return reply.status(201).send(claim);
  });

  // PATCH /warranties/claims/:id
  app.patch("/claims/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const resolved = await resolveClaim(id, orgId, body, userId);
    return reply.send(resolved);
  });
};
