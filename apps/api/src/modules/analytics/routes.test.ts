import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "get" | "post";

type RegisteredRoute = {
  method: RouteMethod;
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string) {
      routes.push({ method: "get", path });
    },
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("analytics route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { analyticsRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await analyticsRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/daily-sales" },
    { method: "get", path: "/daily-sales/single-day" },
    { method: "get", path: "/daily-sales/summary" },
    { method: "get", path: "/daily-sales/divisions" },
    { method: "get", path: "/daily-sales/yoy" },
    { method: "get", path: "/daily-sales/day-of-week" },
    { method: "post", path: "/daily-sales/upsert" },
    { method: "get", path: "/daily-sales/rows" },
    { method: "get", path: "/monthly-sales/single-month" },
  ]);
});
