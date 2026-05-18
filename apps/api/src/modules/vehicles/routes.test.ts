import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "patch" | "post";

type RegisteredRoute = {
  method: RouteMethod;
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    delete(path: string) {
      routes.push({ method: "delete", path });
    },
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

test("vehicle route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { vehicleRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await vehicleRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "post", path: "/" },
    { method: "patch", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "post", path: "/:id/unfit-all" },
    { method: "get", path: "/:id/products" },
    { method: "post", path: "/bulk-apply" },
    { method: "post", path: "/bulk-remove" },
  ]);
});
