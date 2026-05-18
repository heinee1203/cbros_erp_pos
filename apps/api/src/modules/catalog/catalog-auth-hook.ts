import type { FastifyInstance } from "fastify";
import {
  findCatalogApiKey,
  markCatalogApiKeyUsed,
} from "./catalog-route-service";

export function registerCatalogApiKeyAuthHook(app: FastifyInstance) {
  // API Key auth hook - runs on all routes in this plugin
  app.addHook("onRequest", async (request, reply) => {
    const apiKey = request.headers["x-api-key"] as string;
    if (!apiKey) {
      return reply.status(401).send({ error: "Missing X-API-Key header" });
    }

    const keyRow = await findCatalogApiKey(apiKey);
    if (!keyRow || !keyRow.isActive) {
      return reply.status(401).send({ error: "Invalid or inactive API key" });
    }

    // Store orgId on request for use in route handlers.
    (request as any).catalogOrgId = keyRow.orgId;

    // Update last_used_at (fire and forget).
    markCatalogApiKeyUsed(keyRow.id);
  });
}
