import type { FastifyReply } from "fastify";
import { parseQuery, syncQuerySchema } from "../../lib/validate-query";

export function parseSyncDeltaQuery(query: unknown, reply: FastifyReply) {
  return parseQuery(syncQuerySchema, query, reply);
}

export function requireSyncLocation(locationId: string | null | undefined, reply: FastifyReply) {
  if (!locationId) {
    reply.status(400).send({ error: "A specific location must be selected for sync" });
    return null;
  }

  return locationId;
}
