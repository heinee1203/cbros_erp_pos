import type { FastifyInstance } from "fastify";
import {
  listImportLocationMappings,
  saveImportLocationMappings,
} from "./location-mapping-service";
import { MANAGE_ROLES } from "./route-permissions";

export function registerLocationMappingRoutes(app: FastifyInstance) {
  app.get("/location-mappings", async (request, reply) => {
    const orgId = request.user.orgId;
    const mappings = await listImportLocationMappings(orgId);
    return reply.send({ mappings });
  });

  app.post("/save-location-mappings", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
    const orgId = request.user.orgId;
    const { mappings } = request.body as { mappings: Record<string, string> };
    if (!mappings || typeof mappings !== "object") {
      return reply.status(400).send({ error: "mappings object required" });
    }

    const result = await saveImportLocationMappings(orgId, mappings);
    return reply.send(result);
  });
}
