import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "patch" | "post";
  path: string;
};

type RouteHandler = (request: any, reply: any) => unknown;

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const handlers = new Map<string, RouteHandler>();
  const record = (
    method: RegisteredRoute["method"],
    path: string,
    args: unknown[],
  ) => {
    routes.push({ method, path });
    const handler = [...args].reverse().find((arg) => typeof arg === "function");
    if (handler) {
      handlers.set(`${method} ${path}`, handler as RouteHandler);
    }
  };
  const app = {
    delete(path: string, ...args: unknown[]) {
      record("delete", path, args);
    },
    get(path: string, ...args: unknown[]) {
      record("get", path, args);
    },
    patch(path: string, ...args: unknown[]) {
      record("patch", path, args);
    },
    post(path: string, ...args: unknown[]) {
      record("post", path, args);
    },
  };

  return { app, routes, handlers };
}

function createReply() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
}

test("accounts payable route registration keeps extracted AP route groups first", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { accountsPayableRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await accountsPayableRoutes(app as any, {} as any);

  assert.deepEqual(routes.slice(0, 53), [
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
    { method: "get", path: "/suppliers/:id/overview" },
    { method: "get", path: "/suppliers/:id/activity" },
    { method: "get", path: "/suppliers/:id" },
    { method: "get", path: "/suppliers/:id/audit-log" },
    { method: "post", path: "/suppliers" },
    { method: "post", path: "/suppliers/:id/verify-bank" },
    { method: "post", path: "/suppliers/:id/merge" },
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
  const supplierOverviewIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/suppliers/:id/overview",
  );
  const supplierActivityIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/suppliers/:id/activity",
  );
  const supplierDetailIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/suppliers/:id",
  );

  assert.ok(soaHistoryIndex > -1);
  assert.ok(soaDetailIndex > -1);
  assert.ok(supplierBulkTermsIndex > -1);
  assert.ok(supplierPatchIndex > -1);
  assert.ok(supplierOverviewIndex > -1);
  assert.ok(supplierActivityIndex > -1);
  assert.ok(supplierDetailIndex > -1);
  assert.ok(soaHistoryIndex < soaDetailIndex);
  assert.ok(supplierBulkTermsIndex < supplierPatchIndex);
  assert.ok(supplierOverviewIndex < supplierDetailIndex);
  assert.ok(supplierActivityIndex < supplierDetailIndex);
});

test("supplier verify-bank and merge routes guard AP role and malformed merge input", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { accountsPayableRoutes } = await import("./routes");
  const { app, handlers } = createRouteRecorder();

  await accountsPayableRoutes(app as any, {} as any);

  const verifyBank = handlers.get("post /suppliers/:id/verify-bank");
  const merge = handlers.get("post /suppliers/:id/merge");
  assert.ok(verifyBank);
  assert.ok(merge);

  const forbiddenReply = createReply();
  await verifyBank(
    {
      user: { userId: "user-1", role: "CASHIER" },
      storeContext: { orgId: "org-1" },
      params: { id: "supplier-1" },
      ip: "127.0.0.1",
    },
    forbiddenReply,
  );

  assert.equal(forbiddenReply.statusCode, 403);
  assert.deepEqual(forbiddenReply.payload, { error: "Insufficient role for AP operations" });

  const malformedReply = createReply();
  await merge(
    {
      user: { userId: "user-1", role: "MANAGER" },
      storeContext: { orgId: "org-1" },
      params: { id: "supplier-1" },
      body: {},
      ip: "127.0.0.1",
    },
    malformedReply,
  );

  assert.equal(malformedReply.statusCode, 400);
  assert.deepEqual(malformedReply.payload, { error: "sourceSupplierId is required" });
});
