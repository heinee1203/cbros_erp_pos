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

test("product route registration keeps static routes before dynamic product detail routes", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { productRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await productRoutes(app as any, {} as any);

  assert.deepEqual(routes.slice(0, 5), [
    { method: "get", path: "/" },
    { method: "get", path: "/search" },
    { method: "post", path: "/" },
    { method: "patch", path: "/bulk-update" },
    { method: "post", path: "/bulk-find-replace" },
  ]);

  const detailIndex = routes.findIndex((route) => route.method === "get" && route.path === "/:id");
  const groupedCountsIndex = routes.findIndex((route) => route.method === "get" && route.path === "/grouped-counts");
  const barcodeIndex = routes.findIndex((route) => route.method === "get" && route.path === "/by-barcode/:barcode");
  const familiesIndex = routes.findIndex((route) => route.method === "get" && route.path === "/families");
  const vehiclesIndex = routes.findIndex((route) => route.method === "get" && route.path === "/vehicles/makes");

  assert.ok(groupedCountsIndex > -1);
  assert.ok(detailIndex > -1);
  assert.ok(barcodeIndex > -1);
  assert.ok(familiesIndex > -1);
  assert.ok(vehiclesIndex > -1);
  assert.ok(groupedCountsIndex < detailIndex);
  assert.ok(barcodeIndex > detailIndex);
  assert.ok(familiesIndex > barcodeIndex);
  assert.ok(vehiclesIndex > familiesIndex);
});
