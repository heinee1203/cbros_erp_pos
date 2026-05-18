import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "get" | "post";
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

test("stock monitor route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { stockMonitorRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await stockMonitorRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "get", path: "/export" },
    { method: "get", path: "/suppliers" },
    { method: "post", path: "/refresh" },
    { method: "get", path: "/reorder-suggestions" },
  ]);
});
