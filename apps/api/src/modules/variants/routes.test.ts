import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "post";

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
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("variant route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { variantRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await variantRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/:productId" },
    { method: "post", path: "/:productId" },
    { method: "post", path: "/:productId/batch" },
    { method: "delete", path: "/:productId/:variantId" },
    { method: "post", path: "/:productId/convert-to-regular" },
  ]);
});
