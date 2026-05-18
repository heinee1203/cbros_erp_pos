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

test("sales route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { salesRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await salesRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "post", path: "/" },
    { method: "post", path: "/:id/park" },
    { method: "post", path: "/:id/resume" },
    { method: "post", path: "/:id/void" },
    { method: "post", path: "/:id/complete" },
    { method: "post", path: "/:id/refund" },
    { method: "get", path: "/" },
    { method: "get", path: "/history" },
    { method: "get", path: "/history/receipts" },
    { method: "get", path: "/history/receipt/:receiptNumber" },
    { method: "post", path: "/history/deduplicate" },
    { method: "get", path: "/next-receipt-number" },
    { method: "get", path: "/by-number/:saleNo" },
    { method: "get", path: "/by-idempotency-key/:key" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/:id/journal" },
  ]);
});
