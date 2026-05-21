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

test("supplier return route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { supplierReturnsRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await supplierReturnsRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "get", path: "/po-returnable-lines" },
    { method: "get", path: "/analytics" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/:id/attachments" },
    { method: "post", path: "/:id/attachments" },
    { method: "delete", path: "/:id/attachments/:attachmentId" },
    { method: "post", path: "/" },
    { method: "patch", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "post", path: "/:id/submit" },
    { method: "post", path: "/:id/acknowledge" },
    { method: "post", path: "/:id/receive-credit" },
    { method: "post", path: "/:id/close" },
    { method: "post", path: "/:id/close-without-credit" },
    { method: "post", path: "/:id/cancel" },
    { method: "post", path: "/:id/reject" },
    { method: "get", path: "/draft-for-supplier" },
    { method: "post", path: "/:id/add-line" },
  ]);
});
