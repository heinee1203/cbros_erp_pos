import type { FastifyInstance } from "fastify";
import { createJobCardSchema } from "@apex/types";
import { createJobCard } from "./job-card-workflow-service";

export async function registerJobCardCreateRoute(app: FastifyInstance) {
  // POST /job-cards - Create a new job card (SCHEDULED)
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = createJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createJobCard(parsed.data, orgId, userId, role);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
