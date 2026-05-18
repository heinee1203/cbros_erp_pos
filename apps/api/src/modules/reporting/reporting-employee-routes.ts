import type { FastifyInstance } from "fastify";
import { listReportingEmployees } from "./reporting-employee-service";

export async function registerReportingEmployeeRoutes(app: FastifyInstance) {
  app.get("/employees", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await listReportingEmployees(orgId);
    return reply.send({ data: rows });
  });
}
