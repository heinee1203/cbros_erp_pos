import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "patch" | "post" | "put";
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
    put(path: string) {
      routes.push({ method: "put", path });
    },
  };

  return { app, routes };
}

test("technician route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { technicianRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await technicianRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "get", path: "/commissions" },
    { method: "get", path: "/:id" },
    { method: "post", path: "/" },
    { method: "post", path: "/seed" },
    { method: "post", path: "/batch-update" },
    { method: "post", path: "/seed-from-products" },
    { method: "post", path: "/backfill-historical" },
    { method: "put", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "get", path: "/commission-rates" },
    { method: "patch", path: "/commission-rates/:productId" },
  ]);
});
