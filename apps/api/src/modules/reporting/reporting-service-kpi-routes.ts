import type { FastifyInstance } from "fastify";
import {
  getKPISummary,
  getServiceHistoryByCustomer,
  getServiceHistoryByVehicle,
  getTechnicianEfficiency,
} from "./reporting-job-card-service";

export async function registerReportingServiceKpiRoutes(app: FastifyInstance) {
  app.get("/technician-efficiency", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const result = await getTechnicianEfficiency(orgId, {
      locationId:
        query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send({ data: result });
  });

  app.get("/service-history/vehicle/:vehicleId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { vehicleId } = request.params as { vehicleId: string };

    const result = await getServiceHistoryByVehicle(vehicleId, orgId);
    return reply.send({ data: result });
  });

  app.get("/service-history/customer/:customerId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { customerId } = request.params as { customerId: string };

    const result = await getServiceHistoryByCustomer(customerId, orgId);
    return reply.send({ data: result });
  });

  app.get("/kpi-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const result = await getKPISummary(orgId, {
      locationId:
        query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send(result);
  });
}
