import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "post";
  path: string;
};

function createRouteRecorder() {
  const routes: RegisteredRoute[] = [];
  const app = {
    post(path: string) {
      routes.push({ method: "post", path });
    },
  };

  return { app, routes };
}

test("auth route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { authRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await authRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "post", path: "/register" },
    { method: "post", path: "/verify-pin" },
    { method: "post", path: "/verify-authorization" },
    { method: "post", path: "/authorization-pin" },
    { method: "post", path: "/login" },
  ]);
});
