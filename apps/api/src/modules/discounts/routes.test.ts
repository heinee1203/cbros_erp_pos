import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "post" | "put";

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
    put(path: string) {
      routes.push({ method: "put", path });
    },
  };

  return { app, routes };
}

test("discount route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { default: discountRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await discountRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/tiers" },
    { method: "post", path: "/tiers" },
    { method: "put", path: "/tiers/:id" },
    { method: "delete", path: "/tiers/:id" },
    { method: "get", path: "/" },
    { method: "get", path: "/:id" },
    { method: "post", path: "/" },
    { method: "put", path: "/:id" },
    { method: "post", path: "/:id/toggle" },
    { method: "delete", path: "/:id" },
    { method: "post", path: "/calculate" },
  ]);
});
