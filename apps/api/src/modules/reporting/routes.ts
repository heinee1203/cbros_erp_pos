import type { FastifyPluginAsync } from "fastify";
import {
  getJobCardMargins,
  getJobCardMarginById,
  getTechnicianEfficiency,
  getServiceHistoryByVehicle,
  getServiceHistoryByCustomer,
  getKPISummary,
} from "./service";
import {
  getSalesByItem,
  getSalesByCategory,
  getSalesByEmployee,
  getSalesSummary,
  getDailySalesSummary,
  getSalesKPIs,
  getSalesByPaymentMethod,
  getDiscountAnalysis,
  getMechanicProductivity,
} from "./sales-reports";
import {
  getInventoryValuation,
  getInventoryValuationDetail,
} from "./inventory-valuation";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export const reportingRoutes: FastifyPluginAsync = async (app) => {
  // ═══════════════════════════════════════════════
  // Job Card Margin Reports
  // ═══════════════════════════════════════════════

  // GET /reports/job-margins — List job card margins (paginated)
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
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });

    return reply.send(result);
  });

  // GET /reports/job-margins/:jobCardId — Single job card margin detail
  app.get("/job-margins/:jobCardId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { jobCardId } = request.params as { jobCardId: string };

    const result = await getJobCardMarginById(jobCardId, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Job card not found" });
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════
  // Technician Efficiency Reports
  // ═══════════════════════════════════════════════

  // GET /reports/technician-efficiency — Technician efficiency metrics
  app.get("/technician-efficiency", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const result = await getTechnicianEfficiency(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send({ data: result });
  });

  // ═══════════════════════════════════════════════
  // Service History Reports
  // ═══════════════════════════════════════════════

  // GET /reports/service-history/vehicle/:vehicleId
  app.get("/service-history/vehicle/:vehicleId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { vehicleId } = request.params as { vehicleId: string };

    const result = await getServiceHistoryByVehicle(vehicleId, orgId);
    return reply.send({ data: result });
  });

  // GET /reports/service-history/customer/:customerId
  app.get("/service-history/customer/:customerId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { customerId } = request.params as { customerId: string };

    const result = await getServiceHistoryByCustomer(customerId, orgId);
    return reply.send({ data: result });
  });

  // ═══════════════════════════════════════════════
  // KPI Summary Dashboard
  // ═══════════════════════════════════════════════

  // GET /reports/kpi-summary — Aggregated dashboard metrics
  app.get("/kpi-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const result = await getKPISummary(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════
  // Sales Reports
  // ═══════════════════════════════════════════════

  // GET /reports/sales-by-item
  app.get("/sales-by-item", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getSalesByItem(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  // GET /reports/sales-by-category
  app.get("/sales-by-category", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getSalesByCategory(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  // GET /reports/sales-by-employee
  app.get("/sales-by-employee", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getSalesByEmployee(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send({ data });
  });

  // GET /reports/sales-by-payment
  app.get("/sales-by-payment", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getSalesByPaymentMethod(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });

  // GET /reports/discount-analysis
  app.get("/discount-analysis", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getDiscountAnalysis(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });

  // GET /reports/mechanic-productivity
  app.get("/mechanic-productivity", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as { from?: string; to?: string; allLocations?: string };
    const data = await getMechanicProductivity(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });
    return reply.send(data);
  });

  // GET /reports/sales-summary
  app.get("/sales-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
    };

    const data = await getSalesSummary(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
    });

    return reply.send(data);
  });

  // ═══════════════════════════════════════════════
  // Sales Analytics Dashboard
  // ═══════════════════════════════════════════════

  // GET /reports/daily-sales-summary
  app.get("/daily-sales-summary", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
      employeeId?: string;
    };

    const data = await getDailySalesSummary(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
      employeeId: query.employeeId,
    });

    return reply.send({ data });
  });

  // GET /reports/sales-kpis
  app.get("/sales-kpis", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      from?: string;
      to?: string;
      allLocations?: string;
      employeeId?: string;
    };

    const data = await getSalesKPIs(orgId, {
      locationId: query.allLocations === "true" || !locationId ? undefined : locationId,
      from: query.from,
      to: query.to,
      employeeId: query.employeeId,
    });

    return reply.send(data);
  });

  // ═══════════════════════════════════════════════
  // Inventory Valuation
  // ═══════════════════════════════════════════════

  // GET /reports/inventory-valuation — Grouped inventory value at cost & retail
  app.get("/inventory-valuation", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      locationId?: string;
      groupBy?: string;
      allLocations?: string;
      categoryId?: string;
      brandId?: string;
      excludeZeroCost?: string;
      excludeZeroSell?: string;
    };

    const effectiveLocationId =
      query.allLocations === "true" || !locationId
        ? query.locationId || undefined
        : query.locationId || locationId;

    const data = await getInventoryValuation(orgId, {
      locationId: effectiveLocationId,
      groupBy: (query.groupBy as any) || "category",
      categoryId: query.categoryId || undefined,
      brandId: query.brandId || undefined,
      excludeZeroCost: query.excludeZeroCost === "true",
      excludeZeroSell: query.excludeZeroSell === "true",
    });

    return reply.send(data);
  });

  // GET /reports/inventory-valuation/detail — Product-level drill-down
  app.get("/inventory-valuation/detail", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      groupBy?: string;
      groupName?: string;
      locationId?: string;
      cursor?: string;
      limit?: string;
      allLocations?: string;
      categoryId?: string;
      brandId?: string;
      excludeZeroCost?: string;
      excludeZeroSell?: string;
    };

    if (!query.groupName) {
      return reply.status(400).send({ error: "groupName is required" });
    }

    const effectiveLocationId =
      query.allLocations === "true" || !locationId
        ? query.locationId || undefined
        : query.locationId || locationId;

    const data = await getInventoryValuationDetail(orgId, {
      groupBy: (query.groupBy as any) || "category",
      groupName: query.groupName,
      locationId: effectiveLocationId,
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      categoryId: query.categoryId || undefined,
      brandId: query.brandId || undefined,
      excludeZeroCost: query.excludeZeroCost === "true",
      excludeZeroSell: query.excludeZeroSell === "true",
    });

    return reply.send(data);
  });

  // GET /reports/employees — Lightweight employee list for filter dropdown
  app.get("/employees", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.execute(sql`
      SELECT id, full_name AS "fullName", role
      FROM users
      WHERE org_id = ${orgId}
      ORDER BY full_name
    `);
    return reply.send({ data: rows });
  });
};
