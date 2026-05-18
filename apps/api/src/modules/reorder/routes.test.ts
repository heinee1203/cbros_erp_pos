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

test("reorder route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { reorderRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await reorderRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/counts" },
    { method: "get", path: "/export" },
    { method: "get", path: "/settings" },
    { method: "patch", path: "/settings" },
    { method: "post", path: "/refresh" },
    { method: "patch", path: "/:id/dismiss" },
    { method: "patch", path: "/:id/qty" },
    { method: "post", path: "/create-pos" },
    { method: "post", path: "/ai-analyze" },
    { method: "get", path: "/ai-usage" },
    { method: "get", path: "/" },
  ]);
});
