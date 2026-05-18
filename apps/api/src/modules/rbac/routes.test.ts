import assert from "node:assert/strict";
import test from "node:test";

type RegisteredRoute = {
  method: "delete" | "get" | "post" | "put";
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
    put(path: string) {
      routes.push({ method: "put", path });
    },
  };

  return { app, routes };
}

test("RBAC route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { rbacRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await rbacRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/permissions" },
    { method: "get", path: "/roles" },
    { method: "get", path: "/roles/:id" },
    { method: "post", path: "/roles" },
    { method: "put", path: "/roles/:id" },
    { method: "delete", path: "/roles/:id" },
    { method: "get", path: "/employees" },
    { method: "put", path: "/users/:userId/role" },
    { method: "post", path: "/seed-cashiers" },
  ]);
});
