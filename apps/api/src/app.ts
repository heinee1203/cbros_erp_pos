import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { healthRoutes } from "./modules/health/routes";
import { authRoutes } from "./modules/auth/routes";
import { authPlugin } from "./plugins/auth";
import { storeContextPlugin } from "./plugins/store-context";
import { productRoutes } from "./modules/products/routes";
import { transferRoutes } from "./modules/transfers/routes";
import { adjustmentRoutes } from "./modules/adjustments/routes";
import { salesRoutes } from "./modules/sales/routes";
import { customerRoutes } from "./modules/customers/routes";
import { procurementRoutes } from "./modules/procurement/routes";
import { jobCardRoutes } from "./modules/job-cards/routes";
import { reportingRoutes } from "./modules/reporting/routes";
import { stockJournalRoutes } from "./modules/stock-journal/routes";
import { stockLevelsRoutes } from "./modules/stock-levels/routes";
import { inventoryCountRoutes } from "./modules/inventory-counts/routes";
import { categoryRoutes } from "./modules/categories/routes";
import { subcategoryRoutes } from "./modules/subcategories/routes";
import { productOptionsRoutes } from "./modules/product-options/routes";
import { variantRoutes } from "./modules/variants/routes";
import { locationRoutes } from "./modules/locations/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { syncRoutes } from "./modules/sync/routes";
import { shiftRoutes } from "./modules/shifts/routes";
import { brandRoutes } from "./modules/brands/routes";
import { settingsRoutes } from "./modules/settings/routes";
import { stockMonitorRoutes } from "./modules/stock-monitor/routes";
import { reorderRoutes } from "./modules/reorder/routes";

export async function buildApp(): Promise<FastifyInstance> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // ── Global plugins ──
  await app.register(cors, {
    origin: process.env.NODE_ENV === "production"
      ? (process.env.CORS_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean)
      : true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(sensible);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
  await app.register(jwt, { secret: JWT_SECRET });

  // ── Custom plugins ──
  await app.register(authPlugin);
  await app.register(storeContextPlugin);

  // ── Routes ──
  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(productRoutes, { prefix: "/products" });
  await app.register(transferRoutes, { prefix: "/transfers" });
  await app.register(adjustmentRoutes, { prefix: "/inventory/adjustments" });
  await app.register(salesRoutes, { prefix: "/sales" });
  await app.register(customerRoutes, { prefix: "/customers" });
  await app.register(procurementRoutes, { prefix: "/procurement" });
  await app.register(jobCardRoutes, { prefix: "/job-cards" });
  await app.register(reportingRoutes, { prefix: "/reports" });
  await app.register(stockJournalRoutes, { prefix: "/inventory/journal" });
  await app.register(stockLevelsRoutes, { prefix: "/inventory/stock-levels" });
  await app.register(inventoryCountRoutes, { prefix: "/inventory/counts" });
  await app.register(categoryRoutes, { prefix: "/categories" });
  await app.register(subcategoryRoutes, { prefix: "/subcategories" });
  await app.register(productOptionsRoutes, { prefix: "/product-options" });
  await app.register(variantRoutes, { prefix: "/variants" });
  await app.register(locationRoutes, { prefix: "/locations" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
  await app.register(syncRoutes, { prefix: "/sync" });
  await app.register(shiftRoutes, { prefix: "/shifts" });
  await app.register(brandRoutes, { prefix: "/brands" });
  await app.register(settingsRoutes, { prefix: "/settings" });
  await app.register(stockMonitorRoutes, { prefix: "/inventory/stock-monitor" });
  await app.register(reorderRoutes, { prefix: "/inventory/reorder" });

  return app;
}
