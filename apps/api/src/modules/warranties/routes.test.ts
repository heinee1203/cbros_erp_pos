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

test("warranty route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { warrantyRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await warrantyRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/policies" },
    { method: "post", path: "/policies" },
    { method: "patch", path: "/policies/:id" },
    { method: "delete", path: "/policies/:id" },
    { method: "get", path: "/lookup" },
    { method: "get", path: "/records" },
    { method: "get", path: "/records/:id" },
    { method: "post", path: "/records/:id/void" },
    { method: "get", path: "/claims" },
    { method: "get", path: "/claims/:id" },
    { method: "post", path: "/claims" },
    { method: "patch", path: "/claims/:id" },
  ]);
});
