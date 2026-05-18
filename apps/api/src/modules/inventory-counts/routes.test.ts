import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "post";
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
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("inventory count route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { inventoryCountRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await inventoryCountRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/:id/items" },
    { method: "post", path: "/" },
    { method: "delete", path: "/:id" },
    { method: "post", path: "/:id/start" },
    { method: "post", path: "/:id/record" },
    { method: "post", path: "/:id/submit-review" },
    { method: "post", path: "/:id/complete" },
    { method: "post", path: "/:id/cancel" },
  ]);
});
