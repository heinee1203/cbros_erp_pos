import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "get";
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string) {
      routes.push({ method: "get", path });
    },
  };

  return { app, routes };
}

test("reporting route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { reportingRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await reportingRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/job-margins" },
    { method: "get", path: "/job-margins/:jobCardId" },
    { method: "get", path: "/technician-efficiency" },
    { method: "get", path: "/service-history/vehicle/:vehicleId" },
    { method: "get", path: "/service-history/customer/:customerId" },
    { method: "get", path: "/kpi-summary" },
    { method: "get", path: "/sales-by-item" },
    { method: "get", path: "/sales-by-category" },
    { method: "get", path: "/sales-by-employee" },
    { method: "get", path: "/sales-by-payment" },
    { method: "get", path: "/discount-analysis" },
    { method: "get", path: "/mechanic-productivity" },
    { method: "get", path: "/sales-summary" },
    { method: "get", path: "/daily-sales-summary" },
    { method: "get", path: "/sales-kpis" },
    { method: "get", path: "/inventory-valuation" },
    { method: "get", path: "/inventory-valuation/detail" },
    { method: "get", path: "/employees" },
  ]);
});
