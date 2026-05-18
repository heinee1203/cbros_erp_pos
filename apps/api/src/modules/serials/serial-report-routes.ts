import type { FastifyInstance } from "fastify";
import { getTireAgeReport } from "./serial-route-service";
import {
  parseTireAgeReportLimit,
  type SerialRouteQuery,
} from "./serial-route-helpers";

export async function registerSerialReportRoutes(app: FastifyInstance) {
  app.get("/tire-age-report", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as SerialRouteQuery;

    const result = await getTireAgeReport(orgId, {
      locationId: q.locationId,
      status: q.status,
      cursor: q.cursor,
      limit: parseTireAgeReportLimit(q),
    });

    return reply.send(result);
  });
}
