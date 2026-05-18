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

test("adjustment route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { adjustmentRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await adjustmentRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "post", path: "/" },
  ]);
});
