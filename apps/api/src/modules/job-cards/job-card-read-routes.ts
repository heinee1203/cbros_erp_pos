import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@apex/types";
import {
  getJobCard,
  getJobCardByNumber,
  getJobCardJournal,
  listJobCards,
} from "./job-card-read-service";

export async function registerJobCardReadRoutes(app: FastifyInstance) {
  // GET /job-cards - List job cards
  app.get("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { cursor?: string; limit?: string };
    const parsed = paginationSchema.safeParse(query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid pagination params" });
    }

    const result = await listJobCards(orgId, locationId || undefined, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });

  // GET /job-cards/:id - Get job card by ID
  app.get("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const result = await getJobCard(id, orgId);
    if (!result) return reply.status(404).send({ error: "Job card not found" });
    return reply.send(result);
  });

  // GET /job-cards/by-number/:jobNo - Get job card by public number
  app.get("/by-number/:jobNo", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { jobNo } = request.params as { jobNo: string };

    const result = await getJobCardByNumber(jobNo, orgId);
    if (!result) return reply.status(404).send({ error: "Job card not found" });
    return reply.send(result);
  });
}

export async function registerJobCardJournalRoute(app: FastifyInstance) {
  // GET /job-cards/:id/journal - Get stock journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const entries = await getJobCardJournal(id, orgId);
    return reply.send(entries);
  });
}
