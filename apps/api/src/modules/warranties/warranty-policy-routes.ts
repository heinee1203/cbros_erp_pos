import type { FastifyInstance } from "fastify";
import {
  createPolicy,
  deactivatePolicy,
  listPolicies,
  updatePolicy,
} from "./warranty-route-service";
import {
  canManageWarranties,
  isWarrantyAdmin,
} from "./warranty-route-helpers";

export async function registerWarrantyPolicyRoutes(app: FastifyInstance) {
  app.get("/policies", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const policies = await listPolicies(orgId);
    return reply.send({ data: policies });
  });

  app.post("/policies", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageWarranties(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const policy = await createPolicy(orgId, body);
    return reply.status(201).send(policy);
  });

  app.patch("/policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageWarranties(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const updated = await updatePolicy(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Policy not found" });
    return reply.send(updated);
  });

  app.delete("/policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!isWarrantyAdmin(role)) {
      return reply.status(403).send({ error: "Admin required" });
    }
    await deactivatePolicy(id, orgId);
    return reply.send({ success: true });
  });
}
