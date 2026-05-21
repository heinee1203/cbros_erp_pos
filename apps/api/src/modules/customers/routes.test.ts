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

test("customer route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { customerRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await customerRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/search" },
    { method: "get", path: "/reports/aging" },
    { method: "get", path: "/reports/soa/:customerId" },
    { method: "get", path: "/reports/soa-by-id/:soaId" },
    { method: "post", path: "/soa/:soaId/recompute" },
    { method: "get", path: "/reports/summary" },
    { method: "get", path: "/soa/search" },
    { method: "post", path: "/soa/batch-generate" },
    { method: "get", path: "/" },
    { method: "post", path: "/" },
    { method: "get", path: "/:id/collection-notes" },
    { method: "post", path: "/:id/collection-notes" },
    { method: "patch", path: "/:id/collection-notes/:noteId" },
    { method: "get", path: "/reports/collections" },
    { method: "get", path: "/:id/credit-control" },
    { method: "patch", path: "/:id/credit-control" },
    { method: "get", path: "/:id/disputes" },
    { method: "post", path: "/:id/disputes" },
    { method: "patch", path: "/:id/disputes/:disputeId" },
    { method: "post", path: "/:id/merge/preview" },
    { method: "post", path: "/:id/merge/apply" },
    { method: "get", path: "/:id/timeline" },
    { method: "get", path: "/:id/documents" },
    { method: "get", path: "/invoices" },
    { method: "post", path: "/invoices/batch" },
    { method: "get", path: "/payments" },
    { method: "post", path: "/multi-payment" },
    { method: "post", path: "/:id/credit-check" },
    { method: "get", path: "/:id" },
    { method: "patch", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "get", path: "/:id/transactions" },
    { method: "post", path: "/:id/payments" },
    { method: "post", path: "/:id/charges" },
    { method: "post", path: "/:id/adjustments" },
    { method: "patch", path: "/:id/transactions/:txnId/reassign" },
    { method: "post", path: "/:id/transactions/:txnId/reverse" },
    { method: "post", path: "/:id/transactions/:txnId/bounce" },
    { method: "patch", path: "/:id/transactions/:txnId/repair-info" },
    { method: "patch", path: "/:id/transactions/:txnId" },
    { method: "delete", path: "/:id/transactions/:txnId" },
    { method: "get", path: "/:id/transactions/:txnId/settled-invoices" },
    { method: "get", path: "/:id/vehicles" },
    { method: "post", path: "/:id/vehicles" },
    { method: "post", path: "/:id/soa/generate" },
    { method: "get", path: "/:id/soa/history" },
    { method: "get", path: "/:id/soa/:soaId/payment-summary" },
    { method: "get", path: "/:id/soa/:soaId/invoices" },
    { method: "patch", path: "/:id/soa/:soaId" },
  ]);
});
