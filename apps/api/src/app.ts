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
import { catalogRoutes } from "./modules/catalog/routes";
import { returnsRoutes } from "./modules/returns/routes";
import { supplierReturnsRoutes } from "./modules/supplier-returns/routes";
import { backorderRoutes } from "./modules/backorders/routes";
import { serialRoutes } from "./modules/serials/routes";
import { dotBatchRoutes } from "./modules/dot-batches/routes";
import { importRoutes } from "./modules/import/routes";
import { importHistoryRoutes } from "./modules/import-history/routes";
import { pricingRoutes } from "./modules/pricing/routes";
import { productSuppliersRoutes } from "./modules/product-suppliers/routes";
import { accountsPayableRoutes } from "./modules/accounts-payable/routes";
import { tagRoutes } from "./modules/tags/routes";
import { notificationRoutes } from "./modules/notifications/routes";
import { warrantyRoutes } from "./modules/warranties/routes";
import { cashflowRoutes } from "./modules/cashflow/routes";
import { promoRoutes } from "./modules/promos/routes";
import { deviceRoutes } from "./modules/devices/routes";
import { rbacRoutes } from "./modules/rbac/routes";
import { vehicleRoutes } from "./modules/vehicles/routes";
import { printingRoutes } from "./modules/printing/routes";
import auditRoutes from "./modules/audit/routes";
import discountRoutes from "./modules/discounts/routes";
import { technicianRoutes } from "./modules/technicians/routes";

export async function buildApp(): Promise<FastifyInstance> {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
    bodyLimit: 50 * 1024 * 1024, // 50 MB — needed for large CSV imports
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
    max: 500,
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
  await app.register(catalogRoutes, { prefix: "/api/v1/catalog" });
  await app.register(returnsRoutes, { prefix: "/returns" });
  await app.register(supplierReturnsRoutes, { prefix: "/procurement/supplier-returns" });
  await app.register(backorderRoutes, { prefix: "/procurement/backorders" });
  await app.register(serialRoutes, { prefix: "/inventory/serials" });
  await app.register(dotBatchRoutes, { prefix: "/inventory/dot-batches" });
  await app.register(importRoutes, { prefix: "/inventory/import" });
  await app.register(importHistoryRoutes, { prefix: "/inventory/import/history" });
  await app.register(pricingRoutes, { prefix: "/inventory/pricing" });
  await app.register(productSuppliersRoutes, { prefix: "/products" });
  await app.register(accountsPayableRoutes, { prefix: "/ap" });
  await app.register(tagRoutes, { prefix: "/tags" });
  await app.register(notificationRoutes, { prefix: "/notifications" });
  await app.register(warrantyRoutes, { prefix: "/warranties" });
  await app.register(cashflowRoutes, { prefix: "/cashflow" });
  await app.register(promoRoutes, { prefix: "/promos" });
  await app.register(deviceRoutes, { prefix: "/devices" });
  await app.register(rbacRoutes, { prefix: "/rbac" });
  await app.register(vehicleRoutes, { prefix: "/vehicles" });
  await app.register(printingRoutes, { prefix: "/printing" });
  await app.register(auditRoutes, { prefix: "/audit-log" });
  await app.register(discountRoutes, { prefix: "/discounts" });
  await app.register(technicianRoutes, { prefix: "/technicians" });

  return app;
}
