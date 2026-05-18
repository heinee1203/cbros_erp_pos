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

test("procurement route registration keeps supplier, PO core, lifecycle, and edit routes first", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { procurementRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await procurementRoutes(app as any, {} as any);

  assert.deepEqual(routes.slice(0, 17), [
    { method: "get", path: "/suppliers" },
    { method: "post", path: "/suppliers" },
    { method: "patch", path: "/suppliers/:id" },
    { method: "delete", path: "/suppliers/:id" },
    { method: "post", path: "/suppliers/merge" },
    { method: "post", path: "/purchase-orders" },
    { method: "get", path: "/purchase-orders" },
    { method: "get", path: "/purchase-orders/by-number/:poNo" },
    { method: "get", path: "/purchase-orders/:id" },
    { method: "post", path: "/purchase-orders/:id/submit" },
    { method: "post", path: "/purchase-orders/:id/receive" },
    { method: "post", path: "/purchase-orders/:id/close-variance" },
    { method: "post", path: "/purchase-orders/:id/cancel" },
    { method: "patch", path: "/purchase-orders/:id" },
    { method: "post", path: "/purchase-orders/:id/lines" },
    { method: "patch", path: "/purchase-orders/:id/lines/:lineId" },
    { method: "delete", path: "/purchase-orders/:id/lines/:lineId" },
  ]);
});

test("procurement route registration preserves static-before-dynamic PO paths", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { procurementRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await procurementRoutes(app as any, {} as any);

  const byNumberIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/purchase-orders/by-number/:poNo",
  );
  const detailIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/purchase-orders/:id",
  );
  const supplierProductsIndex = routes.findIndex(
    (route) => route.method === "get" && route.path === "/suppliers/:supplierId/products",
  );
  const supplierDetailPatchIndex = routes.findIndex(
    (route) => route.method === "patch" && route.path === "/suppliers/:id",
  );

  assert.ok(byNumberIndex > -1);
  assert.ok(detailIndex > -1);
  assert.ok(supplierProductsIndex > -1);
  assert.ok(supplierDetailPatchIndex > -1);
  assert.ok(byNumberIndex < detailIndex);
});

test("procurement route registration preserves auxiliary route order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { procurementRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await procurementRoutes(app as any, {} as any);

  const deleteLineIndex = routes.findIndex(
    (route) =>
      route.method === "delete" &&
      route.path === "/purchase-orders/:id/lines/:lineId",
  );
  const receivedAtIndex = routes.findIndex(
    (route) =>
      route.method === "get" &&
      route.path === "/purchase-orders/received-at/:locationId",
  );
  const redirectPlanIndex = routes.findIndex(
    (route) =>
      route.method === "post" &&
      route.path === "/purchase-orders/:id/redirect-plan",
  );
  const createRedirectIndex = routes.findIndex(
    (route) =>
      route.method === "post" &&
      route.path === "/purchase-orders/:id/create-redirect-pos",
  );
  const supplierProductsIndex = routes.findIndex(
    (route) =>
      route.method === "get" &&
      route.path === "/suppliers/:supplierId/products",
  );

  assert.ok(deleteLineIndex > -1);
  assert.ok(receivedAtIndex > -1);
  assert.ok(redirectPlanIndex > -1);
  assert.ok(createRedirectIndex > -1);
  assert.ok(supplierProductsIndex > -1);
  assert.ok(deleteLineIndex < receivedAtIndex);
  assert.ok(redirectPlanIndex < createRedirectIndex);
  assert.ok(createRedirectIndex < supplierProductsIndex);
});
