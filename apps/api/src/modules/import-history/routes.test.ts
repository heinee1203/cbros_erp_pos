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

test("import history route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { importHistoryRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await importHistoryRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "post", path: "/preview" },
    { method: "post", path: "/execute" },
    { method: "get", path: "/progress/:token" },
    { method: "get", path: "/batches" },
    { method: "delete", path: "/batches/:batchId" },
  ]);
});
