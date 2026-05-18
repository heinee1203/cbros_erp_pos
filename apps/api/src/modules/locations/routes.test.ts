import assert from "node:assert/strict";
import test from "node:test";

type RouteMethod = "delete" | "get" | "patch" | "post" | "put";

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
    put(path: string) {
      routes.push({ method: "put", path });
    },
  };

  return { app, routes };
}

test("location route registration preserves public endpoint order", async () => {
  process.env.DATABASE_URL ??= "postgres://apex:apex@localhost:5432/apex_test";
  const { locationRoutes } = await import("./routes");
  const { app, routes } = createRouteRecorder();

  await locationRoutes(app as any, {} as any);

  assert.deepEqual(routes, [
    { method: "get", path: "/" },
    { method: "post", path: "/" },
    { method: "put", path: "/:id" },
    { method: "delete", path: "/:id" },
    { method: "patch", path: "/:id/reactivate" },
  ]);
});
