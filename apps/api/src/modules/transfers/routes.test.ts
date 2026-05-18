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

test("transfer route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { transferRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await transferRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "post", path: "/" },
    { method: "patch", path: "/:id" },
    { method: "post", path: "/:id/items" },
    { method: "patch", path: "/:id/items/:itemId" },
    { method: "delete", path: "/:id/items/:itemId" },
    { method: "post", path: "/:id/approve" },
    { method: "post", path: "/:id/start-picking" },
    { method: "post", path: "/:id/dispatch" },
    { method: "post", path: "/:id/receive" },
    { method: "post", path: "/:id/report-variance" },
    { method: "post", path: "/:id/cancel" },
    { method: "get", path: "/by-number/:transferNo" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/:id/journal" },
  ]);
});
