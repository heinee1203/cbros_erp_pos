import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "get" | "patch" | "post";

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
    patch(path: string) {
      routes.push({ method: "patch", path });
    },
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("pricing route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { pricingRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await pricingRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/history" },
    { method: "get", path: "/history/:productId" },
    { method: "get", path: "/margin-alerts" },
    { method: "post", path: "/bulk-preview" },
    { method: "post", path: "/bulk-apply" },
    { method: "patch", path: "/:productId" },
  ]);
});
