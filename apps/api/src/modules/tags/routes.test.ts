import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "patch" | "post";
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

test("tag route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { tagRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await tagRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "post", path: "/" },
    { method: "patch", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "get", path: "/:id/products" },
    { method: "post", path: "/:id/bulk-assign" },
    { method: "post", path: "/bulk-assign-by-search" },
    { method: "post", path: "/auto-tag-tires" },
    { method: "get", path: "/demand" },
    { method: "get", path: "/demand/:tagId" },
    { method: "get", path: "/by-product/:productId" },
    { method: "post", path: "/by-product/:productId" },
    { method: "delete", path: "/by-product/:productId/:tagId" },
  ]);
});
