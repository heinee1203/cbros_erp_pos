import type { FastifyInstance } from "fastify";
import {
  getDiscountAnalysis,
  getMechanicProductivity,
  getSalesByCategory,
  getSalesByEmployee,
  getSalesByItem,
  getSalesByPaymentMethod,
  getSalesSummary,
} from "./sales-reports";

type SalesReportQuery = {
  from?: string;
  to?: string;
  allLocations?: string;
};

function resolveLocationId(
  query: SalesReportQuery,
  locationId: string | null | undefined,
) {
  return query.allLocations === "true" || !locationId ? undefined : locationId;
}

export async function registerReportingSalesBreakdownRoutes(
  app: FastifyInstance,
) {
  app.get("/sales-by-item", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getSalesByItem(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  app.get("/sales-by-category", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getSalesByCategory(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  app.get("/sales-by-employee", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getSalesByEmployee(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  app.get("/sales-by-payment", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getSalesByPaymentMethod(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });

  app.get("/discount-analysis", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getDiscountAnalysis(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });

  app.get("/mechanic-productivity", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;
    const data = await getMechanicProductivity(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });
    return reply.send(data);
  });

  app.get("/sales-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as SalesReportQuery;

    const data = await getSalesSummary(orgId, {
      locationId: resolveLocationId(query, locationId),
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });
}
