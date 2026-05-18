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

test("product option route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { productOptionsRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await productOptionsRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/:productId" },
    { method: "post", path: "/:productId" },
    { method: "patch", path: "/:productId/types/:typeId" },
    { method: "delete", path: "/:productId/types/:typeId" },
    { method: "post", path: "/:productId/types/:typeId/values" },
    { method: "patch", path: "/:productId/types/:typeId/values/:valueId" },
    { method: "delete", path: "/:productId/types/:typeId/values/:valueId" },
  ]);
});
