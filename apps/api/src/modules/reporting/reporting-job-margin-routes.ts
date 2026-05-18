import type { FastifyInstance } from "fastify";
import {
  getJobCardMarginById,
  getJobCardMargins,
} from "./reporting-job-card-service";

export async function registerReportingJobMarginRoutes(app: FastifyInstance) {
  app.get("/job-margins", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      cursor?: string;
      limit?: string;
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const result = await getJobCardMargins(orgId, {
      locationId:
        query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });

    return reply.send(result);
  });

  app.get("/job-margins/:jobCardId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { jobCardId } = request.params as { jobCardId: string };

    const result = await getJobCardMarginById(jobCardId, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Job card not found" });
    }

    return reply.send(result);
  });
}
