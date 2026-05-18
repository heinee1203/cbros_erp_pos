import type { FastifyInstance } from "fastify";
import {
  createClaim,
  getClaim,
  listClaims,
  resolveClaim,
} from "./warranty-route-service";
import {
  buildWarrantyClaimFilters,
  canManageWarranties,
  type WarrantyClaimQuery,
} from "./warranty-route-helpers";

export async function registerWarrantyClaimRoutes(app: FastifyInstance) {
  app.get("/claims", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as WarrantyClaimQuery;
    const result = await listClaims(orgId, buildWarrantyClaimFilters(q));
    return reply.send(result);
  });

  app.get("/claims/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const claim = await getClaim(id, orgId);
    if (!claim) return reply.status(404).send({ error: "Claim not found" });
    return reply.send(claim);
  });

  app.post("/claims", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = request.user.userId;
    const body = request.body as any;
    const claim = await createClaim(orgId, body, userId);
    return reply.status(201).send(claim);
  });

  app.patch("/claims/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    if (!canManageWarranties(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const resolved = await resolveClaim(id, orgId, body, userId);
    return reply.send(resolved);
  });
}
