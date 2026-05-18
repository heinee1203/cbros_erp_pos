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

test("accounts payable route registration keeps extracted AP route groups first", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { accountsPayableRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await accountsPayableRoutes(app as any, {} as any);

  assert.deepEqual(routes.slice(0, 48), [
    { method: "get", path: "/invoices" },
    { method: "get", path: "/invoices/:id" },
    { method: "post", path: "/invoices" },
    { method: "post", path: "/invoices/bulk-create" },
    { method: "post", path: "/invoices/bulk-pay" },
    { method: "patch", path: "/invoices/:id" },
    { method: "post", path: "/invoices/:id/void" },
    { method: "get", path: "/check-vouchers" },
    { method: "get", path: "/check-vouchers/:id" },
    { method: "post", path: "/check-vouchers" },
    { method: "patch", path: "/check-vouchers/:id" },
    { method: "delete", path: "/check-vouchers/:id" },
    { method: "post", path: "/check-vouchers/:id/approve" },
    { method: "post", path: "/check-vouchers/:id/mark-printed" },
    { method: "post", path: "/check-vouchers/:id/release" },
    { method: "post", path: "/check-vouchers/:id/clear" },
    { method: "post", path: "/check-vouchers/:id/void" },
    { method: "get", path: "/reports/aging" },
    { method: "get", path: "/reports/soa/:supplierId" },
    { method: "get", path: "/reports/supplier-soa" },
    { method: "post", path: "/supplier-soa/generate" },
    { method: "get", path: "/suppliers/:supplierId/soa-history" },
    { method: "get", path: "/supplier-soa/history" },
    { method: "get", path: "/supplier-soa/:soaId" },
    { method: "patch", path: "/supplier-soa/:soaId" },
    { method: "post", path: "/supplier-soa/:soaId/pay" },
    { method: "post", path: "/disbursement-vouchers" },
    { method: "get", path: "/disbursement-vouchers" },
    { method: "get", path: "/disbursement-vouchers/:id" },
    { method: "post", path: "/disbursement-vouchers/:id/print" },
    { method: "post", path: "/disbursement-vouchers/:id/confirm" },
    { method: "post", path: "/disbursement-vouchers/:id/void" },
    { method: "get", path: "/suppliers" },
    { method: "get", path: "/suppliers/:id" },
    { method: "post", path: "/suppliers" },
    { method: "patch", path: "/suppliers/bulk-terms" },
    { method: "patch", path: "/suppliers/:id" },
    { method: "get", path: "/reports/summary" },
    { method: "get", path: "/reports/pdcs" },
    { method: "get", path: "/check-register" },
    { method: "post", path: "/check-register/:id/release" },
    { method: "post", path: "/check-register/:id/clear" },
    { method: "post", path: "/check-register/:id/bounce" },
    { method: "post", path: "/check-register/:id/cancel" },
    { method: "get", path: "/bank-accounts" },
    { method: "post", path: "/bank-accounts" },
    { method: "patch", path: "/bank-accounts/:id" },
    { method: "delete", path: "/bank-accounts/:id" },
  ]);
});

test("accounts payable route registration preserves static-before-dynamic AP paths", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { accountsPayableRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await accountsPayableRoutes(app as any, {} as any);

  const soaHistoryIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/supplier-soa/history",
  );
  const soaDetailIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/supplier-soa/:soaId",
  );
  const supplierBulkTermsIndex = routes.findIndex(
    (route) => route.method === "patch" && route.path === "/suppliers/bulk-terms",
  );
  const supplierPatchIndex = routes.findIndex(
    (route) => route.method === "patch" && route.path === "/suppliers/:id",
  );

  assert.ok(soaHistoryIndex > -1);
  assert.ok(soaDetailIndex > -1);
  assert.ok(supplierBulkTermsIndex > -1);
  assert.ok(supplierPatchIndex > -1);
  assert.ok(soaHistoryIndex < soaDetailIndex);
  assert.ok(supplierBulkTermsIndex < supplierPatchIndex);
});
